import React, { useEffect, useMemo, useState } from "react";
import { Icon, PageHead, SwitchToggle, EmptyState, showToast } from "../core/internal-ui.jsx";
import { ProductCurationPanel, SUGGESTION_TABS, itemRef } from "./deal-of-the-day-screen.jsx";

const MAX_PRODUCTS = 12;

/* FARMAURA Console — "Tendências": faixa da home do marketplace com uma lista curada e ordenada de
   produtos em alta. Reaproveita o ProductCurationPanel de "Ofertas do dia" — mesma curadoria, mas
   sem os modos automático/agendado nem contador; só desligada/ativa + lista. */
function HomeTrendsScreen({ ctx }) {
  const { homeTrends, setHomeTrends, saveHomeTrends, homeTrendsBusy, fetchDealSuggestions, fetchActivePromotionRefs, inventory, notify } = ctx;
  const mode = (homeTrends && homeTrends.mode) || "off";
  const productRefs = (homeTrends && homeTrends.productRefs) || [];

  const [activeTab, setActiveTab] = useState(SUGGESTION_TABS[0].id);
  const [suggestionsByTab, setSuggestionsByTab] = useState({});
  const [loadingTab, setLoadingTab] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [curatedMeta, setCuratedMeta] = useState({});
  const [promotedRefs, setPromotedRefs] = useState(() => new Set());

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
    setCuratedMeta((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ref of productRefs) {
        if (next[ref]) continue;
        const match = (inventory || []).find((item) => itemRef(item) === ref);
        if (match) { next[ref] = { name: match.name, brand: match.brand, price: match.price, stock: match.qty }; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [productRefs, inventory]);

  useEffect(() => {
    if (mode !== "on" || activeTab === "manual" || suggestionsByTab[activeTab] || loadingTab === activeTab) return undefined;
    let cancelled = false;
    setLoadingTab(activeTab);
    const params = activeTab === "bestsellers" ? { months: 3, limit: 20 } : { limit: 20 };
    fetchDealSuggestions(activeTab, params)
      .then((items) => { if (!cancelled) setSuggestionsByTab((prev) => ({ ...prev, [activeTab]: items })); })
      .catch((error) => { if (!cancelled) showToast({ message: (error && error.message) || "Não foi possível carregar as sugestões." }); })
      .finally(() => { if (!cancelled) setLoadingTab(""); });
    return () => { cancelled = true; };
  }, [activeTab, mode]);

  const cacheMeta = (ref, meta) => setCuratedMeta((prev) => ({ ...prev, [ref]: meta }));

  const save = async () => {
    try { await saveHomeTrends(); showToast({ message: "Tendências salvas." }); }
    catch (err) { showToast({ message: (err && err.message) || "Não foi possível salvar." }); }
  };

  const curationPanelProps = {
    curatedMeta, onCacheMeta: cacheMeta, inventoryByRef, promotedRefs,
    activeTab, setActiveTab, suggestionsByTab, loadingTab,
    manualQuery, setManualQuery,
    manualResults: manualQuery.trim()
      ? (inventory || []).filter((item) => (item.name + " " + item.brand).toLowerCase().includes(manualQuery.trim().toLowerCase())).slice(0, 30)
      : [],
    notify,
    maxProducts: MAX_PRODUCTS,
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Vitrine"
        title="Tendências"
        desc={`Faixa da home do marketplace com uma lista curada de até ${MAX_PRODUCTS} produtos em alta. Ordene com as setas ▲▼; desligar só esconde a faixa, os produtos ficam salvos.`}
        actions={(
          <>
            <SwitchToggle on={mode === "on"} onChange={(v) => saveHomeTrends({ mode: v ? "on" : "off" })} label="Mostrar tendências" />
            <button className="btn btn-primary" disabled={homeTrendsBusy} onClick={save}>
              <Icon name="check" size={14} />{homeTrendsBusy ? "Salvando…" : "Salvar"}
            </button>
          </>
        )}
      />

      {mode === "off" && productRefs.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--accent-soft)" }}>
          <Icon name="info" size={18} style={{ color: "var(--accent)", flex: "none" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Tendências desligadas</div>
            <div className="page-desc" style={{ margin: "2px 0 0" }}>Os {productRefs.length} produto(s) da última configuração continuam salvos — só não aparecem na home até você religar.</div>
          </div>
        </div>
      )}

      {mode === "off" && !productRefs.length && (
        <EmptyState icon="activity" title="Nenhuma tendência configurada ainda" desc='Ligue "Mostrar tendências" acima para começar a montar a faixa.' />
      )}

      {mode === "on" && (
        <ProductCurationPanel
          productRefs={productRefs}
          onChangeRefs={(refs) => setHomeTrends({ productRefs: refs })}
          {...curationPanelProps}
        />
      )}
    </div>
  );
}

export { HomeTrendsScreen };
