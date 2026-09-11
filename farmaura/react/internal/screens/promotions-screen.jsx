import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Icon, PageHead, Modal, Field, SwitchToggle, PillNav, Badge, StatCard, DataTable,
  confirmAction, showToast, money,
} from "../core/internal-ui.jsx";
import {
  COUPON_SCOPE_LABELS, CouponTargetPicker,
  buildCouponCategoryOptions, buildCouponProductOptions, buildCouponServiceOptions,
} from "./coupons-screen.jsx";
import { cnaeIndexByCode, priceCalc, priceForMargin } from "./pricing-screen.jsx";

/*
farmaura/react/internal/screens/promotions-screen.jsx

Segmented automatic pricing promotions screen and modal for the Farmaura internal portal.

Responsibilities:
- render the promotion administration workspace: schedule + customer-audience targeting;
- provide creation and edition flows with a live estimated-audience counter;
- expose activation, pause, duplication, and removal controls;

Observations:
- unlike coupons, these promotions apply automatically (no code) and are evaluated
  server-side against the requesting customer's real profile — see
  app/services/pricing_promotion_service.py for the matching engine this UI configures;
- category/product scope reuses the coupon target picker so the two feature areas never
  diverge in how "which products does this apply to" is expressed.
*/

const PROMO_DISCOUNT_TYPE_LABELS = { percent: "Percentual", fixed: "Valor fixo" };
const MARITAL_STATUS_LABELS = { single: "Solteiro(a)", married: "Casado(a)", divorced: "Divorciado(a)", widowed: "Viúvo(a)", other: "Outro" };
const DEVICE_TYPE_LABELS = { ios: "iPhone", android: "Android", tablet: "Tablet", desktop: "Computador", outro: "Outro" };
const SEGMENT_LABELS = { all: "Todos os clientes", new_customers: "Novos clientes", recurring: "Clientes recorrentes" };
const LOYALTY_TIER_LABELS = { Novo: "Novo", Bronze: "Bronze", Prata: "Prata", Ouro: "Ouro", Diamante: "Diamante", Platina: "Platina" };
const WEEKDAY_CHIP_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PROMOTION_KIND_LABELS = { campaign: "Campanha", product_discount: "Desconto de produto" };
const URGENCY_LABEL_PRESETS = ["Últimas unidades", "Restam só 2 no estoque", "Restam só 1 no estoque", "Estoque acabando", "Corre que acaba rápido"];

const PROMO_STATUS_META = {
  active: { label: "Ativa", tone: "good", icon: "check" },
  scheduled: { label: "Agendada", tone: "neutral", icon: "calendar" },
  expiring: { label: "Expira em breve", tone: "warning", icon: "clock" },
  expired: { label: "Expirada", tone: "neutral", icon: "close" },
  inactive: { label: "Pausada", tone: "neutral", icon: "pause" },
};

/** Build a view-model draft for the promotion form, optionally pre-filled (e.g. from the Precificador). */
function createPromotionDraft(sourcePromotion, initialDraft) {
  const promotion = { ...(sourcePromotion || {}), ...(initialDraft || {}) };
  return {
    name: promotion.name || "",
    description: promotion.description || "",
    active: promotion.active !== false,
    kind: promotion.kind === "product_discount" ? "product_discount" : "campaign",
    discountType: promotion.discountType || "percent",
    discountValue: promotion.discountValue == null ? 10 : Number(promotion.discountValue || 0),
    maxDiscountValue: promotion.maxDiscountValue == null ? "" : Number(promotion.maxDiscountValue),
    scopeType: promotion.scopeType || "all",
    targetCategories: Array.isArray(promotion.targetCategories) ? promotion.targetCategories : [],
    targetProducts: Array.isArray(promotion.targetProducts) ? promotion.targetProducts : [],
    targetServices: Array.isArray(promotion.targetServices) ? promotion.targetServices : [],
    startsAt: promotion.startsAt || "",
    endsAt: promotion.endsAt || "",
    useDailyWindow: !!(promotion.dailyStartTime && promotion.dailyEndTime),
    dailyStartTime: promotion.dailyStartTime || "18:00",
    dailyEndTime: promotion.dailyEndTime || "20:00",
    daysOfWeek: Array.isArray(promotion.daysOfWeek) ? promotion.daysOfWeek : [],
    useAgeRange: promotion.minAge != null || promotion.maxAge != null,
    minAge: promotion.minAge == null ? 18 : Number(promotion.minAge),
    maxAge: promotion.maxAge == null ? 65 : Number(promotion.maxAge),
    regions: Array.isArray(promotion.regions) ? promotion.regions : [],
    deviceTypes: Array.isArray(promotion.deviceTypes) ? promotion.deviceTypes : [],
    maritalStatuses: Array.isArray(promotion.maritalStatuses) ? promotion.maritalStatuses : [],
    useChildrenRange: promotion.minChildren != null || promotion.maxChildren != null,
    minChildren: promotion.minChildren == null ? 0 : Number(promotion.minChildren),
    maxChildren: promotion.maxChildren == null ? 3 : Number(promotion.maxChildren),
    customerSegment: promotion.customerSegment || "all",
    targetLoyaltyTiers: Array.isArray(promotion.targetLoyaltyTiers) ? promotion.targetLoyaltyTiers : [],
    guestVisible: !!promotion.guestVisible,
    highlightStyle: promotion.highlightStyle === "superpromo" ? "superpromo" : "standard",
    urgencyLabel: promotion.urgencyLabel || "",
    priority: promotion.priority == null ? 0 : Number(promotion.priority),
    notes: promotion.notes || "",
  };
}

