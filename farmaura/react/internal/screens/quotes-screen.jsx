import React, { useEffect, useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";
import { SupplierModal } from "./suppliers-screen.jsx";

/* FARMAURA Console — Orçamentos (cotações de compra).
   Captura de cotações de fornecedores (manual ou por IA a partir de PDF/imagem/XLSX/DOCX) para
   apoiar a decisão de compra: fornecedor, produto, preço, formas de pagamento, comodato (ex.:
   geladeira Red Bull), frete FOB/CIF e prazo de entrega. Nunca cria ou altera produtos à venda —
   é somente um registro de orçamento, com a data da cotação preservada (preço varia por dia). */

const PAYMENT_METHOD_LABEL = {
  pix: 'Pix',
  boleto_avista: 'Boleto à vista',
  boleto_prazo: 'Boleto a prazo',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  consignado: 'Consignado',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  outro: 'Outro',
};
const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABEL);
const QUOTE_STATUS_LABEL = { draft: 'Rascunho', confirmed: 'Confirmado', archived: 'Arquivado' };
const UNIT_OPTIONS = ['un', 'cx', 'fardo', 'pct', 'kg', 'g', 'L', 'mL', 'fr', 'dz', 'cartela', 'ampola'];
const PACKAGE_LIKE_UNITS = ['cx', 'fardo', 'pct', 'dz', 'cartela'];
const MAX_BATCH_FILES = 10;
const MAX_CONCURRENT_PREVIEWS = 5;
const MAX_PREVIEW_ATTEMPTS = 3;

function paymentMethodLabel(method) { return PAYMENT_METHOD_LABEL[method] || 'Outro'; }
function todayIsoDate() { return new Date().toISOString().slice(0, 10); }
function itemTotalValue(item) { return Number(item.quantityReference || 0) * Number(item.unitPrice || 0); }

/* Seletor de unidade com fallback "Outro" — orçamentos já existentes podem ter um valor de unidade
   fora da lista fixa, e sem esse fallback o <select> ficaria sem nenhuma opção visivelmente marcada. */
