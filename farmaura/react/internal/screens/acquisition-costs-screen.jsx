import React, { useEffect, useState } from "react";
import { InvoiceImportModal } from "./inventory-screen.jsx";
import { Icon, PageHead, Badge, StatCard, SearchInput, EmptyState, Modal, Field } from "../core/internal-ui.jsx";

/* FARMAURA Console — Custos de aquisição.
   Tela separada do Precificador/Produtos/Estoque: CRUD do custo de compra de cada produto
   (por loja), incluindo leitura de nota fiscal por IA e registro de custo de imposto e
   ICMS-ST — dados que o Precificador usa para calcular margem e tributos. Admin-only.

   Nota: InvoiceImportModal continua vindo de inventory-screen.jsx (Lote G, ainda não
   migrado) — é um modal grande e autocontido, próprio do Estoque; fica com o visual
   legado até esse lote em vez de duplicar aqui a leitura de nota por IA. */

const _prc = (n) => "R$ " + (Number(n) || 0).toFixed(2).replace(".", ",");

/* select tri-state: '' = herda o padrão do CNAE, 'yes'/'no' = força este item */
function icmsStSelectValue(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}
function icmsStFromSelectValue(value) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function AcquisitionCostsScreen({ ctx }) {
  const {
    inventory, storeDirectory, inventoryLocations,
    applyInventoryItemInvoice, fetchInventoryItemInvoices, downloadInventoryInvoiceFile,
    previewInventoryInvoice, confirmInventoryInvoice,
    notify,
  } = ctx;
  const [q, setQ] = useState("");
  const [manualEdit, setManualEdit] = useState(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);

  const storeNameById = Object.fromEntries((storeDirectory || []).map((store) => [store.id, store.name]));
  const categoryOptions = [...new Set(inventory.map((item) => item.cat || "Medicamentos"))].sort((left, right) => left.localeCompare(right, "pt-BR"));

  const rows = inventory
    .filter((it) => !q || (it.name + it.brand + it.ean).toLowerCase().includes(q.toLowerCase()))
    .slice()
    .sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));

  const withoutCost = inventory.filter((it) => !(Number(it.cost) > 0)).length;
  const withIcmsStOverride = inventory.filter((it) => it.isSubjectToIcmsSt != null).length;

  return (
    <div className="route-fade" data-screen-label="Custos de aquisição">
      <PageHead
        eyebrow="Custos" title="Custos de Aquisição" desc="Custo de compra, imposto e ICMS-ST por produto — usados pelo Precificador"
        actions={<SearchInput value={q} onChange={setQ} placeholder="Buscar produto ou EAN" />}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="boxes" label="Produtos" value={inventory.length} />
        <StatCard icon="alert" label="Sem custo lançado" value={withoutCost} tone={withoutCost ? "warning" : "accent"} />
        <StatCard icon="receipt" label="Com ICMS-ST definido no produto" value={withIcmsStOverride} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAiImportOpen(true)} disabled={!inventoryLocations.length}>
          <Icon name="scan" size={15} />Ler nota fiscal (IA)
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Custos por produto</div>
            <div className="card-head-sub">{rows.length} item(ns)</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Produto</th><th>Loja</th><th>Custo de aquisição</th><th>ICMS-ST</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="cell-strong">{it.name}</div>
                    <div className="cell-muted">{it.brand}{it.batch && it.batch !== "—" ? " · lote " + it.batch : ""}</div>
                  </td>
                  <td className="cell-muted">{storeNameById[it.storeId] || "—"}</td>
                  <td className="mono" style={{ fontWeight: 700 }}>{_prc(it.cost)}</td>
                  <td>
                    {it.isSubjectToIcmsSt == null
                      ? <Badge tone="neutral">Padrão do CNAE</Badge>
                      : it.isSubjectToIcmsSt
                        ? <Badge tone="warning"><Icon name="alert" size={11} />Sujeito a ICMS-ST</Badge>
                        : <Badge tone="good"><Icon name="check" size={11} />Não sujeito</Badge>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setManualEdit(it)}><Icon name="edit" size={14} />Lançar custo</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState icon="search" title="Nenhum produto encontrado" />}
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
              notify(error && error.message ? error.message : "Não foi possível anexar a nota fiscal.", "warn");
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
    </div>
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
  const [taxCostAmount, setTaxCostAmount] = useState("");
  const [isSubjectToIcmsSt, setIsSubjectToIcmsSt] = useState(icmsStSelectValue(it.isSubjectToIcmsSt));
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const fileInputId = "acquisition-invoice-file-" + String(it.id || "item");
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        invoiceTotalAmount, productTotalAmount, quantity, note, file,
        taxCostAmount: taxCostAmount === "" ? null : Number(taxCostAmount),
        isSubjectToIcmsSt: icmsStFromSelectValue(isSubjectToIcmsSt),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Lançar custo de aquisição"
      subtitle={<>{it.name} · {it.brand} · <span className="mono">{it.ean}</span></>}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={saving || !valid} onClick={handleSave}>
            <Icon name="check" size={16} />{saving ? "Salvando…" : "Salvar e anexar nota"}
          </button>
        </>
      )}
    >
      <p className="cell-muted" style={{ marginBottom: 18 }}>
        Anexe o PDF ou XML da nota, informe os valores e a quantidade recebida — o preço unitário é calculado automaticamente e passa a ser o custo do produto usado nos cálculos de margem, frete e taxas do precificador.
      </p>

      <div className="grid g-2">
        <Field label="Preço total da nota (R$)" hint="Valor total do documento — pode incluir outros produtos.">
          <input className="input" type="number" step="0.01" min="0" value={invoiceTotalAmount} onChange={(e) => setInvoiceTotalAmount(Number(e.target.value || 0))} />
        </Field>
        <Field label="Preço total do produto nesta nota (R$)">
          <input className="input" type="number" step="0.01" min="0" value={productTotalAmount} onChange={(e) => setProductTotalAmount(Number(e.target.value || 0))} />
        </Field>
        <Field label="Quantidade recebida">
          <input className="input" type="number" step="1" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} />
        </Field>
        <Field label="Preço unitário (calculado)">
          <div className="input" style={{ display: "flex", alignItems: "center", fontWeight: 700, color: "var(--brand)" }}>{_prc(unitPrice)}</div>
        </Field>
        <Field label="Custo de imposto (R$)" hint="Parcela do custo unitário que é imposto (ex.: ICMS-ST retido pelo fornecedor) — informativo.">
          <input className="input" type="number" step="0.01" min="0" value={taxCostAmount} onChange={(e) => setTaxCostAmount(e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="ICMS-ST deste produto" hint="Sobrepõe o padrão configurado no CNAE só para este produto, no cálculo de imposto do Precificador.">
          <select className="input" value={isSubjectToIcmsSt} onChange={(e) => setIsSubjectToIcmsSt(e.target.value)}>
            <option value="">Herdar padrão do CNAE</option>
            <option value="yes">Sujeito a ICMS-ST</option>
            <option value="no">Não sujeito a ICMS-ST</option>
          </select>
        </Field>
      </div>

      <Field label="Arquivo da nota (PDF ou XML) *">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-secondary" htmlFor={fileInputId}><Icon name="plus" size={14} />{file ? "Trocar arquivo" : "Selecionar arquivo"}</label>
          <input id={fileInputId} type="file" accept=".pdf,.xml,application/pdf,text/xml,application/xml" style={{ display: "none" }}
            onChange={(e) => setFile((e.target.files || [])[0] || null)} />
          {file && <span className="cell-muted">{file.name}</span>}
        </div>
      </Field>

      <Field label="Observação (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: fornecedor, número da nota..." />
      </Field>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="receipt" size={15} style={{ color: "var(--info)" }} />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Notas já anexadas a este produto</span>
        </div>
        {historyLoading ? (
          <div className="cell-muted">Carregando histórico…</div>
        ) : history.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
            {history.map((record) => (
              <div key={record.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                <span className="mono" style={{ fontSize: 12 }}>{record.fileName}</span>
                <span className="cell-muted">{record.quantity} un · {_prc(record.unitCost)}/un{record.taxCostAmount != null ? " · " + _prc(record.taxCostAmount) + " imposto" : ""}</span>
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => downloadInvoiceFile(record.id, record.fileName)}>
                  <Icon name="download" size={13} />Baixar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="cell-muted">Nenhuma nota anexada ainda para este produto.</div>
        )}
      </div>
    </Modal>
  );
}

export { AcquisitionCostsScreen };
