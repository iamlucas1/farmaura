import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { StatCard } from "./dashboard-screen.jsx";

/* FARMAURA Console — Custo de Construção por loja.
   CRUD do investimento (dinheiro + tempo) gasto para construir cada loja, e o ROI calculado
   em cima do faturamento real (pedidos + PDV) daquela loja desde a data de abertura informada.
   Os nomes de campo no wire seguem exatamente o schema do backend (snake_case) — não há
   conversão automática de caixa entre o front e a API. Admin-only. */

const _br = (n, d = 0) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const _pct = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const _dateBr = (iso) => {
  if (!iso) return '';
  const parts = String(iso).split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : iso;
};

const CATEGORY_SUGGESTIONS = [
  'Reforma', 'Projeto/Arquitetura', 'Mobiliário', 'Equipamentos', 'Licenças e alvarás',
  'Mão de obra', 'Sinalização e fachada', 'Sistema (TI/PDV)', 'Estoque inicial', 'Outros',
];

function newCostItem() {
  return { id: 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), label: '', category: '', amount: 0, days: 0, note: '' };
}

function buildEntryForm(entry) {
  return {
    opened_at: (entry && entry.opened_at) || '',
    construction_started_at: (entry && entry.construction_started_at) || '',
    net_margin_pct: entry && entry.net_margin_pct != null ? Number(entry.net_margin_pct) : 15,
    items: entry && Array.isArray(entry.items) && entry.items.length ? entry.items.map((item) => ({ ...item })) : [newCostItem()],
  };
}