function UnitSelect({ value, onChange }) {
  const isKnown = UNIT_OPTIONS.includes(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <select className="fa-select" value={isKnown ? value : '__outro__'} onChange={(e) => {
        if (e.target.value === '__outro__') { onChange(isKnown ? '' : value); return; }
        onChange(e.target.value);
      }}>
        {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        <option value="__outro__">Outro…</option>
      </select>
      {!isKnown && <input className="fa-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Digite a unidade" />}
    </div>
  );
}

function QuotesScreen({ ctx }) {
  const {
    suppliers, addSupplier, fetchPurchaseQuotes, createPurchaseQuote, updatePurchaseQuote, updatePurchaseQuoteStatus,
    downloadPurchaseQuoteFile, previewPurchaseQuoteImportOne, confirmPurchaseQuoteImportBatch,
    setPendingPurchaseQuoteId, onNav,
    notify, onLogout,
  } = ctx;
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [freightFilter, setFreightFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editQuote, setEditQuote] = useState(null);
  const [viewQuote, setViewQuote] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const items = await fetchPurchaseQuotes({
        productQuery: q,
        supplierId: supplierFilter === 'all' ? '' : supplierFilter,
        paymentMethod: paymentFilter === 'all' ? '' : paymentFilter,
        freightType: freightFilter === 'all' ? '' : freightFilter,
        status: statusFilter === 'all' ? '' : statusFilter,
        dateFrom, dateTo,
      });
      setQuotes(items);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar os orçamentos.', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [supplierFilter, paymentFilter, freightFilter, statusFilter, dateFrom, dateTo]);

  const activeCount = quotes.filter((quote) => quote.status === 'confirmed').length;
  const supplierCount = new Set(quotes.map((quote) => quote.supplierId || quote.supplierName)).size;
  const itemCount = quotes.reduce((sum, quote) => sum + quote.items.length, 0);
  const comodatoCount = quotes.reduce((sum, quote) => sum + quote.items.filter((item) => item.isComodato).length, 0);

  const rows = quotes.filter((quote) => {
    if (!q) return true;
    const haystack = (quote.supplierName + ' ' + quote.items.map((item) => item.description).join(' ')).toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const handleArchive = async (quote) => {
    setBusyId(quote.id);
    try {
      await updatePurchaseQuoteStatus(quote.id, quote.status === 'archived' ? 'confirmed' : 'archived');
      await load();
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o status do orçamento.', 'warn');
    } finally {
      setBusyId('');
    }
  };

  return (
    <>
      <Topbar title="Orçamentos" sub="Cotações de fornecedores para decisão de compra" onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por fornecedor ou produto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="card" label="Orçamentos confirmados" value={activeCount} />
          <InventoryKpi icon="truck" label="Fornecedores cotados" value={supplierCount} />
          <InventoryKpi icon="capsule" label="Itens cotados" value={itemCount} />
          <InventoryKpi icon="gift" label="Itens em comodato" value={comodatoCount} />
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={load}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setImportOpen(true)}><Icon name="camera" size={15} />Importar com IA</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Cadastro manual</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Fornecedor</label>
              <select className="fa-select" style={{ minWidth: 180 }} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                <option value="all">Todos os fornecedores</option>
                {(suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.legalName}</option>)}
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Forma de pagamento</label>
              <select className="fa-select" style={{ minWidth: 170 }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">Todas</option>
                {PAYMENT_METHOD_OPTIONS.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Frete</label>
              <select className="fa-select" style={{ minWidth: 120 }} value={freightFilter} onChange={(e) => setFreightFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Status</label>
              <select className="fa-select" style={{ minWidth: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Todos</option>
                <option value="confirmed">Confirmado</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <div className="inv-filter-field">
              <label>Cotado de</label>
              <input className="fa-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="inv-filter-field">
              <label>Cotado até</label>
              <input className="fa-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Data da cotação</th>
                <th>Itens</th>
                <th>Pagamento</th>
                <th>Frete</th>
                <th>Prazo entrega</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <div className="ph-td-name">{quote.supplierName}</div>
                    <div className="ph-cell-sub">{quote.supplierDocument || 'CNPJ não informado'}</div>
                  </td>
                  <td className="fa-mono">{quote.quoteDate}{quote.validUntil ? <span className="ph-cell-sub"> · válido até {quote.validUntil}</span> : null}</td>
                  <td>{quote.items.length} item(ns){quote.items.some((item) => item.isComodato) ? <span className="fa-badge fa-badge-mist" style={{ marginLeft: 6 }}>comodato</span> : null}</td>
                  <td>
                    {quote.paymentTerms.length
                      ? quote.paymentTerms.map((term) => <span key={term.id} className="fa-badge" style={{ marginRight: 4 }}>{paymentMethodLabel(term.method)}</span>)
                      : <span className="ph-cell-sub">—</span>}
                  </td>
                  <td>{quote.freightType || '—'}{quote.freightCost ? <span className="ph-cell-sub"> · {brl(quote.freightCost)}</span> : null}</td>
                  <td>{quote.deliveryTimeDays != null ? quote.deliveryTimeDays + ' dia(s)' : '—'}</td>
                  <td>
                    <span className="fa-badge" style={quote.status === 'confirmed' ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
                      {QUOTE_STATUS_LABEL[quote.status] || quote.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setViewQuote(quote)}><Icon name="eye" size={14} />Visualizar</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 8 }} onClick={() => setEditQuote(quote)}><Icon name="edit" size={14} />Editar</button>
                    {quote.status === 'confirmed' && (
                      <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginLeft: 8 }} onClick={() => { setPendingPurchaseQuoteId(quote.id); onNav('purchase-receiving'); }}>
                        <Icon name="plusCircle" size={14} />Confirmar compra
                      </button>
                    )}
                    {quote.hasFile && (
                      <button className="fa-iconbtn" style={{ marginLeft: 8, width: 34, height: 34 }} onClick={() => downloadPurchaseQuoteFile(quote.id, quote.fileName)} aria-label="Baixar arquivo original" title="Baixar arquivo original">
                        <Icon name="chevD" size={16} />
                      </button>
                    )}
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={busyId === quote.id}
                      onClick={() => handleArchive(quote)}
                      aria-label={quote.status === 'archived' ? 'Reativar orçamento' : 'Arquivar orçamento'}
                      title={quote.status === 'archived' ? 'Reativar orçamento' : 'Arquivar orçamento'}
                    >
                      <Icon name={quote.status === 'archived' ? 'repeat' : 'trash'} size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="card" size={28} /></span>
              <div>Nenhum orçamento encontrado.</div>
            </div>
          )}
        </div>
      </div>

      {viewQuote && (
        <QuoteViewModal quote={viewQuote} onClose={() => setViewQuote(null)} />
      )}
      {editQuote && (
        <QuoteFormModal
          title="Editar orçamento"
          submitLabel="Salvar alterações"
          initialQuote={editQuote}
          suppliers={suppliers}
          onClose={() => setEditQuote(null)}
          onSave={async (payload) => {
            try {
              await updatePurchaseQuote(editQuote.id, payload);
              setEditQuote(null);
              await load();
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o orçamento.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <QuoteFormModal
          title="Cadastrar orçamento"
          submitLabel="Salvar orçamento"
          suppliers={suppliers}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await createPurchaseQuote(payload);
              setNewOpen(false);
              await load();
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o orçamento.', 'warn');
            }
          }}
        />
      )}
      {importOpen && (
        <QuoteImportModal
          suppliers={suppliers}
          onAddSupplier={addSupplier}
          onClose={() => setImportOpen(false)}
          onPreviewOne={previewPurchaseQuoteImportOne}
          onConfirmBatch={async (payload) => {
            const result = await confirmPurchaseQuoteImportBatch(payload);
            await load();
            return result;
          }}
          notify={notify}
        />
      )}
    </>
  );
}

/* ===================== FORMAS DE PAGAMENTO E ITENS (linhas dinâmicas) ===================== */
function emptyPaymentTerm() { return { method: 'pix', discountPercent: '', surchargePercent: '', installmentCount: '', daysToPay: '', notes: '' }; }
function emptyItem() { return { productId: '', description: '', brandName: '', skuSnapshot: '', eanCodeSnapshot: '', unit: 'un', unitsPerPackage: '', quantityReference: '', unitPrice: '', ncmCode: '', ipiPercentage: '', icmsStValue: '', finalUnitPrice: '', isComodato: false, comodatoNotes: '', notes: '' }; }

function PaymentTermsEditor({ terms, onChange }) {
  const setTerm = (index, patch) => onChange(terms.map((term, i) => i === index ? { ...term, ...patch } : term));
  const removeTerm = (index) => onChange(terms.filter((_, i) => i !== index));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {terms.map((term, index) => (
        <div key={index} className="fa-card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
          <div className="fa-field"><label>Forma</label>
            <select className="fa-select" value={term.method} onChange={(e) => setTerm(index, { method: e.target.value })}>
              {PAYMENT_METHOD_OPTIONS.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
            </select>
          </div>
          <div className="fa-field"><label>Desconto (%)</label><input className="fa-input" type="number" step="0.01" min="0" max="100" value={term.discountPercent} onChange={(e) => setTerm(index, { discountPercent: e.target.value })} /></div>
          <div className="fa-field"><label>Acréscimo (%)</label><input className="fa-input" type="number" step="0.01" min="0" max="100" value={term.surchargePercent} onChange={(e) => setTerm(index, { surchargePercent: e.target.value })} /></div>
          <div className="fa-field"><label>Parcelas</label><input className="fa-input" type="number" min="1" value={term.installmentCount} onChange={(e) => setTerm(index, { installmentCount: e.target.value })} /></div>
          <div className="fa-field"><label>Prazo (dias)</label><input className="fa-input" type="number" min="0" value={term.daysToPay} onChange={(e) => setTerm(index, { daysToPay: e.target.value })} /></div>
          <button className="fa-iconbtn" style={{ width: 36, height: 36 }} onClick={() => removeTerm(index)} aria-label="Remover forma de pagamento"><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...terms, emptyPaymentTerm()])}>
        <Icon name="plus" size={14} />Adicionar forma de pagamento
      </button>
    </div>
  );
}

function ItemsEditor({ items, onChange }) {
  const setItem = (index, patch) => onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item));
  const removeItem = (index) => onChange(items.filter((_, i) => i !== index));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, index) => (
        <div key={index} className="fa-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="fa-badge fa-badge-mist">Item {index + 1}</span>
            <button className="fa-iconbtn" style={{ width: 32, height: 32 }} onClick={() => removeItem(index)} aria-label="Remover item"><Icon name="trash" size={14} /></button>
          </div>
          <div className="fa-form2">
            <div className="fa-field fa-span2"><label>Descrição *</label><input className="fa-input" value={item.description} onChange={(e) => setItem(index, { description: e.target.value })} /></div>
            <div className="fa-field"><label>Marca</label><input className="fa-input" value={item.brandName} onChange={(e) => setItem(index, { brandName: e.target.value })} /></div>
            <div className="fa-field"><label>Unidade</label><UnitSelect value={item.unit} onChange={(unit) => setItem(index, { unit })} /></div>
            {PACKAGE_LIKE_UNITS.includes(item.unit) && (
              <div className="fa-field"><label>Unidades por {item.unit}</label><input className="fa-input" type="number" step="1" min="1" value={item.unitsPerPackage} onChange={(e) => setItem(index, { unitsPerPackage: e.target.value })} placeholder="Ex.: 50" /></div>
            )}
            <div className="fa-field"><label>Quantidade de referência</label><input className="fa-input" type="number" step="0.001" min="0" value={item.quantityReference} onChange={(e) => setItem(index, { quantityReference: e.target.value })} /></div>
            <div className="fa-field"><label>Preço unitário (R$) *</label><input className="fa-input" type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => setItem(index, { unitPrice: e.target.value })} /></div>
            <div className="fa-field"><label>Valor total</label><input className="fa-input" value={brl(itemTotalValue(item))} disabled /></div>
            <div className="fa-field"><label>SKU</label><input className="fa-input" value={item.skuSnapshot} onChange={(e) => setItem(index, { skuSnapshot: e.target.value })} /></div>
            <div className="fa-field"><label>EAN</label><input className="fa-input" value={item.eanCodeSnapshot} onChange={(e) => setItem(index, { eanCodeSnapshot: e.target.value })} /></div>
            <div className="fa-field"><label>NCM</label><input className="fa-input" value={item.ncmCode} onChange={(e) => setItem(index, { ncmCode: e.target.value })} placeholder="Ex.: 34013000" /></div>
            <div className="fa-field"><label>IPI (%)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.ipiPercentage} onChange={(e) => setItem(index, { ipiPercentage: e.target.value })} /></div>
            <div className="fa-field"><label>ST (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.icmsStValue} onChange={(e) => setItem(index, { icmsStValue: e.target.value })} /></div>
            <div className="fa-field"><label>Preço final (c/ impostos)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.finalUnitPrice} onChange={(e) => setItem(index, { finalUnitPrice: e.target.value })} placeholder="Opcional" /></div>
          </div>
          <label className="fa-check" data-on={item.isComodato ? '1' : '0'} onClick={() => setItem(index, { isComodato: !item.isComodato })} style={{ marginTop: 10 }}>
            <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Item em comodato (ex.: geladeira cedida pelo fornecedor)
          </label>
          {item.isComodato && (
            <div className="fa-field" style={{ marginTop: 10 }}>
              <label>Condições do comodato</label>
              <input className="fa-input" value={item.comodatoNotes} onChange={(e) => setItem(index, { comodatoNotes: e.target.value })} placeholder="Ex.: reposição mínima de 10 caixas/mês" />
            </div>
          )}
        </div>
      ))}
      <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, emptyItem()])}>
        <Icon name="plus" size={14} />Adicionar item
      </button>
    </div>
  );
}

