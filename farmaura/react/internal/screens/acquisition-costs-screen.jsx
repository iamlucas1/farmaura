import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryEmpty, InventoryKpi, InvoiceImportModal } from "./inventory-screen.jsx";

/* FARMAURA Console — Custos de aquisição.
   Tela separada do Precificador/Produtos/Estoque: CRUD do custo de compra de cada produto
   (por loja), incluindo leitura de nota fiscal por IA e registro de custo de imposto e
   ICMS-ST — dados que o Precificador usa para calcular margem e tributos. Admin-only. */

const _prc = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');

/* select tri-state: '' = herda o padrão do CNAE, 'yes'/'no' = força este item */
function icmsStSelectValue(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}
function icmsStFromSelectValue(value) {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

function AcquisitionCostsScreen({ ctx }) {
  const {
    inventory, storeDirectory, inventoryLocations,
    applyInventoryItemInvoice, fetchInventoryItemInvoices, downloadInventoryInvoiceFile,
    previewInventoryInvoice, confirmInventoryInvoice,
    notify, onLogout,
  } = ctx;
  const [q, setQ] = useState('');
  const [manualEdit, setManualEdit] = useState(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);

  const storeNameById = Object.fromEntries((storeDirectory || []).map((store) => [store.id, store.name]));
  const categoryOptions = [...new Set(inventory.map((item) => item.cat || 'Medicamentos'))].sort((left, right) => left.localeCompare(right, 'pt-BR'));

  const rows = inventory
    .filter((it) => !q || (it.name + it.brand + it.ean).toLowerCase().includes(q.toLowerCase()))
    .slice()
    .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const withoutCost = inventory.filter((it) => !(Number(it.cost) > 0)).length;
  const withIcmsStOverride = inventory.filter((it) => it.isSubjectToIcmsSt != null).length;

  return (
    <>
      <Topbar title="Custos de Aquisição" sub="Custo de compra, imposto e ICMS-ST por produto — usados pelo Precificador" onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch"><Icon name="scan" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar produto ou EAN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Topbar>

      <div className="ph-content ph-content-wide inv-screen" data-screen-label="Custos de aquisição">
        <div className="inv-kpis">
          <InventoryKpi icon="boxes" label="Produtos" value={inventory.length} />
          <InventoryKpi icon="alert" label="Sem custo lançado" value={withoutCost} tone={withoutCost ? 'warn' : undefined} />
          <InventoryKpi icon="receipt" label="Com ICMS-ST definido no produto" value={withIcmsStOverride} />
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setAiImportOpen(true)} disabled={!inventoryLocations.length}>
                <Icon name="scan" size={15} />Ler nota fiscal (IA)
              </button>
            </div>
          </div>
        </div>

        <div className="inv-card">
          <div className="inv-card-head">
            <div>
              <div className="inv-card-head-title">Custos por produto</div>
              <div className="inv-card-head-sub">{rows.length} item(ns)</div>
            </div>
          </div>
          <div className="ph-table-wrap">
            <table className="ph-table">
              <thead>
                <tr><th>Produto</th><th>Loja</th><th>Custo de aquisição</th><th>ICMS-ST</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="ph-td-name">{it.name}</div>
                      <div className="ph-cell-sub">{it.brand}{it.batch && it.batch !== '—' ? ' · lote ' + it.batch : ''}</div>
                    </td>
                    <td className="ph-cell-sub">{storeNameById[it.storeId] || '—'}</td>
                    <td className="fa-mono" style={{ fontWeight: 700 }}>{_prc(it.cost)}</td>
                    <td>
                      {it.isSubjectToIcmsSt == null
                        ? <span className="fa-badge fa-badge-mist">Padrão do CNAE</span>
                        : it.isSubjectToIcmsSt
                          ? <span className="fa-badge fa-badge-warn"><Icon name="alert" size={11} />Sujeito a ICMS-ST</span>
                          : <span className="fa-badge fa-badge-health"><Icon name="check" size={11} />Não sujeito</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setManualEdit(it)}><Icon name="edit" size={14} />Lançar custo</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <InventoryEmpty icon="search" label="Nenhum produto encontrado." />}
          </div>
        </div>
      </div>

      {manualEdit && (
        <AcquisitionCostModal
          it={manualEdit}
          fetchInvoices={fetchInventoryItemInvoices}
          downloadInvoiceFile={downloadInventoryInvoiceFile}
          onClose={() => setManualEdit(null)}
          onSave={async (patch) => {
            try {
              await applyInventoryItemInvoice(manualEdit.id, patch);
              setManualEdit(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Não foi possível anexar a nota fiscal.', 'warn');
            }
          }}
        />
      )}

      {aiImportOpen && (
        <InvoiceImportModal
          inventory={inventory}
          locations={inventoryLocations}
          categoryOptions={categoryOptions}
          onClose={() => setAiImportOpen(false)}
          onPreview={previewInventoryInvoice}
          onConfirm={confirmInventoryInvoice}
          notify={notify}
        />
      )}
    </>
  );
}

