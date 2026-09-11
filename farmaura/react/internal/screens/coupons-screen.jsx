import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, Modal, Field, SwitchToggle, Tabs, Badge, StatCard, DataTable,
  EmptyState, confirmAction, showToast, money,
} from "../core/internal-ui.jsx";

/*
farmaura/react/internal/screens/coupons-screen.jsx

Marketplace coupon management screen and modal for Farmaura internal portal.

Responsibilities:
- render the full coupon administration workspace for marketplace campaigns;
- provide creation and edition flows through a reusable modal dialog;
- expose activation, pause, duplication, and removal controls with live metrics;

Observations:
- coupon persistence is handled by the internal app state via the /portal/internal/coupons API;
- CouponInfoHint/CouponFieldLabel stay exported unchanged for purchase-analytics-screen.jsx (still
  on the legacy design); this screen's own UI uses Field's hint text instead of a hover tooltip.
*/

const COUPON_AUDIENCE_LABELS = {
  all: "Todo o marketplace",
  new_customers: "Novos clientes",
  recurring: "Clientes recorrentes",
  prescription: "Pedidos com receita",
};

const COUPON_SCOPE_LABELS = {
  all: "Catálogo completo",
  categories: "Categorias específicas",
  products: "Remédios e produtos específicos",
  services: "Serviços de saúde",
};

const COUPON_CHANNEL_LABELS = {
  all: "Todos os canais",
  online: "Somente loja online",
  pdv: "Somente balcão (PDV)",
};

const COUPON_DISCOUNT_TYPE_ICONS = { percent: "percent", fixed: "tag", shipping: "truck" };
const COUPON_PAYMENT_ICONS = { Pix: "pix", "Cartão de crédito": "card", "Cartão de débito": "card", Dinheiro: "bag" };

const COUPON_STATUS_META = {
  active: { label: "Ativo", tone: "good", icon: "check" },
  scheduled: { label: "Agendado", tone: "neutral", icon: "calendar" },
  expiring: { label: "Expira em breve", tone: "warning", icon: "clock" },
  exhausted: { label: "Esgotado", tone: "critical", icon: "minus" },
  expired: { label: "Expirado", tone: "neutral", icon: "close" },
  inactive: { label: "Pausado", tone: "neutral", icon: "pause" },
};