function ConstructionCostsScreen({ ctx }) {
  const { storeDirectory, constructionCosts, constructionCostsBusy, constructionCostsError, refreshConstructionCosts, saveConstructionCosts, notify, onLogout } = ctx;
  const [editStore, setEditStore] = useState(null);

  useEffect(() => {
    refreshConstructionCosts && refreshConstructionCosts();
  }, []);

  const allStores = storeDirectory || [];
  const storesData = constructionCosts && constructionCosts.stores ? constructionCosts.stores : {};
  const rows = allStores
    .map((store) => ({ store, entry: storesData[store.id] || null }))
    .sort((left, right) => (left.store.name || '').localeCompare(right.store.name || '', 'pt-BR'));

  const totalInvested = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.total_invested) : 0), 0);
  const totalDays = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.total_days) : 0), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.revenue_since_opening) : 0), 0);
  const totalProfit = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.estimated_profit_since_opening) : 0), 0);
  const avgRoiPct = totalInvested > 0 ? (totalProfit - totalInvested) / totalInvested * 100 : null;

  const saveStoreEntry = async (storeId, form) => {
    const nextStores = {};
    rows.forEach(({ store, entry }) => {
      if (entry) {
        nextStores[store.id] = {
          opened_at: entry.opened_at,
          construction_started_at: entry.construction_started_at,
          net_margin_pct: entry.net_margin_pct,
          items: entry.items,
        };
      }
    });
    nextStores[storeId] = form;
    await saveConstructionCosts(nextStores);
  };

  if (constructionCostsError) {
    return (
      <>
        <Topbar title="Custo de Construção" sub="Investimento e ROI por loja" onLogout={onLogout} ctx={ctx} />
        <div className="ph-content">
          <div className="fa-card" style={{ padding: 28, textAlign: 'center' }}>
            <Icon name="info" size={22} style={{ color: 'var(--fa-error)' }} />
            <div style={{ fontWeight: 800, marginTop: 10 }}>Não foi possível carregar o custo de construção</div>
            <div className="ph-cell-sub" style={{ marginTop: 4 }}>{constructionCostsError}</div>
            <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginTop: 14 }} onClick={refreshConstructionCosts}><Icon name="repeat" size={14} />Tentar novamente</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Custo de Construção" sub={rows.length + ' loja(s)'} onLogout={onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide" data-screen-label="Custo de construção por loja">
        <div className="ph-stats">
          <StatCard icon="store" value={_br(totalInvested)} label="Investido em construção (todas as lojas)" />
          <StatCard icon="clock" value={totalDays + ' dias'} label="Tempo de obra somado" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
          <StatCard icon="money" value={_br(totalRevenue)} label="Faturamento real desde a abertura" tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }} />
          <StatCard icon="trendup" value={avgRoiPct == null ? '—' : _pct(avgRoiPct)} label="ROI estimado (lucro sobre investimento)"
            tint={avgRoiPct == null ? undefined : avgRoiPct >= 0 ? { bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' } : { bg: '#FBEAE9', fg: 'var(--fa-error)' }} />
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Abertura</th>
                <th>Investido</th>
                <th>Tempo de obra</th>
                <th>Faturamento desde a abertura</th>
                <th>ROI · Payback</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ store, entry }) => {
                const hasOpenedAt = !!(entry && entry.opened_at);
                return (
                  <tr key={store.id}>
                    <td>
                      <div className="ph-td-name">{store.name}</div>
                      <div className="ph-cell-sub">{store.code}{store.city ? ' · ' + store.city : ''}</div>
                    </td>
                    <td>{hasOpenedAt ? _dateBr(entry.opened_at) : <span className="fa-badge fa-badge-warn">Definir data</span>}</td>
                    <td className="fa-mono" style={{ fontWeight: 700 }}>{_br(entry ? entry.total_invested : 0)}</td>
                    <td>{entry && entry.total_days ? entry.total_days + ' dias' : '—'}</td>
                    <td className="fa-mono">{hasOpenedAt ? _br(entry.revenue_since_opening) : '—'}</td>
                    <td>
                      {hasOpenedAt && entry.roi_pct != null ? (
                        <span style={{ color: entry.roi_pct >= 0 ? 'var(--fa-success)' : 'var(--fa-error)', fontWeight: 700 }}>{_pct(entry.roi_pct)}</span>
                      ) : <span className="ph-cell-sub">sem investimento lançado</span>}
                      {hasOpenedAt && entry.payback_months != null && (
                        <div className="ph-cell-sub">payback ~{Math.round(entry.payback_months)} meses</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditStore(store)}><Icon name="edit" size={14} />Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="pin" size={28} /></span>
              <div>Nenhuma loja cadastrada ainda.</div>
            </div>
          )}
        </div>
      </div>

      {editStore && (
        <ConstructionCostModal
          store={editStore}
          entry={storesData[editStore.id] || null}
          busy={constructionCostsBusy}
          onClose={() => setEditStore(null)}
          onSave={async (form) => {
            try {
              await saveStoreEntry(editStore.id, form);
              setEditStore(null);
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível salvar o custo de construção.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function ConstructionCostModal({ store, entry, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => buildEntryForm(entry));
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, newCostItem()] }));
  const updateItem = (id, patch) => setForm((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id) => setForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items }));

  const validItems = form.items.filter((item) => item.label.trim().length > 0);
  const totalAmount = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalDays = form.items.reduce((sum, item) => sum + (Number(item.days) || 0), 0);
  const valid = validItems.length > 0 && !!form.opened_at;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        opened_at: form.opened_at,
        construction_started_at: form.construction_started_at,
        net_margin_pct: Number(form.net_margin_pct) || 0,
        items: validItems.map((item) => ({
          id: item.id,
          label: item.label.trim(),
          category: item.category || '',
          amount: Number(item.amount) || 0,
          days: Number(item.days) || 0,
          note: item.note || '',
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={true} onClose={(busy || saving) ? () => {} : onClose} maxw={780}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="store" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Custo de construção · {store.name}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Lance os itens de custo (valor e dias gastos) e a data de abertura. O ROI é calculado sozinho a
        partir das vendas reais desta loja desde a abertura, aplicando a margem líquida esperada abaixo.
      </p>

      <div className="fa-form2">
        <div className="fa-field">
          <label>Data de abertura *</label>
          <input className="fa-input" type="date" value={form.opened_at} onChange={(e) => setField('opened_at', e.target.value)} />
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>A partir desta data as vendas da loja entram no cálculo de faturamento e ROI.</div>
        </div>
        <div className="fa-field">
          <label>Início da obra</label>
          <input className="fa-input" type="date" value={form.construction_started_at} onChange={(e) => setField('construction_started_at', e.target.value)} />
        </div>
        <div className="fa-field">
          <label>Margem líquida esperada (%)</label>
          <input className="fa-input" type="number" step="0.5" min="0" max="100" value={form.net_margin_pct} onChange={(e) => setField('net_margin_pct', e.target.value)} />
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Usada para estimar o lucro sobre o faturamento real e calcular o ROI.</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="store" size={15} style={{ color: 'var(--fa-info)' }} />
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>Itens de custo</span>
          <span className="ph-cell-sub">{_br(totalAmount)} · {totalDays} dias</span>
        </div>

        <datalist id="construction-cost-categories">
          {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
        </datalist>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 10 }}>
              <input className="fa-input" style={{ flex: '2 1 160px' }} placeholder="Descrição (ex.: Reforma do salão)" value={item.label} onChange={(e) => updateItem(item.id, { label: e.target.value })} />
              <input className="fa-input" style={{ flex: '1 1 140px' }} list="construction-cost-categories" placeholder="Categoria" value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })} />
              <input className="fa-input" type="number" step="0.01" min="0" style={{ flex: '1 1 110px' }} placeholder="R$" value={item.amount} onChange={(e) => updateItem(item.id, { amount: e.target.value })} />
              <input className="fa-input" type="number" step="1" min="0" style={{ flex: '0 1 90px' }} placeholder="dias" value={item.days} onChange={(e) => updateItem(item.id, { days: e.target.value })} />
              <button type="button" className="fa-iconbtn" style={{ width: 40, height: 40 }} onClick={() => removeItem(item.id)} aria-label="Remover item" title="Remover item">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={addItem}><Icon name="plus" size={14} />Adicionar item de custo</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy || saving}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy || saving} onClick={handleSave}>
          <Icon name="check" size={16} />{saving ? 'Salvando…' : 'Salvar custo de construção'}
        </button>
      </div>
    </ModalShell>
  );
}

export { ConstructionCostsScreen };
