import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { StatCard } from "./dashboard-screen.jsx";

/*
farmaura/react/internal/screens/coupons-screen.jsx

Marketplace coupon management screen and modal for Farmaura internal portal.

Responsibilities:
- render the full coupon administration workspace for marketplace campaigns;
- provide creation and edition flows through a reusable modal dialog;
- expose activation, pause, duplication, and removal controls with live metrics;

Observations:
- coupon persistence is handled by the internal app state via the /portal/internal/coupons API;
- this module relies on shared UI primitives already attached to window;
*/

const COUPON_AUDIENCE_LABELS = {
  all: 'Todo o marketplace',
  new_customers: 'Novos clientes',
  recurring: 'Clientes recorrentes',
  prescription: 'Pedidos com receita',
};

const COUPON_SCOPE_LABELS = {
  all: 'Catálogo completo',
  categories: 'Categorias específicas',
  products: 'Remédios e produtos específicos',
};

const COUPON_STATUS_META = {
  active: { label: 'Ativo', badge: 'fa-badge-health', icon: 'check' },
  scheduled: { label: 'Agendado', badge: 'fa-badge-mist', icon: 'calendar' },
  expiring: { label: 'Expira em breve', badge: 'fa-badge-warn', icon: 'clock' },
  exhausted: { label: 'Esgotado', badge: 'fa-badge-rose', icon: 'minus' },
  expired: { label: 'Expirado', badge: 'fa-badge-mist', icon: 'close' },
  inactive: { label: 'Pausado', badge: 'fa-badge-mist', icon: 'pause' },
};

/** Split comma-separated targets into a normalized array. */
function parseCouponTargets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Convert target arrays into text inputs for forms. */
function stringifyCouponTargets(value) {
  return parseCouponTargets(value).join(', ');
}

/** Build a view-model draft for coupon forms. */
function createCouponDraft(sourceCoupon) {
  const coupon = sourceCoupon || {};
  return {
    code: coupon.code || '',
    title: coupon.title || '',
    description: coupon.description || '',
    discountType: coupon.discountType || 'percent',
    shippingDiscountMode: coupon.shippingDiscountMode || 'full',
    discountValue: coupon.discountType === 'shipping' && (coupon.shippingDiscountMode || 'full') === 'full' ? 0 : coupon.discountValue == null ? 10 : Number(coupon.discountValue || 0),
    minimumOrderValue: coupon.minimumOrderValue == null ? 0 : Number(coupon.minimumOrderValue || 0),
    maxDiscountValue: coupon.discountType === 'shipping' ? '' : coupon.maxDiscountValue == null ? '' : Number(coupon.maxDiscountValue || 0),
    startsAt: coupon.startsAt || '',
    endsAt: coupon.endsAt || '',
    usageLimit: coupon.usageLimit == null ? '' : Number(coupon.usageLimit || 0),
    perCustomerLimit: coupon.perCustomerLimit == null ? 1 : Number(coupon.perCustomerLimit || 1),
    audience: coupon.audience || 'all',
    scopeType: coupon.scopeType || 'all',
    targetCategories: parseCouponTargets(coupon.targetCategories || []),
    targetProducts: parseCouponTargets(coupon.targetProducts || []),
    firstPurchaseOnly: !!coupon.firstPurchaseOnly,
    stackable: !!coupon.stackable,
    active: coupon.active !== false,
    notes: coupon.notes || '',
  };
}

/** Normalize coupon code input for consistent identifiers. */
function normalizeCouponCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]+/g, '')
    .slice(0, 24);
}

/** Format monetary values in BRL. */
function formatCouponCurrency(value) {
  return 'R$ ' + Number(value || 0).toFixed(2).replace('.', ',');
}

/** Format percentage values for labels. */
function formatCouponPercent(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + '%';
}

