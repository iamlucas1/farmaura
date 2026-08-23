import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { resolveMarketplaceAssetUrl } from "./marketplace-assets.js";
import { Icon } from "./marketplace-icons.jsx";

/* FARMAURA — shared UI components. Depends on Icon (icons.jsx). */

const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

function ProductVisual({ product: p, label = '', glyph, style, imageUrl = '' }) {
  // The backend already resolves the correct image for every policy (custom brand photo,
  // regulatory placeholder for prescription-restricted items, or the generic/default
  // placeholder driven by the product's is_generic flag) — see
  // build_marketplace_image_payload in marketplace_projection.py. Re-deriving the
  // placeholder here from the product's name/category text was redundant and drifted out
  // of sync with that flag-driven logic, so this only trusts server output now and keeps a
  // single local fallback for a genuinely broken/missing image URL.
  const primaryImageUrl = imageUrl || (p && p.imageUrl ? p.imageUrl : '');
  const fallbackImageUrl = resolveMarketplaceAssetUrl('PlaceHolder.png');
  const [currentImageUrl, setCurrentImageUrl] = React.useState(primaryImageUrl || fallbackImageUrl);

  React.useEffect(() => {
    setCurrentImageUrl(primaryImageUrl || fallbackImageUrl);
  }, [p && p.id, primaryImageUrl, fallbackImageUrl]);

  return (
    <div className="fa-ph" data-cat={p && p.cat} style={{ ...style, overflow: 'hidden', padding: 0 }}>
      <img
        src={currentImageUrl}
        alt={(p && (p.imageAlt || p.name)) || label || 'Produto Farmaura'}
        style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block', padding: '10px' }}
        onError={() => {
          if (currentImageUrl !== fallbackImageUrl) {
            setCurrentImageUrl(fallbackImageUrl);
          }
        }}
      />
    </div>
  );
}

function Stars({ value, reviews }) {
  return (
    <span className="fa-rating">
      <Icon name="star" size={14} />
      {value.toFixed(1)}
      {reviews != null && <span className="fa-faint" style={{ fontWeight: 600 }}>({reviews})</span>}
    </span>
  );
}

function FlagBadge({ tag }) {
  const map = {
    'oferta': { cls: 'fa-badge-vital', icon: 'percent', label: 'Oferta' },
    'mais-vendido': { cls: 'fa-badge-rose', icon: 'bolt', label: 'Mais vendido' },
    'receita': { cls: 'fa-badge-rx', icon: 'rx', label: 'Receita' },
    'assinatura': { cls: 'fa-badge-health', icon: 'repeat', label: 'Assinatura' },
  };
  const m = map[tag]; if (!m) return null;
  return <span className={'fa-badge ' + m.cls}><Icon name={m.icon} size={12} stroke={2.1} />{m.label}</span>;
}

function QtyStepper({ value, onChange, min = 1, max = 99 }) {
  return (
    <div className="fa-qty" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="menos"><Icon name="minus" size={16} /></button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="mais"><Icon name="plus" size={16} /></button>
    </div>
  );
}