/** Return whether a draft has any audience-restricting axis set — guestVisible requires none. */
function promotionDraftHasAudienceRestrictions(draft) {
  return !!(
    draft.useAgeRange || draft.regions.length || draft.deviceTypes.length || draft.maritalStatuses.length
    || draft.useChildrenRange || (draft.customerSegment && draft.customerSegment !== "all") || draft.targetLoyaltyTiers.length
  );
}

/** Normalize a draft into the payload shape the backend expects, dropping unused axes. */
function buildPromotionPayloadFromDraft(draft) {
  return {
    ...draft,
    targetCategories: draft.scopeType === "categories" ? draft.targetCategories : [],
    targetProducts: draft.scopeType === "products" ? draft.targetProducts : [],
    targetServices: draft.scopeType === "services" ? draft.targetServices : [],
    dailyStartTime: draft.useDailyWindow ? draft.dailyStartTime : "",
    dailyEndTime: draft.useDailyWindow ? draft.dailyEndTime : "",
    minAge: draft.useAgeRange ? draft.minAge : null,
    maxAge: draft.useAgeRange ? draft.maxAge : null,
    minChildren: draft.useChildrenRange ? draft.minChildren : null,
    maxChildren: draft.useChildrenRange ? draft.maxChildren : null,
  };
}