/** Format local datetime labels from ISO-like input. */
function formatCouponDateTime(value) {
  if (!value) {
    return 'Sem agendamento';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sem agendamento';
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Calculate coupon status according to activation, schedule, and usage caps. */
function getCouponStatusKey(coupon) {
  const now = new Date();
  const startsAt = coupon && coupon.startsAt ? new Date(coupon.startsAt) : null;
  const endsAt = coupon && coupon.endsAt ? new Date(coupon.endsAt) : null;
  const usageLimit = coupon && coupon.usageLimit != null ? Number(coupon.usageLimit || 0) : null;
  const usageCount = Number(coupon && coupon.usageCount || 0);
  const msInDay = 24 * 60 * 60 * 1000;

  if (!coupon || coupon.active === false) {
    return 'inactive';
  }
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) {
    return 'scheduled';
  }
  if (usageLimit != null && usageLimit > 0 && usageCount >= usageLimit) {
    return 'exhausted';
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime()) {
    return 'expired';
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() - now.getTime() <= msInDay * 3) {
    return 'expiring';
  }
  return 'active';
}

/** Return a human-readable status metadata object. */
function getCouponStatusMeta(coupon) {
  return COUPON_STATUS_META[getCouponStatusKey(coupon)] || COUPON_STATUS_META.inactive;
}

/** Format discount label depending on coupon type. */
function formatCouponDiscount(coupon) {
  if (coupon.discountType === 'shipping') {
    if ((coupon.shippingDiscountMode || 'full') === 'percent') {
      return formatCouponPercent(coupon.discountValue) + ' no frete';
    }
    if ((coupon.shippingDiscountMode || 'full') === 'fixed') {
      return formatCouponCurrency(coupon.discountValue) + ' no frete';
    }
    return 'Frete grátis';
  }
  if (coupon.discountType === 'fixed') {
    return formatCouponCurrency(coupon.discountValue);
  }
  return formatCouponPercent(coupon.discountValue);
}

/** Calculate usage progress percentage with sensible bounds. */
function getCouponUsageProgress(coupon) {
  const usageLimit = coupon.usageLimit == null ? null : Number(coupon.usageLimit || 0);
  if (!usageLimit || usageLimit <= 0) {
    return Math.min(100, Number(coupon.usageCount || 0) > 0 ? 24 : 0);
  }
  return Math.max(0, Math.min(100, Math.round(Number(coupon.usageCount || 0) / usageLimit * 100)));
}

/** Build human-readable scope labels for the coupon. */
function getCouponScopeBadges(coupon) {
  const badges = [];
  badges.push(COUPON_SCOPE_LABELS[coupon.scopeType] || COUPON_SCOPE_LABELS.all);
  if (coupon.scopeType === 'categories') {
    parseCouponTargets(coupon.targetCategories).slice(0, 3).forEach((item) => badges.push(item));
    if (parseCouponTargets(coupon.targetCategories).length > 3) {
      badges.push('+' + (parseCouponTargets(coupon.targetCategories).length - 3));
    }
  }
  if (coupon.scopeType === 'products') {
    parseCouponTargets(coupon.targetProducts).slice(0, 3).forEach((item) => badges.push(item));
    if (parseCouponTargets(coupon.targetProducts).length > 3) {
      badges.push('+' + (parseCouponTargets(coupon.targetProducts).length - 3));
    }
  }
  if (coupon.firstPurchaseOnly) {
    badges.push('Primeira compra');
  }
  return badges;
}

/** Build searchable coupon text including scope metadata. */
function buildCouponSearchText(coupon) {
  return [
    coupon.code,
    coupon.title,
    coupon.description,
    coupon.notes,
    stringifyCouponTargets(coupon.targetCategories),
    stringifyCouponTargets(coupon.targetProducts),
  ].join(' ').toLowerCase();
}

/** Normalize and validate scope fields before persistence. */
function buildCouponPayloadFromDraft(draft) {
  return {
    ...draft,
    scopeType: draft.scopeType || 'all',
    targetCategories: parseCouponTargets(draft.scopeType === 'categories' ? (draft.targetCategories || draft.targetCategoriesText || []) : []),
    targetProducts: parseCouponTargets(draft.scopeType === 'products' ? (draft.targetProducts || draft.targetProductsText || []) : []),
    shippingDiscountMode: draft.discountType === 'shipping' ? (draft.shippingDiscountMode || 'full') : 'full',
    firstPurchaseOnly: !!draft.firstPurchaseOnly,
  };
}

/** Build stable category options from inventory records. */
function buildCouponCategoryOptions(inventory) {
  return [...new Set((inventory || [])
    .filter((item) => item && item.active !== false)
    .map((item) => String(item.cat || 'Medicamentos').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR'))
    .map((value) => ({ value, label: value }));
}

/** Build stable product options from inventory records. */
function buildCouponProductOptions(inventory) {
  const unique = new Map();
  (inventory || [])
    .filter((item) => item && item.active !== false && String(item.name || '').trim())
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR'))
    .forEach((item) => {
      const value = String(item.name || '').trim();
      const key = value.toLowerCase();
      if (unique.has(key)) {
        return;
      }
      unique.set(key, {
        value,
        label: value,
        meta: [
          String(item.brand || '').trim(),
          String(item.cat || 'Medicamentos').trim(),
          'Estoque ' + Number(item.qty || 0),
        ].filter(Boolean).join(' · '),
      });
    });
  return Array.from(unique.values());
}

/** Render a searchable multi-select bound to inventory-derived options. */
function CouponInfoHint({ text, align = 'center' }) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [tipStyle, setTipStyle] = useState({ top: 0, left: 0, width: 260, arrowLeft: 24 });

  function updatePosition() {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const tooltipWidth = Math.min(260, Math.max(180, viewportWidth - 24));
    const margin = 12;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    if (align === 'start') {
      left = rect.left;
    }
    if (align === 'end') {
      left = rect.right - tooltipWidth;
    }

    left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
    const centerX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(14, Math.min(tooltipWidth - 14, centerX - left));
    setTipStyle({
      top: rect.top - 10,
      left,
      width: tooltipWidth,
      arrowLeft,
    });
  }

  function openTip() {
    updatePosition();
    setOpen(true);
  }

  function closeTip() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const syncPosition = () => updatePosition();
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);
    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
    };
  }, [open, align]);

  return (
    <span
      ref={triggerRef}
      className="cpn-info"
      tabIndex={0}
      aria-label={text}
      onMouseEnter={openTip}
      onMouseLeave={closeTip}
      onFocus={openTip}
      onBlur={closeTip}
    >
      <Icon name="info" size={13} />
      {open && createPortal(
        <span className="cpn-info-tip" style={{ top: tipStyle.top, left: tipStyle.left, width: tipStyle.width }}>
          {text}
          <span className="cpn-info-tip-arrow" style={{ left: tipStyle.arrowLeft }} />
        </span>,
        document.body,
      )}
    </span>
  );
}

