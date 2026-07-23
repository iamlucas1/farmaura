import React, { useEffect, useMemo, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";
import { PAYMENT_METHOD_LABEL, paymentMethodLabel } from "./quotes-screen.jsx";

/* FARMAURA Console — Comparar fornecedores.
   Mostra, de uma vez, todos os itens de orçamentos confirmados lado a lado por fornecedor — sem
   exigir que o usuário busque um produto antes. Filtros, ordenação por coluna, KPIs (melhor
   fornecedor, economia potencial), o "orçamento sugerido" (melhor preço de cada produto, automático)
   e "meu catálogo" (seleção manual do usuário, montada marcando itens na tabela) são todos
   calculados no cliente sobre essa base já carregada — inclusive o frete, somado uma única vez por
   cotação mesmo quando mais de um item vencedor/selecionado vem da mesma cotação. Somente compara
   orçamentos já cadastrados, nunca cria produtos. */

const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABEL);

function todayIsoDate() { return new Date().toISOString().slice(0, 10); }
function isExpired(validUntil) { return !!validUntil && validUntil < todayIsoDate(); }
function groupKeyFor(entry) { return entry.productId || ('desc:' + entry.itemDescription.trim().toLowerCase()); }

const SORT_COMPARATORS = {
  product: (a, b) => a.itemDescription.localeCompare(b.itemDescription, 'pt-BR'),
  supplier: (a, b) => a.supplierName.localeCompare(b.supplierName, 'pt-BR'),
  price: (a, b) => a.bestEffectivePrice - b.bestEffectivePrice,
  total: (a, b) => a.totalWithFreight - b.totalWithFreight,
  freight: (a, b) => (a.freightCost || -1) - (b.freightCost || -1),
  delivery: (a, b) => (a.deliveryTimeDays == null ? Infinity : a.deliveryTimeDays) - (b.deliveryTimeDays == null ? Infinity : b.deliveryTimeDays),
  quoteDate: (a, b) => a.quoteDate.localeCompare(b.quoteDate),
};

/* Agrupa itens (já decorados com lineTotal/quoteId) por fornecedor, somando o frete uma única vez
   por cotação (Map por quoteId) mesmo quando dois itens do mesmo grupo vêm da mesma cotação —
   reaproveitado tanto pelo orçamento sugerido (automático) quanto pelo catálogo (seleção manual). */
function groupBySupplier(items) {
  const bySupplier = new Map();
  items.forEach((entry) => {
    const key = entry.supplierId || entry.supplierName;
    if (!bySupplier.has(key)) {
      bySupplier.set(key, { supplierName: entry.supplierName, items: [], productsSubtotal: 0, freightByQuote: new Map() });
    }
    const bucket = bySupplier.get(key);
    bucket.items.push(entry);
    bucket.productsSubtotal += entry.lineTotal;
    if (entry.freightCost) bucket.freightByQuote.set(entry.quoteId, entry.freightCost);
  });
  return Array.from(bySupplier.values()).map((bucket) => {
    const freightTotal = Array.from(bucket.freightByQuote.values()).reduce((sum, cost) => sum + cost, 0);
    return {
      supplierName: bucket.supplierName,
      items: bucket.items,
      productsSubtotal: bucket.productsSubtotal,
      freightTotal,
      total: bucket.productsSubtotal + freightTotal,
    };
  }).sort((a, b) => b.total - a.total);
}

function SortableHeader({ label, column, sortColumn, sortDirection, onSort }) {
  const active = sortColumn === column;
  return (
    <th onClick={() => onSort(column)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}<span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.3 }}>{active && sortDirection === 'desc' ? '▼' : '▲'}</span>
    </th>
  );
}

function PlanCard({ group }) {
  const initial = (group.supplierName || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="fa-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
          {initial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.supplierName}</div>
          <div className="ph-cell-sub">{group.items.length} item(ns)</div>
        </div>
      </div>
      <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {group.items.map((item) => (
          <div key={item.quoteItemId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, paddingBottom: 8, borderBottom: '1px dashed var(--fa-mist)' }}>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemDescription}</div>
              {item.quantityReference != null && <div className="ph-cell-sub">{item.quantityReference} {item.unit}</div>}
            </div>
            <span className="fa-mono" style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--fa-ink-2)' }}>{brl(item.lineTotal)}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 18px', background: 'var(--fa-mist-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fa-ink-3)', marginBottom: 5 }}>
          <span>Produtos</span>
          <span className="fa-mono">{brl(group.productsSubtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--fa-ink-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="truck" size={12} />Frete</span>
          <span className="fa-mono">{group.freightTotal ? brl(group.freightTotal) : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--fa-mist)' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Total</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--fa-primary)' }}>{brl(group.total)}</span>
        </div>
      </div>
    </div>
  );
}