/** Format a discount label depending on promotion type. */
function formatPromotionDiscount(promotion) {
  const value = Number(promotion.discountValue || 0);
  if (promotion.discountType === "fixed") return money(value);
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%";
}
/** Format a local datetime label from an ISO-like input. */
function formatPromotionDateTime(value) {
  if (!value) return "Sem limite";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem limite";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** Calculate promotion status from activation flag and schedule window. */
function getPromotionStatusKey(promotion) {
  const now = new Date();
  const startsAt = promotion && promotion.startsAt ? new Date(promotion.startsAt) : null;
  const endsAt = promotion && promotion.endsAt ? new Date(promotion.endsAt) : null;
  const msInDay = 24 * 60 * 60 * 1000;
  if (!promotion || promotion.active === false) return "inactive";
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) return "scheduled";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime()) return "expired";
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() - now.getTime() <= msInDay * 3) return "expiring";
  return "active";
}
function getPromotionStatusMeta(promotion) { return PROMO_STATUS_META[getPromotionStatusKey(promotion)] || PROMO_STATUS_META.inactive; }
/** Build human-readable scope badges, reusing the coupon scope vocabulary. */
function getPromotionScopeBadges(promotion) {
  const badges = [COUPON_SCOPE_LABELS[promotion.scopeType] || COUPON_SCOPE_LABELS.all];
  if (promotion.scopeType === "categories") (promotion.targetCategories || []).slice(0, 3).forEach((item) => badges.push(item));
  if (promotion.scopeType === "products") (promotion.targetProducts || []).slice(0, 3).forEach((item) => badges.push(item));
  if (promotion.scopeType === "services") (promotion.targetServices || []).slice(0, 3).forEach((item) => badges.push(item));
  return badges;
}
/** Build human-readable audience badges for one promotion. */
function getPromotionAudienceBadges(promotion) {
  const badges = [];
  if (promotion.minAge != null || promotion.maxAge != null) badges.push("Idade " + (promotion.minAge ?? "0") + "–" + (promotion.maxAge ?? "∞"));
  (promotion.regions || []).slice(0, 2).forEach((region) => badges.push(region));
  if ((promotion.regions || []).length > 2) badges.push("+" + (promotion.regions.length - 2));
  (promotion.deviceTypes || []).forEach((device) => badges.push(DEVICE_TYPE_LABELS[device] || device));
  (promotion.maritalStatuses || []).forEach((status) => badges.push(MARITAL_STATUS_LABELS[status] || status));
  if (promotion.minChildren != null || promotion.maxChildren != null) badges.push("Filhos " + (promotion.minChildren ?? "0") + "–" + (promotion.maxChildren ?? "∞"));
  if (promotion.customerSegment && promotion.customerSegment !== "all") badges.push(SEGMENT_LABELS[promotion.customerSegment] || promotion.customerSegment);
  (promotion.targetLoyaltyTiers || []).forEach((tier) => badges.push(LOYALTY_TIER_LABELS[tier] || tier));
  return badges.length ? badges : ["Todo o público"];
}
/** Build searchable text for one promotion row. */
function buildPromotionSearchText(promotion) {
  return [promotion.name, promotion.description, promotion.notes, (promotion.targetCategories || []).join(" "), (promotion.targetProducts || []).join(" "), (promotion.targetServices || []).join(" ")].join(" ").toLowerCase();
}
/** Build distinct region (city) options from the CRM customer base already loaded in context. */
function buildPromotionRegionOptions(customers) {
  const unique = new Map();
  (customers || []).forEach((customer) => {
    const city = String(customer.city || "").trim();
    if (!city) return;
    const key = city.toLowerCase();
    if (!unique.has(key)) unique.set(key, { value: city, label: city });
  });
  return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** Small toggleable chip row shared by weekday/device/marital/loyalty/urgency-preset pickers. */
function ChipToggleRow({ options, isOn, onToggle }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(({ value, label }) => {
        const on = isOn(value);
        return (
          <button
            key={value} type="button" className="btn btn-sm" onClick={() => onToggle(value)}
            style={on ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" } : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_FILTERS = [
  { key: "all", label: "Todas" }, { key: "active", label: "Ativas" }, { key: "scheduled", label: "Agendadas" }, { key: "expiring", label: "Expirando" },
];
const KIND_FILTERS = [{ key: "all", label: "Todos os tipos" }, { key: "campaign", label: "Campanhas" }, { key: "product_discount", label: "Descontos de produto" }];

/** Render the main promotions administration experience. */
function PromotionsScreen({ ctx }) {
  const { promotions, customers, inventory, openPromotionCreate, openPromotionEdit, togglePromotionState, removePromotion, duplicatePromotion } = ctx;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");

  const enrichedPromotions = promotions.map((promotion) => ({ promotion, statusKey: getPromotionStatusKey(promotion), statusMeta: getPromotionStatusMeta(promotion) }));
  const stats = {
    total: promotions.length,
    active: enrichedPromotions.filter((e) => e.statusKey === "active" || e.statusKey === "expiring").length,
    scheduled: enrichedPromotions.filter((e) => e.statusKey === "scheduled").length,
    expiring: enrichedPromotions.filter((e) => e.statusKey === "expiring").length,
    segmented: promotions.filter((p) => getPromotionAudienceBadges(p)[0] !== "Todo o público").length,
    campaigns: promotions.filter((p) => p.kind !== "product_discount").length,
    productDiscounts: promotions.filter((p) => p.kind === "product_discount").length,
  };
  const statusCounts = { all: stats.total, active: stats.active, scheduled: stats.scheduled, expiring: stats.expiring };
  const kindCounts = { all: null, campaign: stats.campaigns, product_discount: stats.productDiscounts };

  const filteredPromotions = enrichedPromotions.filter(({ promotion, statusKey }) => {
    if (statusFilter !== "all" && statusKey !== statusFilter) return false;
    if (segmentFilter !== "all" && (promotion.customerSegment || "all") !== segmentFilter) return false;
    if (kindFilter !== "all" && (promotion.kind === "product_discount" ? "product_discount" : "campaign") !== kindFilter) return false;
    if (query && !buildPromotionSearchText(promotion).includes(query.toLowerCase())) return false;
    return true;
  }).sort((left, right) => {
    const rank = ["active", "expiring", "scheduled", "inactive", "expired"];
    const rankDiff = rank.indexOf(left.statusKey) - rank.indexOf(right.statusKey);
    return rankDiff !== 0 ? rankDiff : String(right.promotion.updatedAt || "").localeCompare(String(left.promotion.updatedAt || ""));
  });

  const removeConfirm = async (promotion) => {
    const ok = await confirmAction({
      title: "Excluir promoção?", body: "O preço promocional deixará de valer imediatamente. Essa ação não pode ser desfeita.",
      entity: promotion.name, danger: true, confirmLabel: "Excluir",
    });
    if (ok) removePromotion(promotion.id);
  };

  const columns = [
    { key: "promotion", label: "Promoção", render: ({ promotion }) => (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="cell-strong">{promotion.name}</span>
          <Badge tone="neutral">{PROMOTION_KIND_LABELS[promotion.kind] || PROMOTION_KIND_LABELS.campaign}</Badge>
          {promotion.highlightStyle === "superpromo" && <Badge tone="critical"><Icon name="bolt" size={10} />Superpromoção</Badge>}
          {promotion.guestVisible && <Badge tone="neutral"><Icon name="eye" size={10} />Deslogado</Badge>}
          {promotion.urgencyLabel && <Badge tone="warning"><Icon name="alert" size={10} />{promotion.urgencyLabel}</Badge>}
        </div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{promotion.description || "Sem descrição operacional."}</div>
      </>
    ) },
    { key: "discount", label: "Desconto", render: ({ promotion }) => (
      <>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{formatPromotionDiscount(promotion)}</div>
        {promotion.maxDiscountValue != null && promotion.maxDiscountValue !== "" && <div className="cell-muted" style={{ fontSize: 11.5 }}>teto {money(promotion.maxDiscountValue)}</div>}
      </>
    ) },
    { key: "window", label: "Janela", render: ({ promotion }) => (
      <>
        <div className="cell-muted" style={{ fontSize: 11 }}>Início</div>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{formatPromotionDateTime(promotion.startsAt)}</div>
        <div className="cell-muted" style={{ fontSize: 11, marginTop: 4 }}>Fim · {formatPromotionDateTime(promotion.endsAt)}</div>
        {!!(promotion.dailyStartTime && promotion.dailyEndTime) && <div className="cell-muted" style={{ fontSize: 11, marginTop: 4 }}><Icon name="clock" size={10} /> {promotion.dailyStartTime}–{promotion.dailyEndTime}</div>}
        {!!(promotion.daysOfWeek || []).length && <div className="cell-muted" style={{ fontSize: 11, marginTop: 2 }}>{promotion.daysOfWeek.map((d) => WEEKDAY_CHIP_LABELS[d]).join(", ")}</div>}
      </>
    ) },
    { key: "scope", label: "Escopo", render: ({ promotion }) => <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{getPromotionScopeBadges(promotion).map((b) => <Badge key={b} tone="neutral">{b}</Badge>)}</div> },
    { key: "audience", label: "Público-alvo", render: ({ promotion }) => <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 240 }}>{getPromotionAudienceBadges(promotion).map((b) => <Badge key={b} tone="critical">{b}</Badge>)}</div> },
    { key: "status", label: "Status", render: ({ statusMeta }) => <Badge tone={statusMeta.tone} dot><Icon name={statusMeta.icon} size={10} />{statusMeta.label}</Badge> },
  ];

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Preço & Promoções"
        title="Promoções"
        desc="Preço promocional automático por público-alvo e janela de tempo."
        actions={<button className="btn btn-primary" onClick={openPromotionCreate}><Icon name="plus" size={14} />Nova promoção</button>}
      />

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatCard icon="sparkle" value={stats.active} label="Promoções ativas" tone="good" />
        <StatCard icon="calendar" value={stats.scheduled} label="Agendadas" />
        <StatCard icon="clock" value={stats.expiring} label="Expiram em 72h" tone="warning" />
        <StatCard icon="user" value={stats.segmented} label="Com público segmentado" />
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <input className="input" placeholder="Buscar por nome, categoria ou produto" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <ChipToggleRow options={STATUS_FILTERS.map((f) => ({ value: f.key, label: `${f.label} ${statusCounts[f.key]}` }))} isOn={(v) => statusFilter === v} onToggle={setStatusFilter} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <PillNav options={KIND_FILTERS.map((f) => ({ key: f.key, label: kindCounts[f.key] != null ? `${f.label} (${kindCounts[f.key]})` : f.label }))} active={kindFilter} onChange={setKindFilter} />
          <select className="input" style={{ width: "auto", minWidth: 200 }} value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)}>
            <option value="all">Todos os segmentos</option>
            <option value="new_customers">Novos clientes</option>
            <option value="recurring">Clientes recorrentes</option>
          </select>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          rows={filteredPromotions}
          rowKey={(row) => row.promotion.id}
          empty="Nenhuma promoção encontrada com os filtros atuais"
          renderActions={({ promotion }) => (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => openPromotionEdit(promotion.id)}><Icon name="edit" size={12} />Editar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => duplicatePromotion(promotion.id)}><Icon name="plusCircle" size={12} />Duplicar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => togglePromotionState(promotion.id, !promotion.active)}><Icon name={promotion.active ? "pause" : "play"} size={12} />{promotion.active ? "Pausar" : "Ativar"}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--critical)" }} onClick={() => removeConfirm(promotion)}><Icon name="trash" size={12} />Excluir</button>
            </>
          )}
        />
      </div>
    </div>
  );
}

