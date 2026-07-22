import React, { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { StatCard } from "./dashboard-screen.jsx";
import {
  COUPON_SCOPE_LABELS,
  CouponFieldLabel,
  CouponInfoHint,
  CouponTargetPicker,
  buildCouponCategoryOptions,
  buildCouponProductOptions,
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

const PROMO_DISCOUNT_TYPE_LABELS = { percent: 'Percentual', fixed: 'Valor fixo' };
const MARITAL_STATUS_LABELS = { single: 'Solteiro(a)', married: 'Casado(a)', divorced: 'Divorciado(a)', widowed: 'Viúvo(a)', other: 'Outro' };
const DEVICE_TYPE_LABELS = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computador' };
const SEGMENT_LABELS = { all: 'Todos os clientes', new_customers: 'Novos clientes', recurring: 'Clientes recorrentes' };
const WEEKDAY_CHIP_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const PROMO_STATUS_META = {
  active: { label: 'Ativa', badge: 'fa-badge-health', icon: 'check' },
  scheduled: { label: 'Agendada', badge: 'fa-badge-mist', icon: 'calendar' },
  expiring: { label: 'Expira em breve', badge: 'fa-badge-warn', icon: 'clock' },
  expired: { label: 'Expirada', badge: 'fa-badge-mist', icon: 'close' },
  inactive: { label: 'Pausada', badge: 'fa-badge-mist', icon: 'pause' },
};

/** Build a view-model draft for the promotion form. */
function createPromotionDraft(sourcePromotion) {
  const promotion = sourcePromotion || {};
  return {
    name: promotion.name || '',
    description: promotion.description || '',
    active: promotion.active !== false,
    discountType: promotion.discountType || 'percent',
    discountValue: promotion.discountValue == null ? 10 : Number(promotion.discountValue || 0),
    maxDiscountValue: promotion.maxDiscountValue == null ? '' : Number(promotion.maxDiscountValue),
    scopeType: promotion.scopeType || 'all',
    targetCategories: Array.isArray(promotion.targetCategories) ? promotion.targetCategories : [],
    targetProducts: Array.isArray(promotion.targetProducts) ? promotion.targetProducts : [],
    startsAt: promotion.startsAt || '',
    endsAt: promotion.endsAt || '',
    useDailyWindow: !!(promotion.dailyStartTime && promotion.dailyEndTime),
    dailyStartTime: promotion.dailyStartTime || '18:00',
    dailyEndTime: promotion.dailyEndTime || '20:00',
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
    customerSegment: promotion.customerSegment || 'all',
    priority: promotion.priority == null ? 0 : Number(promotion.priority),
    notes: promotion.notes || '',
  };
}

/** Normalize a draft into the payload shape the backend expects, dropping unused axes. */
function buildPromotionPayloadFromDraft(draft) {
  return {
    ...draft,
    targetCategories: draft.scopeType === 'categories' ? draft.targetCategories : [],
    targetProducts: draft.scopeType === 'products' ? draft.targetProducts : [],
    dailyStartTime: draft.useDailyWindow ? draft.dailyStartTime : '',
    dailyEndTime: draft.useDailyWindow ? draft.dailyEndTime : '',
    minAge: draft.useAgeRange ? draft.minAge : null,
    maxAge: draft.useAgeRange ? draft.maxAge : null,
    minChildren: draft.useChildrenRange ? draft.minChildren : null,
    maxChildren: draft.useChildrenRange ? draft.maxChildren : null,
  };
}

/** Format a discount label depending on promotion type. */
function formatPromotionDiscount(promotion) {
  const value = Number(promotion.discountValue || 0);
  if (promotion.discountType === 'fixed') {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%';
}

/** Format a local datetime label from an ISO-like input. */
function formatPromotionDateTime(value) {
  if (!value) return 'Sem limite';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem limite';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Calculate promotion status from activation flag and schedule window. */
function getPromotionStatusKey(promotion) {
  const now = new Date();
  const startsAt = promotion && promotion.startsAt ? new Date(promotion.startsAt) : null;
  const endsAt = promotion && promotion.endsAt ? new Date(promotion.endsAt) : null;
  const msInDay = 24 * 60 * 60 * 1000;
  if (!promotion || promotion.active === false) return 'inactive';
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) return 'scheduled';
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime()) return 'expired';
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() - now.getTime() <= msInDay * 3) return 'expiring';
  return 'active';
}

function getPromotionStatusMeta(promotion) {
  return PROMO_STATUS_META[getPromotionStatusKey(promotion)] || PROMO_STATUS_META.inactive;
}

/** Build human-readable scope badges, reusing the coupon scope vocabulary. */
function getPromotionScopeBadges(promotion) {
  const badges = [COUPON_SCOPE_LABELS[promotion.scopeType] || COUPON_SCOPE_LABELS.all];
  if (promotion.scopeType === 'categories') {
    (promotion.targetCategories || []).slice(0, 3).forEach((item) => badges.push(item));
  }
  if (promotion.scopeType === 'products') {
    (promotion.targetProducts || []).slice(0, 3).forEach((item) => badges.push(item));
  }
  return badges;
}

/** Build human-readable audience badges for one promotion. */
function getPromotionAudienceBadges(promotion) {
  const badges = [];
  if (promotion.minAge != null || promotion.maxAge != null) {
    badges.push('Idade ' + (promotion.minAge ?? '0') + '–' + (promotion.maxAge ?? '∞'));
  }
  (promotion.regions || []).slice(0, 2).forEach((region) => badges.push(region));
  if ((promotion.regions || []).length > 2) badges.push('+' + (promotion.regions.length - 2));
  (promotion.deviceTypes || []).forEach((device) => badges.push(DEVICE_TYPE_LABELS[device] || device));
  (promotion.maritalStatuses || []).forEach((status) => badges.push(MARITAL_STATUS_LABELS[status] || status));
  if (promotion.minChildren != null || promotion.maxChildren != null) {
    badges.push('Filhos ' + (promotion.minChildren ?? '0') + '–' + (promotion.maxChildren ?? '∞'));
  }
  if (promotion.customerSegment && promotion.customerSegment !== 'all') {
    badges.push(SEGMENT_LABELS[promotion.customerSegment] || promotion.customerSegment);
  }
  return badges.length ? badges : ['Todo o público'];
}

/** Build searchable text for one promotion row. */
function buildPromotionSearchText(promotion) {
  return [promotion.name, promotion.description, promotion.notes, (promotion.targetCategories || []).join(' '), (promotion.targetProducts || []).join(' ')].join(' ').toLowerCase();
}

/** Build distinct region (city) options from the CRM customer base already loaded in context. */
function buildPromotionRegionOptions(customers) {
  const unique = new Map();
  (customers || []).forEach((customer) => {
    const city = String(customer.city || '').trim();
    if (!city) return;
    const key = city.toLowerCase();
    if (!unique.has(key)) unique.set(key, { value: city, label: city });
  });
  return Array.from(unique.values()).sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}

/** Render the main promotions administration experience. */
function PromotionsScreen({ ctx }) {
  const {
    promotions, customers, inventory, openPromotionCreate, openPromotionEdit,
    togglePromotionState, removePromotion, duplicatePromotion, onLogout,
  } = ctx;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [segmentFilter, setSegmentFilter] = useState('all');

  const enrichedPromotions = promotions.map((promotion) => ({
    promotion,
    statusKey: getPromotionStatusKey(promotion),
    statusMeta: getPromotionStatusMeta(promotion),
  }));

  const stats = {
    total: promotions.length,
    active: enrichedPromotions.filter((entry) => entry.statusKey === 'active' || entry.statusKey === 'expiring').length,
    scheduled: enrichedPromotions.filter((entry) => entry.statusKey === 'scheduled').length,
    expiring: enrichedPromotions.filter((entry) => entry.statusKey === 'expiring').length,
    segmented: promotions.filter((promotion) => getPromotionAudienceBadges(promotion)[0] !== 'Todo o público').length,
  };

  const filteredPromotions = enrichedPromotions.filter(({ promotion, statusKey }) => {
    if (statusFilter !== 'all' && statusKey !== statusFilter) return false;
    if (segmentFilter !== 'all' && (promotion.customerSegment || 'all') !== segmentFilter) return false;
    if (query && !buildPromotionSearchText(promotion).includes(query.toLowerCase())) return false;
    return true;
  }).sort((left, right) => {
    const rank = ['active', 'expiring', 'scheduled', 'inactive', 'expired'];
    const rankDiff = rank.indexOf(left.statusKey) - rank.indexOf(right.statusKey);
    if (rankDiff !== 0) return rankDiff;
    return String(right.promotion.updatedAt || '').localeCompare(String(left.promotion.updatedAt || ''));
  });

  return (
    <>
      <Topbar title="Promoções" sub="Preço promocional automático por público-alvo e janela de tempo" onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, categoria ou produto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={openPromotionCreate}>
          <Icon name="plus" size={15} />
          Nova promoção
        </button>
      </Topbar>

      <div className="ph-content ph-content-wide" data-screen-label="Promoções segmentadas do marketplace">
        <div className="cpn-kpis">
          <StatCard icon="sparkle" value={stats.active} label="Promoções ativas" tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }} />
          <StatCard icon="calendar" value={stats.scheduled} label="Agendadas" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
          <StatCard icon="clock" value={stats.expiring} label="Expiram em 72h" tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }} />
          <StatCard icon="user" value={stats.segmented} label="Com público segmentado" tint={{ bg: 'var(--fa-rose-soft)', fg: 'var(--fa-primary)' }} />
        </div>

        <div className="cpn-grid">
          <div>
            <div className="cpn-filterbar">
              <div className="ph-seg">
                <button data-on={statusFilter === 'all' ? '1' : '0'} onClick={() => setStatusFilter('all')}>Todas <span className="ph-seg-n">{stats.total}</span></button>
                <button data-on={statusFilter === 'active' ? '1' : '0'} onClick={() => setStatusFilter('active')}>Ativas <span className="ph-seg-n">{stats.active}</span></button>
                <button data-on={statusFilter === 'scheduled' ? '1' : '0'} onClick={() => setStatusFilter('scheduled')}>Agendadas <span className="ph-seg-n">{stats.scheduled}</span></button>
                <button data-on={statusFilter === 'expiring' ? '1' : '0'} onClick={() => setStatusFilter('expiring')}>Expirando <span className="ph-seg-n">{stats.expiring}</span></button>
              </div>
              <select className="fa-select" style={{ minWidth: 220 }} value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}>
                <option value="all">Todos os segmentos</option>
                <option value="new_customers">Novos clientes</option>
                <option value="recurring">Clientes recorrentes</option>
              </select>
            </div>

            <div className="ph-table-wrap cpn-table-wrap">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Promoção</th>
                    <th>Desconto</th>
                    <th>Janela</th>
                    <th>Escopo</th>
                    <th>Público-alvo</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPromotions.map(({ promotion, statusMeta }) => (
                    <tr key={promotion.id}>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{promotion.name}</div>
                        <div className="ph-cell-sub">{promotion.description || 'Sem descrição operacional.'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{formatPromotionDiscount(promotion)}</div>
                        {promotion.maxDiscountValue != null && promotion.maxDiscountValue !== '' && (
                          <div className="ph-cell-sub">teto R$ {Number(promotion.maxDiscountValue).toFixed(2).replace('.', ',')}</div>
                        )}
                      </td>
                      <td>
                        <div className="ph-cell-sub">Início</div>
                        <div style={{ fontWeight: 700 }}>{formatPromotionDateTime(promotion.startsAt)}</div>
                        <div className="ph-cell-sub" style={{ marginTop: 6 }}>Fim · {formatPromotionDateTime(promotion.endsAt)}</div>
                        {!!(promotion.dailyStartTime && promotion.dailyEndTime) && (
                          <div className="ph-cell-sub" style={{ marginTop: 6 }}><Icon name="clock" size={11} /> {promotion.dailyStartTime}–{promotion.dailyEndTime}</div>
                        )}
                        {!!(promotion.daysOfWeek || []).length && (
                          <div className="ph-cell-sub" style={{ marginTop: 4 }}>{promotion.daysOfWeek.map((day) => WEEKDAY_CHIP_LABELS[day]).join(', ')}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {getPromotionScopeBadges(promotion).map((badge) => <span key={badge} className="fa-badge fa-badge-mist">{badge}</span>)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 260 }}>
                          {getPromotionAudienceBadges(promotion).map((badge) => <span key={badge} className="fa-badge fa-badge-vital">{badge}</span>)}
                        </div>
                      </td>
                      <td>
                        <span className={'fa-badge ' + statusMeta.badge}><Icon name={statusMeta.icon} size={11} />{statusMeta.label}</span>
                      </td>
                      <td>
                        <div className="cpn-row-actions">
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => openPromotionEdit(promotion.id)}><Icon name="edit" size={14} />Editar</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => duplicatePromotion(promotion.id)}><Icon name="plusCircle" size={14} />Duplicar</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => togglePromotionState(promotion.id, !promotion.active)}>
                            <Icon name={promotion.active ? 'pause' : 'play'} size={14} />
                            {promotion.active ? 'Pausar' : 'Ativar'}
                          </button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ color: 'var(--fa-error)' }} onClick={() => removePromotion(promotion.id)}>
                            <Icon name="trash" size={14} />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPromotions.length === 0 && (
                <div className="ph-empty">
                  <span className="fa-iconbox"><Icon name="sparkle" size={28} /></span>
                  <div>Nenhuma promoção encontrada com os filtros atuais.</div>
                </div>
              )}
            </div>
          </div>

          <div className="cpn-list">
            <AnCard icon="sparkle" title="Como funciona" sub="Diferente do cupom, a promoção aplica sozinha">
              <div className="cpn-sidecard">
                <div className="cpn-statline"><span>Sem código</span><strong>Aplica na hora</strong></div>
                <div className="cpn-statline"><span>Servidor decide</span><strong>Não dá pra falsificar</strong></div>
                <div className="cpn-statline"><span>Eixo vazio</span><strong>Não restringe</strong></div>
              </div>
            </AnCard>
            <AnCard icon="sparkle" title="Boas práticas" sub="Checklist rápido para segmentar sem perder margem">
              <div className="cpn-badges">
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Combine no máximo 2–3 eixos por promoção</span>
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Use o teto de desconto em promoções por valor fixo</span>
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Confira o alcance estimado antes de ativar</span>
              </div>
            </AnCard>
          </div>
        </div>
      </div>
    </>
  );
}