function PlanSection({ title, description, groups, action, icon }) {
  if (!groups.length) return null;
  const grandTotal = groups.reduce((sum, group) => sum + group.total, 0);
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="fa-iconbox" style={{ width: 40, height: 40 }}><Icon name={icon} size={19} /></span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
            <p className="ph-cell-sub" style={{ marginTop: 2, maxWidth: 620 }}>{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {groups.map((group) => <PlanCard key={group.supplierName} group={group} />)}
      </div>
      <div className="fa-card" style={{ marginTop: 16, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--fa-rose-soft)' }}>
        <span style={{ fontWeight: 700 }}>Total geral · {groups.length} fornecedor(es)</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--fa-primary)' }}>{brl(grandTotal)}</span>
      </div>
    </div>
  );
}

function QuotesCompareScreen({ ctx }) {
  const { fetchPurchaseQuoteCompare, suppliers, notify, onLogout } = ctx;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [freightFilter, setFreightFilter] = useState('all');
  const [onlyComparable, setOnlyComparable] = useState(false);
  const [onlyBestOffers, setOnlyBestOffers] = useState(false);
  const [sortColumn, setSortColumn] = useState('product');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchPurchaseQuoteCompare({});
      setEntries(payload.entries);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível carregar a comparação de fornecedores.', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const clearFilters = () => { setQ(''); setSupplierFilter('all'); setPaymentFilter('all'); setFreightFilter('all'); setOnlyComparable(false); setOnlyBestOffers(false); };

  const toggleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((prev) => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Decoração independente de filtro (quantidade × preço + frete) — usada tanto pelo agrupamento
  // abaixo quanto pelo catálogo manual, para que um item selecionado continue no catálogo mesmo se
  // o usuário depois mudar um filtro que o esconderia da tabela.
  const decoratedEntries = useMemo(() => entries.map((entry) => {
    const lineTotal = entry.quantityReference != null ? entry.quantityReference * entry.bestEffectivePrice : entry.bestEffectivePrice;
    return { ...entry, lineTotal, totalWithFreight: lineTotal + (entry.freightCost || 0) };
  }), [entries]);

  const filteredEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return decoratedEntries.filter((entry) => {
      if (supplierFilter !== 'all' && entry.supplierId !== supplierFilter) return false;
      if (paymentFilter !== 'all' && !entry.paymentMethods.includes(paymentFilter)) return false;
      if (freightFilter !== 'all' && entry.freightType !== freightFilter) return false;
      if (needle && !(entry.itemDescription + ' ' + entry.brandName).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [decoratedEntries, q, supplierFilter, paymentFilter, freightFilter]);

  // Agrupa por produto (independente do fornecedor) para achar a melhor oferta de cada um — esse
  // agrupamento é recalculado sempre que os filtros acima mudam, então "melhor oferta" sempre
  // reflete só o que está filtrado no momento, nunca a base inteira sem filtro.
  const { groupedRows, comparableCount, supplierCount, potentialSavings, bestSupplier } = useMemo(() => {
    const groups = new Map();
    filteredEntries.forEach((entry) => {
      const key = groupKeyFor(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });

    const winCounts = new Map();
    const supplierSet = new Set();
    let savings = 0;
    let comparable = 0;
    const decorated = [];

    groups.forEach((groupEntries) => {
      const sorted = groupEntries.slice().sort((a, b) => a.bestEffectivePrice - b.bestEffectivePrice);
      const isComparable = sorted.length >= 2;
      if (isComparable) {
        comparable += 1;
        savings += sorted[sorted.length - 1].bestEffectivePrice - sorted[0].bestEffectivePrice;
      }
      sorted.forEach((entry, index) => {
        const supplierKey = entry.supplierId || entry.supplierName;
        supplierSet.add(supplierKey);
        if (index === 0 && isComparable) {
          winCounts.set(supplierKey, (winCounts.get(supplierKey) || 0) + 1);
        }
        decorated.push({ ...entry, isBestOffer: index === 0, groupSize: sorted.length });
      });
    });

    let bestKey = '';
    let bestWins = 0;
    winCounts.forEach((count, key) => { if (count > bestWins) { bestWins = count; bestKey = key; } });
    const bestEntry = decorated.find((entry) => (entry.supplierId || entry.supplierName) === bestKey);

    return {
      groupedRows: decorated,
      comparableCount: comparable,
      supplierCount: supplierSet.size,
      potentialSavings: savings,
      bestSupplier: bestEntry ? { name: bestEntry.supplierName, wins: bestWins } : null,
    };
  }, [filteredEntries]);

  // Linhas realmente exibidas na tabela: aplica os toggles de exibição (comparáveis/melhores
  // ofertas) e a ordenação de coluna escolhida, por cima da base já agrupada acima.
  const displayRows = useMemo(() => {
    let visible = groupedRows;
    if (onlyComparable) visible = visible.filter((entry) => entry.groupSize >= 2);
    if (onlyBestOffers) visible = visible.filter((entry) => entry.isBestOffer);
    const comparator = SORT_COMPARATORS[sortColumn] || SORT_COMPARATORS.product;
    const sorted = visible.slice().sort((a, b) => {
      const cmp = comparator(a, b);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [groupedRows, onlyComparable, onlyBestOffers, sortColumn, sortDirection]);

  const toggleSelect = (quoteItemId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(quoteItemId)) next.delete(quoteItemId); else next.add(quoteItemId);
      return next;
    });
  };
  const allVisibleSelected = displayRows.length > 0 && displayRows.every((entry) => selectedIds.has(entry.quoteItemId));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayRows.forEach((entry) => { if (allVisibleSelected) next.delete(entry.quoteItemId); else next.add(entry.quoteItemId); });
      return next;
    });
  };
  const selectBestOffersVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayRows.filter((entry) => entry.isBestOffer).forEach((entry) => next.add(entry.quoteItemId));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Orçamento sugerido: melhor oferta de cada produto (respeitando os filtros ativos), automático.
  const suggestedPlan = useMemo(() => groupBySupplier(groupedRows.filter((entry) => entry.isBestOffer)), [groupedRows]);

  // Meu catálogo: só os itens marcados manualmente pelo usuário na tabela — sobrevive a mudanças de
  // filtro porque parte de decoratedEntries (não de filteredEntries/groupedRows).
  const myCatalog = useMemo(
    () => groupBySupplier(decoratedEntries.filter((entry) => selectedIds.has(entry.quoteItemId))),
    [decoratedEntries, selectedIds]
  );

  return (
    <>
      <Topbar title="Comparar fornecedores" sub="Onde cada produto sai mais barato, por fornecedor" onLogout={onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        {!loading && !entries.length ? (
          <div className="ph-empty">
            <span className="fa-iconbox"><Icon name="activity" size={28} /></span>
            <div>Nenhum orçamento confirmado ainda. Cadastre ou confirme um orçamento na tela <strong>Cotações</strong> para começar a comparar.</div>
          </div>
        ) : (
          <>
            <div className="inv-kpis">
              <InventoryKpi icon="capsule" label="Produtos comparáveis (2+ fornecedores)" value={loading ? '…' : comparableCount} />
              <InventoryKpi icon="truck" label="Fornecedores cotados" value={loading ? '…' : supplierCount} />
              <InventoryKpi icon="star" label={bestSupplier ? 'Melhor fornecedor · ' + bestSupplier.name : 'Melhor fornecedor'} value={loading ? '…' : (bestSupplier ? bestSupplier.wins + ' vitória(s)' : '—')} />
              <InventoryKpi icon="sparkle" label="Economia potencial somada" value={loading ? '…' : brl(potentialSavings)} />
            </div>

            <div className="inv-toolbar">
              <div className="inv-toolbar-row is-filters">
                <div className="inv-filter-field" style={{ flex: 1, minWidth: 240 }}>
                  <label>Buscar</label>
                  <input className="fa-input" placeholder="Produto, marca, SKU ou EAN" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
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
                <label className="fa-check" data-on={onlyComparable ? '1' : '0'} onClick={() => setOnlyComparable((prev) => !prev)} style={{ alignSelf: 'flex-end', marginBottom: 10, whiteSpace: 'nowrap' }}>
                  <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Somente comparáveis
                </label>
                <label className="fa-check" data-on={onlyBestOffers ? '1' : '0'} onClick={() => setOnlyBestOffers((prev) => !prev)} style={{ alignSelf: 'flex-end', marginBottom: 10, whiteSpace: 'nowrap' }}>
                  <span className="box"><Icon name="check" size={13} stroke={2.6} /></span>Somente melhores ofertas
                </label>
              </div>
              <div className="inv-toolbar-row" style={{ alignItems: 'center' }}>
                <span className="ph-cell-sub">{selectedIds.size} produto(s) selecionado(s) para o meu catálogo</span>
                <div className="inv-actions">
                  <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={selectBestOffersVisible}><Icon name="sparkle" size={14} />Selecionar melhores ofertas visíveis</button>
                  {selectedIds.size > 0 && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={clearSelection}><Icon name="close" size={14} />Limpar seleção</button>}
                </div>
              </div>
            </div>

            {!loading && !displayRows.length && (
              <div className="ph-empty">
                <span className="fa-iconbox"><Icon name="search" size={28} /></span>
                <div>Nenhum item para estes filtros.</div>
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={clearFilters}>Limpar filtros</button>
              </div>
            )}

            {displayRows.length > 0 && (
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Selecionar todos os itens visíveis" /></th>
                      <SortableHeader label="Produto" column="product" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableHeader label="Fornecedor" column="supplier" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableHeader label="Preço" column="price" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableHeader label="Valor total" column="total" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <th>Pagamento</th>
                      <SortableHeader label="Frete" column="freight" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableHeader label="Prazo" column="delivery" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <SortableHeader label="Cotado em" column="quoteDate" sortColumn={sortColumn} sortDirection={sortDirection} onSort={toggleSort} />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((entry) => (
                      <tr key={entry.quoteItemId} style={entry.isBestOffer && entry.groupSize >= 2 ? { background: 'var(--fa-success-soft)' } : undefined}>
                        <td><input type="checkbox" checked={selectedIds.has(entry.quoteItemId)} onChange={() => toggleSelect(entry.quoteItemId)} aria-label={'Selecionar ' + entry.itemDescription} /></td>
                        <td>
                          <div className="ph-td-name">{entry.itemDescription}</div>
                          <div className="ph-cell-sub">{entry.brandName || 'Sem marca'}</div>
                        </td>
                        <td>{entry.supplierName}</td>
                        <td>
                          <div style={{ fontWeight: 800 }}>{brl(entry.bestEffectivePrice)}</div>
                          {entry.bestEffectivePrice !== entry.unitPrice && (
                            <div className="ph-cell-sub">tabela {brl(entry.unitPrice)} · {entry.bestPaymentDiscountPercent}% {paymentMethodLabel(entry.bestPaymentMethod)}</div>
                          )}
                        </td>
                        <td>
                          {entry.isBestOffer ? (
                            <>
                              <div style={{ fontWeight: 800 }}>{brl(entry.totalWithFreight)}</div>
                              {entry.freightCost ? <div className="ph-cell-sub">produto {brl(entry.lineTotal)} + frete {brl(entry.freightCost)}</div> : null}
                            </>
                          ) : <span className="ph-cell-sub">—</span>}
                        </td>
                        <td>
                          {entry.paymentMethods.length
                            ? entry.paymentMethods.map((method) => <span key={method} className="fa-badge" style={{ marginRight: 4 }}>{paymentMethodLabel(method)}</span>)
                            : <span className="ph-cell-sub">—</span>}
                        </td>
                        <td>{entry.freightType || '—'}{entry.freightCost ? <span className="ph-cell-sub"> · {brl(entry.freightCost)}</span> : null}</td>
                        <td>{entry.deliveryTimeDays != null ? entry.deliveryTimeDays + ' dia(s)' : '—'}</td>
                        <td className="fa-mono">
                          {entry.quoteDate}
                          {isExpired(entry.validUntil) && <span className="fa-badge" style={{ marginLeft: 6, background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>Vencido</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {entry.isBestOffer && entry.groupSize >= 2 && <span className="fa-badge fa-badge-health"><Icon name="sparkle" size={12} />Melhor oferta</span>}
                          {entry.isComodato && <span className="fa-badge fa-badge-mist" style={{ marginLeft: 4 }}><Icon name="gift" size={11} />Comodato</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <PlanSection
              title="Meu catálogo — produtos selecionados"
              description="Marque itens na tabela acima (de qualquer fornecedor, independente de ser a melhor oferta) para montar sua própria lista de compra. Frete somado uma única vez por cotação, mesmo com mais de um item selecionado da mesma cotação."
              groups={myCatalog}
              icon="cart"
              action={myCatalog.length > 0 ? <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={clearSelection}><Icon name="close" size={14} />Limpar seleção</button> : null}
            />

            <PlanSection
              title="Orçamento sugerido — melhor preço de cada produto, por fornecedor"
              description="Automático, com base nos filtros ativos: pega a melhor oferta de cada produto comparável. Quantidade com base na quantidade de referência cotada; frete somado uma única vez por cotação — apoio à decisão, não uma previsão exata de compra."
              groups={suggestedPlan}
              icon="sparkle"
            />
          </>
        )}
      </div>
    </>
  );
}

export { QuotesCompareScreen };
