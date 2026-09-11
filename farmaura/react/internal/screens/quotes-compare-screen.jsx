import React, { useEffect, useMemo, useRef, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { PAYMENT_METHOD_LABEL, paymentMethodLabel } from "./quotes-screen.jsx";
import { Icon, PageHead, Badge, StatCard, PillNav, EmptyState, Field } from "../core/internal-ui.jsx";
import "../../shared/portal-cache.js";

// Chave do cache local (por usuário) do "Meu mix de compra" — sobrevive a troca de tela/reload;
// IDs que não existem mais na base atual (cotação expirada, item removido) são simplesmente
// ignorados por quem consome selectedIds, então não precisa de limpeza especial aqui.
const MIX_CACHE_KEY = "quotes_compare_mix";

/* FARMAURA Console — Comparar fornecedores.
   Duas subtelas (aba pillnav) sobre a mesma base de itens de orçamentos confirmados, ambas
   derivadas no cliente dos mesmos filtros ativos (busca/fornecedores/produtos/pagamento/frete).
   Cotações vencidas (valid_until no passado) ficam fora por padrão em todas as subtelas — o
   filtro "Mostrar cotações vencidas" as traz de volta (com o selo "Vencido").
   Fornecedores e produtos aceitam seleção múltipla via FilterDropdown (botão + painel pequeno
   ancorado, estilo Excel — fecha sozinho ao clicar fora ou Esc); forma de pagamento é única e,
   quando selecionada, recalcula o preço/desconto usado em toda a tela para o valor específico
   daquela forma (não o melhor desconto geral do orçamento) — assim "melhor oferta" sempre
   reflete o que foi de fato filtrado:
   - "Comparar produtos": tabela item a item lado a lado por fornecedor, com KPIs e seleção
     manual (selectedIds) via checkbox — essa seleção é a mesma usada em "Meu mix de compra".
   - "Sugestão de compra": tudo em tabela (MixResultTable, sem cartão nenhum), duas seções
     visualmente idênticas separadas por um divisor — "Meu mix de compra" (a seleção manual da
     aba Comparar produtos, editável aqui via filtro "Produtos do mix" e parâmetros próprios de
     forma de pagamento/frete — mixPaymentPreference/mixFreightPreference — que recalculam quem
     já está no mix a cada mudança; produto sem oferta que atenda aos parâmetros nunca some, cai
     pro melhor preço geral com aviso mixMismatchPayment/mixMismatchFreight na tabela) e
     "Sugestão automática" (mesma lógica de melhor-oferta-com-fallback, mas somente leitura, com
     botão "Usar como meu mix" pra copiar pra seleção manual).
   Em toda tabela de mix (automática ou manual), o frete é somado uma única vez por cotação via
   groupBySupplier, mesmo quando mais de um item vencedor/selecionado vem da mesma cotação — o
   total por fornecedor e o total geral já refletem essa soma. Somente compara orçamentos já
   cadastrados, nunca cria produtos. */

const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABEL);

function todayIsoDate() { return new Date().toISOString().slice(0, 10); }
function isExpired(validUntil) { return !!validUntil && validUntil < todayIsoDate(); }
function groupKeyFor(entry) { return entry.productId || ("desc:" + entry.itemDescription.trim().toLowerCase()); }

const SORT_COMPARATORS = {
  product: (a, b) => a.itemDescription.localeCompare(b.itemDescription, "pt-BR"),
  supplier: (a, b) => a.supplierName.localeCompare(b.supplierName, "pt-BR"),
  price: (a, b) => a.effectivePrice - b.effectivePrice,
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
    <th onClick={() => onSort(column)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label}<span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.3 }}>{active && sortDirection === "desc" ? "▼" : "▲"}</span>
    </th>
  );
}

/* Filtro estilo Excel: botão-gatilho que abre um painel pequeno ancorado com busca + lista de
   checkboxes, em vez de expor a lista inteira sempre visível na tela. Fecha ao clicar fora ou
   apertar Esc — não é um modal bloqueante (sem stack de Escape hierárquico). */