// ---- Product card. variant: 'standard' | 'image' | 'list' ----
function ProductCard({ product: p, variant = 'standard', onOpen, onAdd, fav, onFav, notified, onNotify }) {
  const discount = p.discount > 0;
  const isSuperpromo = discount && p.promotionHighlight === 'superpromo';
  const isFixedDiscount = p.discountType === 'fixed';
  const discountAmount = discount && p.old != null ? Math.max(0, Number(p.old) - Number(p.price)) : 0;
  // Um desconto fixo em R$ vende melhor mostrado em reais ("R$10 OFF") do que convertido pra um
  // percentual pequeno e pouco chamativo — segue o que o admin configurou na promoção.
  const shortDiscountLabel = isFixedDiscount && discountAmount > 0 ? brl(discountAmount) + ' OFF' : '-' + p.discount + '%';
  const savingsLabel = discountAmount > 0 ? 'Economize ' + brl(discountAmount) : '';
  const outOfStock = Number(p.stock || 0) <= 0;
  const notifyBtn = (
    <button
      className="fa-btn fa-btn-soft fa-btn-sm"
      disabled={!!notified}
      onClick={(e) => { e.stopPropagation(); if (!notified && onNotify) onNotify(p.id, p.name); }}
    >
      <Icon name="bell" size={15} stroke={2.1} />{notified ? 'Vamos te avisar' : 'Avise-me quando chegar'}
    </button>
  );
  const flags = (
    <div className="fa-pc-flags">
      {isSuperpromo
        ? <span className="fa-pc-superbadge"><Icon name="bolt" size={14} stroke={2.6} />{shortDiscountLabel}</span>
        : discount && <span className="fa-badge fa-badge-vital fa-pc-discount-badge">{shortDiscountLabel}</span>}
      {p.tags.includes('mais-vendido') && variant !== 'list' && <span className="fa-badge fa-badge-rose"><Icon name="bolt" size={11} stroke={2.2} />Top</span>}
      {p.rx && <span className="fa-badge fa-badge-rx"><Icon name="rx" size={11} stroke={2.2} />Receita</span>}
      {outOfStock && <span className="fa-badge fa-badge-mist"><Icon name="minus" size={11} stroke={2.2} />Sem estoque</span>}
    </div>
  );
  const favBtn = (
    <button className="fa-pc-fav" data-on={fav ? '1' : '0'} aria-label="favoritar"
      onClick={(e) => { e.stopPropagation(); onFav && onFav(p.id); }}>
      <Icon name="heart" size={17} style={fav ? { fill: 'currentColor' } : undefined} />
    </button>
  );
  const savingsChip = savingsLabel && (
    <span className={isSuperpromo ? 'fa-pc-savings' : 'fa-pc-savings fa-pc-savings-mini'} data-super={isSuperpromo ? '1' : '0'}>{savingsLabel}</span>
  );
  const urgencyLine = p.urgencyLabel && (
    <div className="fa-pc-urgency"><Icon name="alert" size={12} stroke={2.6} />{p.urgencyLabel}</div>
  );

  if (variant === 'list') {
    return (
      <div className="fa-pc" data-style="list" data-out={outOfStock ? '1' : '0'} data-superpromo={isSuperpromo ? '1' : '0'} onClick={() => onOpen(p)}>
        <ProductVisual product={p} label={p.sub} />
        <div className="fa-pc-body">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{flags}</div>
          <div className="fa-pc-brand">{p.brand}</div>
          <div className="fa-pc-name" style={{ minHeight: 0 }}>{p.name}</div>
          <Stars value={p.rating} reviews={p.reviews} />
          <div className="fa-pc-price-row">
            <span className="fa-price">{brl(p.price)}</span>
            {p.old && <span className="fa-price-old">{brl(p.old)}</span>}
            {savingsChip}
            {p.tags.includes('assinatura') && <span className="fa-badge fa-badge-health"><Icon name="repeat" size={11} stroke={2.1} />Assinar</span>}
          </div>
          {urgencyLine}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {outOfStock ? notifyBtn : (
            <button className="fa-btn fa-btn-primary" onClick={(e) => { e.stopPropagation(); onAdd(p); }}>
              <Icon name="plus" size={16} stroke={2.2} />Adicionar
            </button>
          )}
        </div>
      </div>
    );
  }

  const body = (
    <>
      <div className="fa-pc-brand">{p.brand}</div>
      <div className="fa-pc-name">{p.name}</div>
      <Stars value={p.rating} reviews={p.reviews} />
      <div className="fa-pc-price-row">
        <span className="fa-price">{brl(p.price)}</span>
        {p.old && <span className="fa-price-old">{brl(p.old)}</span>}
      </div>
      {savingsChip}
      {urgencyLine}
      <div className="fa-pc-foot">
        {outOfStock ? notifyBtn : (
          <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={(e) => { e.stopPropagation(); onAdd(p); }}>
            <Icon name="cart" size={16} stroke={2} />Adicionar
          </button>
        )}
      </div>
    </>
  );

  if (variant === 'image') {
    return (
      <div className="fa-pc" data-style="image" data-out={outOfStock ? '1' : '0'} data-superpromo={isSuperpromo ? '1' : '0'} onClick={() => onOpen(p)}>
        {flags}{favBtn}
        <ProductVisual product={p} label={p.sub} style={{ aspectRatio: '4/3' }} />
        <div className="fa-pc-body">{body}</div>
      </div>
    );
  }

  // standard
  return (
    <div className="fa-pc" data-out={outOfStock ? '1' : '0'} data-superpromo={isSuperpromo ? '1' : '0'} onClick={() => onOpen(p)}>
      {flags}{favBtn}
      <ProductVisual product={p} label={p.sub} />
      {body}
    </div>
  );
}

// ---- Toggle switch ----
function Toggle({ on, onChange, ariaLabel }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel}
      className="fa-switch" data-on={on ? '1' : '0'} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <span className="fa-switch-knob" />
    </button>
  );
}

// ---- Modal stack: shared Escape-key hierarchy for every full-screen overlay/drawer in the app ----
// Clicking the backdrop never closes a modal (too easy to lose in-progress form data by accident)
// — only Esc does, and only the most recently opened one, one at a time, like a real dialog stack.
// Any full-page overlay component (ModalShell below, or a bespoke drawer that doesn't go through
// it) should call this hook instead of wiring its own keydown/body-overflow effect, so every modal
// in the app shares one stack and closes in the right order regardless of which component opened it.
let _modalStack = [];
let _nextModalStackId = 1;

function useModalStack(open, onClose) {
  const idRef = React.useRef(null);
  if (idRef.current === null) idRef.current = _nextModalStackId++;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    _modalStack.push({ id, close: () => onCloseRef.current() });

    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const top = _modalStack[_modalStack.length - 1];
      if (top && top.id === id) {
        e.stopPropagation();
        top.close();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      _modalStack = _modalStack.filter((entry) => entry.id !== id);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);
}