function CouponFieldLabel({ label, tooltip, align = 'center' }) {
  return (
    <span className="cpn-field-label">
      <span>{label}</span>
      <CouponInfoHint text={tooltip} align={align} />
    </span>
  );
}

function CouponTargetPicker({ label, tooltip, align = 'start', placeholder, options, selectedValues, onChange, emptyMessage, searchPlaceholder }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const selected = Array.isArray(selectedValues) ? selectedValues : [];
  const selectedKeySet = new Set(selected.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
  const filteredOptions = options.filter((option) => {
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [option.label, option.meta].join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  /** Toggle a value in the current multi-selection. */
  function toggleValue(value) {
    const normalizedValue = String(value || '').trim();
    const normalizedKey = normalizedValue.toLowerCase();
    if (!normalizedValue) {
      return;
    }
    if (selectedKeySet.has(normalizedKey)) {
      onChange(selected.filter((item) => String(item || '').trim().toLowerCase() !== normalizedKey));
      return;
    }
    onChange([...selected, normalizedValue]);
  }

  /** Remove a single selected value. */
  function removeValue(value) {
    const normalizedKey = String(value || '').trim().toLowerCase();
    onChange(selected.filter((item) => String(item || '').trim().toLowerCase() !== normalizedKey));
  }

  return (
    <div className="fa-field">
      <label><CouponFieldLabel label={label} tooltip={tooltip} align={align} /></label>
      <div className="cpn-picker">
        <input
          className="fa-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder || placeholder}
        />
        {selected.length > 0 && (
          <div className="cpn-picker-selected">
            {selected.map((value) => (
              <button key={value} type="button" className="cpn-picker-chip" onClick={() => removeValue(value)}>
                <span>{value}</span>
                <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        )}
        <div className="cpn-picker-list" role="listbox" aria-label={label}>
          {filteredOptions.length ? filteredOptions.map((option) => {
            const checked = selectedKeySet.has(String(option.value || '').trim().toLowerCase());
            return (
              <button
                key={option.value}
                type="button"
                className="cpn-picker-option"
                data-on={checked ? '1' : '0'}
                onClick={() => toggleValue(option.value)}
              >
                <span className="cpn-picker-check">
                  {checked && <Icon name="check" size={13} stroke={2.8} />}
                </span>
                <span className="cpn-picker-copy">
                  <strong>{option.label}</strong>
                  {option.meta && <small>{option.meta}</small>}
                </span>
              </button>
            );
          }) : <div className="cpn-picker-empty">{emptyMessage || 'Nenhuma opção encontrada no estoque.'}</div>}
        </div>
      </div>
    </div>
  );
}

/** Render the main coupon administration experience. */
function CouponsScreen({ ctx }) {
  const { coupons, openCouponCreate, openCouponEdit, toggleCouponState, removeCoupon, duplicateCoupon, onLogout } = ctx;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  const enrichedCoupons = coupons.map((coupon) => ({
    coupon,
    statusKey: getCouponStatusKey(coupon),
    statusMeta: getCouponStatusMeta(coupon),
    usageProgress: getCouponUsageProgress(coupon),
  }));

  const stats = {
    total: coupons.length,
    active: enrichedCoupons.filter((entry) => entry.statusKey === 'active' || entry.statusKey === 'expiring').length,
    scheduled: enrichedCoupons.filter((entry) => entry.statusKey === 'scheduled').length,
    expiring: enrichedCoupons.filter((entry) => entry.statusKey === 'expiring').length,
    redeemed: coupons.reduce((total, coupon) => total + Number(coupon.usageCount || 0), 0),
  };

  const filteredCoupons = enrichedCoupons.filter(({ coupon, statusKey }) => {
    if (statusFilter !== 'all' && statusKey !== statusFilter) {
      return false;
    }
    if (audienceFilter !== 'all' && coupon.audience !== audienceFilter) {
      return false;
    }
    if (scopeFilter === 'first_purchase' && !coupon.firstPurchaseOnly) {
      return false;
    }
    if (scopeFilter !== 'all' && scopeFilter !== 'first_purchase' && coupon.scopeType !== scopeFilter) {
      return false;
    }
    if (query && !buildCouponSearchText(coupon).includes(query.toLowerCase())) {
      return false;
    }
    return true;
  }).sort((left, right) => {
    const leftActiveRank = ['active', 'expiring', 'scheduled', 'inactive', 'exhausted', 'expired'].indexOf(left.statusKey);
    const rightActiveRank = ['active', 'expiring', 'scheduled', 'inactive', 'exhausted', 'expired'].indexOf(right.statusKey);
    if (leftActiveRank !== rightActiveRank) {
      return leftActiveRank - rightActiveRank;
    }
    return String(right.coupon.updatedAt || '').localeCompare(String(left.coupon.updatedAt || ''));
  });

  const topCoupons = [...enrichedCoupons]
    .sort((left, right) => Number(right.coupon.usageCount || 0) - Number(left.coupon.usageCount || 0))
    .slice(0, 4);

  return (
    <>
      <Topbar title="Cupons" sub="Campanhas, regras promocionais e governança do marketplace" onLogout={onLogout}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por código, campanha, categoria ou produto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={openCouponCreate}>
          <Icon name="plus" size={15} />
          Novo cupom
        </button>
      </Topbar>

      <div className="ph-content ph-content-wide" data-screen-label="Gestão de cupons do marketplace">
        <div className="cpn-kpis">
          <StatCard icon="gift" value={stats.active} label="Cupons ativos" tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }} />
          <StatCard icon="calendar" value={stats.scheduled} label="Campanhas agendadas" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
          <StatCard icon="clock" value={stats.expiring} label="Expiram em 72h" tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }} />
          <StatCard icon="repeat" value={stats.redeemed} label="Resgates acumulados" tint={{ bg: 'var(--fa-rose-soft)', fg: 'var(--fa-primary)' }} />
        </div>

        <div className="cpn-grid">
          <div>
            <div className="cpn-filterbar">
              <div className="ph-seg">
                <button data-on={statusFilter === 'all' ? '1' : '0'} onClick={() => setStatusFilter('all')}>Todos <span className="ph-seg-n">{stats.total}</span></button>
                <button data-on={statusFilter === 'active' ? '1' : '0'} onClick={() => setStatusFilter('active')}>Ativos <span className="ph-seg-n">{stats.active}</span></button>
                <button data-on={statusFilter === 'scheduled' ? '1' : '0'} onClick={() => setStatusFilter('scheduled')}>Agendados <span className="ph-seg-n">{stats.scheduled}</span></button>
                <button data-on={statusFilter === 'expiring' ? '1' : '0'} onClick={() => setStatusFilter('expiring')}>Expirando <span className="ph-seg-n">{stats.expiring}</span></button>
              </div>
              <select className="fa-select" style={{ minWidth: 220 }} value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)}>
                <option value="all">Todos os públicos</option>
                <option value="new_customers">Novos clientes</option>
                <option value="recurring">Clientes recorrentes</option>
                <option value="prescription">Pedidos com receita</option>
              </select>
              <select className="fa-select" style={{ minWidth: 240 }} value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
                <option value="all">Todos os escopos</option>
                <option value="products">Remédios e produtos específicos</option>
                <option value="categories">Categorias específicas</option>
                <option value="first_purchase">Apenas primeira compra</option>
              </select>
            </div>

            <div className="ph-table-wrap cpn-table-wrap">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th>Desconto</th>
                    <th>Janela</th>
                    <th>Uso</th>
                    <th>Escopo</th>
                    <th>Público</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoupons.map(({ coupon, statusMeta, usageProgress }) => (
                    <tr key={coupon.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span className="cpn-code"><Icon name="tag" size={13} />{coupon.code}</span>
                            <span className={'fa-badge ' + statusMeta.badge}><Icon name={statusMeta.icon} size={11} />{statusMeta.label}</span>
                            {coupon.stackable && <span className="fa-badge fa-badge-mist"><Icon name="repeat" size={11} />Acumulável</span>}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{coupon.title}</div>
                            <div className="ph-cell-sub">{coupon.description || 'Sem descrição operacional.'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{formatCouponDiscount(coupon)}</div>
                        <div className="ph-cell-sub">
                          Pedido mínimo {formatCouponCurrency(coupon.minimumOrderValue)}
                          {coupon.maxDiscountValue != null && coupon.maxDiscountValue !== '' ? ' · teto ' + formatCouponCurrency(coupon.maxDiscountValue) : ''}
                        </div>
                      </td>
                      <td>
                        <div className="ph-cell-sub">Início</div>
                        <div style={{ fontWeight: 700 }}>{formatCouponDateTime(coupon.startsAt)}</div>
                        <div className="ph-cell-sub" style={{ marginTop: 6 }}>Fim · {formatCouponDateTime(coupon.endsAt)}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{Number(coupon.usageCount || 0)}{coupon.usageLimit ? ' / ' + coupon.usageLimit : ''}</div>
                        <div className="prc-bar" style={{ marginTop: 8 }}><i style={{ width: usageProgress + '%', background: usageProgress >= 85 ? 'var(--fa-warn)' : 'var(--fa-success)' }} /></div>
                        <div className="ph-cell-sub" style={{ marginTop: 6 }}>Limite por cliente · {coupon.perCustomerLimit || 1}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {getCouponScopeBadges(coupon).map((badge) => <span key={badge} className="fa-badge fa-badge-mist">{badge}</span>)}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{COUPON_AUDIENCE_LABELS[coupon.audience] || COUPON_AUDIENCE_LABELS.all}</div>
                        <div className="ph-cell-sub">{coupon.notes || 'Sem observação extra.'}</div>
                      </td>
                      <td>
                        <div className="cpn-row-actions">
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => openCouponEdit(coupon.id)}><Icon name="edit" size={14} />Editar</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => duplicateCoupon(coupon.id)}><Icon name="plusCircle" size={14} />Duplicar</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => toggleCouponState(coupon.id, !coupon.active)}>
                            <Icon name={coupon.active ? 'pause' : 'play'} size={14} />
                            {coupon.active ? 'Pausar' : 'Ativar'}
                          </button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ color: 'var(--fa-error)' }} onClick={() => removeCoupon(coupon.id)}>
                            <Icon name="trash" size={14} />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCoupons.length === 0 && (
                <div className="ph-empty">
                  <span className="fa-iconbox"><Icon name="gift" size={28} /></span>
                  <div>Nenhum cupom encontrado com os filtros atuais.</div>
                </div>
              )}
            </div>
          </div>

          <div className="cpn-list">
            <AnCard icon="activity" title="Visão operacional" sub="Acompanhe pressão de uso e campanhas que exigem atenção imediata">
              <div className="cpn-sidecard">
                <div className="cpn-statline"><span>Cupons com consumo alto</span><strong>{enrichedCoupons.filter((entry) => entry.usageProgress >= 70).length}</strong></div>
                <div className="cpn-statline"><span>Pausados manualmente</span><strong>{enrichedCoupons.filter((entry) => entry.statusKey === 'inactive').length}</strong></div>
                <div className="cpn-statline"><span>Cupons por categoria</span><strong>{enrichedCoupons.filter((entry) => entry.coupon.scopeType === 'categories').length}</strong></div>
                <div className="cpn-statline"><span>Primeira compra</span><strong>{enrichedCoupons.filter((entry) => entry.coupon.firstPurchaseOnly).length}</strong></div>
              </div>
            </AnCard>

            <AnCard icon="trophy" title="Mais resgatados" sub="Campanhas com maior tração recente" tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }}>
              {topCoupons.length ? topCoupons.map(({ coupon, statusMeta, usageProgress }) => (
                <div key={coupon.id} className="cpn-summary">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{coupon.code}</strong>
                      <span className={'fa-badge ' + statusMeta.badge}><Icon name={statusMeta.icon} size={11} />{statusMeta.label}</span>
                    </div>
                    <div className="ph-cell-sub" style={{ marginTop: 4 }}>{coupon.title}</div>
                    <div className="prc-bar" style={{ marginTop: 8, width: 180 }}><i style={{ width: usageProgress + '%', background: 'var(--fa-primary)' }} /></div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{Number(coupon.usageCount || 0)} usos</div>
                    <div className="ph-cell-sub">{formatCouponDiscount(coupon)}</div>
                  </div>
                </div>
              )) : <div className="ph-cell-sub">Sem resgates registrados até o momento.</div>}
            </AnCard>

            <AnCard icon="sparkle" title="Boas práticas" sub="Checklist rápido para publicar promoções com menor risco de margem">
              <div className="cpn-badges">
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Use categorias para giro controlado</span>
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Aplique produto específico em remédios âncora</span>
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Restrinja primeira compra quando necessário</span>
                <span className="fa-badge fa-badge-mist"><Icon name="check" size={11} />Revise teto e limite por cliente</span>
              </div>
            </AnCard>
          </div>
        </div>
      </div>
    </>
  );
}