/** Split comma-separated targets into a normalized array. */
function parseCouponTargets(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
/** Join target values into a comma-separated string for search-text building. */
function stringifyCouponTargets(value) { return parseCouponTargets(value).join(", "); }

/** Build a view-model draft for coupon forms. */
function createCouponDraft(sourceCoupon) {
  const coupon = sourceCoupon || {};
  return {
    code: coupon.code || "",
    title: coupon.title || "",
    description: coupon.description || "",
    discountType: coupon.discountType || "percent",
    shippingDiscountMode: coupon.shippingDiscountMode || "full",
    discountValue: coupon.discountType === "shipping" && (coupon.shippingDiscountMode || "full") === "full" ? 0 : coupon.discountValue == null ? 10 : Number(coupon.discountValue || 0),
    minimumOrderValue: coupon.minimumOrderValue == null ? 0 : Number(coupon.minimumOrderValue || 0),
    maxDiscountValue: coupon.discountType === "shipping" ? "" : coupon.maxDiscountValue == null ? "" : Number(coupon.maxDiscountValue || 0),
    startsAt: coupon.startsAt || "",
    endsAt: coupon.endsAt || "",
    usageLimit: coupon.usageLimit == null ? "" : Number(coupon.usageLimit || 0),
    perCustomerLimit: coupon.perCustomerLimit == null ? 1 : Number(coupon.perCustomerLimit || 1),
    audience: coupon.audience || "all",
    channelScope: coupon.channelScope || "all",
    scopeType: coupon.scopeType || "all",
    targetCategories: parseCouponTargets(coupon.targetCategories || []),
    targetProducts: parseCouponTargets(coupon.targetProducts || []),
    targetServices: parseCouponTargets(coupon.targetServices || []),
    firstPurchaseOnly: !!coupon.firstPurchaseOnly,
    stackable: !!coupon.stackable,
    active: coupon.active !== false,
    notes: coupon.notes || "",
  };
}

/** Normalize coupon code input for consistent identifiers. */
function normalizeCouponCode(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9_-]+/g, "").slice(0, 24);
}
/** Format monetary values in BRL. */
function formatCouponCurrency(value) { return money(value); }
/** Format percentage values for labels. */
function formatCouponPercent(value) { return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%"; }
/** Format local datetime labels from ISO-like input. */
function formatCouponDateTime(value) {
  if (!value) return "Sem agendamento";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem agendamento";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** Calculate coupon status according to activation, schedule, and usage caps. */
function getCouponStatusKey(coupon) {
  const now = new Date();
  const startsAt = coupon && coupon.startsAt ? new Date(coupon.startsAt) : null;
  const endsAt = coupon && coupon.endsAt ? new Date(coupon.endsAt) : null;
  const usageLimit = coupon && coupon.usageLimit != null ? Number(coupon.usageLimit || 0) : null;
  const usageCount = Number(coupon && coupon.usageCount || 0);
  const msInDay = 24 * 60 * 60 * 1000;
  if (!coupon || coupon.active === false) return "inactive";
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) return "scheduled";
  if (usageLimit != null && usageLimit > 0 && usageCount >= usageLimit) return "exhausted";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime()) return "expired";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() - now.getTime() <= msInDay * 3) return "expiring";
  return "active";
}
/** Return a human-readable status metadata object. */
function getCouponStatusMeta(coupon) { return COUPON_STATUS_META[getCouponStatusKey(coupon)] || COUPON_STATUS_META.inactive; }
/** Format discount label depending on coupon type. */
function formatCouponDiscount(coupon) {
  if (coupon.discountType === "shipping") {
    if ((coupon.shippingDiscountMode || "full") === "percent") return formatCouponPercent(coupon.discountValue) + " no frete";
    if ((coupon.shippingDiscountMode || "full") === "fixed") return formatCouponCurrency(coupon.discountValue) + " no frete";
    return "Frete grátis";
  }
  if (coupon.discountType === "fixed") return formatCouponCurrency(coupon.discountValue);
  return formatCouponPercent(coupon.discountValue);
}
/** Calculate usage progress percentage with sensible bounds. */
function getCouponUsageProgress(coupon) {
  const usageLimit = coupon.usageLimit == null ? null : Number(coupon.usageLimit || 0);
  if (!usageLimit || usageLimit <= 0) return Math.min(100, Number(coupon.usageCount || 0) > 0 ? 24 : 0);
  return Math.max(0, Math.min(100, Math.round(Number(coupon.usageCount || 0) / usageLimit * 100)));
}
/** Build human-readable scope labels for the coupon. */
function getCouponScopeBadges(coupon) {
  const badges = [];
  badges.push(COUPON_SCOPE_LABELS[coupon.scopeType] || COUPON_SCOPE_LABELS.all);
  if (coupon.scopeType === "categories") {
    parseCouponTargets(coupon.targetCategories).slice(0, 3).forEach((item) => badges.push(item));
    if (parseCouponTargets(coupon.targetCategories).length > 3) badges.push("+" + (parseCouponTargets(coupon.targetCategories).length - 3));
  }
  if (coupon.scopeType === "products") {
    parseCouponTargets(coupon.targetProducts).slice(0, 3).forEach((item) => badges.push(item));
    if (parseCouponTargets(coupon.targetProducts).length > 3) badges.push("+" + (parseCouponTargets(coupon.targetProducts).length - 3));
  }
  if (coupon.scopeType === "services") {
    parseCouponTargets(coupon.targetServices).slice(0, 3).forEach((item) => badges.push(item));
    if (parseCouponTargets(coupon.targetServices).length > 3) badges.push("+" + (parseCouponTargets(coupon.targetServices).length - 3));
  }
  if (coupon.firstPurchaseOnly) badges.push("Primeira compra");
  if (coupon.channelScope && coupon.channelScope !== "all") badges.push(COUPON_CHANNEL_LABELS[coupon.channelScope] || coupon.channelScope);
  return badges;
}
/** Build searchable coupon text including scope metadata. */
function buildCouponSearchText(coupon) {
  return [coupon.code, coupon.title, coupon.description, coupon.notes, stringifyCouponTargets(coupon.targetCategories), stringifyCouponTargets(coupon.targetProducts), stringifyCouponTargets(coupon.targetServices)].join(" ").toLowerCase();
}
/** Normalize and validate scope fields before persistence. */
function buildCouponPayloadFromDraft(draft) {
  return {
    ...draft,
    scopeType: draft.scopeType || "all",
    targetCategories: parseCouponTargets(draft.scopeType === "categories" ? draft.targetCategories || [] : []),
    targetProducts: parseCouponTargets(draft.scopeType === "products" ? draft.targetProducts || [] : []),
    targetServices: parseCouponTargets(draft.scopeType === "services" ? draft.targetServices || [] : []),
    shippingDiscountMode: draft.discountType === "shipping" ? (draft.shippingDiscountMode || "full") : "full",
    firstPurchaseOnly: !!draft.firstPurchaseOnly,
  };
}
/** Build stable category options from inventory records. */
function buildCouponCategoryOptions(inventory) {
  return [...new Set((inventory || []).filter((item) => item && item.active !== false).map((item) => String(item.cat || "Medicamentos").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR")).map((value) => ({ value, label: value }));
}
/** Build stable product options from inventory records. */
function buildCouponProductOptions(inventory) {
  const unique = new Map();
  (inventory || [])
    .filter((item) => item && item.active !== false && String(item.name || "").trim())
    .slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))
    .forEach((item) => {
      const value = String(item.name || "").trim();
      const key = value.toLowerCase();
      if (unique.has(key)) return;
      unique.set(key, { value, label: value, meta: [String(item.brand || "").trim(), String(item.cat || "Medicamentos").trim(), "Estoque " + Number(item.qty || 0)].filter(Boolean).join(" · ") });
    });
  return Array.from(unique.values());
}
/** Build stable service options from the health-services admin catalog. */
function buildCouponServiceOptions(healthServices) {
  return (healthServices || [])
    .filter((service) => service && service.active !== false && String(service.name || "").trim())
    .slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))
    .map((service) => ({ value: String(service.name || "").trim(), label: String(service.name || "").trim(), meta: [String(service.group || "").trim(), money(service.price || 0)].filter(Boolean).join(" · ") }));
}

