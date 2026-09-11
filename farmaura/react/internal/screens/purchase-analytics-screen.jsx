import React, { useEffect, useRef, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { paymentMethodLabel } from "./quotes-screen.jsx";
import { CouponInfoHint } from "./coupons-screen.jsx";
import { Icon, PageHead, Badge, StatCard, PillNav, EmptyState, Field } from "../core/internal-ui.jsx";
import "../../shared/portal-cache.js";

const COLUMNS_CACHE_KEY = "purchase_analytics_columns";
/* "Produto" é a coluna-âncora (sempre visível, não entra no seletor). As demais o usuário escolhe
   via ColumnFilterDropdown estilo Excel — evita rolagem lateral forçada numa tabela de 10 colunas
   deixando cada usuário montar só o que importa pro que está analisando no momento. */
const TABLE_COLUMNS = [
  { value: "category", label: "Categoria" },
  { value: "abc", label: "ABC" },
  { value: "xyz", label: "XYZ" },
  { value: "avgMonthly", label: "Consumo médio/mês" },
  { value: "stock", label: "Estoque atual" },
  { value: "coverage", label: "Cobertura" },
  { value: "supplier", label: "Melhor fornecedor" },
  { value: "suggestion", label: "Sugestão de compra" },
  { value: "orderDate", label: "Comprar até" },
  { value: "alerts", label: "Alertas" },
];
const DEFAULT_COLUMNS = ["abc", "xyz", "coverage", "supplier", "suggestion", "alerts"];

const ABC_EXPLANATION = "Classificação por valor (curva de Pareto): agrupa os produtos pela receita acumulada no período. Classe A = os que mais geram receita (até 80% do acumulado), B = até 95%, C = os 5% finais.";
const XYZ_EXPLANATION = "Classificação por variabilidade de demanda (coeficiente de variação da quantidade vendida mês a mês). X = demanda estável, Y = variável, Z = errática/imprevisível. Exige pelo menos 2 meses distintos com venda — antes disso aparece \"Aguardando histórico\".";

/* FARMAURA Console — Painel de Compras (Fase 2 de Orçamentos).
   Classifica produtos por valor (ABC, Pareto) e por variabilidade de demanda (XYZ, coeficiente
   de variação) a partir das vendas reais (pedidos online + balcão), cruza com os orçamentos
   confirmados (Fase 1) e sugere o que comprar. Sem histórico de vendas suficiente, mostra um
   estado vazio explicativo em vez de uma tabela vazia — a classificação aparece sozinha conforme
   as vendas forem sendo registradas. */

const ABC_TONE = { A: "good", B: "info", C: "neutral" };
const XYZ_COLUMNS = [
  { key: "X", label: "X · Estável" },
  { key: "Y", label: "Y · Variável" },
  { key: "Z", label: "Z · Errático" },
  { key: "", label: "Aguardando histórico" },
];
const ABC_ROWS = ["A", "B", "C"];

function formatIsoDate(isoDate) {
  if (!isoDate) return "—";
  const parsed = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("pt-BR");
}

/* Dropdown de seleção múltipla de colunas (estilo Excel), próprio desta tela — evita depender
   do FilterDropdown de quotes-compare-screen.jsx (Lote F, ainda não migrado). */
function ColumnFilterDropdown({ label, options, selectedValues, onChange }) {
  const [open, setOpen] = useState(false);
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

  const toggleValue = (value) => {
    onChange(selectedValues.includes(value) ? selectedValues.filter((v) => v !== value) : [...selectedValues, value]);
  };

  let triggerLabel = "Todas";
  if (selectedValues.length === 1) {
    const found = options.find((option) => option.value === selectedValues[0]);
    triggerLabel = found ? found.label : selectedValues[0];
  } else if (selectedValues.length > 1) {
    triggerLabel = selectedValues.length + " selecionadas";
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
        <div className="card" role="dialog" aria-label={label} style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20, padding: 8, minWidth: 240, maxHeight: 320, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <button
                key={option.value} type="button" onClick={() => toggleValue(option.value)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "none", background: checked ? "var(--surface-2)" : "transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: checked ? "var(--accent)" : "transparent", borderColor: checked ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>
                  {checked && <Icon name="check" size={11} />}
                </span>
                <span style={{ fontSize: 13 }}>{option.label}</span>
              </button>
            );
          })}
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

/* Matriz ABC (valor) × XYZ (variabilidade): heatmap de contagem em um único tom (sequencial),
   sempre com o número escrito na célula — a cor nunca é a única forma de ler o valor. */