function FilterDropdown({ label, placeholder, options, selectedValues, onChange, emptyMessage }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const needle = query.trim().toLowerCase();
  const filteredOptions = needle
    ? options.filter((option) => (option.label + " " + (option.meta || "")).toLowerCase().includes(needle))
    : options;

  const toggleValue = (value) => {
    onChange(selectedValues.includes(value) ? selectedValues.filter((v) => v !== value) : [...selectedValues, value]);
  };

  let triggerLabel = "Todos";
  if (selectedValues.length === 1) {
    const found = options.find((option) => option.value === selectedValues[0]);
    triggerLabel = found ? found.label : selectedValues[0];
  } else if (selectedValues.length > 1) {
    triggerLabel = selectedValues.length + " selecionados";
  }

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <Field label={label}>
        <button
          type="button" className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer", minWidth: 200 }}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerLabel}</span>
          <Icon name="chevD" size={14} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : undefined, transition: "transform .14s" }} />
        </button>
      </Field>
      {open && (
        <div className="card" role="dialog" aria-label={label} style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20, padding: 8, minWidth: 260, maxHeight: 320, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
          <input
            className="input" autoFocus placeholder={placeholder || "Buscar"} value={query}
            onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 6 }}
          />
          {filteredOptions.length ? filteredOptions.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <button
                key={option.value} type="button" onClick={() => toggleValue(option.value)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "none", background: checked ? "var(--surface-2)" : "transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: checked ? "var(--accent)" : "transparent", borderColor: checked ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>
                  {checked && <Icon name="check" size={11} />}
                </span>
                <span style={{ fontSize: 13 }}>
                  <strong>{option.label}</strong>
                  {option.meta && <span className="cell-muted" style={{ display: "block" }}>{option.meta}</span>}
                </span>
              </button>
            );
          }) : <div className="cell-muted" style={{ padding: 8 }}>{emptyMessage || "Nenhuma opção encontrada."}</div>}
          {selectedValues.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={() => onChange([])}>
              <Icon name="close" size={13} />Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Cabeçalho padrão de seção (ícone + título + descrição + ação), reaproveitado pelas duas seções
   da aba Sugestão de compra (Automático / Meu mix) pra manter o mesmo visual — nada de cartão numa
   e tabela solta na outra. */
function SectionHeader({ icon, title, description, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="stat-icon" style={{ width: 40, height: 40 }}><Icon name={icon} size={19} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          {description && <p className="cell-muted" style={{ marginTop: 2, maxWidth: 620 }}>{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* Mix de compra em tabela — agrupado por fornecedor (nome em rowSpan cobrindo os itens daquele
   fornecedor + a linha de subtotal/frete/total logo abaixo). Usado tanto pra sugestão automática
   (somente leitura, sem onRemoveItem) quanto pro mix montado manualmente (com × por item pra
   remover) — mesmo componente, mesmo visual, só o dado (groupBySupplier) e a edição mudam. O total
   por fornecedor e o total geral já incluem o frete somado uma única vez por cotação. */
function MixResultTable({ groups, onRemoveItem, emptyMessage }) {
  if (!groups.length) {
    return <div className="card"><EmptyState icon="cart" title={emptyMessage} /></div>;
  }
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);
  const grandFreight = groups.reduce((sum, g) => sum + g.freightTotal, 0);
  return (
    <>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Produto</th>
                <th>Valor</th>
                {onRemoveItem && <th></th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={group.supplierName}>
                  {group.items.map((item, index) => (
                    <tr key={item.quoteItemId}>
                      {index === 0 && (
                        <td rowSpan={group.items.length + 1} style={{ verticalAlign: "top", borderRight: "1px solid var(--border)" }}>
                          <div className="cell-strong">{group.supplierName}</div>
                          <div className="cell-muted">{group.items.length} item(ns)</div>
                        </td>
                      )}
                      <td>
                        <div className="cell-strong">{item.itemDescription}</div>
                        {item.quantityReference != null && <div className="cell-muted">{item.quantityReference} {item.unit}</div>}
                        {(item.mixMismatchPayment || item.mixMismatchFreight) && (
                          <div style={{ marginTop: 5 }}>
                            <Badge tone="warning">
                              <Icon name="info" size={12} />
                              <span>Sem {[item.mixMismatchPayment && "forma de pagamento", item.mixMismatchFreight && "frete"].filter(Boolean).join(" e ")} do mix cadastrado(a) — melhor preço mantido</span>
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>{brl(item.lineTotal)}</td>
                      {onRemoveItem && (
                        <td>
                          <button
                            type="button" className="icon-btn" style={{ width: 26, height: 26 }}
                            onClick={() => onRemoveItem(item.quoteItemId)} aria-label={"Remover " + item.itemDescription}
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr style={{ background: "var(--surface-2)" }}>
                    <td colSpan={2} style={{ textAlign: "right", fontSize: 12.5, color: "var(--text-muted)" }}>
                      Produtos <span className="mono" style={{ marginRight: 14 }}>{brl(group.productsSubtotal)}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="truck" size={11} />Frete</span>{" "}
                      <span className="mono" style={{ marginRight: 14 }}>{group.freightTotal ? brl(group.freightTotal) : "—"}</span>
                      <strong style={{ color: "var(--text-primary)" }}>Total {brl(group.total)}</strong>
                    </td>
                    {onRemoveItem && <td></td>}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card card-pad" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--accent-soft)" }}>
        <span style={{ fontWeight: 700 }}>Total geral · {groups.length} fornecedor(es) · frete {brl(grandFreight)}</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: "var(--brand)" }}>{brl(grandTotal)}</span>
      </div>
    </>
  );
}

function QuotesCompareScreen({ ctx }) {
  const { fetchPurchaseQuoteCompare, notify, user } = ctx;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [supplierFilters, setSupplierFilters] = useState([]);
  const [productFilters, setProductFilters] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [freightFilter, setFreightFilter] = useState("all");
  const [onlyComparable, setOnlyComparable] = useState(false);
  const [onlyBestOffers, setOnlyBestOffers] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [sortColumn, setSortColumn] = useState("product");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(window.FA_PORTAL_CACHE.readLocal("internal", user, MIX_CACHE_KEY, []))
  );
  const [view, setView] = useState("compare");
  // Parâmetros do "Meu mix de compra" (aba Sugestão de compra) — só afetam qual oferta entra
  // quando um produto é marcado no filtro "Produtos do mix"; diferente dos filtros globais do
  // topo, não escondem nada das outras abas nem da Sugestão automática.
  const [mixPaymentPreference, setMixPaymentPreference] = useState("all");
  const [mixFreightPreference, setMixFreightPreference] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchPurchaseQuoteCompare({});
      setEntries(payload.entries);
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível carregar a comparação de fornecedores.", "warn");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Persiste "Meu mix de compra" (selectedIds) no cache local do usuário a cada mudança, pra
  // sobreviver a troca de tela ou reload — reidratado no useState de selectedIds acima.
  useEffect(() => {
    window.FA_PORTAL_CACHE.writeLocal("internal", user, MIX_CACHE_KEY, Array.from(selectedIds));
  }, [user && user.id, selectedIds]);

  const clearFilters = () => { setQ(""); setSupplierFilters([]); setProductFilters([]); setPaymentFilter("all"); setFreightFilter("all"); setOnlyComparable(false); setOnlyBestOffers(false); setShowExpired(false); };

  const toggleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((prev) => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Opções para os seletores de fornecedor/produto específicos — derivadas da base inteira (não da
  // já filtrada), para que a lista de opções não encolha conforme o usuário vai filtrando.
  const supplierOptions = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const key = entry.supplierId || entry.supplierName;
      if (!key || map.has(key)) return;
      map.set(key, { value: key, label: entry.supplierName || "Sem nome" });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [entries]);

  const productOptions = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const key = groupKeyFor(entry);
      if (map.has(key)) return;
      map.set(key, { value: key, label: entry.itemDescription, meta: entry.brandName || "" });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [entries]);

  // Decoração que depende do filtro de forma de pagamento: quando uma forma específica está
  // selecionada (ex.: Boleto), o preço/desconto usados em todo o resto da tela passam a ser os
  // dessa forma especificamente — não o melhor desconto do orçamento como um todo — para que
  // "melhor oferta" sempre reflita o que foi realmente filtrado. Sem filtro, mantém o melhor preço
  // geral (bestEffectivePrice), como antes.
  const pricedEntries = useMemo(() => entries.map((entry) => {
    let effectivePrice = entry.bestEffectivePrice;
    let effectivePaymentMethod = entry.bestPaymentMethod;
    let effectivePaymentDiscountPercent = entry.bestPaymentDiscountPercent;
    if (paymentFilter !== "all") {
      const term = (entry.paymentTerms || []).find((t) => t.method === paymentFilter);
      if (term) {
        effectivePrice = term.effectivePrice;
        effectivePaymentMethod = term.method;
        effectivePaymentDiscountPercent = term.discountPercent;
      }
    }
    const lineTotal = entry.quantityReference != null ? entry.quantityReference * effectivePrice : effectivePrice;
    return { ...entry, effectivePrice, effectivePaymentMethod, effectivePaymentDiscountPercent, lineTotal, totalWithFreight: lineTotal + (entry.freightCost || 0) };
  }), [entries, paymentFilter]);

  const filteredEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pricedEntries.filter((entry) => {
      if (!showExpired && isExpired(entry.validUntil)) return false;
      const supplierKey = entry.supplierId || entry.supplierName;
      if (supplierFilters.length && !supplierFilters.includes(supplierKey)) return false;
      if (productFilters.length && !productFilters.includes(groupKeyFor(entry))) return false;
      if (paymentFilter !== "all" && !entry.paymentMethods.includes(paymentFilter)) return false;
      if (freightFilter !== "all" && entry.freightType !== freightFilter) return false;
      if (needle && !(entry.itemDescription + " " + entry.brandName).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [pricedEntries, q, supplierFilters, productFilters, paymentFilter, freightFilter, showExpired]);

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
      const sorted = groupEntries.slice().sort((a, b) => a.effectivePrice - b.effectivePrice);
      const isComparable = sorted.length >= 2;
      if (isComparable) {
        comparable += 1;
        savings += sorted[sorted.length - 1].effectivePrice - sorted[0].effectivePrice;
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

    let bestKey = "";
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
      return sortDirection === "asc" ? cmp : -cmp;
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

  // Re-rank por produto depois de aplicar "Forma de pagamento do mix"/"Frete do mix" por cima dos
  // filtros globais — sem isso, os dois seletores da aba Sugestão de compra não alteravam nada:
  // eles só entravam na hora de marcar um produto novo em "Produtos do mix", mas a "Sugestão
  // automática" continuava sempre baseada em groupedRows (só os filtros globais). Um produto sem
  // NENHUMA oferta que atenda aos parâmetros não desaparece — cai de volta pro melhor preço geral
  // do produto (ranking entre todas as ofertas, não só as que batem) e vem marcado com
  // mixMismatchPayment/mixMismatchFreight, pra a tabela avisar em vez de esconder silenciosamente.
  const mixRankedRows = useMemo(() => {
    if (mixPaymentPreference === "all" && mixFreightPreference === "all") return groupedRows;
    const groups = new Map();
    groupedRows.forEach((entry) => {
      const key = groupKeyFor(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    const decorated = [];
    groups.forEach((groupEntries) => {
      const matching = groupEntries.filter((entry) =>
        (mixPaymentPreference === "all" || entry.paymentMethods.includes(mixPaymentPreference)) &&
        (mixFreightPreference === "all" || entry.freightType === mixFreightPreference)
      );
      const isFallback = matching.length === 0;
      const pool = isFallback ? groupEntries : matching;
      const sorted = pool.slice().sort((a, b) => a.effectivePrice - b.effectivePrice);
      sorted.forEach((entry, index) => {
        decorated.push({
          ...entry,
          isBestOffer: index === 0,
          groupSize: sorted.length,
          mixMismatchPayment: isFallback && index === 0 && mixPaymentPreference !== "all" && !entry.paymentMethods.includes(mixPaymentPreference),
          mixMismatchFreight: isFallback && index === 0 && mixFreightPreference !== "all" && entry.freightType !== mixFreightPreference,
        });
      });
    });
    return decorated;
  }, [groupedRows, mixPaymentPreference, mixFreightPreference]);

  // Copia exatamente o que está sendo exibido em "Sugestão automática" (já considerando forma de
  // pagamento/frete do mix) pra dentro da seleção manual — diferente de selectBestOffersVisible,
  // que serve ao botão "Selecionar melhores ofertas visíveis" da aba Comparar produtos e ignora os
  // parâmetros do mix (não faz sentido lá, onde esses seletores nem aparecem).
  const useSuggestionAsMix = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      mixRankedRows.filter((entry) => entry.isBestOffer).forEach((entry) => next.add(entry.quoteItemId));
      return next;
    });
  };

  // Um grupo por produto único (respeitando os filtros ativos), com todas as ofertas de
  // fornecedor daquele produto ordenadas por preço (offers[0] = melhor oferta) — base do filtro
  // "Produtos do mix" na aba Sugestão de compra.
  const productGroups = useMemo(() => {
    const map = new Map();
    groupedRows.forEach((entry) => {
      const key = groupKeyFor(entry);
      if (!map.has(key)) map.set(key, { key, itemDescription: entry.itemDescription, brandName: entry.brandName, offers: [] });
      map.get(key).offers.push(entry);
    });
    return Array.from(map.values())
      .map((group) => ({ ...group, offers: group.offers.slice().sort((a, b) => a.effectivePrice - b.effectivePrice) }))
      .sort((a, b) => a.itemDescription.localeCompare(b.itemDescription, "pt-BR"));
  }, [groupedRows]);

  // Opções do filtro "Produtos do mix" e quais já estão selecionados (produto conta como
  // selecionado se alguma das suas ofertas estiver em selectedIds).
  const mixProductOptions = useMemo(
    () => productGroups.map((group) => ({ value: group.key, label: group.itemDescription, meta: group.brandName || "" })),
    [productGroups]
  );
  const mixSelectedProductKeys = useMemo(
    () => productGroups.filter((group) => group.offers.some((offer) => selectedIds.has(offer.quoteItemId))).map((group) => group.key),
    [productGroups, selectedIds]
  );

  // Oferta mais barata de um grupo (offers já vem ordenado por preço) que atenda aos parâmetros de
  // pagamento/frete do mix informados — null se nenhuma atender. Parâmetros são passados em vez de
  // lidos do state pra dar pra reconciliar com o valor novo antes do re-render (ver
  // handleMixPaymentPreferenceChange/handleMixFreightPreferenceChange abaixo).
  const pickMatchingOffer = (group, paymentPref, freightPref) => {
    const matching = group.offers.filter((offer) =>
      (paymentPref === "all" || offer.paymentMethods.includes(paymentPref)) &&
      (freightPref === "all" || offer.freightType === freightPref)
    );
    return matching[0] || null;
  };

  // Marcar um produto no filtro entra com a oferta mais barata que respeite os parâmetros do mix
  // (forma de pagamento/frete preferidos, se definidos). Se NENHUMA oferta do produto atender, ele
  // entra mesmo assim pelo melhor preço geral — nunca fica de fora por falta de dado — e o item
  // decorado por myCatalog (mixMismatchPayment/mixMismatchFreight) mostra o aviso na tabela.
  // Desmarcar tira todas as ofertas daquele produto do mix. Troca de fornecedor pra um item
  // específico continua sendo feita marcando outra linha na tabela da aba Comparar produtos.
  const handleMixProductSelection = (nextKeys) => {
    const nextKeySet = new Set(nextKeys);
    let fallbackCount = 0;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      productGroups.forEach((group) => {
        const wasSelected = group.offers.some((offer) => prev.has(offer.quoteItemId));
        const isSelected = nextKeySet.has(group.key);
        if (isSelected && !wasSelected) {
          const matched = pickMatchingOffer(group, mixPaymentPreference, mixFreightPreference);
          const offer = matched || group.offers[0];
          if (offer) {
            next.add(offer.quoteItemId);
            if (!matched) fallbackCount += 1;
          }
        } else if (!isSelected && wasSelected) {
          group.offers.forEach((offer) => next.delete(offer.quoteItemId));
        }
      });
      return next;
    });
    if (fallbackCount > 0) {
      notify && notify(
        fallbackCount + " produto(s) não têm oferta com os parâmetros do mix — adicionados mesmo assim pelo melhor preço disponível (veja o aviso na tabela).",
        "warn"
      );
    }
  };

  // Reconcilia os produtos JÁ selecionados sempre que "Forma de pagamento do mix"/"Frete do mix"
  // mudam — sem isso, os parâmetros só valiam pra próxima marcação, deixando quem já estava no mix
  // intocado. Pra cada produto no mix: troca pra oferta mais barata que atenda ao novo parâmetro;
  // se nenhuma atender, mantém o produto no mix pelo melhor preço geral (nunca remove por falta de
  // dado) — a tabela mostra o aviso via mixMismatchPayment/mixMismatchFreight (decorado em
  // myCatalog).
  const reconcileMixSelection = (paymentPref, freightPref) => {
    let fallbackCount = 0;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      productGroups.forEach((group) => {
        const currentOffer = group.offers.find((offer) => prev.has(offer.quoteItemId));
        if (!currentOffer) return;
        const matched = pickMatchingOffer(group, paymentPref, freightPref);
        const bestOffer = matched || group.offers[0];
        if (!matched) fallbackCount += 1;
        if (bestOffer && bestOffer.quoteItemId !== currentOffer.quoteItemId) {
          next.delete(currentOffer.quoteItemId);
          next.add(bestOffer.quoteItemId);
        }
      });
      return next;
    });
    if (fallbackCount > 0) {
      notify && notify(
        fallbackCount + " produto(s) do mix não têm oferta com os novos parâmetros — mantidos pelo melhor preço disponível (veja o aviso na tabela).",
        "warn"
      );
    }
  };
  const handleMixPaymentPreferenceChange = (value) => {
    setMixPaymentPreference(value);
    reconcileMixSelection(value, mixFreightPreference);
  };
  const handleMixFreightPreferenceChange = (value) => {
    setMixFreightPreference(value);
    reconcileMixSelection(mixPaymentPreference, value);
  };

  // Com algum filtro ativo, um grupo reduzido a 1 oferta ainda é a "melhor oferta" válida para o
  // que foi filtrado (ex.: filtrar por um fornecedor específico ou por uma forma de pagamento que só
  // ele oferece) — sem filtro nenhum, mantém a exigência original de 2+ ofertas para não marcar como
  // "melhor" um produto que nunca teve de fato para comparar.
  const hasActiveFilters = !!(q.trim() || supplierFilters.length || productFilters.length || paymentFilter !== "all" || freightFilter !== "all");
  const isBestOfferVisible = (entry) => entry.isBestOffer && (entry.groupSize >= 2 || hasActiveFilters);

  // Sugestão automática: melhor oferta de cada produto, respeitando os filtros ativos (aba
  // Comparar produtos) E os parâmetros do mix (forma de pagamento/frete, aba Sugestão de compra).
  const suggestedPlan = useMemo(() => groupBySupplier(mixRankedRows.filter((entry) => entry.isBestOffer)), [mixRankedRows]);

  // Meu catálogo: só os itens marcados manualmente pelo usuário na tabela — sobrevive a mudanças de
  // filtro porque parte de pricedEntries (não de filteredEntries/groupedRows). Cada item ganha
  // mixMismatchPayment/mixMismatchFreight quando não atende ao parâmetro do mix atualmente
  // escolhido — recalculado reativamente sempre que os parâmetros mudam, mesmo sem trocar a oferta
  // (ex.: item que já estava certo antes de um parâmetro ser ligado).
  const myCatalog = useMemo(() => {
    const items = pricedEntries
      .filter((entry) => selectedIds.has(entry.quoteItemId))
      .map((entry) => ({
        ...entry,
        mixMismatchPayment: mixPaymentPreference !== "all" && !entry.paymentMethods.includes(mixPaymentPreference),
        mixMismatchFreight: mixFreightPreference !== "all" && entry.freightType !== mixFreightPreference,
      }));
    return groupBySupplier(items);
  }, [pricedEntries, selectedIds, mixPaymentPreference, mixFreightPreference]);

  return (
    <div className="route-fade">
      <PageHead eyebrow="Compras" title="Comparar fornecedores" desc="Onde cada produto sai mais barato, por fornecedor" />

      {!loading && !entries.length ? (
        <div className="card">
          <EmptyState icon="activity" title="Nenhum orçamento confirmado ainda" desc="Cadastre ou confirme um orçamento na tela Cotações para começar a comparar." />
        </div>
      ) : (
        <>
          <PillNav
            options={[{ key: "compare", label: "Comparar produtos" }, { key: "suggestion", label: "Sugestão de compra" }]}
            active={view} onChange={setView}
          />
          <div style={{ height: 20 }} />

          {view === "compare" && (
            <>
              <div className="grid g-4" style={{ marginBottom: 16 }}>
                <StatCard icon="capsule" label="Produtos comparáveis (2+ fornecedores)" value={loading ? "…" : comparableCount} />
                <StatCard icon="truck" label="Fornecedores cotados" value={loading ? "…" : supplierCount} />
                <StatCard icon="star" label={bestSupplier ? "Melhor fornecedor · " + bestSupplier.name : "Melhor fornecedor"} value={loading ? "…" : (bestSupplier ? bestSupplier.wins + " vitória(s)" : "—")} />
                <StatCard icon="sparkle" label="Economia potencial somada" value={loading ? "…" : brl(potentialSavings)} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 12 }}>
                <Field label="Buscar"><input className="input" style={{ minWidth: 220 }} placeholder="Produto, marca, SKU ou EAN" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
                <FilterDropdown
                  label="Fornecedores específicos" placeholder="Buscar fornecedor" options={supplierOptions} selectedValues={supplierFilters}
                  onChange={setSupplierFilters} emptyMessage="Nenhum fornecedor encontrado nas cotações."
                />
                <FilterDropdown
                  label="Produtos específicos" placeholder="Buscar produto ou marca" options={productOptions} selectedValues={productFilters}
                  onChange={setProductFilters} emptyMessage="Nenhum produto encontrado nas cotações."
                />
                <Field label="Forma de pagamento">
                  <select className="input" style={{ minWidth: 170 }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                    <option value="all">Todas</option>
                    {PAYMENT_METHOD_OPTIONS.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
                  </select>
                </Field>
                <Field label="Frete">
                  <select className="input" style={{ minWidth: 120 }} value={freightFilter} onChange={(e) => setFreightFilter(e.target.value)}>
                    <option value="all">Todos</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                  </select>
                </Field>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setOnlyComparable((prev) => !prev)}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: onlyComparable ? "var(--accent)" : "transparent", borderColor: onlyComparable ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{onlyComparable && <Icon name="check" size={12} />}</span>
                  Somente comparáveis
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setOnlyBestOffers((prev) => !prev)}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: onlyBestOffers ? "var(--accent)" : "transparent", borderColor: onlyBestOffers ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{onlyBestOffers && <Icon name="check" size={12} />}</span>
                  Somente melhores ofertas
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }} onClick={() => setShowExpired((prev) => !prev)}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", background: showExpired ? "var(--accent)" : "transparent", borderColor: showExpired ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>{showExpired && <Icon name="check" size={12} />}</span>
                  Mostrar cotações vencidas
                </label>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                <span className="cell-muted">{selectedIds.size} produto(s) selecionado(s) — veja e ajuste seu mix na aba <strong>Sugestão de compra</strong></span>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button className="btn btn-secondary btn-sm" onClick={selectBestOffersVisible}><Icon name="sparkle" size={14} />Selecionar melhores ofertas visíveis</button>
                  {selectedIds.size > 0 && <button className="btn btn-secondary btn-sm" onClick={clearSelection}><Icon name="close" size={14} />Limpar seleção</button>}
                </div>
              </div>

              {!loading && !displayRows.length && (
                <div className="card">
                  <EmptyState icon="search" title="Nenhum item para estes filtros" />
                  <div style={{ textAlign: "center", paddingBottom: 20 }}><button className="btn btn-secondary btn-sm" onClick={clearFilters}>Limpar filtros</button></div>
                </div>
              )}

              {displayRows.length > 0 && (
                <div className="card">
                  <div className="table-wrap">
                    <table>
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
                          <tr key={entry.quoteItemId} style={isBestOfferVisible(entry) ? { background: "var(--good-soft)" } : undefined}>
                            <td><input type="checkbox" checked={selectedIds.has(entry.quoteItemId)} onChange={() => toggleSelect(entry.quoteItemId)} aria-label={"Selecionar " + entry.itemDescription} /></td>
                            <td>
                              <div className="cell-strong">{entry.itemDescription}</div>
                              <div className="cell-muted">{entry.brandName || "Sem marca"}</div>
                            </td>
                            <td>{entry.supplierName}</td>
                            <td>
                              <div style={{ fontWeight: 800 }}>{brl(entry.effectivePrice)}</div>
                              {entry.effectivePrice !== entry.unitPrice && (
                                <div className="cell-muted">tabela {brl(entry.unitPrice)} · {entry.effectivePaymentDiscountPercent}% {paymentMethodLabel(entry.effectivePaymentMethod)}</div>
                              )}
                            </td>
                            <td>
                              {entry.isBestOffer ? (
                                <>
                                  <div style={{ fontWeight: 800 }}>{brl(entry.totalWithFreight)}</div>
                                  {entry.freightCost ? <div className="cell-muted">produto {brl(entry.lineTotal)} + frete {brl(entry.freightCost)}</div> : null}
                                </>
                              ) : <span className="cell-muted">—</span>}
                            </td>
                            <td>
                              {entry.paymentMethods.length
                                ? entry.paymentMethods.map((method) => <span key={method} style={{ marginRight: 4, display: "inline-block" }}><Badge tone="neutral">{paymentMethodLabel(method)}</Badge></span>)
                                : <span className="cell-muted">—</span>}
                            </td>
                            <td>{entry.freightType || "—"}{entry.freightCost ? <span className="cell-muted"> · {brl(entry.freightCost)}</span> : null}</td>
                            <td>{entry.deliveryTimeDays != null ? entry.deliveryTimeDays + " dia(s)" : "—"}</td>
                            <td className="mono">
                              {entry.quoteDate}
                              {isExpired(entry.validUntil) && <span style={{ marginLeft: 6 }}><Badge tone="warning">Vencido</Badge></span>}
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {isBestOfferVisible(entry) && <Badge tone="good"><Icon name="sparkle" size={12} />Melhor oferta</Badge>}
                              {entry.isComodato && <span style={{ marginLeft: 4 }}><Badge tone="neutral"><Icon name="gift" size={11} />Comodato</Badge></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "suggestion" && (
            <>
              <SectionHeader
                icon="cart"
                title="Meu mix de compra"
                description={"Nem tudo que foi cotado precisa ser comprado: escolha os produtos que você realmente vai levar, com os parâmetros de pagamento/frete que preferir — cada um entra com a oferta mais barata que atender esses parâmetros. Produto sem nenhuma oferta com o dado escolhido nunca fica de fora: entra pelo melhor preço geral mesmo assim, com um aviso na tabela deixando isso claro. Mudar um parâmetro recalcula quem já está no mix também. Pra trocar o fornecedor de um item específico sem mexer nos parâmetros, marque a oferta desejada na aba Comparar produtos. Frete somado uma única vez por cotação. Fica salvo automaticamente — sobrevive a troca de tela."}
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 16 }}>
                <FilterDropdown
                  label="Produtos do mix" placeholder="Buscar produto" options={mixProductOptions} selectedValues={mixSelectedProductKeys}
                  onChange={handleMixProductSelection} emptyMessage="Nenhum produto para estes filtros."
                />
                <Field label="Forma de pagamento do mix">
                  <select className="input" style={{ minWidth: 170 }} value={mixPaymentPreference} onChange={(e) => handleMixPaymentPreferenceChange(e.target.value)}>
                    <option value="all">Qualquer</option>
                    {PAYMENT_METHOD_OPTIONS.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
                  </select>
                </Field>
                <Field label="Frete do mix">
                  <select className="input" style={{ minWidth: 120 }} value={mixFreightPreference} onChange={(e) => handleMixFreightPreferenceChange(e.target.value)}>
                    <option value="all">Qualquer</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                  </select>
                </Field>
                {myCatalog.length > 0 && (
                  <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={clearSelection}><Icon name="close" size={14} />Limpar seleção</button>
                )}
              </div>

              <MixResultTable
                groups={myCatalog}
                onRemoveItem={toggleSelect}
                emptyMessage='Você ainda não montou seu mix. Use o filtro "Produtos do mix" acima, o botão "Usar como meu mix" na sugestão automática abaixo, ou marque itens específicos na aba Comparar produtos.'
              />

              <div style={{ marginTop: 36, paddingTop: 28, borderTop: "1px solid var(--border)" }}>
                <SectionHeader
                  icon="sparkle"
                  title="Sugestão automática"
                  description="Com base nos filtros ativos e nos parâmetros do mix (forma de pagamento/frete) acima: pega a melhor oferta de cada produto comparável dentro desses critérios — quando nenhuma oferta atende, cai pro melhor preço geral do produto e avisa na tabela em vez de esconder o produto. Quantidade com base na quantidade de referência cotada; frete somado uma única vez por cotação — ponto de partida, não uma previsão exata de compra."
                  action={suggestedPlan.length > 0 ? (
                    <button className="btn btn-secondary btn-sm" onClick={useSuggestionAsMix}><Icon name="cart" size={14} />Usar como meu mix</button>
                  ) : null}
                />
                <MixResultTable groups={suggestedPlan} emptyMessage="Nenhuma oferta comparável para estes filtros." />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export { QuotesCompareScreen, FilterDropdown };