// ---- Modal shell (portaled to <body>; full-viewport overlay, viewport-centered,
//      body scroll locked). Use directly for custom layouts (e.g. chat). ----
function ModalShell({ open, onClose, children, maxw = 440, padded = true, className = '' }) {
  useModalStack(open, onClose);
  if (!open) return null;
  const node = (
    <div className="fa-modal-overlay">
      <div className={'fa-modal ' + className} style={{ maxWidth: maxw, padding: padded ? undefined : 0 }} role="dialog" aria-modal="true">
        <button className="fa-modal-x" onClick={onClose} aria-label="fechar"><Icon name="close" size={18} /></button>
        {children}
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

// ---- Titled modal (icon + title + sub + children) ----
function Modal({ open, onClose, title, sub, icon, children, maxw = 440 }) {
  return (
    <ModalShell open={open} onClose={onClose} maxw={maxw}>
      {icon && <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 16 }}><Icon name={icon} size={26} /></span>}
      {title && <h2 className="fa-h3" style={{ fontSize: 21 }}>{title}</h2>}
      {sub && <p className="fa-muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>{sub}</p>}
      {children}
    </ModalShell>
  );
}

// ---- Aura decoration (clean by default, controlled by --fa-aura) ----
function AuraLayer({ tone = 'rgba(122,13,22,1)' }) {
  return (
    <div className="fa-aura-layer" style={{ color: tone }}>
      <span className="fa-arc" style={{ width: 360, height: 360, borderWidth: 2, top: -140, right: -80 }} />
      <span className="fa-arc" style={{ width: 240, height: 240, borderWidth: 2, top: -60, right: 40, opacity: .35 }} />
      <span className="fa-arc" style={{ width: 480, height: 480, borderWidth: 1.5, bottom: -260, left: -120, opacity: .3 }} />
    </div>
  );
}

// Ícone de "info" com dica flutuante ao passar o mouse/focar (teclado) — único primitivo de tooltip
// do app, criado para explicar controles do console sem depender só de texto corrido. Sem toggle por
// clique: é um app de uso desktop/admin, hover + foco já cobre mouse e navegação por Tab.
function InfoTip({ text, icon = 'info', side = 'top' }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="fa-infotip"
      tabIndex={0}
      role="button"
      aria-label={text}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <Icon name={icon} size={14} />
      {open && <span className={`fa-infotip-bubble fa-infotip-${side}`} role="tooltip">{text}</span>}
    </span>
  );
}

// "Ofertas do dia": admin-curated product list (Marketplace → Ofertas do dia, console interno),
// resolved by both the home strip and the /offers extension page — shared here (not in either
// screen file) since this codebase has no cross-screen imports, every screen only imports shared
// logic from core/marketplace-*.jsx. The backend only guards an ordered list of refs — no product
// resolution happens server-side, the marketplace already has the full catalog loaded (`products`),
// and every CatalogItem carries an `aliases` list containing these same refs, so resolution happens
// client-side, same principle as home_brands matching by name.
function resolveDealOfTheDayProducts(dealOfTheDay, products) {
  const mode = (dealOfTheDay && dealOfTheDay.mode) || 'off';
  const refs = (dealOfTheDay && dealOfTheDay.productRefs) || [];
  if ((mode !== 'manual' && mode !== 'auto' && mode !== 'scheduled') || !refs.length) {
    return [];
  }
  return refs
    .map((ref) => products.find((product) => product.id === ref || (product.aliases || []).includes(ref)))
    .filter(Boolean);
}

// Faixa de urgência com contador regressivo até o horário de reset configurado no console (Ofertas
// do dia → horário do ciclo, default 00:00) — reforça que é a oferta "de hoje", sem relação com a
// curadoria em si (nos modos manual/agendado a lista permanece igual até o admin trocar/o dia mudar;
// no modo automático, é exatamente esse horário que dispara o próximo sorteio — ver
// PortalService._deal_cycle_elapsed/_current_cycle_date).
function DealCountdown({ resetTime }) {
  const computeRemaining = () => {
    const [hour, minute] = (resetTime || '00:00').split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour || 0, minute || 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return Math.max(0, next - now);
  };
  const [remaining, setRemaining] = useState(computeRemaining);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(computeRemaining()), 1000);
    return () => clearInterval(timer);
  }, [resetTime]);
  const pad = (n) => String(n).padStart(2, '0');
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <div className="fa-deal-countdown" aria-label="Tempo restante da oferta de hoje">
      <span className="fa-deal-countdown-seg"><b>{pad(hours)}</b><em>h</em></span>
      <span className="fa-deal-countdown-colon">:</span>
      <span className="fa-deal-countdown-seg"><b>{pad(minutes)}</b><em>min</em></span>
      <span className="fa-deal-countdown-colon">:</span>
      <span className="fa-deal-countdown-seg"><b>{pad(seconds)}</b><em>seg</em></span>
    </div>
  );
}

export {
  brl,
  AuraLayer,
  DealCountdown,
  FlagBadge,
  InfoTip,
  Modal,
  ModalShell,
  ProductCard,
  ProductVisual,
  QtyStepper,
  resolveDealOfTheDayProducts,
  Stars,
  Toggle,
  useModalStack,
};