/** Render the reusable create/edit promotion modal, with a live estimated-audience counter. */
function PromotionModal({ mode, promotion, inventory, customers, mkt, cnaeSettings, onClose, onCreate, onUpdate, estimateAudience }) {
  const [draft, setDraft] = useState(() => createPromotionDraft(promotion));
  const [error, setError] = useState('');
  const [audienceEstimate, setAudienceEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  // "Por margem" só faz sentido travado a um único produto: com categoria ou vários produtos,
  // cada um tem um custo diferente e não existe um percentual único que acerte a margem de todos.
  const [discountMode, setDiscountMode] = useState('value'); // value | margin
  const [targetMarginPercent, setTargetMarginPercent] = useState(22);
  const categoryOptions = useMemo(() => buildCouponCategoryOptions(inventory), [inventory]);
  const productOptions = useMemo(() => buildCouponProductOptions(inventory), [inventory]);
  const regionOptions = useMemo(() => buildPromotionRegionOptions(customers), [customers]);
  const debounceRef = useRef(null);

  const singleTargetProduct = draft.scopeType === 'products' && draft.targetProducts.length === 1
    ? (inventory || []).find((item) => String(item.name || '').trim().toLowerCase() === draft.targetProducts[0].trim().toLowerCase())
    : null;
  const marginModeAvailable = !!singleTargetProduct;

  useEffect(() => {
    if (!marginModeAvailable && discountMode === 'margin') {
      setDiscountMode('value');
    }
  }, [marginModeAvailable, discountMode]);

  useEffect(() => {
    if (discountMode !== 'margin' || !singleTargetProduct || !mkt) return;
    const cnaeIndex = cnaeIndexByCode(cnaeSettings);
    const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
    const currentPrice = Number(singleTargetProduct.price || 0);
    if (currentPrice <= 0) return;
    const currentCalc = priceCalc({ ...singleTargetProduct, promo: 0 }, mkt, cnaeIndex, taxRegime);
    const targetEffectivePrice = priceForMargin(currentCalc.cost, targetMarginPercent, mkt, currentCalc.taxPct);
    const impliedDiscount = targetEffectivePrice != null
      ? Math.max(0, Math.min(100, (1 - targetEffectivePrice / currentPrice) * 100))
      : 0;
    setDraft((current) => ({ ...current, discountType: 'percent', discountValue: Math.round(impliedDiscount * 10) / 10 }));
  }, [discountMode, singleTargetProduct, targetMarginPercent, mkt, cnaeSettings]);

  useEffect(() => {
    setDraft(createPromotionDraft(promotion));
    setError('');
  }, [promotion, mode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const result = await estimateAudience({
          minAge: draft.useAgeRange ? draft.minAge : null,
          maxAge: draft.useAgeRange ? draft.maxAge : null,
          regions: draft.regions,
          deviceTypes: draft.deviceTypes,
          maritalStatuses: draft.maritalStatuses,
          minChildren: draft.useChildrenRange ? draft.minChildren : null,
          maxChildren: draft.useChildrenRange ? draft.maxChildren : null,
          customerSegment: draft.customerSegment,
        });
        setAudienceEstimate(result);
      } catch (err) {
        setAudienceEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draft.useAgeRange, draft.minAge, draft.maxAge, draft.regions, draft.deviceTypes, draft.maritalStatuses, draft.useChildrenRange, draft.minChildren, draft.maxChildren, draft.customerSegment]);

  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleWeekday(day) {
    setDraft((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day) ? current.daysOfWeek.filter((item) => item !== day) : [...current.daysOfWeek, day].sort(),
    }));
  }

  function toggleListValue(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const normalizedName = String(draft.name || '').trim();
    const discountValue = Number(draft.discountValue || 0);
    const startTimestamp = draft.startsAt ? new Date(draft.startsAt).getTime() : null;
    const endTimestamp = draft.endsAt ? new Date(draft.endsAt).getTime() : null;
    const payload = buildPromotionPayloadFromDraft(draft);

    if (!normalizedName) {
      setError('Informe um nome para a promoção.');
      return;
    }
    if (discountValue <= 0) {
      setError('O desconto precisa ser maior que zero.');
      return;
    }
    if (draft.discountType === 'percent' && discountValue > 100) {
      setError('O desconto percentual não pode passar de 100%.');
      return;
    }
    if (startTimestamp != null && endTimestamp != null && endTimestamp <= startTimestamp) {
      setError('A data final deve ser posterior ao início.');
      return;
    }
    if (draft.useAgeRange && Number(draft.minAge) > Number(draft.maxAge)) {
      setError('A idade mínima não pode ser maior que a máxima.');
      return;
    }
    if (draft.useChildrenRange && Number(draft.minChildren) > Number(draft.maxChildren)) {
      setError('O número mínimo de filhos não pode ser maior que o máximo.');
      return;
    }
    if (payload.scopeType === 'categories' && payload.targetCategories.length === 0) {
      setError('Selecione pelo menos uma categoria.');
      return;
    }
    if (payload.scopeType === 'products' && payload.targetProducts.length === 0) {
      setError('Selecione pelo menos um produto.');
      return;
    }

    if (mode === 'edit' && promotion) {
      onUpdate(promotion.id, payload);
      return;
    }
    onCreate(payload);
  }

  return (
    <ModalShell open={true} onClose={onClose} maxw={780} className="cpn-modal">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <span className="fa-iconbox" style={{ width: 52, height: 52, flex: 'none' }}><Icon name="sparkle" size={24} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>{mode === 'edit' ? 'Editar promoção' : 'Nova promoção'}</h2>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
            Preço promocional automático, sem código, aplicado só para o público e a janela que você configurar aqui.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label>Nome da promoção</label>
            <input className="fa-input" value={draft.name} onChange={(event) => setField('name', event.target.value)} placeholder="Happy hour vitaminas" />
          </div>
          <div className="fa-field">
            <label>Descrição operacional</label>
            <input className="fa-input" value={draft.description} onChange={(event) => setField('description', event.target.value)} placeholder="Resumo curto para o time" />
          </div>
        </div>

        {marginModeAvailable && (
          <div className="ph-seg" style={{ marginBottom: 2 }}>
            <button type="button" data-on={discountMode === 'value' ? '1' : '0'} onClick={() => setDiscountMode('value')}><Icon name="money" size={14} />Definir por valor</button>
            <button type="button" data-on={discountMode === 'margin' ? '1' : '0'} onClick={() => setDiscountMode('margin')}><Icon name="gauge" size={14} />Definir por margem</button>
          </div>
        )}

        {discountMode === 'margin' && marginModeAvailable ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fa-field" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="ph-cell-sub">Margem líquida-alvo para <b>{singleTargetProduct.name}</b></span>
                <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--fa-primary)' }}>{targetMarginPercent}%</span>
              </div>
              <input className="prc-range" type="range" min="0" max="60" step="1" value={targetMarginPercent} onChange={(event) => setTargetMarginPercent(Number(event.target.value))} />
              <div className="ph-cell-sub" style={{ marginTop: 6 }}>Desconto calculado: <b>-{draft.discountValue}%</b> sobre o preço atual ({singleTargetProduct.price != null ? Number(singleTargetProduct.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'})</div>
            </div>
            <div className="fa-field">
              <label>Teto do desconto em R$</label>
              <input className="fa-input" type="number" min="0" step="0.01" value={draft.maxDiscountValue} onChange={(event) => setField('maxDiscountValue', event.target.value)} placeholder="Opcional" />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 14 }}>
            <div className="fa-field">
              <label>Tipo de desconto</label>
              <select className="fa-select" value={draft.discountType} onChange={(event) => setField('discountType', event.target.value)}>
                <option value="percent">Percentual</option>
                <option value="fixed">Valor fixo</option>
              </select>
            </div>
            <div className="fa-field">
              <label>{draft.discountType === 'fixed' ? 'Desconto em R$' : 'Desconto em %'}</label>
              <input className="fa-input" type="number" min="0" step={draft.discountType === 'fixed' ? '0.01' : '0.1'} value={draft.discountValue} onChange={(event) => setField('discountValue', event.target.value)} />
            </div>
            <div className="fa-field">
              <label>Teto do desconto em R$</label>
              <input className="fa-input" type="number" min="0" step="0.01" value={draft.maxDiscountValue} onChange={(event) => setField('maxDiscountValue', event.target.value)} placeholder="Opcional" />
            </div>
          </div>
        )}

        <div className="fa-field">
          <label><CouponFieldLabel label="Escopo da promoção" tooltip="Define se a promoção vale para todo o catálogo, categorias específicas ou produtos determinados." align="start" /></label>
          <select className="fa-select" value={draft.scopeType} onChange={(event) => setField('scopeType', event.target.value)}>
            <option value="all">Catálogo completo</option>
            <option value="categories">Categorias específicas</option>
            <option value="products">Remédios e produtos específicos</option>
          </select>
        </div>
        {draft.scopeType === 'categories' && (
          <CouponTargetPicker
            label="Categorias elegíveis" tooltip="Categorias do estoque que recebem o preço promocional." align="start"
            placeholder="Buscar categorias" searchPlaceholder="Buscar categorias do estoque"
            options={categoryOptions} selectedValues={draft.targetCategories}
            onChange={(value) => setField('targetCategories', value)} emptyMessage="Nenhuma categoria encontrada."
          />
        )}
        {draft.scopeType === 'products' && (
          <CouponTargetPicker
            label="Produtos elegíveis" tooltip="Produtos específicos do estoque que recebem o preço promocional." align="start"
            placeholder="Buscar produtos" searchPlaceholder="Buscar produtos do estoque"
            options={productOptions} selectedValues={draft.targetProducts}
            onChange={(value) => setField('targetProducts', value)} emptyMessage="Nenhum produto encontrado."
          />
        )}

        <div className="fa-h3" style={{ fontSize: 15, marginTop: 4 }}>Agendamento</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label>Início</label>
            <input className="fa-input" type="datetime-local" value={draft.startsAt} onChange={(event) => setField('startsAt', event.target.value)} />
          </div>
          <div className="fa-field">
            <label>Fim</label>
            <input className="fa-input" type="datetime-local" value={draft.endsAt} onChange={(event) => setField('endsAt', event.target.value)} />
          </div>
        </div>
        <div className="fa-row">
          <div className="fa-row-main">
            <div className="fa-row-label">Restringir a um horário do dia</div>
            <div className="fa-row-desc">Ex.: desconto válido só das 18h às 20h, todo dia dentro da janela acima.</div>
          </div>
          <Toggle on={!!draft.useDailyWindow} onChange={(value) => setField('useDailyWindow', value)} ariaLabel="restringir horário do dia" />
        </div>
        {draft.useDailyWindow && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fa-field">
              <label>Das</label>
              <input className="fa-input" type="time" value={draft.dailyStartTime} onChange={(event) => setField('dailyStartTime', event.target.value)} />
            </div>
            <div className="fa-field">
              <label>Até</label>
              <input className="fa-input" type="time" value={draft.dailyEndTime} onChange={(event) => setField('dailyEndTime', event.target.value)} />
            </div>
          </div>
        )}
        <div className="fa-field">
          <label>Dias da semana (vazio = todos os dias)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WEEKDAY_CHIP_LABELS.map((label, day) => (
              <button key={label} type="button" className="fa-chip" data-active={draft.daysOfWeek.includes(day) ? '1' : '0'} onClick={() => toggleWeekday(day)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="fa-h3" style={{ fontSize: 15, marginTop: 4 }}>Público-alvo</div>
        <div className="fa-row">
          <div className="fa-row-main">
            <div className="fa-row-label">Restringir por faixa etária</div>
            <div className="fa-row-desc">Calculada a partir da data de nascimento cadastrada do cliente.</div>
          </div>
          <Toggle on={!!draft.useAgeRange} onChange={(value) => setField('useAgeRange', value)} ariaLabel="restringir por idade" />
        </div>
        {draft.useAgeRange && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fa-field">
              <label>Idade mínima</label>
              <input className="fa-input" type="number" min="0" max="120" value={draft.minAge} onChange={(event) => setField('minAge', event.target.value)} />
            </div>
            <div className="fa-field">
              <label>Idade máxima</label>
              <input className="fa-input" type="number" min="0" max="120" value={draft.maxAge} onChange={(event) => setField('maxAge', event.target.value)} />
            </div>
          </div>
        )}

        <CouponTargetPicker
          label="Regiões elegíveis (vazio = todas)" tooltip="Cidades cadastradas na base de clientes. Vazio não restringe por região." align="start"
          placeholder="Buscar cidade" searchPlaceholder="Buscar cidade dos clientes"
          options={regionOptions} selectedValues={draft.regions}
          onChange={(value) => setField('regions', value)} emptyMessage="Nenhuma cidade encontrada na base de clientes."
        />

        <div className="fa-field">
          <label>Tipo de dispositivo (vazio = todos)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(DEVICE_TYPE_LABELS).map(([value, label]) => (
              <button key={value} type="button" className="fa-chip" data-active={draft.deviceTypes.includes(value) ? '1' : '0'} onClick={() => toggleListValue('deviceTypes', value)}>{label}</button>
            ))}
          </div>
          <div className="ph-cell-sub" style={{ marginTop: 6 }}>Detectado automaticamente na navegação do cliente — sem dado nenhum eixo não restringe.</div>
        </div>

        <div className="fa-field">
          <label>Estado civil (vazio = todos)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
              <button key={value} type="button" className="fa-chip" data-active={draft.maritalStatuses.includes(value) ? '1' : '0'} onClick={() => toggleListValue('maritalStatuses', value)}>{label}</button>
            ))}
          </div>
          <div className="ph-cell-sub" style={{ marginTop: 6 }}>Autodeclarado pelo cliente na conta — quem não preencheu não entra em filtros deste eixo.</div>
        </div>

        <div className="fa-row">
          <div className="fa-row-main">
            <div className="fa-row-label">Restringir por número de filhos</div>
            <div className="fa-row-desc">Autodeclarado pelo cliente na conta.</div>
          </div>
          <Toggle on={!!draft.useChildrenRange} onChange={(value) => setField('useChildrenRange', value)} ariaLabel="restringir por filhos" />
        </div>
        {draft.useChildrenRange && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fa-field">
              <label>Mínimo de filhos</label>
              <input className="fa-input" type="number" min="0" max="20" value={draft.minChildren} onChange={(event) => setField('minChildren', event.target.value)} />
            </div>
            <div className="fa-field">
              <label>Máximo de filhos</label>
              <input className="fa-input" type="number" min="0" max="20" value={draft.maxChildren} onChange={(event) => setField('maxChildren', event.target.value)} />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14 }}>
          <div className="fa-field">
            <label>Segmento de relacionamento</label>
            <select className="fa-select" value={draft.customerSegment} onChange={(event) => setField('customerSegment', event.target.value)}>
              <option value="all">Todos os clientes</option>
              <option value="new_customers">Novos clientes</option>
              <option value="recurring">Clientes recorrentes</option>
            </select>
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Prioridade" tooltip="Quando mais de uma promoção bate no mesmo produto e cliente, a de maior prioridade vence." align="end" /></label>
            <input className="fa-input" type="number" min="0" max="100" value={draft.priority} onChange={(event) => setField('priority', event.target.value)} />
          </div>
        </div>

        <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-mist-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="user" size={18} style={{ color: 'var(--fa-primary)', flex: 'none' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {estimating ? 'Calculando alcance…' : audienceEstimate ? audienceEstimate.matchingCustomers + ' de ' + audienceEstimate.totalActiveCustomers + ' clientes ativos elegíveis' : 'Alcance estimado indisponível'}
            </div>
            <div className="ph-cell-sub">Contagem ao vivo com base nos filtros de público acima.</div>
          </div>
        </div>

        <div className="fa-row">
          <div className="fa-row-main">
            <div className="fa-row-label">Promoção ativa ao salvar</div>
            <div className="fa-row-desc">Aplica automaticamente assim que a janela e o público baterem.</div>
          </div>
          <Toggle on={!!draft.active} onChange={(value) => setField('active', value)} ariaLabel="promoção ativa" />
        </div>

        <div className="fa-field">
          <label>Observações internas</label>
          <textarea className="fa-input" style={{ height: 96, paddingTop: 12, resize: 'vertical' }} value={draft.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="Contexto da campanha para o time" />
        </div>

        {error && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13.5 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" className="fa-btn fa-btn-soft" onClick={onClose}>Cancelar</button>
          <button type="submit" className="fa-btn fa-btn-primary">
            <Icon name="check" size={16} />
            {mode === 'edit' ? 'Salvar promoção' : 'Criar promoção'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export {
  DEVICE_TYPE_LABELS,
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