/* ---------- kept for purchase-analytics-screen.jsx (still on the legacy design) ---------- */
function CouponInfoHint({ text }) {
  return <span title={text} style={{ display: "inline-flex", cursor: "help", color: "var(--text-muted)" }}><Icon name="info" size={12} /></span>;
}
function CouponFieldLabel({ label, tooltip }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{label}<CouponInfoHint text={tooltip} /></span>;
}

/** Searchable multi-select bound to inventory/category/service-derived options. */
function CouponTargetPicker({ label, tooltip, placeholder, options, selectedValues, onChange, emptyMessage, searchPlaceholder }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const selected = Array.isArray(selectedValues) ? selectedValues : [];
  const selectedKeySet = new Set(selected.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean));
  const filteredOptions = options.filter((option) => {
    if (!normalizedQuery) return true;
    return [option.label, option.meta].join(" ").toLowerCase().includes(normalizedQuery);
  });
  const toggleValue = (value) => {
    const normalizedValue = String(value || "").trim();
    const key = normalizedValue.toLowerCase();
    if (!normalizedValue) return;
    onChange(selectedKeySet.has(key) ? selected.filter((item) => String(item || "").trim().toLowerCase() !== key) : [...selected, normalizedValue]);
  };
  const removeValue = (value) => {
    const key = String(value || "").trim().toLowerCase();
    onChange(selected.filter((item) => String(item || "").trim().toLowerCase() !== key));
  };

  return (
    <Field label={label} hint={tooltip}>
      <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder || placeholder} style={{ marginBottom: 8 }} />
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {selected.map((value) => (
            <button key={value} type="button" className="badge badge-accent" style={{ border: "none", cursor: "pointer" }} onClick={() => removeValue(value)}>
              {value}<Icon name="x" size={11} />
            </button>
          ))}
        </div>
      )}
      <div className="icon-picker scrollbar-thin" style={{ display: "block", gridTemplateColumns: "none", maxHeight: 200 }}>
        {filteredOptions.length ? filteredOptions.map((option) => {
          const checked = selectedKeySet.has(String(option.value || "").trim().toLowerCase());
          return (
            <button
              key={option.value} type="button" onClick={() => toggleValue(option.value)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 6px", border: "none", background: checked ? "var(--accent-soft)" : "none", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", borderRadius: 6 }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: checked ? "var(--accent)" : "var(--surface)", color: "var(--accent-contrast)" }}>
                {checked && <Icon name="check" size={11} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 12.5 }}>{option.label}</strong>
                {option.meta && <div className="cell-muted" style={{ fontSize: 11 }}>{option.meta}</div>}
              </span>
            </button>
          );
        }) : <div className="page-desc" style={{ padding: 8 }}>{emptyMessage || "Nenhuma opção encontrada no estoque."}</div>}
      </div>
    </Field>
  );
}

const STATUS_FILTERS = [
  { key: "all", label: "Todos" }, { key: "active", label: "Ativos" }, { key: "scheduled", label: "Agendados" },
  { key: "expiring", label: "Expirando" }, { key: "expired", label: "Expirados" }, { key: "exhausted", label: "Esgotados" },
  { key: "inactive", label: "Inativos" },
];