function AbcXyzMatrix({ items }) {
  const counts = {};
  let max = 0;
  ABC_ROWS.forEach((abc) => {
    XYZ_COLUMNS.forEach((col) => {
      const count = items.filter((item) => item.abcClass === abc && item.xyzClass === col.key).length;
      counts[abc + "|" + col.key] = count;
      if (count > max) max = count;
    });
  });
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 6, width: "100%", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ width: 84 }}></th>
            {XYZ_COLUMNS.map((col) => (
              <th key={col.key || "none"} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", textAlign: "center", padding: "0 4px" }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ABC_ROWS.map((abc) => (
            <tr key={abc}>
              <td style={{ fontSize: 13, fontWeight: 800 }}>Classe {abc}</td>
              {XYZ_COLUMNS.map((col) => {
                const count = counts[abc + "|" + col.key];
                const ratio = max > 0 ? count / max : 0;
                const background = count === 0 ? "var(--surface-2)" : "color-mix(in srgb, var(--accent) " + Math.round(18 + ratio * 67) + "%, white)";
                const color = ratio > 0.55 ? "#fff" : "var(--text-primary)";
                return (
                  <td key={col.key || "none"} style={{ textAlign: "center", padding: "16px 6px", borderRadius: 10, background, color, fontWeight: 800, fontSize: 18 }}>
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseAnalyticsScreen({ ctx }) {
  const { fetchPurchaseAnalytics, categories, notify, onNav, user } = ctx;
  const [months, setMonths] = useState(12);
  const [categoryId, setCategoryId] = useState("");
  const [abcClass, setAbcClass] = useState("");
  const [xyzClass, setXyzClass] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState(
    () => window.FA_PORTAL_CACHE.readLocal("internal", user, COLUMNS_CACHE_KEY, DEFAULT_COLUMNS)
  );

  useEffect(() => {
    window.FA_PORTAL_CACHE.writeLocal("internal", user, COLUMNS_CACHE_KEY, visibleColumns);
  }, [user && user.id, visibleColumns]);

  const showColumn = (key) => visibleColumns.includes(key);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await fetchPurchaseAnalytics({ months, categoryId, abcClass, xyzClass });
      setData(payload);
    } catch (error) {
      notify && notify(error && error.message ? error.message : "Não foi possível carregar o painel de compras.", "warn");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [months, categoryId, abcClass, xyzClass]);

  const summary = data && data.summary;
  const items = (data && data.items) || [];
  const hasData = !!summary && summary.totalProductsWithSales > 0;
  const hasFilters = !!categoryId || !!abcClass || !!xyzClass;

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Compras" title="Painel de Compras" desc="Classificação ABC/XYZ e sugestão de compra"
        actions={<PillNav options={[3, 6, 12].map((option) => ({ key: option, label: option + " meses" }))} active={months} onChange={setMonths} />}
      />

      {loading && !data && <EmptyState icon="gauge" title="Carregando painel de compras…" />}

      {!loading && data && !hasData && (
        <EmptyState
          icon="gauge" title="Ainda não há histórico suficiente"
          desc="A classificação ABC/XYZ e as sugestões de compra aparecem aqui automaticamente conforme os pedidos online e as vendas do balcão forem sendo registrados."
        />
      )}
      {!loading && data && !hasData && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: -12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onNav("quotes")}><Icon name="card" size={14} />Ver cotações</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onNav("quotes-compare")}><Icon name="activity" size={14} />Comparar fornecedores</button>
        </div>
      )}

      {data && hasData && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 18 }}>
            <StatCard icon="capsule" value={summary.totalProductsWithSales} label="Produtos analisados" />
            <StatCard icon="star" value={summary.classACount} label="Produtos classe A" />
            <StatCard icon="bell" value={summary.classAWithoutOfferCount} label="Classe A sem orçamento ativo" tone={summary.classAWithoutOfferCount ? "warning" : "accent"} />
            <StatCard icon="tag" value={brl(summary.totalRevenueAnalyzed)} label={"Receita analisada · " + summary.months + " meses"} />
            <StatCard icon="activity" value={summary.totalUnitsSoldPerMonth} label="Unidades vendidas/mês (média)" />
            <StatCard icon="bell" value={summary.urgentReorderCount} label="Compra urgente" tone={summary.urgentReorderCount ? "warning" : "accent"} />
          </div>

          {summary.monthsWithData < 2 && (
            <div className="card card-pad" style={{ marginBottom: 16, background: "var(--info-soft)", color: "var(--info)", fontSize: 13.5, fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
              <Icon name="info" size={16} />
              A classificação XYZ (variabilidade de demanda) fica mais precisa conforme mais
              meses de venda forem registrados — por enquanto, produtos aparecem como
              "Aguardando histórico".
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            <Field label="Categoria">
              <select className="input" style={{ minWidth: 170 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Todas as categorias</option>
                {(categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Classe ABC">
              <select className="input" style={{ minWidth: 120 }} value={abcClass} onChange={(e) => setAbcClass(e.target.value)}>
                <option value="">Todas</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Field>
            <Field label="Classe XYZ">
              <select className="input" style={{ minWidth: 120 }} value={xyzClass} onChange={(e) => setXyzClass(e.target.value)}>
                <option value="">Todas</option>
                <option value="X">X</option>
                <option value="Y">Y</option>
                <option value="Z">Z</option>
              </select>
            </Field>
            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setCategoryId(""); setAbcClass(""); setXyzClass(""); }}>
                <Icon name="close" size={14} />Limpar filtros
              </button>
            )}
            <ColumnFilterDropdown label="Colunas da tabela" options={TABLE_COLUMNS} selectedValues={visibleColumns} onChange={setVisibleColumns} />
            {visibleColumns.length !== DEFAULT_COLUMNS.length || visibleColumns.some((key) => !DEFAULT_COLUMNS.includes(key)) ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setVisibleColumns(DEFAULT_COLUMNS)}>
                <Icon name="close" size={14} />Colunas padrão
              </button>
            ) : null}
          </div>

          <AnCard
            icon="grid"
            title={<>Matriz ABC × XYZ <CouponInfoHint text={ABC_EXPLANATION + " " + XYZ_EXPLANATION} align="start" /></>}
            sub="Quantidade de produtos por combinação de classe"
            style={{ marginBottom: 16 }}
          >
            <AbcXyzMatrix items={items} />
          </AnCard>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    {showColumn("category") && <th>Categoria</th>}
                    {showColumn("abc") && <th>ABC <CouponInfoHint text={ABC_EXPLANATION} align="start" /></th>}
                    {showColumn("xyz") && <th>XYZ <CouponInfoHint text={XYZ_EXPLANATION} align="start" /></th>}
                    {showColumn("avgMonthly") && <th>Consumo médio/mês</th>}
                    {showColumn("stock") && <th>Estoque atual</th>}
                    {showColumn("coverage") && <th>Cobertura</th>}
                    {showColumn("supplier") && <th>Melhor fornecedor</th>}
                    {showColumn("suggestion") && <th>Sugestão de compra</th>}
                    {showColumn("orderDate") && <th>Comprar até</th>}
                    {showColumn("alerts") && <th>Alertas</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const alerts = [];
                    if (!item.bestOffer) {
                      alerts.push({ key: "no-offer", icon: "bell", text: "Sem orçamento", tone: "warning" });
                    }
                    if (item.reorderUrgency === "urgent") {
                      alerts.push({ key: "urgent", icon: "bell", text: "Compra urgente", tone: "warning" });
                    } else if (item.reorderUrgency === "soon") {
                      alerts.push({ key: "soon", icon: "activity", text: "Comprar em breve", tone: "info" });
                    }
                    if (item.leadTimeMissing && item.suggestedOrderDate) {
                      alerts.push({ key: "lead-missing", icon: "info", text: "Prazo de entrega não cadastrado — usando só a cobertura de estoque", tone: "warning" });
                    }
                    return (
                      <tr key={item.productId}>
                        <td>
                          <div className="cell-strong">{item.name}</div>
                          <div className="cell-muted">{item.brandName || "Sem marca"}</div>
                        </td>
                        {showColumn("category") && <td>{item.categoryName || "—"}</td>}
                        {showColumn("abc") && <td><Badge tone={ABC_TONE[item.abcClass]}>{item.abcClass}</Badge></td>}
                        {showColumn("xyz") && <td>{item.xyzClass ? <Badge tone="neutral">{item.xyzClass}</Badge> : <span className="cell-muted">Aguardando</span>}</td>}
                        {showColumn("avgMonthly") && <td className="mono">{item.averageMonthlyQuantity}</td>}
                        {showColumn("stock") && <td className="mono">{item.currentStock}</td>}
                        {showColumn("coverage") && <td>{item.coverageDays != null ? item.coverageDays + " dias" : "—"}</td>}
                        {showColumn("supplier") && (
                          <td>
                            {item.bestOffer ? (
                              <>
                                <div className="cell-strong" style={{ fontSize: 13 }}>{item.bestOffer.supplierName}</div>
                                <div className="cell-muted">{brl(item.bestOffer.effectivePrice)} · {paymentMethodLabel(item.bestOffer.paymentMethod)}</div>
                              </>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
                          </td>
                        )}
                        {showColumn("suggestion") && (
                          <td>
                            {item.suggestedPurchaseQuantity > 0 ? (
                              <Badge tone="info">{item.suggestedPurchaseQuantity} un</Badge>
                            ) : (
                              <span className="cell-muted">Estoque OK</span>
                            )}
                          </td>
                        )}
                        {showColumn("orderDate") && <td className="mono" style={{ whiteSpace: "nowrap" }}>{formatIsoDate(item.suggestedOrderDate)}</td>}
                        {showColumn("alerts") && (
                          <td style={{ verticalAlign: "top" }}>
                            {alerts.length ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
                                {alerts.map((alert) => (
                                  <Badge key={alert.key} tone={alert.tone}>
                                    <Icon name={alert.icon} size={12} />
                                    <span>{alert.text}</span>
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!items.length && <EmptyState icon="search" title="Nenhum produto encontrado com os filtros aplicados" />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export { PurchaseAnalyticsScreen };
