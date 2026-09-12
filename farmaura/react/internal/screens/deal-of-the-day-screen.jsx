import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, Tabs, SwitchToggle, StatCard, DataTable, Badge, RowIconBtn,
  EmptyState, money, showToast, InfoTip,
} from "../core/internal-ui.jsx";

const MAX_PRODUCTS = 30;
const MAX_SPECIFIC_DATES = 31;

const SUGGESTION_TABS = [
  { id: "bestsellers", label: "Mais vendidos", glyph: "search" },
  { id: "margins", label: "Melhores margens", glyph: "tag" },
  { id: "promotions", label: "Promoção ativa", glyph: "sparkle" },
  { id: "discounts", label: "Desconto ativo", glyph: "percent" },
  { id: "coupons", label: "Cupom ativo", glyph: "gift" },
  { id: "manual", label: "Buscar manualmente", glyph: "filter" },
];

const MODE_OPTIONS = [
  { id: "off", label: "Desativado", glyph: "close", desc: "Esconde a faixa da home", tip: "A faixa some da home, mas produtos e parâmetros de todos os modos continuam salvos — nada é perdido ao desativar." },
  { id: "manual", label: "Manual", glyph: "filter", desc: "Você escolhe e ordena", tip: "Você escolhe os produtos um a um (sugestões ou busca) e a ordem definida com as setas ▲▼ — a lista fica exatamente assim até você editar de novo." },
  { id: "auto", label: "Automático", glyph: "repeat", desc: "Sorteio por ciclo diário", tip: "Todo dia, no horário do ciclo, o sistema sorteia sozinho um novo conjunto seguindo os parâmetros salvos (categorias, marcas, quantidade por fonte)." },
  { id: "scheduled", label: "Agendado", glyph: "calendar", desc: "Calendário de entradas", tip: "Um calendário de entradas — cada uma com sua lista de produtos, título e subtítulo — ativa numa data específica e/ou num dia da semana. Em empate no mesmo dia, a primeira entrada da lista vence." },
];

const AUTO_COUNT_FIELDS = [
  { key: "countBestsellers", label: "Mais vendidos" },
  { key: "countMargins", label: "Melhores margens" },
  { key: "countPromotions", label: "Promoção ativa" },
  { key: "countDiscounts", label: "Desconto ativo" },
  { key: "countCoupons", label: "Cupom ativo" },
  { key: "countRandom", label: "Aleatório (sem fonte específica)" },
];

/* 0=Segunda..6=Domingo — mesma convenção de app.services.portal_service._match_deal_schedule_entry. */
const WEEKDAY_LABELS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function itemRef(item) { return "inv-" + item.id; }

function formatDateTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
}
function formatDateBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function isNearExpiry(expiry) {
  if (!expiry || expiry === "—") return false;
  const match = /^(\d{2})\/(\d{4})$/.exec(expiry);
  if (!match) return false;
  const expiryDate = new Date(Number(match[2]), Number(match[1]), 0);
  const diff = expiryDate.getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
}
function summarizeSchedule(entry) {
  const parts = [];
  const dates = entry.specificDates || [];
  if (dates.length) parts.push(dates.length === 1 ? formatDateBR(dates[0]) : dates.length + " datas específicas");
  const weekdays = entry.weekdays || [];
  if (weekdays.length) {
    let label = weekdays.slice().sort((a, b) => a - b).map((w) => WEEKDAY_LABELS_PT[w]).join(", ");
    if (entry.endTime) label += ` até ${entry.endTime}`;
    parts.push(label);
  }
  return parts.length ? parts.join(" + ") : "Sem data definida";
}

function ChipToggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={onClick}
      style={on
        ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" }
        : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
    >
      {children}
    </button>
  );
}

function StatusBadges({ productRef, inventoryByRef, promotedRefs }) {
  const inv = inventoryByRef.get(productRef);
  const hasPromotion = promotedRefs.has(productRef);
  const nearExpiry = inv ? isNearExpiry(inv.expiry) : false;
  if (!hasPromotion && !nearExpiry) return <span className="cell-muted">—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {hasPromotion && <Badge tone="critical">Promoção</Badge>}
      {nearExpiry && <Badge tone="warning">Vence em breve</Badge>}
    </div>
  );
}