/* ===================== MODAL: VISUALIZAÇÃO (SOMENTE LEITURA) ===================== */
function QuoteViewModal({ quote, onClose }) {
  return (
    <ModalShell open={true} onClose={onClose} maxw={920} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="eye" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{quote.supplierName}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        {quote.supplierDocument || 'CNPJ não informado'} · Cotado em {quote.quoteDate}
        {quote.validUntil ? ' · válido até ' + quote.validUntil : ''}
      </p>

      <div className="fa-form2" style={{ marginBottom: 4 }}>
        <div className="fa-field"><label>Frete</label><div className="ph-cell-sub">{quote.freightType || '—'}{quote.freightCost ? ' · ' + brl(quote.freightCost) : ''}</div></div>
        <div className="fa-field"><label>Prazo de entrega</label><div className="ph-cell-sub">{quote.deliveryTimeDays != null ? quote.deliveryTimeDays + ' dia(s)' : '—'}</div></div>
        <div className="fa-field"><label>Status</label><div className="ph-cell-sub">{QUOTE_STATUS_LABEL[quote.status] || quote.status}</div></div>
        {quote.notes && <div className="fa-field fa-span2"><label>Observações</label><div className="ph-cell-sub">{quote.notes}</div></div>}
      </div>

      <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Formas de pagamento</div>
      {quote.paymentTerms.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {quote.paymentTerms.map((term) => (
            <span key={term.id} className="fa-badge">
              {paymentMethodLabel(term.method)}
              {term.discountPercent ? ' · ' + term.discountPercent + '% desconto' : ''}
              {term.surchargePercent ? ' · ' + term.surchargePercent + '% acréscimo' : ''}
              {term.daysToPay ? ' · ' + term.daysToPay + ' dias' : ''}
              {term.installmentCount ? ' · ' + term.installmentCount + 'x' : ''}
            </span>
          ))}
        </div>
      ) : <div className="ph-cell-sub">Nenhuma forma de pagamento cadastrada.</div>}

      <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Itens cotados ({quote.items.length})</div>
      <div className="ph-table-wrap">
        <table className="ph-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Marca</th>
              <th>Unidade</th>
              <th>Quantidade</th>
              <th>Impostos</th>
              <th>Preço unitário</th>
              <th>Valor total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="ph-td-name">{item.description}</div>
                  {item.isComodato && <span className="fa-badge fa-badge-mist" style={{ marginTop: 4 }}><Icon name="gift" size={11} />Comodato{item.comodatoNotes ? ' · ' + item.comodatoNotes : ''}</span>}
                </td>
                <td>{item.brandName || '—'}</td>
                <td>{item.unit}{item.unitsPerPackage ? <span className="ph-cell-sub"> · {item.unitsPerPackage} un/{item.unit}</span> : null}</td>
                <td>{item.quantityReference != null ? item.quantityReference : '—'}</td>
                <td>
                  {item.ncmCode ? <div>NCM {item.ncmCode}</div> : null}
                  {(item.ipiPercentage != null || item.icmsStValue != null) && (
                    <span className="ph-cell-sub">
                      {item.ipiPercentage != null ? 'IPI ' + item.ipiPercentage + '%' : ''}
                      {item.ipiPercentage != null && item.icmsStValue != null ? ' · ' : ''}
                      {item.icmsStValue != null ? 'ST ' + brl(item.icmsStValue) : ''}
                    </span>
                  )}
                  {!item.ncmCode && item.ipiPercentage == null && item.icmsStValue == null ? '—' : null}
                </td>
                <td>
                  {brl(item.unitPrice)}
                  {item.finalUnitPrice != null && <div className="ph-cell-sub">Final: {brl(item.finalUnitPrice)}</div>}
                </td>
                <td>{brl(itemTotalValue(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} onClick={onClose}>Fechar</button>
      </div>
    </ModalShell>
  );
}

/* ===================== MODAL: CADASTRO/EDIÇÃO MANUAL ===================== */
function buildQuoteForm(quote) {
  return {
    supplierId: quote && quote.supplierId || '',
    supplierName: quote && quote.supplierName || '',
    supplierDocument: quote && quote.supplierDocument || '',
    quoteDate: quote && quote.quoteDate || todayIsoDate(),
    validUntil: quote && quote.validUntil || '',
    freightType: quote && quote.freightType || '',
    freightCost: quote && quote.freightCost != null ? quote.freightCost : '',
    deliveryTimeDays: quote && quote.deliveryTimeDays != null ? quote.deliveryTimeDays : '',
    notes: quote && quote.notes || '',
    paymentTerms: quote && quote.paymentTerms && quote.paymentTerms.length ? quote.paymentTerms.map((term) => ({ ...term, discountPercent: term.discountPercent ?? '', surchargePercent: term.surchargePercent ?? '', installmentCount: term.installmentCount ?? '', daysToPay: term.daysToPay ?? '' })) : [emptyPaymentTerm()],
    items: quote && quote.items && quote.items.length ? quote.items.map((item) => ({ ...item, unitsPerPackage: item.unitsPerPackage ?? '', quantityReference: item.quantityReference ?? '', ipiPercentage: item.ipiPercentage ?? '', icmsStValue: item.icmsStValue ?? '', finalUnitPrice: item.finalUnitPrice ?? '' })) : [emptyItem()],
  };
}

function QuoteFormModal({ title, submitLabel, initialQuote, suppliers, onClose, onSave }) {
  const [form, setForm] = useState(() => buildQuoteForm(initialQuote));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const validItems = form.items.length > 0 && form.items.every((item) => item.description.trim() && Number(item.unitPrice) >= 0 && item.unitPrice !== '');
  const valid = form.supplierName.trim().length >= 2 && !!form.quoteDate && validItems;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={920} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="card" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Registre a proposta do fornecedor exatamente como recebida. Este cadastro é apenas um orçamento — não altera o catálogo de produtos à venda.
      </p>

      <div className="fa-form2">
        <div className="fa-field fa-span2">
          <label>Fornecedor cadastrado (opcional)</label>
          <select className="fa-select" value={form.supplierId} onChange={(e) => {
            const selected = (suppliers || []).find((supplier) => supplier.id === e.target.value);
            set('supplierId', e.target.value);
            if (selected) { set('supplierName', selected.legalName); set('supplierDocument', selected.cnpj); }
          }}>
            <option value="">Fornecedor avulso (não cadastrado)</option>
            {(suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.legalName}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Nome do fornecedor *</label><input className="fa-input" value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} /></div>
        <div className="fa-field"><label>CNPJ</label><input className="fa-input" value={form.supplierDocument} onChange={(e) => set('supplierDocument', e.target.value)} /></div>
        <div className="fa-field"><label>Data da cotação *</label><input className="fa-input" type="date" value={form.quoteDate} onChange={(e) => set('quoteDate', e.target.value)} /></div>
        <div className="fa-field"><label>Válido até</label><input className="fa-input" type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></div>
        <div className="fa-field">
          <label>Frete</label>
          <select className="fa-select" value={form.freightType} onChange={(e) => set('freightType', e.target.value)}>
            <option value="">Não informado</option>
            <option value="FOB">FOB</option>
            <option value="CIF">CIF</option>
          </select>
        </div>
        <div className="fa-field"><label>Custo do frete (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={form.freightCost} onChange={(e) => set('freightCost', e.target.value)} /></div>
        <div className="fa-field"><label>Prazo de entrega (dias)</label><input className="fa-input" type="number" min="0" value={form.deliveryTimeDays} onChange={(e) => set('deliveryTimeDays', e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Observações</label><input className="fa-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </div>

      <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Formas de pagamento</div>
      <PaymentTermsEditor terms={form.paymentTerms} onChange={(terms) => set('paymentTerms', terms)} />

      <div style={{ marginTop: 20, marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Itens cotados</div>
      <ItemsEditor items={form.items} onChange={(items) => set('items', items)} />

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{busy ? 'Salvando…' : submitLabel}</button>
      </div>
    </ModalShell>
  );
}

/* ===================== MODAL: IMPORTAR ORÇAMENTO COM IA ===================== */
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupFormFromPreview(payload) {
  return {
    supplierId: payload.header.matchedSupplierId || '',
    supplierName: payload.header.supplierName,
    supplierDocument: payload.header.supplierDocument,
    quoteDate: /^\d{4}-\d{2}-\d{2}$/.test(payload.header.quoteDate) ? payload.header.quoteDate : todayIsoDate(),
    validUntil: /^\d{4}-\d{2}-\d{2}$/.test(payload.header.validUntil) ? payload.header.validUntil : '',
    freightType: payload.header.freightType,
    freightCost: payload.header.freightCost != null ? payload.header.freightCost : '',
    deliveryTimeDays: payload.header.deliveryTimeDays != null ? payload.header.deliveryTimeDays : '',
    notes: payload.header.notes,
    paymentTerms: payload.paymentTerms.length ? payload.paymentTerms.map((term) => ({ ...term, discountPercent: term.discountPercent ?? '', surchargePercent: term.surchargePercent ?? '', installmentCount: term.installmentCount ?? '', daysToPay: term.daysToPay ?? '' })) : [emptyPaymentTerm()],
    items: payload.items.map((item) => ({
      productId: item.matchCandidates[0] ? item.matchCandidates[0].id : '',
      description: item.description, brandName: item.brandName, skuSnapshot: item.sku, eanCodeSnapshot: item.eanCode,
      unit: item.unit, unitsPerPackage: item.unitsPerPackage ?? '', quantityReference: item.quantityReference ?? '', unitPrice: item.unitPrice,
      ncmCode: item.ncmCode ?? '', ipiPercentage: item.ipiPercentage ?? '', icmsStValue: item.icmsStValue ?? '', finalUnitPrice: item.finalUnitPrice ?? '',
      isComodato: item.isComodato, comodatoNotes: item.comodatoNotes, notes: '',
      matchCandidates: item.matchCandidates,
    })),
  };
}

function isGroupValid(form) {
  const validItems = form.items.length > 0 && form.items.every((item) => item.description.trim() && item.unitPrice !== '' && Number(item.unitPrice) >= 0);
  return !!form.supplierId && !!form.quoteDate && validItems;
}

function QuoteReviewGroup({ group, index, suppliers, onChange, onRemove, onAddSupplier, notify }) {
  const { fileName, preview, form, confirmError } = group;
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const set = (key, value) => onChange(index, (prev) => ({ ...prev, [key]: value }));
  const setItem = (itemIndex, patch) => onChange(index, (prev) => ({ ...prev, items: prev.items.map((it, i) => i === itemIndex ? { ...it, ...patch } : it) }));

  const itemsByBrand = form.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .sort((a, b) => (a.item.brandName || '').localeCompare(b.item.brandName || '', 'pt-BR'));
  let lastBrand = undefined;

  return (
    <div className="fa-card" style={{ padding: 18, marginBottom: 16, border: confirmError ? '1px solid var(--fa-error)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{form.supplierName || 'Fornecedor não identificado'}</div>
          <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
            <div>Arquivo: <span className="fa-mono">{fileName}</span></div>
            <div>Provider: <span className="fa-mono">{preview.provider} · {preview.model}</span> · Itens: <span className="fa-mono">{preview.items.length}</span></div>
          </div>
          {confirmError && <div style={{ color: 'var(--fa-error)', fontWeight: 700, marginTop: 6, fontSize: 13.5 }}>{confirmError}</div>}
        </div>
        <button className="fa-iconbtn" style={{ width: 32, height: 32 }} onClick={() => onRemove(index)} aria-label="Remover este orçamento da lista"><Icon name="trash" size={14} /></button>
      </div>

      <div className="fa-form2" style={{ marginBottom: 16 }}>
        <div className="fa-field fa-span2">
          <label>Fornecedor *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fa-select" style={{ flex: 1 }} value={form.supplierId} onChange={(e) => {
              const selected = (suppliers || []).find((supplier) => supplier.id === e.target.value);
              set('supplierId', e.target.value);
              if (selected) { set('supplierName', selected.legalName); set('supplierDocument', selected.cnpj); }
            }}>
              <option value="">Selecione um fornecedor cadastrado</option>
              {(suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.legalName}</option>)}
            </select>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setAddSupplierOpen(true)}><Icon name="plus" size={14} stroke={2.2} />Adicionar</button>
          </div>
          {!form.supplierId && (
            <div className="ph-cell-sub" style={{ color: 'var(--fa-error)', marginTop: 4 }}>
              {form.supplierName ? `Fornecedor extraído ("${form.supplierName}") não está cadastrado — selecione o correspondente ou cadastre um novo.` : 'Selecione um fornecedor cadastrado ou cadastre um novo.'}
            </div>
          )}
        </div>
        <div className="fa-field"><label>Data da cotação *</label><input className="fa-input" type="date" value={form.quoteDate} onChange={(e) => set('quoteDate', e.target.value)} /></div>
        <div className="fa-field"><label>Válido até</label><input className="fa-input" type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></div>
        <div className="fa-field">
          <label>Frete</label>
          <select className="fa-select" value={form.freightType} onChange={(e) => set('freightType', e.target.value)}>
            <option value="">Não informado</option>
            <option value="FOB">FOB</option>
            <option value="CIF">CIF</option>
          </select>
        </div>
        <div className="fa-field"><label>Custo do frete (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={form.freightCost} onChange={(e) => set('freightCost', e.target.value)} /></div>
        <div className="fa-field"><label>Prazo de entrega (dias)</label><input className="fa-input" type="number" min="0" value={form.deliveryTimeDays} onChange={(e) => set('deliveryTimeDays', e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Observações</label><input className="fa-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </div>

      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Formas de pagamento</div>
      <PaymentTermsEditor terms={form.paymentTerms} onChange={(terms) => set('paymentTerms', terms)} />

      <div style={{ margin: '20px 0 8px', fontWeight: 700, fontSize: 13.5 }}>Itens extraídos (por marca)</div>
      <div style={{ maxHeight: '40vh', overflowY: 'auto', paddingRight: 6, display: 'grid', gap: 12 }}>
        {itemsByBrand.map(({ item, itemIndex }) => {
          const brandLabel = item.brandName || 'Sem marca';
          const showBrandHeader = brandLabel !== lastBrand;
          lastBrand = brandLabel;
          return (
            <React.Fragment key={itemIndex}>
              {showBrandHeader && (
                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--fa-ink-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>{brandLabel}</div>
              )}
              <div className="fa-card" style={{ padding: 14, borderLeft: item.isComodato ? '4px solid var(--fa-info)' : '4px solid var(--fa-success)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="fa-badge fa-badge-mist">Linha {itemIndex + 1}</span>
                  <div style={{ fontWeight: 800, flex: 1, minWidth: 200 }}>{item.description}</div>
                  <span className="fa-badge" style={{ background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>{brl(Number(item.unitPrice || 0))}</span>
                </div>
                <div className="fa-form2">
                  <div className="fa-field fa-span2"><label>Descrição *</label><input className="fa-input" value={item.description} onChange={(e) => setItem(itemIndex, { description: e.target.value })} /></div>
                  <div className="fa-field"><label>Marca</label><input className="fa-input" value={item.brandName} onChange={(e) => setItem(itemIndex, { brandName: e.target.value })} /></div>
                  <div className="fa-field"><label>Unidade</label><UnitSelect value={item.unit} onChange={(unit) => setItem(itemIndex, { unit })} /></div>
                  {PACKAGE_LIKE_UNITS.includes(item.unit) && (
                    <div className="fa-field"><label>Unidades por {item.unit}</label><input className="fa-input" type="number" step="1" min="1" value={item.unitsPerPackage} onChange={(e) => setItem(itemIndex, { unitsPerPackage: e.target.value })} placeholder="Ex.: 50" /></div>
                  )}
                  <div className="fa-field"><label>Quantidade de referência</label><input className="fa-input" type="number" step="0.001" min="0" value={item.quantityReference} onChange={(e) => setItem(itemIndex, { quantityReference: e.target.value })} /></div>
                  <div className="fa-field"><label>Preço unitário (R$) *</label><input className="fa-input" type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => setItem(itemIndex, { unitPrice: e.target.value })} /></div>
                  <div className="fa-field"><label>Valor total</label><input className="fa-input" value={brl(itemTotalValue(item))} disabled /></div>
                  <div className="fa-field"><label>NCM</label><input className="fa-input" value={item.ncmCode} onChange={(e) => setItem(itemIndex, { ncmCode: e.target.value })} placeholder="Ex.: 34013000" /></div>
                  <div className="fa-field"><label>IPI (%)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.ipiPercentage} onChange={(e) => setItem(itemIndex, { ipiPercentage: e.target.value })} /></div>
                  <div className="fa-field"><label>ST (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.icmsStValue} onChange={(e) => setItem(itemIndex, { icmsStValue: e.target.value })} /></div>
                  <div className="fa-field"><label>Preço final (c/ impostos)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.finalUnitPrice} onChange={(e) => setItem(itemIndex, { finalUnitPrice: e.target.value })} placeholder="Opcional" /></div>
                  {item.matchCandidates && item.matchCandidates.length > 0 && (
                    <div className="fa-field fa-span2">
                      <label>Produto correspondente no catálogo (referência, opcional)</label>
                      <select className="fa-select" value={item.productId} onChange={(e) => setItem(itemIndex, { productId: e.target.value })}>
                        <option value="">Nenhum (produto ainda não cadastrado)</option>
                        {item.matchCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.brandName || 'Sem marca'} · {candidate.eanCode || candidate.sku}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <label className="fa-check" data-on={item.isComodato ? '1' : '0'} onClick={() => setItem(itemIndex, { isComodato: !item.isComodato })} style={{ marginTop: 10 }}>
                  <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Item em comodato
                </label>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {addSupplierOpen && (
        <SupplierModal
          title="Novo fornecedor"
          submitLabel="Cadastrar e vincular"
          initialSupplier={{ legalName: form.supplierName, cnpj: form.supplierDocument }}
          onClose={() => setAddSupplierOpen(false)}
          onSave={async (payload) => {
            try {
              const created = await onAddSupplier(payload);
              set('supplierId', created.id);
              set('supplierName', created.legalName);
              set('supplierDocument', created.cnpj);
              setAddSupplierOpen(false);
              notify && notify('Fornecedor cadastrado e vinculado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o fornecedor.', 'warn');
            }
          }}
        />
      )}
    </div>
  );
}

function QuoteImportModal({ suppliers, onAddSupplier, onClose, onPreviewOne, onConfirmBatch, notify }) {
  const [stage, setStage] = useState('upload');
  const [provider, setProvider] = useState('openai');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState([]);
  const [failedFiles, setFailedFiles] = useState([]);
  const [fileProgress, setFileProgress] = useState([]);

  const removeSelectedFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleFilesSelected = (e) => {
    const incoming = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!incoming.length) return;
    setFiles((prev) => {
      const merged = [...prev];
      incoming.forEach((file) => {
        const alreadyAdded = merged.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
        if (!alreadyAdded) merged.push(file);
      });
      if (merged.length > MAX_BATCH_FILES) {
        notify(`Você pode importar no máximo ${MAX_BATCH_FILES} arquivos por vez (a seleção chegaria a ${merged.length}). Remova algum arquivo ou selecione menos arquivos.`, 'warn');
        return prev;
      }
      return merged;
    });
  };

  const previewFileWithRetry = async (file, index) => {
    let lastResult = null;
    for (let attempt = 1; attempt <= MAX_PREVIEW_ATTEMPTS; attempt += 1) {
      setFileProgress((prev) => prev.map((entry, i) => (i === index ? { ...entry, status: 'processing', attempt } : entry)));
      try {
        lastResult = await onPreviewOne({ file, provider, model: '' });
      } catch (error) {
        lastResult = {
          fileName: file.name,
          success: false,
          preview: null,
          error: error && error.message ? error.message : 'Não foi possível ler o orçamento.',
        };
      }
      if (lastResult.success) break;
    }
    setFileProgress((prev) => prev.map((entry, i) => (
      i === index ? { ...entry, status: lastResult.success ? 'done' : 'error' } : entry
    )));
    return lastResult;
  };

  const handleAnalyze = async () => {
    if (!files.length) { notify('Selecione ao menos um arquivo de orçamento.', 'warn'); return; }
    setBusy(true);
    setStage('processing');
    setFileProgress(files.map((file) => ({ fileName: file.name, status: 'processing', attempt: 1 })));
    try {
      // Only MAX_CONCURRENT_PREVIEWS requests run at once (each retried up to
      // MAX_PREVIEW_ATTEMPTS times before its error reaches the review screen) — a fixed pool of
      // lanes, each pulling the next unprocessed file, keeps that cap regardless of batch size.
      const results = new Array(files.length);
      let nextIndex = 0;
      const runLane = async () => {
        while (nextIndex < files.length) {
          const index = nextIndex;
          nextIndex += 1;
          results[index] = await previewFileWithRetry(files[index], index);
        }
      };
      const lanes = Array.from({ length: Math.min(MAX_CONCURRENT_PREVIEWS, files.length) }, runLane);
      await Promise.all(lanes);

      const nextGroups = [];
      const nextFailed = [];
      results.forEach((result, index) => {
        const sourceFile = files[index];
        if (!result.success || !result.preview) {
          nextFailed.push({ fileName: result.fileName || (sourceFile && sourceFile.name) || '', error: result.error || 'Não foi possível ler o orçamento.' });
          return;
        }
        nextGroups.push({
          file: sourceFile,
          fileName: result.fileName || (sourceFile && sourceFile.name) || '',
          preview: result.preview,
          form: groupFormFromPreview(result.preview),
        });
      });
      setGroups(nextGroups);
      setFailedFiles(nextFailed);
      setStage('review');
      if (!nextGroups.length) {
        notify('Nenhum arquivo pôde ser lido. Veja os erros abaixo.', 'warn');
      }
    } catch (error) {
      setStage('upload');
      notify(error && error.message ? error.message : 'Não foi possível ler os orçamentos.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const updateGroupForm = (index, updater) => setGroups((prev) => prev.map((group, i) => i === index ? { ...group, form: updater(group.form), confirmError: '' } : group));
  const removeGroup = (index) => setGroups((prev) => prev.filter((_, i) => i !== index));

  const valid = groups.length > 0 && groups.every((group) => isGroupValid(group.form));

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const { results } = await onConfirmBatch({ files: groups.map((group) => group.file), forms: groups.map((group) => group.form) });
      const stillFailing = [];
      results.forEach((result, index) => {
        if (!result.success) stillFailing.push({ ...groups[index], confirmError: result.error || 'Não foi possível salvar este orçamento.' });
      });
      if (stillFailing.length) {
        setGroups(stillFailing);
        notify(`${results.length - stillFailing.length} de ${results.length} orçamentos salvos — corrija os que falharam e tente de novo.`, 'warn');
      } else {
        onClose();
      }
    } catch (error) {
      notify(error && error.message ? error.message : 'Não foi possível confirmar a importação dos orçamentos.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={1080} className="inv-modal">
      {stage === 'upload' && (
        <div>
          <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14 }}><Icon name="camera" size={28} /></span>
          <h2 className="fa-h3" style={{ fontSize: 22 }}>Importar orçamento com IA</h2>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
            Envie um ou mais orçamentos em PDF, imagem, planilha (XLSX) ou documento Word (DOCX) — inclusive de
            fornecedores diferentes. A IA extrai fornecedor, marcas, produtos, preços, formas de pagamento, frete
            e prazo de cada arquivo — você confere tudo, organizado por fornecedor, antes de salvar.
          </p>
          <div className="fa-form2" style={{ marginTop: 18 }}>
            <div className="fa-field fa-span2">
              <label>Arquivos do orçamento (até {MAX_BATCH_FILES}, até 100MB cada — pode selecionar em mais de uma vez)</label>
              <input className="fa-input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFilesSelected} />
            </div>
            <div className="fa-field">
              <label>Provider de leitura</label>
              <select className="fa-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
              </select>
            </div>
            <div className="fa-field">
              <label>Observação</label>
              <div className="fa-card" style={{ padding: '12px 14px', minHeight: 46, display: 'flex', alignItems: 'center', color: 'var(--fa-ink-3)', fontSize: 13.5 }}>
                Para PDF prefira Gemini. Cada arquivo vira um orçamento — se dois arquivos forem do mesmo
                fornecedor, você pode apontar os dois para o mesmo cadastro na conferência.
              </div>
            </div>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 4, display: 'grid', gap: 8 }}>
              {files.map((f, index) => (
                <div key={`${f.name}-${index}`} className="fa-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="tag" size={16} />
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{f.name}</div>
                  <span className="ph-cell-sub">{formatFileSize(f.size)}</span>
                  <button className="fa-iconbtn" style={{ width: 28, height: 28 }} onClick={() => removeSelectedFile(index)} aria-label="Remover arquivo"><Icon name="close" size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!files.length} onClick={handleAnalyze}><Icon name="camera" size={16} />Analisar {files.length > 1 ? `${files.length} orçamentos` : 'orçamento'}</button>
          </div>
        </div>
      )}

      {stage === 'processing' && (
        <div style={{ textAlign: 'center', padding: '24px 8px 12px' }}>
          <span className="qt-spinner" style={{ width: 68, height: 68, borderWidth: 5, margin: '0 auto 16px' }} />
          <h2 className="fa-h3" style={{ fontSize: 22 }}>Processando orçamento{files.length > 1 ? 's' : ''}</h2>
          <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: '10px auto 0' }}>
            Estamos lendo {files.length > 1 ? 'os documentos' : 'o documento'} e extraindo fornecedor, marca, itens,
            preços e condições para a sua conferência. Arquivos grandes podem levar alguns minutos.
          </p>
          <div className="fa-card qt-import-progress-summary" style={{ background: 'var(--fa-info-soft)', color: 'var(--fa-primary)', fontWeight: 700 }}>
            {fileProgress.filter((entry) => entry.status !== 'processing').length} de {fileProgress.length} arquivo{fileProgress.length > 1 ? 's' : ''} processado{fileProgress.length > 1 ? 's' : ''}
          </div>
          <div className="qt-import-progress-list">
            {fileProgress.map((entry, index) => (
              <div key={`${entry.fileName}-${index}`} className="fa-card qt-import-progress-row" data-status={entry.status}>
                <span className="qt-import-status-icon">
                  {entry.status === 'processing' && <span className="qt-spinner qt-spinner-sm" />}
                  {entry.status === 'done' && <Icon name="check" size={16} />}
                  {entry.status === 'error' && <Icon name="close" size={16} />}
                </span>
                <div className="qt-import-progress-name">{entry.fileName}</div>
                <span className="qt-import-progress-label">
                  {entry.status === 'processing'
                    ? (entry.attempt > 1 ? `Processando… (tentativa ${entry.attempt} de ${MAX_PREVIEW_ATTEMPTS})` : 'Processando…')
                    : entry.status === 'done' ? 'Pronto' : 'Falhou'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === 'review' && (
        <div>
          {groups.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14 }}><Icon name="check" size={28} /></span>
              <h2 className="fa-h3" style={{ fontSize: 22 }}>Conferência antes de salvar</h2>
              <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                {groups.length > 1 ? `${groups.length} orçamentos extraídos, um por fornecedor.` : 'Orçamento extraído.'} Revise
                cabeçalho, formas de pagamento e itens de cada um — a data da cotação é o dado mais importante, pois o
                preço varia por dia.
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14, background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="close" size={28} /></span>
              <h2 className="fa-h3" style={{ fontSize: 22 }}>Não foi possível ler os orçamentos</h2>
              <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                Nenhum dos arquivos enviados pôde ser processado, mesmo após {MAX_PREVIEW_ATTEMPTS} tentativas cada. Veja os
                erros abaixo, ajuste o que for necessário e tente novamente.
              </p>
            </div>
          )}

          {failedFiles.length > 0 && (
            <div className="fa-card" style={{ padding: 14, marginBottom: 16, borderLeft: '4px solid var(--fa-error)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Não foi possível ler {failedFiles.length > 1 ? 'estes arquivos' : 'este arquivo'}:</div>
              {failedFiles.map((failed, index) => (
                <div key={index} className="qt-import-failed-row">
                  <span className="qt-import-failed-name">{failed.fileName}</span>
                  <span className="qt-import-failed-error">{failed.error}</span>
                </div>
              ))}
            </div>
          )}

          {groups.map((group, index) => (
            <QuoteReviewGroup key={`${group.fileName}-${index}`} group={group} index={index} suppliers={suppliers} onChange={updateGroupForm} onRemove={removeGroup} onAddSupplier={onAddSupplier} notify={notify} />
          ))}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={() => setStage('upload')} disabled={busy}>Voltar</button>
            {groups.length > 0 && (
              <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleConfirm}><Icon name="check" size={16} />{busy ? 'Salvando…' : `Confirmar e salvar ${groups.length > 1 ? `${groups.length} orçamentos` : 'orçamento'}`}</button>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

export { QuotesScreen, PAYMENT_METHOD_LABEL, paymentMethodLabel };