/** Render the reusable create/edit promotion modal, with a live estimated-audience counter. */
function PromotionModal({ mode, promotion, initialDraft, inventory, healthServices, customers, mkt, cnaeSettings, onClose, onCreate, onUpdate, estimateAudience }) {
  const [draft, setDraft] = useState(() => createPromotionDraft(promotion, initialDraft));
  const [error, setError] = useState("");
  const [audienceEstimate, setAudienceEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  // "Por margem" só faz sentido travado a um único produto: com categoria ou vários produtos, cada
  // um tem um custo diferente e não existe um percentual único que acerte a margem de todos.
  const [discountMode, setDiscountMode] = useState("value");
  const [targetMarginPercent, setTargetMarginPercent] = useState(22);
  const categoryOptions = useMemo(() => buildCouponCategoryOptions(inventory), [inventory]);
  const productOptions = useMemo(() => buildCouponProductOptions(inventory), [inventory]);
  const serviceOptions = useMemo(() => buildCouponServiceOptions(healthServices), [healthServices]);
  const regionOptions = useMemo(() => buildPromotionRegionOptions(customers), [customers]);
  const debounceRef = useRef(null);

  const singleTargetProduct = draft.scopeType === "products" && draft.targetProducts.length === 1
    ? (inventory || []).find((item) => String(item.name || "").trim().toLowerCase() === draft.targetProducts[0].trim().toLowerCase())
    : null;
  const marginModeAvailable = !!singleTargetProduct;

  useEffect(() => { if (!marginModeAvailable && discountMode === "margin") setDiscountMode("value"); }, [marginModeAvailable, discountMode]);

  useEffect(() => {
    if (discountMode !== "margin" || !singleTargetProduct || !mkt) return;
    const cnaeIndex = cnaeIndexByCode(cnaeSettings);
    const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
    const currentPrice = Number(singleTargetProduct.price || 0);
    if (currentPrice <= 0) return;
    const currentCalc = priceCalc({ ...singleTargetProduct, promo: 0 }, mkt, cnaeIndex, taxRegime);
    const targetEffectivePrice = priceForMargin(currentCalc.cost, targetMarginPercent, mkt, currentCalc.taxPct);
    const impliedDiscount = targetEffectivePrice != null ? Math.max(0, Math.min(100, (1 - targetEffectivePrice / currentPrice) * 100)) : 0;
    setDraft((current) => ({ ...current, discountType: "percent", discountValue: Math.round(impliedDiscount * 10) / 10 }));
  }, [discountMode, singleTargetProduct, targetMarginPercent, mkt, cnaeSettings]);

  useEffect(() => { setDraft(createPromotionDraft(promotion, initialDraft)); setError(""); }, [promotion, mode, initialDraft]);

  const setKind = (nextKind) => setDraft((current) => nextKind === "product_discount"
    ? { ...current, kind: nextKind, scopeType: "products", useAgeRange: false, regions: [], deviceTypes: [], maritalStatuses: [], useChildrenRange: false, customerSegment: "all", targetLoyaltyTiers: [] }
    : { ...current, kind: nextKind });

  useEffect(() => {
    if (draft.kind === "product_discount") { setAudienceEstimate(null); return undefined; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const result = await estimateAudience({
          minAge: draft.useAgeRange ? draft.minAge : null, maxAge: draft.useAgeRange ? draft.maxAge : null,
          regions: draft.regions, deviceTypes: draft.deviceTypes, maritalStatuses: draft.maritalStatuses,
          minChildren: draft.useChildrenRange ? draft.minChildren : null, maxChildren: draft.useChildrenRange ? draft.maxChildren : null,
          customerSegment: draft.customerSegment, targetLoyaltyTiers: draft.targetLoyaltyTiers,
        });
        setAudienceEstimate(result);
      } catch { setAudienceEstimate(null); } finally { setEstimating(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.kind, draft.useAgeRange, draft.minAge, draft.maxAge, draft.regions, draft.deviceTypes, draft.maritalStatuses, draft.useChildrenRange, draft.minChildren, draft.maxChildren, draft.customerSegment, draft.targetLoyaltyTiers]);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const toggleWeekday = (day) => setDraft((current) => ({ ...current, daysOfWeek: current.daysOfWeek.includes(day) ? current.daysOfWeek.filter((d) => d !== day) : [...current.daysOfWeek, day].sort() }));
  const toggleListValue = (field, value) => setDraft((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedName = String(draft.name || "").trim();
    const discountValue = Number(draft.discountValue || 0);
    const startTimestamp = draft.startsAt ? new Date(draft.startsAt).getTime() : null;
    const endTimestamp = draft.endsAt ? new Date(draft.endsAt).getTime() : null;
    const payload = buildPromotionPayloadFromDraft(draft);

    if (!normalizedName) { setError("Informe um nome para a promoção."); return; }
    if (discountValue <= 0) { setError("O desconto precisa ser maior que zero."); return; }
    if (draft.discountType === "percent" && discountValue > 100) { setError("O desconto percentual não pode passar de 100%."); return; }
    if (startTimestamp != null && endTimestamp != null && endTimestamp <= startTimestamp) { setError("A data final deve ser posterior ao início."); return; }
    if (draft.useAgeRange && Number(draft.minAge) > Number(draft.maxAge)) { setError("A idade mínima não pode ser maior que a máxima."); return; }
    if (draft.useChildrenRange && Number(draft.minChildren) > Number(draft.maxChildren)) { setError("O número mínimo de filhos não pode ser maior que o máximo."); return; }
    if (payload.scopeType === "categories" && payload.targetCategories.length === 0) { setError("Selecione pelo menos uma categoria."); return; }
    if (payload.scopeType === "products" && payload.targetProducts.length === 0) { setError("Selecione pelo menos um produto."); return; }
    if (draft.kind === "product_discount") {
      if (draft.scopeType !== "products" || draft.targetProducts.length === 0) { setError("Um desconto de produto precisa de pelo menos um produto selecionado."); return; }
      if (promotionDraftHasAudienceRestrictions(draft)) { setError('Um desconto de produto não pode ter filtro de público — isso é uma campanha. Mude o tipo ou remova os filtros.'); return; }
    }
    if (draft.guestVisible && promotionDraftHasAudienceRestrictions(draft)) { setError('Uma promoção visível para visitantes deslogados não pode ter filtro de público — remova os filtros antes de marcar "visível deslogado".'); return; }

    if (mode === "edit" && promotion) onUpdate(promotion.id, payload);
    else onCreate(payload);
  };

  return (
    <Modal
      open onClose={onClose} title={mode === "edit" ? "Editar promoção" : "Nova promoção"}
      subtitle="Preço promocional automático, sem código, aplicado só para o público e a janela que você configurar aqui."
      wide
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" form="promotion-form" className="btn btn-primary"><Icon name="check" size={14} />{mode === "edit" ? "Salvar promoção" : "Criar promoção"}</button>
        </>
      )}
    >
      <form id="promotion-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Tipo de promoção" hint="Campanha permite segmentar por público. Desconto de produto é um preço promocional direto sobre produtos, sem segmentação.">
          <PillNav options={[{ key: "campaign", label: "Campanha" }, { key: "product_discount", label: "Desconto de produto" }]} active={draft.kind} onChange={setKind} />
        </Field>

        <div className="grid g-2">
          <Field label="Nome da promoção"><input className="input" value={draft.name} onChange={(e) => setField("name", e.target.value)} placeholder="Happy hour vitaminas" /></Field>
          <Field label="Descrição operacional"><input className="input" value={draft.description} onChange={(e) => setField("description", e.target.value)} placeholder="Resumo curto para o time" /></Field>
        </div>

        {marginModeAvailable && (
          <PillNav options={[{ key: "value", label: "Definir por valor" }, { key: "margin", label: "Definir por margem" }]} active={discountMode} onChange={setDiscountMode} />
        )}

        {discountMode === "margin" && marginModeAvailable ? (
          <div className="grid g-2">
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <span className="page-desc" style={{ margin: 0 }}>Margem líquida-alvo para <b>{singleTargetProduct.name}</b></span>
                <span style={{ fontWeight: 800, fontSize: 18, color: "var(--accent)" }}>{targetMarginPercent}%</span>
              </div>
              <input type="range" min="0" max="60" step="1" value={targetMarginPercent} onChange={(e) => setTargetMarginPercent(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
              <p className="page-desc" style={{ marginTop: 6 }}>Desconto calculado: <b>-{draft.discountValue}%</b> sobre o preço atual ({singleTargetProduct.price != null ? money(singleTargetProduct.price) : "—"})</p>
            </div>
            <Field label="Teto do desconto em R$"><input className="input" type="number" min="0" step="0.01" value={draft.maxDiscountValue} onChange={(e) => setField("maxDiscountValue", e.target.value)} placeholder="Opcional" /></Field>
          </div>
        ) : (
          <div className="grid g-3">
            <Field label="Tipo de desconto">
              <select className="input" value={draft.discountType} onChange={(e) => setField("discountType", e.target.value)}>
                <option value="percent">Percentual</option><option value="fixed">Valor fixo</option>
              </select>
            </Field>
            <Field label={draft.discountType === "fixed" ? "Desconto em R$" : "Desconto em %"}>
              <input className="input" type="number" min="0" step={draft.discountType === "fixed" ? "0.01" : "0.1"} value={draft.discountValue} onChange={(e) => setField("discountValue", e.target.value)} />
            </Field>
            <Field label="Teto do desconto em R$"><input className="input" type="number" min="0" step="0.01" value={draft.maxDiscountValue} onChange={(e) => setField("maxDiscountValue", e.target.value)} placeholder="Opcional" /></Field>
          </div>
        )}

        {draft.kind === "campaign" && (
          <Field label="Escopo da promoção" hint="Todo o catálogo, categorias específicas ou produtos determinados.">
            <select className="input" value={draft.scopeType} onChange={(e) => setField("scopeType", e.target.value)}>
              <option value="all">Catálogo completo</option><option value="categories">Categorias específicas</option>
              <option value="products">Remédios e produtos específicos</option><option value="services">Serviços de saúde</option>
            </select>
          </Field>
        )}
        {draft.scopeType === "categories" && (
          <CouponTargetPicker label="Categorias elegíveis" tooltip="Categorias do estoque que recebem o preço promocional." placeholder="Buscar categorias" searchPlaceholder="Buscar categorias do estoque" options={categoryOptions} selectedValues={draft.targetCategories} onChange={(v) => setField("targetCategories", v)} emptyMessage="Nenhuma categoria encontrada." />
        )}
        {draft.scopeType === "products" && (
          <CouponTargetPicker label="Produtos elegíveis" tooltip="Produtos específicos do estoque que recebem o preço promocional." placeholder="Buscar produtos" searchPlaceholder="Buscar produtos do estoque" options={productOptions} selectedValues={draft.targetProducts} onChange={(v) => setField("targetProducts", v)} emptyMessage="Nenhum produto encontrado." />
        )}
        {draft.scopeType === "services" && (
          <CouponTargetPicker label="Serviços de saúde elegíveis" tooltip="Serviços de Catálogo → Serviços de saúde que recebem o preço promocional." placeholder="Buscar serviços de saúde" searchPlaceholder="Buscar serviços de saúde cadastrados" options={serviceOptions} selectedValues={draft.targetServices} onChange={(v) => setField("targetServices", v)} emptyMessage="Nenhum serviço de saúde ativo cadastrado ainda." />
        )}

        <div style={{ fontWeight: 800, fontSize: 14 }}>Agendamento</div>
        <div className="grid g-2">
          <Field label="Início"><input className="input" type="datetime-local" value={draft.startsAt} onChange={(e) => setField("startsAt", e.target.value)} /></Field>
          <Field label="Fim"><input className="input" type="datetime-local" value={draft.endsAt} onChange={(e) => setField("endsAt", e.target.value)} /></Field>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Restringir a um horário do dia</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Ex.: válido só das 18h às 20h, todo dia dentro da janela acima.</div></div>
          <SwitchToggle on={!!draft.useDailyWindow} onChange={(v) => setField("useDailyWindow", v)} label="restringir horário do dia" />
        </div>
        {draft.useDailyWindow && (
          <div className="grid g-2">
            <Field label="Das"><input className="input" type="time" value={draft.dailyStartTime} onChange={(e) => setField("dailyStartTime", e.target.value)} /></Field>
            <Field label="Até"><input className="input" type="time" value={draft.dailyEndTime} onChange={(e) => setField("dailyEndTime", e.target.value)} /></Field>
          </div>
        )}
        <Field label="Dias da semana (vazio = todos os dias)">
          <ChipToggleRow options={WEEKDAY_CHIP_LABELS.map((label, day) => ({ value: day, label }))} isOn={(day) => draft.daysOfWeek.includes(day)} onToggle={toggleWeekday} />
        </Field>

        {draft.kind === "campaign" && (
          <>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Público-alvo</div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Restringir por faixa etária</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Calculada a partir da data de nascimento cadastrada.</div></div>
              <SwitchToggle on={!!draft.useAgeRange} onChange={(v) => setField("useAgeRange", v)} label="restringir por idade" />
            </div>
            {draft.useAgeRange && (
              <div className="grid g-2">
                <Field label="Idade mínima"><input className="input" type="number" min="0" max="120" value={draft.minAge} onChange={(e) => setField("minAge", e.target.value)} /></Field>
                <Field label="Idade máxima"><input className="input" type="number" min="0" max="120" value={draft.maxAge} onChange={(e) => setField("maxAge", e.target.value)} /></Field>
              </div>
            )}

            <CouponTargetPicker label="Regiões elegíveis (vazio = todas)" tooltip="UF, cidade, bairro ou prefixo de CEP (5 dígitos) do endereço principal do cliente." placeholder="Buscar cidade, bairro, UF ou CEP" searchPlaceholder="Buscar cidade, bairro, UF ou CEP" options={regionOptions} selectedValues={draft.regions} onChange={(v) => setField("regions", v)} emptyMessage="Nenhuma região encontrada na base de clientes." />

            <Field label="Tipo de dispositivo (vazio = todos)" hint="Detectado automaticamente na navegação — sem dado, nenhum eixo restringe.">
              <ChipToggleRow options={Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => ({ value, label }))} isOn={(v) => draft.deviceTypes.includes(v)} onToggle={(v) => toggleListValue("deviceTypes", v)} />
            </Field>
            <Field label="Estado civil (vazio = todos)" hint="Autodeclarado pelo cliente na conta.">
              <ChipToggleRow options={Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => ({ value, label }))} isOn={(v) => draft.maritalStatuses.includes(v)} onToggle={(v) => toggleListValue("maritalStatuses", v)} />
            </Field>

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Restringir por número de filhos</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Autodeclarado pelo cliente na conta.</div></div>
              <SwitchToggle on={!!draft.useChildrenRange} onChange={(v) => setField("useChildrenRange", v)} label="restringir por filhos" />
            </div>
            {draft.useChildrenRange && (
              <div className="grid g-2">
                <Field label="Mínimo de filhos"><input className="input" type="number" min="0" max="20" value={draft.minChildren} onChange={(e) => setField("minChildren", e.target.value)} /></Field>
                <Field label="Máximo de filhos"><input className="input" type="number" min="0" max="20" value={draft.maxChildren} onChange={(e) => setField("maxChildren", e.target.value)} /></Field>
              </div>
            )}

            <Field label="Segmento de relacionamento">
              <select className="input" value={draft.customerSegment} onChange={(e) => setField("customerSegment", e.target.value)}>
                <option value="all">Todos os clientes</option><option value="new_customers">Novos clientes</option><option value="recurring">Clientes recorrentes</option>
              </select>
            </Field>
            <Field label="Selo de fidelidade (vazio = todos)" hint="Calculado pelo servidor a partir de pedidos concluídos — nunca informado pelo cliente.">
              <ChipToggleRow options={Object.entries(LOYALTY_TIER_LABELS).map(([value, label]) => ({ value, label }))} isOn={(v) => draft.targetLoyaltyTiers.includes(v)} onToggle={(v) => toggleListValue("targetLoyaltyTiers", v)} />
            </Field>
          </>
        )}

        <Field label="Prioridade" hint="Quando mais de uma promoção bate no mesmo produto e cliente, a de maior prioridade vence.">
          <input className="input" type="number" min="0" max="100" style={{ maxWidth: 160 }} value={draft.priority} onChange={(e) => setField("priority", e.target.value)} />
        </Field>

        <div style={{ fontWeight: 800, fontSize: 14 }}>Exibição no marketplace</div>
        {draft.kind === "product_discount" ? (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Visível para visitante deslogado</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Desconto de produto é sempre visível, logado ou não.</div></div>
            <SwitchToggle on onChange={() => {}} label="visível para visitante deslogado (sempre ativo)" />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Visível para visitante deslogado</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Só permitido sem nenhum filtro de público acima.</div></div>
              <SwitchToggle on={!!draft.guestVisible} onChange={(v) => setField("guestVisible", v)} label="visível para visitante deslogado" />
            </div>
            {draft.guestVisible && promotionDraftHasAudienceRestrictions(draft) && (
              <p className="field-error" style={{ margin: 0 }}>Remova os filtros de público acima para deixar esta promoção visível a visitantes deslogados.</p>
            )}
          </>
        )}
        <Field label="Modo de exibição" hint="Superpromoção destaca o produto no marketplace com um selo mais chamativo.">
          <PillNav options={[{ key: "standard", label: "Simplificado" }, { key: "superpromo", label: "Superpromoção" }]} active={draft.highlightStyle} onChange={(v) => setField("highlightStyle", v)} />
        </Field>

        <Field label="Texto de urgência (opcional)" hint="Aparece no card do produto no marketplace — texto livre, não calculado a partir do estoque real.">
          <input className="input" value={draft.urgencyLabel} maxLength={60} placeholder="Ex.: Restam só 2 no estoque" onChange={(e) => setField("urgencyLabel", e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <ChipToggleRow options={URGENCY_LABEL_PRESETS.map((p) => ({ value: p, label: p }))} isOn={(p) => draft.urgencyLabel === p} onToggle={(p) => setField("urgencyLabel", draft.urgencyLabel === p ? "" : p)} />
          </div>
        </Field>

        {draft.kind === "campaign" && (
          <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="user" size={16} style={{ color: "var(--accent)", flex: "none" }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {estimating ? "Calculando alcance…" : audienceEstimate ? `${audienceEstimate.matchingCustomers} de ${audienceEstimate.totalActiveCustomers} clientes ativos elegíveis` : "Alcance estimado indisponível"}
              </div>
              <div className="page-desc" style={{ margin: 0 }}>Contagem ao vivo com base nos filtros de público acima.</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>Promoção ativa ao salvar</div><div className="page-desc" style={{ margin: "2px 0 0" }}>Aplica automaticamente assim que a janela e o público baterem.</div></div>
          <SwitchToggle on={!!draft.active} onChange={(v) => setField("active", v)} label="promoção ativa" />
        </div>

        <Field label="Observações internas">
          <textarea className="input" style={{ minHeight: 80 }} value={draft.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Contexto da campanha para o time" />
        </Field>

        {error && <div className="field-error" style={{ padding: "10px 12px", background: "var(--critical-soft)", borderRadius: "var(--radius-md)" }}>{error}</div>}
      </form>
    </Modal>
  );
}

export {
  DEVICE_TYPE_LABELS,
  LOYALTY_TIER_LABELS,
  MARITAL_STATUS_LABELS,
  PROMO_DISCOUNT_TYPE_LABELS,
  PROMO_STATUS_META,
  SEGMENT_LABELS,
  PromotionModal,
  PromotionsScreen,
  buildPromotionPayloadFromDraft,
  buildPromotionRegionOptions,
  buildPromotionSearchText,
  createPromotionDraft,
  formatPromotionDateTime,
  formatPromotionDiscount,
  getPromotionAudienceBadges,
  getPromotionScopeBadges,
  getPromotionStatusKey,
  getPromotionStatusMeta,
};
