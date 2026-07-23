import React, { useEffect, useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

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
    suppliers, fetchPurchaseQuotes, createPurchaseQuote, updatePurchaseQuote, updatePurchaseQuoteStatus,
    downloadPurchaseQuoteFile, previewPurchaseQuoteImport, confirmPurchaseQuoteImport,
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
          onClose={() => setImportOpen(false)}
          onPreview={previewPurchaseQuoteImport}
          onConfirm={async (payload) => {
            await confirmPurchaseQuoteImport(payload);
            await load();
          }}
          notify={notify}
        />
      )}
    </>
  );
}

/* ===================== FORMAS DE PAGAMENTO E ITENS (linhas dinâmicas) ===================== */
function emptyPaymentTerm() { return { method: 'pix', discountPercent: '', surchargePercent: '', installmentCount: '', daysToPay: '', notes: '' }; }
function emptyItem() { return { productId: '', description: '', brandName: '', skuSnapshot: '', eanCodeSnapshot: '', unit: 'un', quantityReference: '', unitPrice: '', isComodato: false, comodatoNotes: '', notes: '' }; }

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
            <div className="fa-field"><label>Quantidade de referência</label><input className="fa-input" type="number" step="0.001" min="0" value={item.quantityReference} onChange={(e) => setItem(index, { quantityReference: e.target.value })} /></div>
            <div className="fa-field"><label>Preço unitário (R$) *</label><input className="fa-input" type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => setItem(index, { unitPrice: e.target.value })} /></div>
            <div className="fa-field"><label>Valor total</label><input className="fa-input" value={brl(itemTotalValue(item))} disabled /></div>
            <div className="fa-field"><label>SKU</label><input className="fa-input" value={item.skuSnapshot} onChange={(e) => setItem(index, { skuSnapshot: e.target.value })} /></div>
            <div className="fa-field"><label>EAN</label><input className="fa-input" value={item.eanCodeSnapshot} onChange={(e) => setItem(index, { eanCodeSnapshot: e.target.value })} /></div>
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
                <td>{item.unit}</td>
                <td>{item.quantityReference != null ? item.quantityReference : '—'}</td>
                <td>{brl(item.unitPrice)}</td>
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
    items: quote && quote.items && quote.items.length ? quote.items.map((item) => ({ ...item, quantityReference: item.quantityReference ?? '' })) : [emptyItem()],
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
function QuoteImportModal({ suppliers, onClose, onPreview, onConfirm, notify }) {
  const [stage, setStage] = useState('upload');
  const [provider, setProvider] = useState('gemini');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  const handleAnalyze = async () => {
    if (!file) { notify('Selecione um arquivo de orçamento.', 'warn'); return; }
    setBusy(true);
    setStage('processing');
    try {
      const payload = await onPreview({ file, provider, model: '' });
      setPreview(payload);
      setForm({
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
          unit: item.unit, quantityReference: item.quantityReference ?? '', unitPrice: item.unitPrice,
          isComodato: item.isComodato, comodatoNotes: item.comodatoNotes, notes: '',
          matchCandidates: item.matchCandidates,
        })),
      });
      setStage('review');
    } catch (error) {
      setStage('upload');
      notify(error && error.message ? error.message : 'Não foi possível ler o orçamento.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const validItems = form && form.items.length > 0 && form.items.every((item) => item.description.trim() && item.unitPrice !== '' && Number(item.unitPrice) >= 0);
  const valid = form && form.supplierName.trim().length >= 2 && !!form.quoteDate && validItems;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm({ file, ...form });
      onClose();
    } catch (error) {
      notify(error && error.message ? error.message : 'Não foi possível confirmar a importação do orçamento.', 'warn');
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
            Envie o orçamento em PDF, imagem, planilha (XLSX) ou documento Word (DOCX). A IA extrai fornecedor,
            produtos, preços, formas de pagamento, frete e prazo — você confere tudo antes de salvar.
          </p>
          <div className="fa-form2" style={{ marginTop: 18 }}>
            <div className="fa-field fa-span2">
              <label>Arquivo do orçamento</label>
              <input className="fa-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
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
                Para PDF prefira Gemini. Para XLSX/DOCX o conteúdo é lido diretamente do arquivo antes da IA interpretar.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!file} onClick={handleAnalyze}><Icon name="camera" size={16} />Analisar orçamento</button>
          </div>
        </div>
      )}

      {stage === 'processing' && (
        <div style={{ textAlign: 'center', padding: '24px 8px 12px' }}>
          <span className="fa-iconbox" style={{ width: 68, height: 68, margin: '0 auto 16px' }}><Icon name="repeat" size={30} /></span>
          <h2 className="fa-h3" style={{ fontSize: 22 }}>Processando orçamento</h2>
          <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: '10px auto 0' }}>
            Estamos lendo o documento e extraindo fornecedor, itens, preços e condições para a sua conferência.
          </p>
          <div className="fa-card" style={{ marginTop: 18, padding: '16px 18px', background: 'var(--fa-info-soft)', color: 'var(--fa-primary)', fontWeight: 700 }}>
            Arquivo em análise: {file ? file.name : 'orçamento'}
          </div>
        </div>
      )}

      {stage === 'review' && form && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14 }}><Icon name="check" size={28} /></span>
              <h2 className="fa-h3" style={{ fontSize: 22 }}>Conferência antes de salvar</h2>
              <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                Revise e corrija o cabeçalho, as formas de pagamento e os itens. A data da cotação é o dado mais
                importante — confirme que reflete o dia em que o orçamento foi enviado, pois o preço varia por dia.
              </p>
            </div>
            <div className="fa-card" style={{ padding: 16, minWidth: 300, flex: '0 0 340px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{preview.sourceFileName}</div>
              <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                <div>Provider: <span className="fa-mono">{preview.provider} · {preview.model}</span></div>
                <div>Itens extraídos: <span className="fa-mono">{preview.items.length}</span></div>
              </div>
            </div>
          </div>

          <div className="fa-form2" style={{ marginBottom: 16 }}>
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

          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13.5 }}>Formas de pagamento</div>
          <PaymentTermsEditor terms={form.paymentTerms} onChange={(terms) => set('paymentTerms', terms)} />

          <div style={{ margin: '20px 0 8px', fontWeight: 700, fontSize: 13.5 }}>Itens extraídos</div>
          <div style={{ maxHeight: '40vh', overflowY: 'auto', paddingRight: 6, display: 'grid', gap: 12 }}>
            {form.items.map((item, index) => (
              <div key={index} className="fa-card" style={{ padding: 14, borderLeft: item.isComodato ? '4px solid var(--fa-info)' : '4px solid var(--fa-success)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span className="fa-badge fa-badge-mist">Linha {index + 1}</span>
                  <div style={{ fontWeight: 800, flex: 1, minWidth: 200 }}>{item.description}</div>
                  <span className="fa-badge" style={{ background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>{brl(Number(item.unitPrice || 0))}</span>
                </div>
                <div className="fa-form2">
                  <div className="fa-field fa-span2"><label>Descrição *</label><input className="fa-input" value={item.description} onChange={(e) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, description: e.target.value } : it) }))} /></div>
                  <div className="fa-field"><label>Marca</label><input className="fa-input" value={item.brandName} onChange={(e) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, brandName: e.target.value } : it) }))} /></div>
                  <div className="fa-field"><label>Unidade</label><UnitSelect value={item.unit} onChange={(unit) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, unit } : it) }))} /></div>
                  <div className="fa-field"><label>Quantidade de referência</label><input className="fa-input" type="number" step="0.001" min="0" value={item.quantityReference} onChange={(e) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, quantityReference: e.target.value } : it) }))} /></div>
                  <div className="fa-field"><label>Preço unitário (R$) *</label><input className="fa-input" type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, unitPrice: e.target.value } : it) }))} /></div>
                  <div className="fa-field"><label>Valor total</label><input className="fa-input" value={brl(itemTotalValue(item))} disabled /></div>
                  {item.matchCandidates && item.matchCandidates.length > 0 && (
                    <div className="fa-field fa-span2">
                      <label>Produto correspondente no catálogo (referência, opcional)</label>
                      <select className="fa-select" value={item.productId} onChange={(e) => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, productId: e.target.value } : it) }))}>
                        <option value="">Nenhum (produto ainda não cadastrado)</option>
                        {item.matchCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.brandName || 'Sem marca'} · {candidate.eanCode || candidate.sku}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <label className="fa-check" data-on={item.isComodato ? '1' : '0'} onClick={() => setForm((prev) => ({ ...prev, items: prev.items.map((it, i) => i === index ? { ...it, isComodato: !it.isComodato } : it) }))} style={{ marginTop: 10 }}>
                  <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Item em comodato
                </label>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={() => setStage('upload')} disabled={busy}>Voltar</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleConfirm}><Icon name="check" size={16} />{busy ? 'Salvando…' : 'Confirmar e salvar orçamento'}</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

export { QuotesScreen, PAYMENT_METHOD_LABEL, paymentMethodLabel };