/** Render the reusable create/edit coupon modal. */
function CouponModal({ mode, coupon, inventory, onClose, onCreate, onUpdate }) {
  const [draft, setDraft] = useState(() => createCouponDraft(coupon));
  const [error, setError] = useState('');
  const categoryOptions = useMemo(() => buildCouponCategoryOptions(inventory), [inventory]);
  const productOptions = useMemo(() => buildCouponProductOptions(inventory), [inventory]);

  useEffect(() => {
    setDraft(createCouponDraft(coupon));
    setError('');
  }, [coupon, mode]);

  /** Update a single form field. */
  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  /** Validate and submit the coupon payload. */
  function handleSubmit(event) {
    event.preventDefault();
    const normalizedCode = normalizeCouponCode(draft.code);
    const normalizedTitle = String(draft.title || '').trim();
    const discountValue = Number(draft.discountValue || 0);
    const minimumOrderValue = Number(draft.minimumOrderValue || 0);
    const startTimestamp = draft.startsAt ? new Date(draft.startsAt).getTime() : null;
    const endTimestamp = draft.endsAt ? new Date(draft.endsAt).getTime() : null;
    const normalizedPayload = buildCouponPayloadFromDraft(draft);

    if (!normalizedCode || normalizedCode.length < 4) {
      setError('Informe um código com pelo menos 4 caracteres válidos.');
      return;
    }
    if (!normalizedTitle) {
      setError('Informe um nome operacional para a campanha.');
      return;
    }
    if ((draft.discountType !== 'shipping' || draft.shippingDiscountMode !== 'full') && discountValue <= 0) {
      setError('O desconto precisa ser maior que zero.');
      return;
    }
    if ((draft.discountType === 'percent' || (draft.discountType === 'shipping' && draft.shippingDiscountMode === 'percent')) && discountValue > 100) {
      setError('O desconto percentual não pode passar de 100%.');
      return;
    }
    if (minimumOrderValue < 0) {
      setError('O pedido mínimo não pode ser negativo.');
      return;
    }
    if (startTimestamp != null && endTimestamp != null && endTimestamp <= startTimestamp) {
      setError('A data final deve ser posterior ao início da campanha.');
      return;
    }
    if (normalizedPayload.scopeType === 'categories' && normalizedPayload.targetCategories.length === 0) {
      setError('Selecione pelo menos uma categoria para o cupom específico.');
      return;
    }
    if (normalizedPayload.scopeType === 'products' && normalizedPayload.targetProducts.length === 0) {
      setError('Selecione pelo menos um remédio ou produto para o cupom específico.');
      return;
    }

    const payload = {
      ...draft,
      ...normalizedPayload,
      code: normalizedCode,
      title: normalizedTitle,
      description: String(draft.description || '').trim(),
      notes: String(draft.notes || '').trim(),
    };

    if (mode === 'edit' && coupon) {
      onUpdate(coupon.id, payload);
      return;
    }
    onCreate(payload);
  }

  return (
    <ModalShell open={true} onClose={onClose} maxw={760} className="cpn-modal">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
        <span className="fa-iconbox" style={{ width: 52, height: 52, flex: 'none' }}><Icon name="gift" size={24} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>{mode === 'edit' ? 'Editar cupom' : 'Criar cupom'}</h2>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
            Configure código, desconto, vigência, público e escopo por produto, categoria ou primeira compra.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label><CouponFieldLabel label="Código do cupom" tooltip="Identificador que o cliente digita no checkout. Use um código curto, fácil de lembrar e sem espaços, por exemplo BEMVINDO15." align="start" /></label>
            <input className="fa-input" value={draft.code} onChange={(event) => setField('code', normalizeCouponCode(event.target.value))} placeholder="BEMVINDO15" />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Campanha" tooltip="Nome interno da ação promocional. Preencha com um título claro para o time identificar o objetivo do cupom." align="end" /></label>
            <input className="fa-input" value={draft.title} onChange={(event) => setField('title', event.target.value)} placeholder="Primeira compra" />
          </div>
        </div>

        <div className="fa-field">
          <label><CouponFieldLabel label="Descrição operacional" tooltip="Resumo rápido do contexto da campanha. Informe em uma frase onde o cupom será usado ou qual estratégia ele atende." align="start" /></label>
          <input className="fa-input" value={draft.description} onChange={(event) => setField('description', event.target.value)} placeholder="Resumo curto para o time interno" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label><CouponFieldLabel label="Tipo" tooltip="Define se o cupom dará desconto percentual, valor fixo em reais ou frete grátis calculado sobre a entrega do pedido." align="start" /></label>
            <select className="fa-select" value={draft.discountType} onChange={(event) => setField('discountType', event.target.value)}>
              <option value="percent">Percentual</option>
              <option value="fixed">Valor fixo</option>
              <option value="shipping">Desconto no frete</option>
            </select>
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label={draft.discountType === 'shipping' ? (draft.shippingDiscountMode === 'percent' ? 'Percentual no frete' : draft.shippingDiscountMode === 'fixed' ? 'Valor no frete' : 'Frete grátis') : draft.discountType === 'fixed' ? 'Desconto em R$' : 'Desconto em %'} tooltip={draft.discountType === 'shipping' ? draft.shippingDiscountMode === 'percent' ? 'Percentual que será abatido somente do valor de entrega do pedido.' : draft.shippingDiscountMode === 'fixed' ? 'Valor fixo que será abatido somente da taxa de entrega do pedido.' : 'Para frete grátis, o desconto será calculado automaticamente com base na taxa de entrega do pedido. Nenhum valor manual é necessário.' : draft.discountType === 'fixed' ? 'Valor fixo que será abatido do pedido quando o cupom for aplicado. Preencha o total em reais.' : 'Percentual de abatimento aplicado sobre o pedido elegível. Informe apenas o número da porcentagem.'} align="center" /></label>
            <input className="fa-input" type="number" min="0" step={draft.discountType === 'fixed' ? '0.01' : '0.1'} value={draft.discountType === 'shipping' && draft.shippingDiscountMode === 'full' ? 0 : draft.discountValue} onChange={(event) => setField('discountValue', event.target.value)} disabled={draft.discountType === 'shipping' && draft.shippingDiscountMode === 'full'} />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Teto do desconto em R$" tooltip="Limite máximo de desconto que esse cupom pode conceder. Use para evitar descontos altos demais em pedidos com valor elevado. Para frete grátis, este campo não é usado." align="end" /></label>
            <input className="fa-input" type="number" min="0" step="0.01" value={draft.discountType === 'shipping' ? '' : draft.maxDiscountValue} onChange={(event) => setField('maxDiscountValue', event.target.value)} placeholder={draft.discountType === 'shipping' ? 'Não se aplica' : 'Ex.: 25,00'} disabled={draft.discountType === 'shipping'} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label><CouponFieldLabel label="Pedido mínimo" tooltip="Valor mínimo que o carrinho precisa atingir para liberar o uso do cupom. Preencha o total em reais." align="start" /></label>
            <input className="fa-input" type="number" min="0" step="0.01" value={draft.minimumOrderValue} onChange={(event) => setField('minimumOrderValue', event.target.value)} />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Limite total" tooltip="Quantidade máxima de vezes que o cupom pode ser resgatado no marketplace. Deixe em branco se não quiser limitar." align="center" /></label>
            <input className="fa-input" type="number" min="0" step="1" value={draft.usageLimit} onChange={(event) => setField('usageLimit', event.target.value)} placeholder="Opcional" />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Limite por cliente" tooltip="Número máximo de usos permitidos para cada cliente. Use 1 quando o cupom deve ser resgatado só uma vez por conta." align="end" /></label>
            <input className="fa-input" type="number" min="1" step="1" value={draft.perCustomerLimit} onChange={(event) => setField('perCustomerLimit', event.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label><CouponFieldLabel label="Início" tooltip="Data e hora em que o cupom começa a valer. Deixe vazio apenas se a campanha puder iniciar imediatamente." align="start" /></label>
            <input className="fa-input" type="datetime-local" value={draft.startsAt} onChange={(event) => setField('startsAt', event.target.value)} />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Fim" tooltip="Data e hora limite para uso do cupom. Defina esse campo para encerrar a campanha automaticamente." align="center" /></label>
            <input className="fa-input" type="datetime-local" value={draft.endsAt} onChange={(event) => setField('endsAt', event.target.value)} />
          </div>
          <div className="fa-field">
            <label><CouponFieldLabel label="Público" tooltip="Segmento de clientes que poderá usar o cupom. Escolha entre todo o marketplace, novos clientes, recorrentes ou pedidos com receita." align="end" /></label>
            <select className="fa-select" value={draft.audience} onChange={(event) => setField('audience', event.target.value)}>
              <option value="all">Todo o marketplace</option>
              <option value="new_customers">Novos clientes</option>
              <option value="recurring">Clientes recorrentes</option>
              <option value="prescription">Pedidos com receita</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="fa-field">
            <label><CouponFieldLabel label="Escopo do cupom" tooltip="Define onde o cupom será aplicado: em todo o catálogo, apenas em categorias específicas ou só em produtos determinados." align="start" /></label>
            <select className="fa-select" value={draft.scopeType} onChange={(event) => setField('scopeType', event.target.value)}>
              <option value="all">Catálogo completo</option>
              <option value="categories">Categorias específicas</option>
              <option value="products">Remédios e produtos específicos</option>
            </select>
          </div>
          {draft.discountType === 'shipping' && (
            <div className="fa-field">
              <label><CouponFieldLabel label="Modo do desconto no frete" tooltip="Escolha se o cupom vai zerar o frete, abater um valor fixo da entrega ou aplicar um percentual sobre a taxa de entrega." align="start" /></label>
              <select className="fa-select" value={draft.shippingDiscountMode || 'full'} onChange={(event) => setField('shippingDiscountMode', event.target.value)}>
                <option value="full">Frete grátis</option>
                <option value="fixed">Valor fixo no frete</option>
                <option value="percent">Percentual no frete</option>
              </select>
            </div>
          )}
          <div className="fa-row">
            <div className="fa-row-main">
              <div className="fa-row-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Apenas primeira compra<CouponInfoHint text="Ative quando o cupom só puder ser usado no primeiro pedido do cliente no marketplace. Ideal para aquisição de novos compradores." align="end" /></div>
              <div className="fa-row-desc">Restringe o uso ao primeiro pedido do cliente no marketplace.</div>
            </div>
            <Toggle on={!!draft.firstPurchaseOnly} onChange={(value) => setField('firstPurchaseOnly', value)} ariaLabel="Apenas primeira compra" />
          </div>
        </div>

        {draft.scopeType === 'categories' && (
          <CouponTargetPicker
            label="Categorias elegíveis"
            tooltip="Selecione quais categorias do estoque poderão receber o desconto. Escolha uma ou mais categorias válidas para restringir a campanha."
            align="start"
            placeholder="Buscar categorias do estoque"
            searchPlaceholder="Buscar categorias vinculadas ao estoque"
            options={categoryOptions}
            selectedValues={draft.targetCategories}
            onChange={(value) => setField('targetCategories', value)}
            emptyMessage="Nenhuma categoria encontrada no estoque atual."
          />
        )}

        {draft.scopeType === 'products' && (
          <CouponTargetPicker
            label="Remédios ou produtos elegíveis"
            tooltip="Selecione os itens específicos do estoque que poderão usar o cupom. A campanha ficará restrita apenas aos produtos marcados."
            align="start"
            placeholder="Buscar itens do estoque"
            searchPlaceholder="Buscar remédios e produtos vinculados ao estoque"
            options={productOptions}
            selectedValues={draft.targetProducts}
            onChange={(value) => setField('targetProducts', value)}
            emptyMessage="Nenhum item elegível encontrado no estoque atual."
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="fa-row">
            <div className="fa-row-main">
              <div className="fa-row-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Cupom ativo ao salvar<CouponInfoHint text="Mantém o cupom pronto para uso assim que for salvo, respeitando agenda, escopo e demais limites configurados." align="start" /></div>
              <div className="fa-row-desc">Permite publicação imediata conforme agenda e limites definidos.</div>
            </div>
            <Toggle on={!!draft.active} onChange={(value) => setField('active', value)} ariaLabel="Cupom ativo" />
          </div>
          <div className="fa-row">
            <div className="fa-row-main">
              <div className="fa-row-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Acumulável com outras campanhas<CouponInfoHint text="Permite combinar este cupom com outras promoções. Ative apenas quando a regra comercial e a margem estiverem protegidas." align="end" /></div>
              <div className="fa-row-desc">Use apenas quando a margem já estiver protegida por pedido mínimo e teto.</div>
            </div>
            <Toggle on={!!draft.stackable} onChange={(value) => setField('stackable', value)} ariaLabel="Cupom acumulável" />
          </div>
        </div>

        <div className="fa-field">
          <label><CouponFieldLabel label="Observações internas" tooltip="Espaço para registrar contexto operacional da campanha, como canal, região, mídia ou restrições que o time precisa lembrar." align="start" /></label>
          <textarea className="fa-input" style={{ height: 112, paddingTop: 12, resize: 'vertical' }} value={draft.notes} onChange={(event) => setField('notes', event.target.value)} placeholder="Canal de mídia, região priorizada, restrições operacionais..." />
        </div>

        {error && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13.5 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" className="fa-btn fa-btn-soft" onClick={onClose}>Cancelar</button>
          <button type="submit" className="fa-btn fa-btn-primary">
            <Icon name="check" size={16} />
            {mode === 'edit' ? 'Salvar cupom' : 'Criar cupom'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

export { COUPON_AUDIENCE_LABELS, COUPON_SCOPE_LABELS, COUPON_STATUS_META, CouponFieldLabel, CouponInfoHint, CouponModal, CouponTargetPicker, CouponsScreen, buildCouponCategoryOptions, buildCouponPayloadFromDraft, buildCouponProductOptions, buildCouponSearchText, createCouponDraft, formatCouponCurrency, formatCouponDateTime, formatCouponDiscount, formatCouponPercent, getCouponScopeBadges, getCouponStatusKey, getCouponStatusMeta, getCouponUsageProgress, normalizeCouponCode, parseCouponTargets, stringifyCouponTargets };