/** Render the main coupon administration experience. */
function CouponsScreen({ ctx }) {
  const { coupons, openCouponCreate, openCouponEdit, toggleCouponState, removeCoupon, duplicateCoupon, fetchCouponAnalytics } = ctx;
  const [view, setView] = useState("manage");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    if (view !== "insights" || analytics || analyticsLoading || !fetchCouponAnalytics) return;
    setAnalyticsLoading(true);
    fetchCouponAnalytics()
      .then((result) => { setAnalytics(result); setAnalyticsError(""); })
      .catch((error) => setAnalyticsError((error && error.message) || "Não foi possível carregar as análises."))
      .finally(() => setAnalyticsLoading(false));
  }, [view, analytics, analyticsLoading, fetchCouponAnalytics]);

  const enrichedCoupons = coupons.map((coupon) => ({ coupon, statusKey: getCouponStatusKey(coupon), statusMeta: getCouponStatusMeta(coupon), usageProgress: getCouponUsageProgress(coupon) }));
  const couponsByCode = Object.fromEntries(coupons.map((coupon) => [coupon.code, coupon]));

  const stats = {
    total: coupons.length,
    active: enrichedCoupons.filter((e) => e.statusKey === "active" || e.statusKey === "expiring").length,
    scheduled: enrichedCoupons.filter((e) => e.statusKey === "scheduled").length,
    expiring: enrichedCoupons.filter((e) => e.statusKey === "expiring").length,
    expired: enrichedCoupons.filter((e) => e.statusKey === "expired").length,
    exhausted: enrichedCoupons.filter((e) => e.statusKey === "exhausted").length,
    inactive: enrichedCoupons.filter((e) => e.statusKey === "inactive").length,
    redeemed: coupons.reduce((total, c) => total + Number(c.usageCount || 0), 0),
  };
  const statusCounts = { all: stats.total, active: stats.active, scheduled: stats.scheduled, expiring: stats.expiring, expired: stats.expired, exhausted: stats.exhausted, inactive: stats.inactive };

  const filteredCoupons = enrichedCoupons.filter(({ coupon, statusKey }) => {
    if (statusFilter !== "all" && statusKey !== statusFilter) return false;
    if (audienceFilter !== "all" && coupon.audience !== audienceFilter) return false;
    if (channelFilter !== "all" && (coupon.channelScope || "all") !== channelFilter) return false;
    if (scopeFilter === "first_purchase" && !coupon.firstPurchaseOnly) return false;
    if (scopeFilter !== "all" && scopeFilter !== "first_purchase" && coupon.scopeType !== scopeFilter) return false;
    if (query && !buildCouponSearchText(coupon).includes(query.toLowerCase())) return false;
    return true;
  }).sort((left, right) => {
    const order = ["active", "expiring", "scheduled", "inactive", "exhausted", "expired"];
    const rankDiff = order.indexOf(left.statusKey) - order.indexOf(right.statusKey);
    return rankDiff !== 0 ? rankDiff : String(right.coupon.updatedAt || "").localeCompare(String(left.coupon.updatedAt || ""));
  });

  const topCoupons = [...enrichedCoupons].sort((a, b) => Number(b.coupon.usageCount || 0) - Number(a.coupon.usageCount || 0)).slice(0, 4);

  const removeConfirm = async (coupon) => {
    const ok = await confirmAction({
      title: "Excluir cupom?",
      body: "O cupom deixará de funcionar imediatamente para qualquer cliente, mesmo em pedidos já em andamento que ainda não finalizaram o pagamento. Essa ação não pode ser desfeita.",
      entity: coupon.code, danger: true, confirmLabel: "Excluir",
    });
    if (ok) removeCoupon(coupon.id);
  };

  const columns = [
    { key: "coupon", label: "Cupom", render: ({ coupon, statusMeta }) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="mono cell-strong"><Icon name="tag" size={12} />{coupon.code}</span>
          <Badge tone={statusMeta.tone} dot><Icon name={statusMeta.icon} size={10} />{statusMeta.label}</Badge>
          {coupon.stackable && <Badge tone="neutral"><Icon name="repeat" size={10} />Acumulável</Badge>}
        </div>
        <div>
          <div className="cell-strong">{coupon.title}</div>
          <div className="cell-muted" style={{ fontSize: 12 }}>{coupon.description || "Sem descrição operacional."}</div>
        </div>
      </div>
    ) },
    { key: "discount", label: "Desconto", render: ({ coupon }) => (
      <>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{formatCouponDiscount(coupon)}</div>
        <div className="cell-muted" style={{ fontSize: 11.5 }}>Pedido mínimo {formatCouponCurrency(coupon.minimumOrderValue)}{coupon.maxDiscountValue != null && coupon.maxDiscountValue !== "" ? " · teto " + formatCouponCurrency(coupon.maxDiscountValue) : ""}</div>
      </>
    ) },
    { key: "window", label: "Janela", render: ({ coupon }) => (
      <>
        <div className="cell-muted" style={{ fontSize: 11 }}>Início</div>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{formatCouponDateTime(coupon.startsAt)}</div>
        <div className="cell-muted" style={{ fontSize: 11, marginTop: 4 }}>Fim · {formatCouponDateTime(coupon.endsAt)}</div>
      </>
    ) },
    { key: "usage", label: "Uso", render: ({ coupon, usageProgress }) => (
      <>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{Number(coupon.usageCount || 0)}{coupon.usageLimit ? " / " + coupon.usageLimit : ""}</div>
        <div style={{ height: 5, borderRadius: 5, background: "var(--surface-2)", marginTop: 6, overflow: "hidden", width: 100 }}>
          <div style={{ height: "100%", width: usageProgress + "%", background: usageProgress >= 85 ? "var(--warning)" : "var(--good)" }} />
        </div>
        <div className="cell-muted" style={{ fontSize: 11, marginTop: 4 }}>Limite por cliente · {coupon.perCustomerLimit || 1}</div>
      </>
    ) },
    { key: "scope", label: "Escopo", render: ({ coupon }) => (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{getCouponScopeBadges(coupon).map((b) => <Badge key={b} tone="neutral">{b}</Badge>)}</div>
    ) },
    { key: "audience", label: "Público", render: ({ coupon }) => (
      <>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{COUPON_AUDIENCE_LABELS[coupon.audience] || COUPON_AUDIENCE_LABELS.all}</div>
        <div className="cell-muted" style={{ fontSize: 11 }}>{coupon.notes || "Sem observação extra."}</div>
      </>
    ) },
  ];

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Preço & Promoções"
        title="Cupons"
        desc="Campanhas, regras promocionais e governança do marketplace."
        actions={<button className="btn btn-primary" onClick={openCouponCreate}><Icon name="plus" size={14} />Novo cupom</button>}
      />

      <Tabs tabs={[{ key: "manage", label: "Gestão da tabela" }, { key: "insights", label: "Análises" }]} active={view} onChange={setView} />

      {view === "manage" && (
        <>
          <div className="card card-pad" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <input className="input" placeholder="Buscar por código, campanha, categoria ou produto" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key} type="button" className="btn btn-sm"
                  onClick={() => setStatusFilter(f.key)}
                  style={statusFilter === f.key ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" } : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
                >
                  {f.label} <span className="tab-count" style={{ marginLeft: 4 }}>{statusCounts[f.key]}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="input" style={{ width: "auto", minWidth: 200 }} value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                <option value="all">Todos os públicos</option>
                <option value="new_customers">Novos clientes</option>
                <option value="recurring">Clientes recorrentes</option>
                <option value="prescription">Pedidos com receita</option>
              </select>
              <select className="input" style={{ width: "auto", minWidth: 220 }} value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
                <option value="all">Todos os escopos</option>
                <option value="products">Remédios e produtos específicos</option>
                <option value="categories">Categorias específicas</option>
                <option value="services">Serviços de saúde</option>
                <option value="first_purchase">Apenas primeira compra</option>
              </select>
              <select className="input" style={{ width: "auto", minWidth: 190 }} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
                <option value="all">Todos os canais</option>
                <option value="online">Somente loja online</option>
                <option value="pdv">Somente balcão (PDV)</option>
              </select>
            </div>
          </div>

          <div className="card">
            <DataTable
              columns={columns}
              rows={filteredCoupons}
              rowKey={(row) => row.coupon.id}
              empty="Nenhum cupom encontrado com os filtros atuais"
              renderActions={({ coupon }) => (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => openCouponEdit(coupon.id)}><Icon name="edit" size={12} />Editar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => duplicateCoupon(coupon.id)}><Icon name="plusCircle" size={12} />Duplicar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleCouponState(coupon.id, !coupon.active)}><Icon name={coupon.active ? "pause" : "play"} size={12} />{coupon.active ? "Pausar" : "Ativar"}</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--critical)" }} onClick={() => removeConfirm(coupon)}><Icon name="trash" size={12} />Excluir</button>
                </>
              )}
            />
          </div>
        </>
      )}

      {view === "insights" && (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatCard icon="gift" value={analytics ? analytics.summary.activeCount : stats.active} label="Cupons ativos" tone="good" />
            <StatCard icon="calendar" value={analytics ? analytics.summary.scheduledCount : stats.scheduled} label="Campanhas agendadas" />
            <StatCard icon="clock" value={analytics ? analytics.summary.expiringCount : stats.expiring} label="Expiram em 72h" tone="warning" />
            <StatCard icon="repeat" value={analytics ? analytics.summary.totalRedemptions : stats.redeemed} label="Resgates reais registrados" />
          </div>

          <div className="grid g-2" style={{ marginBottom: 16, alignItems: "start" }}>
            <div className="card">
              <div className="card-head"><div><h3>Visão operacional</h3><div className="card-head-sub">Estados que pedem atenção — calculados no servidor a partir do uso real</div></div></div>
              <div className="card-pad" style={{ display: "grid", gap: 8 }}>
                {[["Expirados", analytics ? analytics.summary.expiredCount : "—"], ["Esgotados", analytics ? analytics.summary.exhaustedCount : "—"], ["Próximos do limite de uso", analytics ? analytics.summary.nearLimitCount : "—"], ["Pausados manualmente", analytics ? analytics.summary.inactiveCount : "—"], ["Desconto total concedido", analytics ? formatCouponCurrency(analytics.summary.totalDiscountGranted) : "—"]].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span className="cell-muted">{label}</span><strong>{val}</strong></div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><div><h3>Mais resgatados</h3><div className="card-head-sub">Campanhas com maior tração recente</div></div></div>
              <div className="card-pad" style={{ display: "grid", gap: 12 }}>
                {topCoupons.length ? topCoupons.map(({ coupon, statusMeta, usageProgress }) => (
                  <div key={coupon.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 13 }}>{coupon.code}</strong>
                        <Badge tone={statusMeta.tone} dot>{statusMeta.label}</Badge>
                      </div>
                      <div className="cell-muted" style={{ fontSize: 12, marginTop: 4 }}>{coupon.title}</div>
                      <div style={{ height: 5, borderRadius: 5, background: "var(--surface-2)", marginTop: 8, width: 160, overflow: "hidden" }}><div style={{ height: "100%", width: usageProgress + "%", background: "var(--accent)" }} /></div>
                    </div>
                    <div style={{ textAlign: "right", flex: "none" }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{Number(coupon.usageCount || 0)} usos</div>
                      <div className="cell-muted" style={{ fontSize: 11.5 }}>{formatCouponDiscount(coupon)}</div>
                    </div>
                  </div>
                )) : <p className="page-desc" style={{ margin: 0 }}>Sem resgates registrados até o momento.</p>}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><div><h3>Boas práticas</h3><div className="card-head-sub">Checklist rápido para publicar promoções com menor risco de margem</div></div></div>
              <div className="card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Use categorias para giro controlado", "Aplique produto específico em remédios âncora", "Restrinja primeira compra quando necessário", "Revise teto e limite por cliente"].map((t) => (
                  <Badge key={t} tone="neutral"><Icon name="check" size={10} />{t}</Badge>
                ))}
              </div>
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-head"><div><h3>Detalhamento por cupom</h3><div className="card-head-sub">Pagamento, canal (online × PDV), entrega e perfil de cliente de cada resgate real</div></div></div>
              <div className="card-pad">
                {analyticsLoading ? <p className="page-desc" style={{ margin: 0 }}>Carregando análises...</p>
                  : analyticsError ? <p className="page-desc" style={{ margin: 0 }}>{analyticsError}</p>
                  : analytics && analytics.items.filter((item) => item.totalRedemptions > 0).length ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {analytics.items.filter((item) => item.totalRedemptions > 0).sort((a, b) => b.totalRedemptions - a.totalRedemptions).map((item) => {
                        const discountType = (couponsByCode[item.code] || {}).discountType;
                        const fulfillmentChips = [
                          item.fulfillmentBreakdown.pickupCount > 0 && { key: "pickup", icon: "pin", label: "Retirada", count: item.fulfillmentBreakdown.pickupCount },
                          item.fulfillmentBreakdown.deliveryCount > 0 && { key: "delivery", icon: "truck", label: "Entrega", count: item.fulfillmentBreakdown.deliveryCount },
                          item.fulfillmentBreakdown.shippingCount > 0 && { key: "shipping", icon: "truck", label: "Transportadora", count: item.fulfillmentBreakdown.shippingCount },
                        ].filter(Boolean);
                        const channelChips = [
                          item.channelBreakdown.onlineCount > 0 && { key: "online", icon: "cart", label: "Online", count: item.channelBreakdown.onlineCount },
                          item.channelBreakdown.pdvCount > 0 && { key: "pdv", icon: "bag", label: "Balcão (PDV)", count: item.channelBreakdown.pdvCount },
                        ].filter(Boolean);
                        return (
                          <div key={item.couponId} className="card card-pad">
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span className="stat-icon" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}><Icon name={COUPON_DISCOUNT_TYPE_ICONS[discountType] || "gift"} size={16} /></span>
                              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className="mono cell-strong"><Icon name="tag" size={11} />{item.code}</span>
                                <strong style={{ fontSize: 13.5 }}>{item.title}</strong>
                              </div>
                              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, fontSize: 15 }}>{item.totalRedemptions}</div><div className="cell-muted" style={{ fontSize: 10.5 }}>resgate{item.totalRedemptions === 1 ? "" : "s"}</div></div>
                              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, fontSize: 15, color: "var(--accent)" }}>{formatCouponCurrency(item.totalDiscountGranted)}</div><div className="cell-muted" style={{ fontSize: 10.5 }}>concedido</div></div>
                            </div>
                            <div className="grid g-4" style={{ marginTop: 12, gap: 10 }}>
                              {[["Pagamento", "card", item.paymentBreakdown.map((e) => ({ icon: COUPON_PAYMENT_ICONS[e.label] || "card", label: `${e.label} · ${e.count}` }))],
                                ["Canal", "activity", channelChips.map((c) => ({ icon: c.icon, label: `${c.label} · ${c.count}` }))],
                                ["Entrega", "truck", fulfillmentChips.map((c) => ({ icon: c.icon, label: `${c.label} · ${c.count}` }))],
                                ["Cliente", "user", item.segmentBreakdown.map((e) => ({ icon: "user", label: `${e.segment} · ${e.count}` }))]].map(([label, ic, chips]) => (
                                <div key={label}>
                                  <div className="cell-muted" style={{ fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}><Icon name={ic} size={11} />{label}</div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{chips.map((c, i) => <Badge key={i} tone="neutral"><Icon name={c.icon} size={10} />{c.label}</Badge>)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="page-desc" style={{ margin: 0 }}>Nenhum cupom foi resgatado ainda em pedidos reais.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Render the reusable create/edit coupon modal. */
function CouponModal({ mode, coupon, inventory, healthServices, onClose, onCreate, onUpdate }) {
  const [draft, setDraft] = useState(() => createCouponDraft(coupon));
  const [error, setError] = useState("");
  const categoryOptions = useMemo(() => buildCouponCategoryOptions(inventory), [inventory]);
  const productOptions = useMemo(() => buildCouponProductOptions(inventory), [inventory]);
  const serviceOptions = useMemo(() => buildCouponServiceOptions(healthServices), [healthServices]);

  useEffect(() => { setDraft(createCouponDraft(coupon)); setError(""); }, [coupon, mode]);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedCode = normalizeCouponCode(draft.code);
    const normalizedTitle = String(draft.title || "").trim();
    const discountValue = Number(draft.discountValue || 0);
    const minimumOrderValue = Number(draft.minimumOrderValue || 0);
    const startTimestamp = draft.startsAt ? new Date(draft.startsAt).getTime() : null;
    const endTimestamp = draft.endsAt ? new Date(draft.endsAt).getTime() : null;
    const normalizedPayload = buildCouponPayloadFromDraft(draft);

    if (!normalizedCode || normalizedCode.length < 4) { setError("Informe um código com pelo menos 4 caracteres válidos."); return; }
    if (!normalizedTitle) { setError("Informe um nome operacional para a campanha."); return; }
    if ((draft.discountType !== "shipping" || draft.shippingDiscountMode !== "full") && discountValue <= 0) { setError("O desconto precisa ser maior que zero."); return; }
    if ((draft.discountType === "percent" || (draft.discountType === "shipping" && draft.shippingDiscountMode === "percent")) && discountValue > 100) { setError("O desconto percentual não pode passar de 100%."); return; }
    if (minimumOrderValue < 0) { setError("O pedido mínimo não pode ser negativo."); return; }
    if (startTimestamp != null && endTimestamp != null && endTimestamp <= startTimestamp) { setError("A data final deve ser posterior ao início da campanha."); return; }
    if (normalizedPayload.scopeType === "categories" && normalizedPayload.targetCategories.length === 0) { setError("Selecione pelo menos uma categoria para o cupom específico."); return; }
    if (normalizedPayload.scopeType === "products" && normalizedPayload.targetProducts.length === 0) { setError("Selecione pelo menos um remédio ou produto para o cupom específico."); return; }

    const payload = { ...draft, ...normalizedPayload, code: normalizedCode, title: normalizedTitle, description: String(draft.description || "").trim(), notes: String(draft.notes || "").trim() };
    if (mode === "edit" && coupon) onUpdate(coupon.id, payload);
    else onCreate(payload);
  };

  const discountLabel = draft.discountType === "shipping"
    ? (draft.shippingDiscountMode === "percent" ? "Percentual no frete" : draft.shippingDiscountMode === "fixed" ? "Valor no frete" : "Frete grátis")
    : draft.discountType === "fixed" ? "Desconto em R$" : "Desconto em %";
  const discountHint = draft.discountType === "shipping"
    ? (draft.shippingDiscountMode === "percent" ? "Percentual abatido só do valor de entrega." : draft.shippingDiscountMode === "fixed" ? "Valor fixo abatido só da taxa de entrega." : "Calculado automaticamente com base na taxa de entrega — nenhum valor manual necessário.")
    : draft.discountType === "fixed" ? "Valor fixo abatido do pedido quando o cupom for aplicado." : "Percentual de abatimento sobre o pedido elegível.";

  return (
    <Modal
      open onClose={onClose} title={mode === "edit" ? "Editar cupom" : "Criar cupom"}
      subtitle="Configure código, desconto, vigência, público e escopo por produto, categoria ou primeira compra."
      wide
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="coupon-form" className="btn btn-primary"><Icon name="check" size={14} />{mode === "edit" ? "Salvar cupom" : "Criar cupom"}</button>
        </>
      )}
    >
      <form id="coupon-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="grid g-2">
          <Field label="Código do cupom" hint="Identificador que o cliente digita no checkout. Curto, sem espaços — ex.: BEMVINDO15.">
            <input className="input" value={draft.code} onChange={(e) => setField("code", normalizeCouponCode(e.target.value))} placeholder="BEMVINDO15" />
          </Field>
          <Field label="Campanha" hint="Nome interno da ação promocional.">
            <input className="input" maxLength={120} value={draft.title} onChange={(e) => setField("title", e.target.value)} placeholder="Primeira compra" />
          </Field>
        </div>

        <Field label="Descrição operacional" hint="Resumo rápido do contexto da campanha, para o time interno.">
          <input className="input" maxLength={500} value={draft.description} onChange={(e) => setField("description", e.target.value)} placeholder="Resumo curto para o time interno" />
        </Field>

        <div className="grid g-3">
          <Field label="Tipo" hint="Percentual, valor fixo ou frete grátis.">
            <select className="input" value={draft.discountType} onChange={(e) => setField("discountType", e.target.value)}>
              <option value="percent">Percentual</option><option value="fixed">Valor fixo</option><option value="shipping">Desconto no frete</option>
            </select>
          </Field>
          <Field label={discountLabel} hint={discountHint}>
            <input
              className="input" type="number" min="0" step={draft.discountType === "fixed" ? "0.01" : "0.1"}
              value={draft.discountType === "shipping" && draft.shippingDiscountMode === "full" ? 0 : draft.discountValue}
              onChange={(e) => setField("discountValue", e.target.value)}
              disabled={draft.discountType === "shipping" && draft.shippingDiscountMode === "full"}
            />
          </Field>
          <Field label="Teto do desconto em R$" hint="Só se aplica a desconto percentual.">
            <input
              className="input" type="number" min="0" step="0.01"
              value={draft.discountType === "percent" ? draft.maxDiscountValue : ""}
              onChange={(e) => setField("maxDiscountValue", e.target.value)}
              placeholder={draft.discountType === "percent" ? "Ex.: 15,00" : "Não se aplica"}
              disabled={draft.discountType !== "percent"}
            />
          </Field>
        </div>

        <div className="grid g-3">
          <Field label="Pedido mínimo"><input className="input" type="number" min="0" step="0.01" value={draft.minimumOrderValue} onChange={(e) => setField("minimumOrderValue", e.target.value)} /></Field>
          <Field label="Limite total" hint="Vazio = sem limite."><input className="input" type="number" min="0" step="1" value={draft.usageLimit} onChange={(e) => setField("usageLimit", e.target.value)} placeholder="Opcional" /></Field>
          <Field label="Limite por cliente"><input className="input" type="number" min="1" step="1" value={draft.perCustomerLimit} onChange={(e) => setField("perCustomerLimit", e.target.value)} /></Field>
        </div>

        <div className="grid g-3">
          <Field label="Início"><input className="input" type="datetime-local" value={draft.startsAt} onChange={(e) => setField("startsAt", e.target.value)} /></Field>
          <Field label="Fim"><input className="input" type="datetime-local" value={draft.endsAt} onChange={(e) => setField("endsAt", e.target.value)} /></Field>
          <Field label="Público">
            <select className="input" value={draft.audience} onChange={(e) => setField("audience", e.target.value)}>
              <option value="all">Todo o marketplace</option><option value="new_customers">Novos clientes</option>
              <option value="recurring">Clientes recorrentes</option><option value="prescription">Pedidos com receita</option>
            </select>
          </Field>
        </div>

        <div className="grid g-2">
          <Field label="Canal">
            <select className="input" value={draft.channelScope} onChange={(e) => setField("channelScope", e.target.value)}>
              <option value="all">Todos os canais</option><option value="online">Somente loja online</option><option value="pdv">Somente balcão (PDV)</option>
            </select>
          </Field>
          <Field label="Escopo do cupom">
            <select className="input" value={draft.scopeType} onChange={(e) => setField("scopeType", e.target.value)}>
              <option value="all">Catálogo completo</option><option value="categories">Categorias específicas</option>
              <option value="products">Remédios e produtos específicos</option><option value="services">Serviços de saúde</option>
            </select>
          </Field>
          {draft.discountType === "shipping" && (
            <Field label="Modo do desconto no frete">
              <select className="input" value={draft.shippingDiscountMode || "full"} onChange={(e) => setField("shippingDiscountMode", e.target.value)}>
                <option value="full">Frete grátis</option><option value="fixed">Valor fixo no frete</option><option value="percent">Percentual no frete</option>
              </select>
            </Field>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Apenas primeira compra</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Restringe ao primeiro pedido do cliente.</div></div>
            <SwitchToggle on={!!draft.firstPurchaseOnly} onChange={(v) => setField("firstPurchaseOnly", v)} label="Apenas primeira compra" />
          </div>
        </div>

        {draft.scopeType === "categories" && (
          <CouponTargetPicker label="Categorias elegíveis" tooltip="Selecione as categorias do estoque que poderão receber o desconto." placeholder="Buscar categorias do estoque" searchPlaceholder="Buscar categorias vinculadas ao estoque" options={categoryOptions} selectedValues={draft.targetCategories} onChange={(v) => setField("targetCategories", v)} emptyMessage="Nenhuma categoria encontrada no estoque atual." />
        )}
        {draft.scopeType === "products" && (
          <CouponTargetPicker label="Remédios ou produtos elegíveis" tooltip="Selecione os itens específicos do estoque que poderão usar o cupom." placeholder="Buscar itens do estoque" searchPlaceholder="Buscar remédios e produtos vinculados ao estoque" options={productOptions} selectedValues={draft.targetProducts} onChange={(v) => setField("targetProducts", v)} emptyMessage="Nenhum item elegível encontrado no estoque atual." />
        )}
        {draft.scopeType === "services" && (
          <CouponTargetPicker label="Serviços de saúde elegíveis" tooltip="Selecione os serviços de saúde que poderão usar este cupom." placeholder="Buscar serviços de saúde" searchPlaceholder="Buscar serviços de saúde cadastrados" options={serviceOptions} selectedValues={draft.targetServices} onChange={(v) => setField("targetServices", v)} emptyMessage="Nenhum serviço de saúde ativo cadastrado ainda." />
        )}

        <div className="grid g-2">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Cupom ativo ao salvar</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Publicação imediata conforme agenda e limites.</div></div>
            <SwitchToggle on={!!draft.active} onChange={(v) => setField("active", v)} label="Cupom ativo" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Acumulável com outras campanhas</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Use só com margem já protegida.</div></div>
            <SwitchToggle on={!!draft.stackable} onChange={(v) => setField("stackable", v)} label="Cupom acumulável" />
          </div>
        </div>

        <Field label="Observações internas">
          <textarea className="input" maxLength={1000} style={{ minHeight: 90 }} value={draft.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Canal de mídia, região priorizada, restrições operacionais..." />
        </Field>

        {error && <div className="field-error" style={{ padding: "10px 12px", background: "var(--critical-soft)", borderRadius: "var(--radius-md)" }}>{error}</div>}
      </form>
    </Modal>
  );
}

export { COUPON_AUDIENCE_LABELS, COUPON_SCOPE_LABELS, COUPON_STATUS_META, CouponFieldLabel, CouponInfoHint, CouponModal, CouponTargetPicker, CouponsScreen, buildCouponCategoryOptions, buildCouponPayloadFromDraft, buildCouponProductOptions, buildCouponSearchText, buildCouponServiceOptions, createCouponDraft, formatCouponCurrency, formatCouponDateTime, formatCouponDiscount, formatCouponPercent, getCouponScopeBadges, getCouponStatusKey, getCouponStatusMeta, getCouponUsageProgress, normalizeCouponCode, parseCouponTargets, stringifyCouponTargets };
