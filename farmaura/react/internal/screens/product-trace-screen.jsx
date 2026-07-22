import React, { useEffect, useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { LOCATION_TYPE_LABEL, formatIsoDate, isExpiringSoonIso, lotStatusBadge } from "./inventory-screen.jsx";

const CONTROLLED_CATEGORY_LABEL = {
  none: '',
  prescription: 'Sob prescrição',
  prescription_retention: 'Prescrição com retenção',
  special_control: 'Controle especial',
  black_stripe: 'Tarja preta',
};

const MOVEMENT_TYPE_META = {
  receipt: { label: 'Recebimento', icon: 'plus' },
  transfer_out: { label: 'Saída por transferência', icon: 'route' },
  transfer_in: { label: 'Entrada por transferência', icon: 'route' },
  adjustment: { label: 'Ajuste', icon: 'edit' },
  sale_exit: { label: 'Saída por venda', icon: 'minus' },
};

function movementMeta(type) {
  return MOVEMENT_TYPE_META[type] || { label: type, icon: 'activity' };
}

function movementDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('pt-BR') : 'Data indisponível';
}

/* FARMAURA Console — Rastreabilidade de produtos (verificação para o admin). */
function ProductTraceScreen({ ctx }) {
  const { searchItemTrace, fetchItemTrace, notify, onLogout } = ctx;
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [trace, setTrace] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  const runSearch = async (term) => {
    setSearching(true);
    try {
      const results = await searchItemTrace(typeof term === 'string' ? term : q);
      setCandidates(results);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    runSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCandidate = async (itemId) => {
    setSelectedId(itemId);
    setLoadingTrace(true);
    setTrace(null);
    try {
      const payload = await fetchItemTrace(itemId);
      setTrace(payload);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar o histórico do produto.', 'warn');
    } finally {
      setLoadingTrace(false);
    }
  };

  return (
    <>
      <Topbar title="Rastreabilidade" sub="Verifique onde cada produto está e todo o histórico de movimentação, do recebimento até a venda" onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input
            placeholder="Buscar por nome, SKU, EAN ou lote"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          />
        </div>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => runSearch()} disabled={searching}>
          <Icon name="search" size={15} />Buscar
        </button>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
          <div className="fa-card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Produtos</div>
            {searching && !candidates.length && <div className="ph-cell-sub" style={{ padding: '8px 2px' }}>Carregando produtos…</div>}
            {searched && !searching && !candidates.length && <div className="ph-cell-sub" style={{ padding: '8px 2px' }}>Nenhum produto encontrado.</div>}
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => selectCandidate(candidate.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: selectedId === candidate.id ? 'var(--fa-rose-soft)' : 'transparent',
                  borderRadius: 10, padding: '10px 12px', marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{candidate.name}</div>
                <div className="ph-cell-sub">{candidate.brand || 'Sem marca'} · <span className="fa-mono">{candidate.ean || candidate.sku}</span> · {candidate.qty} un</div>
              </button>
            ))}
          </div>

          <div>
            {!trace && !loadingTrace && (
              <div className="ph-empty">
                <span className="fa-iconbox"><Icon name="search" size={28} /></span>
                <div>Selecione um produto na lista ao lado ou busque por nome, SKU, EAN ou lote.</div>
              </div>
            )}
            {loadingTrace && <div className="ph-cell-sub" style={{ padding: 16 }}>Carregando histórico…</div>}

            {trace && !loadingTrace && (
              <>
                <div className="fa-card" style={{ padding: 18, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="fa-iconbox" style={{ width: 46, height: 46 }}><Icon name="pill" size={20} /></span>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {trace.item.name}
                        {trace.item.controlledCategory !== 'none' && (
                          <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />{CONTROLLED_CATEGORY_LABEL[trace.item.controlledCategory] || 'Tarja'}</span>
                        )}
                      </div>
                      <div className="ph-cell-sub">{trace.item.brand || 'Sem marca'} · SKU <span className="fa-mono">{trace.item.sku}</span> · EAN <span className="fa-mono">{trace.item.ean || '—'}</span> · {trace.item.medClass}</div>
                    </div>
                    <span className="fa-badge" style={{ background: 'var(--fa-info-soft)', color: 'var(--fa-info)', fontSize: 13 }}>{trace.item.totalAvailableQuantity} un no total</span>
                  </div>
                </div>

                <div className="fa-card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', fontWeight: 800, borderBottom: '1px solid var(--fa-mist)' }}>Onde este produto está agora</div>
                  <div className="ph-table-wrap">
                    <table className="ph-table">
                      <thead>
                        <tr><th>Local</th><th>Lote</th><th>Validade</th><th>Quantidade</th><th>Status</th><th>Fornecedor</th></tr>
                      </thead>
                      <tbody>
                        {trace.lots.map((lot) => (
                          <tr key={lot.id}>
                            <td>
                              <span className="ph-pick-loc">{lot.locationCode}</span>
                              <div className="ph-cell-sub">{lot.locationName} · {LOCATION_TYPE_LABEL[lot.locationType] || lot.locationType}</div>
                            </td>
                            <td className="fa-mono">{lot.batch || '—'}</td>
                            <td style={isExpiringSoonIso(lot.expiry) ? { color: 'var(--fa-warn)', fontWeight: 700 } : undefined}>{formatIsoDate(lot.expiry)}</td>
                            <td style={{ fontWeight: 800 }}>{lot.qty} un</td>
                            <td>{lotStatusBadge(lot.status)}</td>
                            <td>{lot.supplierName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!trace.lots.length && <div className="ph-cell-sub" style={{ padding: 16 }}>Nenhum saldo disponível para este produto.</div>}
                  </div>
                </div>

                <div className="fa-card" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Linha do tempo — do recebimento até a saída</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {trace.movements.map((movement) => {
                      const meta = movementMeta(movement.type);
                      return (
                        <div key={movement.id} className="fa-card" style={{ padding: 14, background: 'var(--fa-mist-2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span className="fa-iconbox" style={{ width: 36, height: 36 }}><Icon name={meta.icon} size={16} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{meta.label} · lote <span className="fa-mono">{movement.batch || '—'}</span></div>
                              <div className="ph-cell-sub">{movement.performedByUserName || (movement.sourceType === 'marketplace_order' ? 'Cliente (compra online)' : 'Sistema')} · {movementDate(movement.createdAt)}</div>
                            </div>
                            <span className="fa-badge" style={{ background: movement.delta >= 0 ? 'var(--fa-success-soft)' : 'var(--fa-warn-soft)', color: movement.delta >= 0 ? 'var(--fa-success)' : 'var(--fa-warn)' }}>
                              {movement.delta > 0 ? '+' : ''}{movement.delta}
                            </span>
                          </div>
                          <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                            <div>Antes: <span className="fa-mono">{movement.before}</span> · Depois: <span className="fa-mono">{movement.after}</span></div>
                            <div>Origem: <span className="fa-mono">{movement.fromLocationCode || '—'}</span> · Destino: <span className="fa-mono">{movement.toLocationCode || '—'}</span></div>
                            <div>Motivo: {movement.reason || '—'}{movement.referenceCode ? ' · Referência: ' + movement.referenceCode : ''}</div>
                            {movement.sourceType === 'pdv_sale' && <div>Origem da baixa: venda no balcão (PDV) · {movement.sourceId}</div>}
                            {movement.sourceType === 'marketplace_order' && <div>Origem da baixa: pedido online (marketplace) · {movement.sourceId}</div>}
                          </div>
                          {movement.note && <div style={{ marginTop: 8, fontSize: 13 }}>{movement.note}</div>}
                        </div>
                      );
                    })}
                    {!trace.movements.length && <div className="ph-cell-sub">Nenhuma movimentação registrada para este produto.</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { ProductTraceScreen };