/* Painel de curadoria de produtos — reaproveitado pelo modo manual desta tela, por cada entrada do
   modo agendado, e por home-trends-screen.jsx. */
function ProductCurationPanel({
  productRefs, onChangeRefs,
  curatedMeta, onCacheMeta,
  inventoryByRef, promotedRefs,
  activeTab, setActiveTab, suggestionsByTab, loadingTab,
  manualQuery, setManualQuery, manualResults,
  notify, maxProducts = MAX_PRODUCTS,
}) {
  const [subview, setSubview] = useState("suggestions");
  const toast = notify || ((m) => showToast({ message: typeof m === "string" ? m : "" }));

  const addProduct = (item) => {
    if (productRefs.includes(item.ref)) { toast("Esse produto já está na lista."); return; }
    if (productRefs.length >= maxProducts) { toast(`Limite de ${maxProducts} produtos — remova algum antes de adicionar outro.`); return; }
    onCacheMeta(item.ref, { name: item.name, brand: item.brand, price: item.price, stock: item.stock });
    onChangeRefs([...productRefs, item.ref]);
  };
  const removeProduct = (ref) => onChangeRefs(productRefs.filter((r) => r !== ref));
  const moveProduct = (ref, dir) => {
    const index = productRefs.indexOf(ref);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= productRefs.length) return;
    const next = productRefs.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    onChangeRefs(next);
  };

  const sourceItems = activeTab === "manual"
    ? manualResults.map((item) => ({ ref: itemRef(item), name: item.name, brand: item.brand, price: item.price, stock: item.qty, metric_label: "" }))
    : (suggestionsByTab[activeTab] || []);
  const visibleItems = sourceItems.filter((item) => !productRefs.includes(item.ref));

  const suggestionColumns = [
    { key: "name", label: "Produto", render: (item) => (
      <>
        <div className="cell-strong">{item.name}</div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{item.brand}{item.metric_label ? " · " + item.metric_label : ""}</div>
      </>
    ) },
    { key: "price", label: "Preço", mono: true, render: (item) => money(item.price) },
    { key: "stock", label: "Estoque", render: (item) => item.stock },
    { key: "status", label: "Status", render: (item) => <StatusBadges productRef={item.ref} inventoryByRef={inventoryByRef} promotedRefs={promotedRefs} /> },
  ];

  const renderSourceBody = () => {
    if (activeTab === "manual") {
      if (!manualQuery.trim()) return <p className="page-desc" style={{ margin: 0 }}>Digite para buscar por nome ou marca.</p>;
      if (!manualResults.length) return <p className="page-desc" style={{ margin: 0 }}>Nenhum produto encontrado.</p>;
    } else {
      if (loadingTab === activeTab) return <p className="page-desc" style={{ margin: 0 }}>Carregando sugestões…</p>;
      if (!sourceItems.length) return <p className="page-desc" style={{ margin: 0 }}>Nenhuma sugestão encontrada nesta fonte agora.</p>;
    }
    if (!visibleItems.length) return <p className="page-desc" style={{ margin: 0 }}>Todos os produtos desta fonte já foram adicionados.</p>;
    return (
      <DataTable
        columns={suggestionColumns}
        rows={visibleItems}
        rowKey="ref"
        renderActions={(item) => (
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => addProduct(item)}>
            <Icon name="plus" size={12} />Adicionar
          </button>
        )}
      />
    );
  };

  return (
    <div>
      <Tabs
        tabs={[
          { key: "suggestions", label: "Sugestões e busca" },
          { key: "selected", label: "Produtos selecionados", count: productRefs.length },
        ]}
        active={subview}
        onChange={setSubview}
      />

      {subview === "suggestions" ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Sugestões e busca</h3>
              <div className="card-head-sub">Escolha por fonte automática ou busque manualmente.</div>
            </div>
            <InfoTip text="Mais vendidos, melhores margens, promoção/desconto/cupom ativo — cada aba busca candidatos reais do seu catálogo. Produtos já adicionados somem da lista automaticamente." />
          </div>
          <div className="card-pad">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {SUGGESTION_TABS.map((tab) => (
                <ChipToggle key={tab.id} on={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                  <Icon name={tab.glyph} size={12} />{tab.label}
                </ChipToggle>
              ))}
            </div>
            {activeTab === "manual" && (
              <input
                className="input" style={{ marginBottom: 10 }}
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Buscar por nome ou marca…"
              />
            )}
            <div style={{ minHeight: 160 }}>{renderSourceBody()}</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>Produtos selecionados ({productRefs.length})</h3>
            <InfoTip text="A ordem aqui é a ordem exibida na home e em /offers — use as setas para reordenar." />
          </div>
          {!productRefs.length ? (
            <div className="card-pad"><p className="page-desc" style={{ margin: 0 }}>Nenhum produto ainda — adicione em "Sugestões e busca".</p></div>
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "Produto", render: (ref) => {
                  const meta = curatedMeta[ref] || {};
                  return (<><div className="cell-strong">{meta.name || "Produto"}</div><div className="cell-muted" style={{ fontSize: 12 }}>{meta.brand}</div></>);
                } },
                { key: "price", label: "Preço", mono: true, render: (ref) => { const m = curatedMeta[ref] || {}; return m.price != null ? money(m.price) : "—"; } },
                { key: "stock", label: "Estoque", render: (ref) => { const m = curatedMeta[ref] || {}; return m.stock != null ? m.stock : "—"; } },
                { key: "status", label: "Status", render: (ref) => <StatusBadges productRef={ref} inventoryByRef={inventoryByRef} promotedRefs={promotedRefs} /> },
              ]}
              rows={productRefs}
              renderActions={(ref) => {
                const index = productRefs.indexOf(ref);
                return (
                  <>
                    <RowIconBtn name="chevrondown" onClick={() => moveProduct(ref, -1)} label="Mover para cima" disabled={index === 0} />
                    <RowIconBtn name="chevrondown" onClick={() => moveProduct(ref, 1)} label="Mover para baixo" disabled={index === productRefs.length - 1} />
                    <RowIconBtn name="trash" tone="danger" onClick={() => removeProduct(ref)} label="Remover" />
                  </>
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* FARMAURA Console — "Ofertas do dia": seção da home do marketplace com 4 modos — desativada,
   curada manualmente, automática (sorteio diário) ou agendada (calendário de entradas). */
function DealOfTheDayScreen({ ctx }) {
  const {
    dealOfTheDay, setDealOfTheDay, saveDealOfTheDay, dealOfTheDayBusy, fetchDealSuggestions,
    fetchActivePromotionRefs, generateDealOfTheDayNow, inventory, categories, brands, notify,
  } = ctx;
  const mode = (dealOfTheDay && dealOfTheDay.mode) || "off";
  const productRefs = (dealOfTheDay && dealOfTheDay.productRefs) || [];
  const resetTime = (dealOfTheDay && dealOfTheDay.resetTime) || "00:00";
  const autoParams = (dealOfTheDay && dealOfTheDay.autoParams) || {};
  const lastGeneratedAt = dealOfTheDay && dealOfTheDay.lastGeneratedAt;
  const scheduleEntries = (dealOfTheDay && dealOfTheDay.scheduleEntries) || [];
  const showCountdown = !dealOfTheDay || dealOfTheDay.showCountdown !== false;

  const [activeTab, setActiveTab] = useState(SUGGESTION_TABS[0].id);
  const [suggestionsByTab, setSuggestionsByTab] = useState({});
  const [loadingTab, setLoadingTab] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [curatedMeta, setCuratedMeta] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [promotedRefs, setPromotedRefs] = useState(() => new Set());

  const selectedEntry = scheduleEntries.find((e) => e.id === selectedEntryId) || scheduleEntries[0] || null;

  const inventoryByRef = useMemo(() => {
    const map = new Map();
    for (const item of inventory || []) map.set(itemRef(item), item);
    return map;
  }, [inventory]);

  useEffect(() => {
    let cancelled = false;
    fetchActivePromotionRefs().then((refs) => { if (!cancelled) setPromotedRefs(new Set(refs)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const allRefs = [...productRefs, ...scheduleEntries.flatMap((e) => e.productRefs || [])];
    setCuratedMeta((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ref of allRefs) {
        if (next[ref]) continue;
        const match = (inventory || []).find((item) => itemRef(item) === ref);
        if (match) { next[ref] = { name: match.name, brand: match.brand, price: match.price, stock: match.qty }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [productRefs, scheduleEntries, inventory]);

  useEffect(() => {
    if ((mode !== "manual" && mode !== "scheduled") || activeTab === "manual" || suggestionsByTab[activeTab] || loadingTab === activeTab) return undefined;
    let cancelled = false;
    setLoadingTab(activeTab);
    const params = activeTab === "bestsellers" ? { months: 3, limit: 20 } : { limit: 20 };
    fetchDealSuggestions(activeTab, params)
      .then((items) => { if (!cancelled) setSuggestionsByTab((prev) => ({ ...prev, [activeTab]: items })); })
      .catch((error) => { if (!cancelled) showToast({ message: (error && error.message) || "Não foi possível carregar as sugestões." }); })
      .finally(() => { if (!cancelled) setLoadingTab(""); });
    return () => { cancelled = true; };
  }, [activeTab, mode]);

  useEffect(() => { setNewDate(""); }, [selectedEntryId]);

  const switchMode = async (nextMode) => { await saveDealOfTheDay({ mode: nextMode }); };
  const cacheMeta = (ref, meta) => setCuratedMeta((prev) => ({ ...prev, [ref]: meta }));
  const patchAutoParams = (patch) => setDealOfTheDay({ autoParams: { ...autoParams, ...patch } });
  const toggleAutoListValue = (key, value) => {
    const list = autoParams[key] || [];
    patchAutoParams({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };
  const autoTotalCount = AUTO_COUNT_FIELDS.reduce((sum, field) => sum + Number(autoParams[field.key] || 0), 0);

  const save = async () => {
    try { await saveDealOfTheDay(); showToast({ message: "Ofertas do dia salvas." }); }
    catch (err) { showToast({ message: (err && err.message) || "Não foi possível salvar." }); }
  };
  const handleGenerateNow = async () => {
    await saveDealOfTheDay();
    await generateDealOfTheDayNow();
    showToast({ message: "Novo sorteio gerado." });
  };

  const newEntryId = () => "sched-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const addEntry = () => {
    const entry = { id: newEntryId(), title: "", subtitle: "", productRefs: [], specificDates: [], weekdays: [], startDate: null, endDate: null };
    setDealOfTheDay({ scheduleEntries: [...scheduleEntries, entry] });
    setSelectedEntryId(entry.id);
  };
  const removeEntry = (id) => {
    setDealOfTheDay({ scheduleEntries: scheduleEntries.filter((e) => e.id !== id) });
    if (selectedEntryId === id) setSelectedEntryId("");
  };
  const moveEntry = (id, dir) => {
    const index = scheduleEntries.findIndex((e) => e.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= scheduleEntries.length) return;
    const next = scheduleEntries.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    setDealOfTheDay({ scheduleEntries: next });
  };
  const patchEntry = (id, patch) => setDealOfTheDay({ scheduleEntries: scheduleEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const addSpecificDate = () => {
    if (!newDate || !selectedEntry) return;
    if ((selectedEntry.specificDates || []).includes(newDate)) { showToast({ message: "Essa data já está na lista." }); return; }
    if ((selectedEntry.specificDates || []).length >= MAX_SPECIFIC_DATES) { showToast({ message: `Limite de ${MAX_SPECIFIC_DATES} datas específicas.` }); return; }
    patchEntry(selectedEntry.id, { specificDates: [...(selectedEntry.specificDates || []), newDate].sort() });
    setNewDate("");
  };
  const toggleWeekday = (idx) => {
    if (!selectedEntry) return;
    const list = selectedEntry.weekdays || [];
    patchEntry(selectedEntry.id, { weekdays: list.includes(idx) ? list.filter((w) => w !== idx) : [...list, idx].sort((a, b) => a - b) });
  };

  const manualResults = manualQuery.trim()
    ? (inventory || []).filter((item) => (item.name + " " + item.brand).toLowerCase().includes(manualQuery.trim().toLowerCase())).slice(0, 30)
    : [];
  const activeCategories = (categories || []).filter((c) => c.active && !c.discarded);
  const activeBrands = (brands || []).filter((b) => b.active && !b.discarded);

  const curationPanelProps = {
    curatedMeta, onCacheMeta: cacheMeta, inventoryByRef, promotedRefs,
    activeTab, setActiveTab, suggestionsByTab, loadingTab,
    manualQuery, setManualQuery, manualResults, notify,
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Vitrine"
        title="Ofertas do dia"
        desc="Seção em destaque na home do marketplace — manual, por ciclos automáticos ou agendada."
        actions={(
          <button className="btn btn-primary" disabled={dealOfTheDayBusy} onClick={save}>
            <Icon name="check" size={14} />{dealOfTheDayBusy ? "Salvando…" : "Salvar"}
          </button>
        )}
      />

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="stat-card"
            disabled={dealOfTheDayBusy}
            onClick={() => switchMode(option.id)}
            style={{
              textAlign: "left", cursor: "pointer", gap: 4, position: "relative",
              borderColor: mode === option.id ? "var(--accent)" : "var(--border)",
              boxShadow: mode === option.id ? "0 0 0 3px var(--accent-soft)" : "var(--shadow-sm)",
            }}
          >
            <div className="stat-top">
              <span className="stat-icon" style={{ background: "var(--surface-2)", color: mode === option.id ? "var(--accent)" : "var(--text-secondary)" }}>
                <Icon name={option.glyph} size={15} />
              </span>
              <span style={{ position: "absolute", top: 10, right: 10 }}><InfoTip text={option.tip} /></span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{option.label}</div>
            <div className="cell-muted" style={{ fontSize: 11.5 }}>{option.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        {mode === "scheduled" ? (
          <>
            <StatCard icon="calendar" label="Entradas no calendário" value={scheduleEntries.length} />
            <StatCard icon="layout" label="Produtos na entrada selecionada" value={`${(selectedEntry && selectedEntry.productRefs || []).length}/${MAX_PRODUCTS}`} />
          </>
        ) : (
          <StatCard icon="layout" label={mode === "auto" ? "Produtos no sorteio atual" : "Produtos ativos"} value={`${productRefs.length}/${MAX_PRODUCTS}`} />
        )}
      </div>

      <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <SwitchToggle on={showCountdown} onChange={(v) => setDealOfTheDay({ showCountdown: v })} label="Mostrar contador regressivo" />
        <span style={{ fontWeight: 700, fontSize: 13 }}>Mostrar contador regressivo na faixa</span>
        <InfoTip text="Quando desligado, a faixa mostra os produtos sem o relógio regressivo — vale para qualquer modo." />
      </div>

      {mode === "off" && (
        (productRefs.length > 0 || scheduleEntries.length > 0) ? (
          <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--warning-soft)" }}>
            <Icon name="info" size={18} style={{ color: "var(--warning)", flex: "none" }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Ofertas do dia desativadas</div>
              <div className="page-desc" style={{ margin: "2px 0 0" }}>
                {scheduleEntries.length > 0
                  ? `${scheduleEntries.length} entrada(s) de calendário continuam salvas — só não aparecem até você reativar.`
                  : `${productRefs.length} produto(s) da última configuração continuam salvos.`}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon="sparkle" title="Nenhuma oferta configurada ainda" desc='Escolha um modo acima para começar a montar a seção "Ofertas do dia".' />
        )
      )}

      {mode === "manual" && (
        <ProductCurationPanel productRefs={productRefs} onChangeRefs={(refs) => setDealOfTheDay({ productRefs: refs })} {...curationPanelProps} />
      )}

      {mode === "auto" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="card-head"><h3>Horário do ciclo</h3><InfoTip text="Também é o horário-limite: no modo agendado, um dia começa e termina neste horário, não à meia-noite." /></div>
              <div className="card-pad">
                <input type="time" className="input" style={{ width: 140 }} value={resetTime} onChange={(e) => setDealOfTheDay({ resetTime: e.target.value })} />
                <p className="page-desc" style={{ marginTop: 8 }}>Todo dia nesse horário, um novo sorteio substitui o anterior automaticamente.</p>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Categorias e marcas elegíveis</h3><InfoTip text="Vazio = sem restrição, o sorteio pode escolher de qualquer categoria/marca." /></div>
              <div className="card-pad">
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "var(--text-secondary)" }}>Categorias</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {activeCategories.map((c) => (
                    <ChipToggle key={c.id} on={(autoParams.categories || []).includes(c.name)} onClick={() => toggleAutoListValue("categories", c.name)}>{c.name}</ChipToggle>
                  ))}
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, margin: "16px 0 8px", color: "var(--text-secondary)" }}>Marcas</div>
                <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {activeBrands.map((b) => (
                    <ChipToggle key={b.id} on={(autoParams.brands || []).includes(b.name)} onClick={() => toggleAutoListValue("brands", b.name)}>{b.name}</ChipToggle>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Quantos sortear de cada fonte — total {autoTotalCount}/{MAX_PRODUCTS}</h3><InfoTip text="Cada fonte sorteia sua própria cota ao acaso e o resultado final é embaralhado de novo." /></div>
              <div className="card-pad">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {AUTO_COUNT_FIELDS.map((field) => (
                    <div key={field.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12.5 }}>{field.label}</span>
                      <input
                        type="number" min="0" max={MAX_PRODUCTS} className="input" style={{ width: 64, textAlign: "center" }}
                        value={autoParams[field.key] || 0}
                        onChange={(e) => patchAutoParams({ [field.key]: Math.max(0, Math.min(MAX_PRODUCTS, Number(e.target.value) || 0)) })}
                      />
                    </div>
                  ))}
                </div>
                {autoTotalCount > MAX_PRODUCTS && <p className="field-error" style={{ marginTop: 8 }}>A soma passa do limite de {MAX_PRODUCTS} — o sorteio corta no limite.</p>}
                <button className="btn btn-primary" type="button" onClick={handleGenerateNow} disabled={dealOfTheDayBusy} style={{ marginTop: 16 }}>
                  <Icon name="sparkle" size={14} />{dealOfTheDayBusy ? "Gerando…" : "Gerar agora"}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Sorteio atual ({productRefs.length})</h3></div>
            <div className="card-pad">
              <p className="page-desc" style={{ marginTop: 0 }}>{lastGeneratedAt ? "Última geração: " + formatDateTime(lastGeneratedAt) : 'Ainda não gerado — clique em "Gerar agora".'}</p>
              {!productRefs.length && <p className="page-desc" style={{ margin: 0 }}>Nenhum produto sorteado ainda.</p>}
              {productRefs.map((ref) => {
                const meta = curatedMeta[ref] || {};
                return (
                  <div key={ref} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.name || "Produto"}</div>
                    <div className="cell-muted" style={{ fontSize: 12 }}>{meta.brand}{meta.price != null ? " · " + money(meta.price) : ""}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mode === "scheduled" && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" }}>
          <div className="card">
            <div className="card-head"><h3>Entradas do calendário ({scheduleEntries.length})</h3><InfoTip text="Em conflito no mesmo dia, a primeira da lista tem prioridade — reordene com as setas." /></div>
            <div className="card-pad">
              <button className="btn btn-secondary btn-sm" type="button" onClick={addEntry} style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}>
                <Icon name="plus" size={12} />Nova entrada
              </button>
              {!scheduleEntries.length && <p className="page-desc" style={{ margin: 0 }}>Nenhuma entrada ainda — clique acima para criar a primeira.</p>}
              {scheduleEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="card"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 8, cursor: "pointer", borderColor: selectedEntry && selectedEntry.id === entry.id ? "var(--accent)" : "var(--border)" }}
                  role="button" tabIndex={0}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title || "Sem título"}</div>
                    <div className="cell-muted" style={{ fontSize: 12 }}>{summarizeSchedule(entry)} · {(entry.productRefs || []).length} produto(s)</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flex: "none" }} onClick={(e) => e.stopPropagation()}>
                    <RowIconBtn name="chevrondown" onClick={() => moveEntry(entry.id, -1)} label="Mover para cima" disabled={index === 0} />
                    <RowIconBtn name="chevrondown" onClick={() => moveEntry(entry.id, 1)} label="Mover para baixo" disabled={index === scheduleEntries.length - 1} />
                    <RowIconBtn name="trash" tone="danger" onClick={() => removeEntry(entry.id)} label="Remover" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedEntry ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card">
                <div className="card-head"><h3>Detalhes da entrada</h3></div>
                <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="field">
                    <label>Título</label>
                    <input className="input" value={selectedEntry.title} placeholder="Ex: Black Week" onChange={(e) => patchEntry(selectedEntry.id, { title: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Subtítulo</label>
                    <input className="input" value={selectedEntry.subtitle} placeholder="Ex: Até 50% off em itens selecionados" onChange={(e) => patchEntry(selectedEntry.id, { subtitle: e.target.value })} />
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      Datas específicas ({(selectedEntry.specificDates || []).length}/{MAX_SPECIFIC_DATES})
                      <InfoTip text="Data específica sempre vence a repetição semanal, se as duas baterem no mesmo dia." />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <input type="date" className="input" style={{ width: 180 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                      <button className="btn btn-secondary btn-sm" type="button" onClick={addSpecificDate}><Icon name="plus" size={12} />Adicionar</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(selectedEntry.specificDates || []).map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="badge badge-accent"
                          style={{ cursor: "pointer", border: "none" }}
                          onClick={() => patchEntry(selectedEntry.id, { specificDates: selectedEntry.specificDates.filter((v) => v !== d) })}
                        >
                          {formatDateBR(d)}<Icon name="x" size={11} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                      Repetição semanal
                      <InfoTip text="'De'/'Até' são opcionais — limitam em quais datas a repetição roda. O horário de término é independente: se definido, a oferta some nesse horário todos os dias em que a regra vale." />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {WEEKDAY_LABELS_PT.map((label, idx) => (
                        <ChipToggle key={idx} on={(selectedEntry.weekdays || []).includes(idx)} onClick={() => toggleWeekday(idx)}>{label}</ChipToggle>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div className="field" style={{ width: 160 }}>
                        <label>De (opcional)</label>
                        <input type="date" className="input" value={selectedEntry.startDate || ""} onChange={(e) => patchEntry(selectedEntry.id, { startDate: e.target.value || null })} />
                      </div>
                      <div className="field" style={{ width: 160 }}>
                        <label>Até (opcional)</label>
                        <input type="date" className="input" value={selectedEntry.endDate || ""} onChange={(e) => patchEntry(selectedEntry.id, { endDate: e.target.value || null })} />
                      </div>
                      <div className="field" style={{ width: 150 }}>
                        <label>Término diário (opcional)</label>
                        <input type="time" className="input" value={selectedEntry.endTime || ""} onChange={(e) => patchEntry(selectedEntry.id, { endTime: e.target.value || null })} />
                      </div>
                    </div>
                    <p className="page-desc" style={{ marginTop: 6 }}>Ex: marcando só Domingo + término 20:00, a oferta vale todo domingo até as 20h.</p>
                  </div>
                </div>
              </div>

              <ProductCurationPanel
                productRefs={selectedEntry.productRefs || []}
                onChangeRefs={(refs) => patchEntry(selectedEntry.id, { productRefs: refs })}
                {...curationPanelProps}
              />
            </div>
          ) : (
            <EmptyState icon="calendar" title="Nenhuma entrada ainda" desc="Crie uma entrada de calendário ao lado para começar." />
          )}
        </div>
      )}
    </div>
  );
}

export { DealOfTheDayScreen, ProductCurationPanel, itemRef, SUGGESTION_TABS };