/* ===================== MODAL: LANÇAR CUSTO MANUALMENTE (SÓ ADMIN) ===================== */
function AcquisitionCostModal({ it, fetchInvoices, downloadInvoiceFile, onClose, onSave }) {
  // Ponto de partida realista antes do histórico carregar: usa o custo atual do item (já vem do estoque) com um lote de reposição típico, nunca zero/1 "vazio".
  const fallbackQuantity = 10;
  const fallbackUnitCost = +it.cost || 0;
  const [invoiceTotalAmount, setInvoiceTotalAmount] = useState(Math.round(fallbackUnitCost * fallbackQuantity * 100) / 100);
  const [productTotalAmount, setProductTotalAmount] = useState(Math.round(fallbackUnitCost * fallbackQuantity * 100) / 100);
  const [quantity, setQuantity] = useState(fallbackQuantity);
  const [taxCostAmount, setTaxCostAmount] = useState('');
  const [isSubjectToIcmsSt, setIsSubjectToIcmsSt] = useState(icmsStSelectValue(it.isSubjectToIcmsSt));
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const fileInputId = 'acquisition-invoice-file-' + String(it.id || 'item');
  const unitPrice = quantity > 0 ? productTotalAmount / quantity : 0;
  const valid = !!file && productTotalAmount > 0 && quantity > 0 && invoiceTotalAmount >= productTotalAmount;

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    fetchInvoices(it.id)
      .then((records) => {
        if (!active) return;
        setHistory(records);
        // Pré-preenche com a nota real mais recente deste produto (quando existir) em vez de deixar os campos zerados.
        const latest = records[0];
        if (latest) {
          setInvoiceTotalAmount(latest.invoiceTotalAmount);
          setProductTotalAmount(latest.productTotalAmount);
          setQuantity(latest.quantity);
          if (latest.taxCostAmount != null) setTaxCostAmount(String(latest.taxCostAmount));
        }
      })
      .catch(() => {})
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [it.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        invoiceTotalAmount, productTotalAmount, quantity, note, file,
        taxCostAmount: taxCostAmount === '' ? null : Number(taxCostAmount),
        isSubjectToIcmsSt: icmsStFromSelectValue(isSubjectToIcmsSt),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={560}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="edit" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Lançar custo de aquisição</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        <b>{it.name}</b> · {it.brand} · <span className="fa-mono">{it.ean}</span><br />
        Anexe o PDF ou XML da nota, informe os valores e a quantidade recebida — o preço unitário é calculado automaticamente e passa a ser o custo do produto usado nos cálculos de margem, frete e taxas do precificador.
      </p>

      <div className="fa-form2">
        <div className="fa-field">
          <label>Preço total da nota (R$)</label>
          <input className="fa-input" type="number" step="0.01" min="0" value={invoiceTotalAmount} onChange={(e) => setInvoiceTotalAmount(Number(e.target.value || 0))} />
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Valor total do documento — pode incluir outros produtos.</div>
        </div>
        <div className="fa-field">
          <label>Preço total do produto nesta nota (R$)</label>
          <input className="fa-input" type="number" step="0.01" min="0" value={productTotalAmount} onChange={(e) => setProductTotalAmount(Number(e.target.value || 0))} />
        </div>
        <div className="fa-field">
          <label>Quantidade recebida</label>
          <input className="fa-input" type="number" step="1" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} />
        </div>
        <div className="fa-field">
          <label>Preço unitário (calculado)</label>
          <div className="fa-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 700, color: 'var(--fa-primary)' }}>{_prc(unitPrice)}</div>
        </div>
        <div className="fa-field">
          <label>Custo de imposto (R$)</label>
          <input className="fa-input" type="number" step="0.01" min="0" value={taxCostAmount} onChange={(e) => setTaxCostAmount(e.target.value)} placeholder="Opcional" />
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Parcela do custo unitário que é imposto (ex.: ICMS-ST retido pelo fornecedor) — informativo.</div>
        </div>
        <div className="fa-field">
          <label>ICMS-ST deste produto</label>
          <select className="fa-select" value={isSubjectToIcmsSt} onChange={(e) => setIsSubjectToIcmsSt(e.target.value)}>
            <option value="">Herdar padrão do CNAE</option>
            <option value="yes">Sujeito a ICMS-ST</option>
            <option value="no">Não sujeito a ICMS-ST</option>
          </select>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Sobrepõe o padrão configurado no CNAE só para este produto, no cálculo de imposto do Precificador.</div>
        </div>
      </div>

      <div className="fa-field" style={{ marginTop: 14 }}>
        <label>Arquivo da nota (PDF ou XML) *</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="fa-btn fa-btn-soft" htmlFor={fileInputId}><Icon name="plus" size={14} />{file ? 'Trocar arquivo' : 'Selecionar arquivo'}</label>
          <input id={fileInputId} type="file" accept=".pdf,.xml,application/pdf,text/xml,application/xml" style={{ display: 'none' }}
            onChange={(e) => setFile((e.target.files || [])[0] || null)} />
          {file && <span className="ph-cell-sub">{file.name}</span>}
        </div>
      </div>

      <div className="fa-field" style={{ marginTop: 14 }}>
        <label>Observação (opcional)</label>
        <input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: fornecedor, número da nota..." />
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon name="receipt" size={15} style={{ color: 'var(--fa-info)' }} />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Notas já anexadas a este produto</span>
        </div>
        {historyLoading ? (
          <div className="ph-cell-sub">Carregando histórico…</div>
        ) : history.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
            {history.map((record) => (
              <div key={record.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: '8px 10px' }}>
                <span className="fa-mono" style={{ fontSize: 12 }}>{record.fileName}</span>
                <span className="ph-cell-sub">{record.quantity} un · {_prc(record.unitCost)}/un{record.taxCostAmount != null ? ' · ' + _prc(record.taxCostAmount) + ' imposto' : ''}</span>
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => downloadInvoiceFile(record.id, record.fileName)}>
                  <Icon name="download" size={13} />Baixar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="ph-cell-sub">Nenhuma nota anexada ainda para este produto.</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={saving || !valid} onClick={handleSave}>
          <Icon name="check" size={16} stroke={2.2} />{saving ? 'Salvando…' : 'Salvar e anexar nota'}
        </button>
      </div>
    </ModalShell>
  );
}

export { AcquisitionCostsScreen };
