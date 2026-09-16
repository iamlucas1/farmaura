import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { resolveMarketplaceAssetUrl } from "./marketplace-assets.js";
import { Icon } from "./marketplace-icons.jsx";

/* FARMAURA — shared UI components. Depends on Icon (icons.jsx). */

const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

function ProductVisual({ product: p, label = '', glyph, style, imageUrl = '', loading = 'lazy' }) {
  // The backend already resolves the correct image for every policy (custom brand photo,
  // regulatory placeholder for prescription-restricted items, or the generic/default
  // placeholder driven by the product's is_generic flag) — see
  // build_marketplace_image_payload in marketplace_projection.py. Re-deriving the
  // placeholder here from the product's name/category text was redundant and drifted out
  // of sync with that flag-driven logic, so this only trusts server output now and keeps a
  // single local fallback for a genuinely broken/missing image URL.
  const primaryImageUrl = imageUrl || (p && p.imageUrl ? p.imageUrl : '');
  const fallbackImageUrl = resolveMarketplaceAssetUrl('PlaceHolder.webp');
  const [currentImageUrl, setCurrentImageUrl] = React.useState(primaryImageUrl || fallbackImageUrl);

  React.useEffect(() => {
    setCurrentImageUrl(primaryImageUrl || fallbackImageUrl);
  }, [p && p.id, primaryImageUrl, fallbackImageUrl]);

  return (
    <div className="fa-ph" data-cat={p && p.cat} style={{ ...style, overflow: 'hidden', padding: 0, background: '#fff' }}>
      <img
        src={currentImageUrl}
        alt={(p && (p.imageAlt || p.name)) || label || 'Produto Farmaura'}
        loading={loading}
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

// Clickable 1-5 star rating input (as opposed to `Stars`, which only ever displays a
// read-only average). Used by the product review flow — see ProductReviewModal in
// screens/account-shared.jsx.
function StarPicker({ value = 0, onChange, size = 26 }) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;
  return (
    <div className="fa-star-picker" role="radiogroup" aria-label="Nota de 1 a 5 estrelas" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={n + (n > 1 ? ' estrelas' : ' estrela')}
          className="fa-star-picker-btn"
          style={{ color: n <= shown ? 'var(--fa-warn)' : 'var(--fa-mist)' }}
          onMouseEnter={() => setHovered(n)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(0)}
          onClick={() => onChange && onChange(n)}
        >
          <Icon name="star" size={size} />
        </button>
      ))}
    </div>
  );
}

// Horizontal scroll-snap carousel with true infinite wraparound (clones the first/last few
// items on either end so crossing the boundary re-snaps silently, mid-scroll, instead of
// jumping back to the start). Same visual idiom already duplicated by hand in
// CartRecommendations (cart-screen.jsx) and BrandCircles (home-screen.jsx) — those two are
// left as-is (already working) and not migrated onto this in this pass, but any *new*
// horizontal rail should use this instead of writing a third copy.
function ScrollRail({ items, renderItem, itemWidth = 220, gap = 16, ariaLabel = '' }) {
  const trackRef = useRef(null);
  const loop = items.length > 3;
  const cloneCount = loop ? Math.min(items.length, 6) : 0;
  const step = itemWidth + gap;
  const blockWidth = items.length * step;
  const extended = loop ? [...items.slice(-cloneCount), ...items, ...items.slice(0, cloneCount)] : items;

  useLayoutEffect(() => {
    if (loop && trackRef.current) trackRef.current.scrollLeft = cloneCount * step;
  }, [loop, cloneCount, step, items.length]);

  useEffect(() => {
    if (!loop) return undefined;
    const el = trackRef.current;
    if (!el) return undefined;
    let timer = null;
    const startBound = cloneCount * step;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (el.scrollLeft < startBound - 2) el.scrollLeft += blockWidth;
        else if (el.scrollLeft > startBound + blockWidth - 2) el.scrollLeft -= blockWidth;
      }, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer); };
  }, [loop, cloneCount, step, blockWidth]);

  const scrollTrack = (direction) => { if (trackRef.current) trackRef.current.scrollBy({ left: direction * step, behavior: 'smooth' }); };

  if (!items.length) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="fa-rail-arrow fa-rail-arrow-prev" aria-label={'Anterior' + (ariaLabel ? ' — ' + ariaLabel : '')} onClick={() => scrollTrack(-1)}><Icon name="chevL" size={17} /></button>
      <button type="button" className="fa-rail-arrow fa-rail-arrow-next" aria-label={'Próximo' + (ariaLabel ? ' — ' + ariaLabel : '')} onClick={() => scrollTrack(1)}><Icon name="chevR" size={17} /></button>
      <div ref={trackRef} className="fa-noscroll" style={{ display: 'flex', gap, overflowX: 'auto', padding: '6px 8px', scrollSnapType: 'x proximity' }}>
        {extended.map((item, i) => {
          // The seamless-loop illusion needs duplicate copies of the edge items sitting just
          // outside the visible window — but a keyboard user tabbing through must never land on
          // those off-screen clones (or a screen reader announce the same product twice).
          // `inert` removes a clone's whole subtree from both the tab order and the a11y tree in
          // one shot; aria-hidden is kept alongside it for browsers that don't support inert yet.
          const isClone = loop && (i < cloneCount || i >= cloneCount + items.length);
          return (
            <div
              key={(item && item.id != null ? item.id : i) + '-' + i}
              style={{ flex: 'none', width: itemWidth, scrollSnapAlign: 'start' }}
              aria-hidden={isClone || undefined}
              {...(isClone ? { inert: '' } : {})}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
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
      <span aria-live="polite">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="mais"><Icon name="plus" size={16} /></button>
    </div>
  );
}

// ---- Product card. variant: 'standard' | 'image' ----
function ProductCard({ product: p, variant = 'standard', onOpen, onAdd, onBuyNow, fav, onFav, notified, onNotify }) {
  const discount = p.discount > 0;
  const isSuperpromo = discount && p.promotionHighlight === 'superpromo';
  const isFixedDiscount = p.discountType === 'fixed';
  const discountAmount = discount && p.old != null ? Math.max(0, Number(p.old) - Number(p.price)) : 0;
  // Um desconto fixo em R$ vende melhor mostrado em reais ("R$10 OFF") do que convertido pra um
  // percentual pequeno e pouco chamativo — segue o que o admin configurou na promoção.
  const shortDiscountLabel = isFixedDiscount && discountAmount > 0 ? brl(discountAmount) + ' OFF' : '-' + p.discount + '%';
  const outOfStock = Number(p.stock || 0) <= 0;
  // Demo's `.card` (standard/image variants) — thumb, brand, name, price and the discount/
  // superpromo badge treatment only; no stars, no "Economize" chip, no urgency line, no rx/"Top"
  // badge (the whole card still opens the product on click, same as the demo). Two additions
  // kept on top of the demo's own design, both real product functionality the demo never
  // modeled: the heart, and a "Comprar agora"/"Adicionar ao carrinho" pair per explicit request
  // — same primary/ghost hierarchy already used on the product page's own BuyBox.
  const demoFlags = isSuperpromo || discount ? (
    <div className={'fa-pc-demo-flags' + (isSuperpromo ? ' fa-pc-demo-badges' : '')}>
      {isSuperpromo && <span className="fa-pc-demo-superbadge"><Icon name="bolt" size={12} stroke={2.6} />{p.urgencyLabel || shortDiscountLabel}</span>}
      {discount && <span className={'fa-pc-demo-discount' + (isSuperpromo ? ' is-dark' : '')}>{shortDiscountLabel}</span>}
    </div>
  ) : null;
  const demoBody = (
    <>
      <div className="fa-pc-brand">{p.brand}</div>
      <div className="fa-pc-name">{p.name}</div>
      {outOfStock ? (
        <div className="fa-pc-demo-oos">
          <span className="fa-pc-demo-oos-msg">Fora de estoque — chega em breve</span>
          <button
            className="fa-pc-demo-oos-notify"
            data-active={notified ? '1' : '0'}
            disabled={!!notified}
            onClick={(e) => { e.stopPropagation(); if (!notified && onNotify) onNotify(p.id, p.name); }}
          >
            {notified ? 'Vamos te avisar' : 'Avise-me quando chegar'}
          </button>
        </div>
      ) : (
        <>
          <div className="fa-pc-demo-price-row">
            {discount ? (
              <>
                <span className="fa-pc-demo-price is-discounted">{brl(p.price)}</span>
                {p.old != null && <span className="fa-pc-demo-price-was">{brl(p.old)}</span>}
              </>
            ) : (
              <span className="fa-pc-demo-price">{brl(p.price)}</span>
            )}
          </div>
          <div className="fa-pc-demo-actions">
            <button className="fa-btn fa-btn-primary fa-btn-sm fa-btn-block" onClick={(e) => { e.stopPropagation(); onBuyNow ? onBuyNow(p) : onAdd(p); }}>
              Comprar agora
            </button>
            <button className="fa-btn fa-btn-ghost fa-btn-sm fa-btn-block" onClick={(e) => { e.stopPropagation(); onAdd(p); }}>
              <Icon name="cart" size={14} stroke={2.2} />Adicionar ao carrinho
            </button>
          </div>
        </>
      )}
    </>
  );
  const favBtn = (
    <button className="fa-pc-fav" data-on={fav ? '1' : '0'} aria-label="favoritar"
      onClick={(e) => { e.stopPropagation(); onFav && onFav(p.id); }}>
      <Icon name="heart" size={17} style={fav ? { fill: 'currentColor' } : undefined} />
    </button>
  );
  if (variant === 'image') {
    return (
      <div className="fa-pc fa-pc-demo" data-style="image" data-out={outOfStock ? '1' : '0'} data-discount={discount ? '1' : '0'} data-superpromo={isSuperpromo ? '1' : '0'} onClick={() => onOpen(p)}>
        {demoFlags}{favBtn}
        <ProductVisual product={p} label={p.sub} style={{ aspectRatio: '4/3' }} />
        <div className="fa-pc-body">{demoBody}</div>
      </div>
    );
  }

  // standard
  return (
    <div className="fa-pc fa-pc-demo" data-out={outOfStock ? '1' : '0'} data-discount={discount ? '1' : '0'} data-superpromo={isSuperpromo ? '1' : '0'} onClick={() => onOpen(p)}>
      {demoFlags}{favBtn}
      <ProductVisual product={p} label={p.sub} />
      {demoBody}
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

// ---- Recurrence: what the customer explains/confirms, shared across product page, cart, and
// the subscriptions screen (all three toggle the same 15% recurrence discount) ----
const RECURRENCE_INFO_ITEMS = [
  ['tag', 'Sempre 15% off', 'Desconto fixo em todo item assinado, em cada entrega.'],
  ['bell', 'Lembrete de dose', 'Avisamos antes de cada envio — é só confirmar ou ajustar.'],
  ['pause', 'Flexível de verdade', 'Pause, pule uma entrega ou cancele quando quiser, sem multa.'],
];

function RecurrenceInfoContent() {
  return (
    <div className="fa-grid" style={{ '--fa-grid-min': '210px', gap: 16 }}>
      {RECURRENCE_INFO_ITEMS.map(([iconName, title, description]) => (
        <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name={iconName} size={18} /></span>
          <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div><p className="fa-muted" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{description}</p></div>
        </div>
      ))}
    </div>
  );
}

function RecurrenceInfoModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} icon="repeat" title="Como funciona a compra recorrente" maxw={520}>
      <div style={{ marginTop: 16 }}><RecurrenceInfoContent /></div>
    </Modal>
  );
}

// First question before any prescription submission: a paper-born prescription's original has
// to be physically retained at the counter by law — a photo/scan of it can never substitute for
// that. Digital-native ones (a signed PDF, a validation link from a digital-prescription service)
// have no such requirement and follow the existing chat-upload + online approval flow untouched.
// Shared between the cart badge and the checkout payment gate — both need to ask this before
// anything else.
function PrescriptionKindModal({ open, onClose, onSelectDigital, onSelectPhysical }) {
  const optionStyle = { textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, padding: 16, borderRadius: 'var(--fa-r-card)', border: '1px solid var(--fa-mist)', background: 'var(--fa-surface)', transition: 'all .15s' };
  return (
    <Modal open={open} onClose={onClose} icon="rx" title="Como é a sua receita?" sub="A forma de envio muda como você recebe e paga o pedido." maxw={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <button type="button" style={optionStyle} onClick={onSelectDigital}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>Receita digital</div>
          <div className="fa-muted" style={{ fontSize: 13 }}>Nasceu digital (PDF assinado ou link de uma plataforma de receita digital). Envie pelo chat com o farmacêutico — validamos e liberamos o pagamento online.</div>
        </button>
        <button type="button" style={optionStyle} onClick={onSelectPhysical}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>Receita física (papel)</div>
          <div className="fa-muted" style={{ fontSize: 13 }}>Por lei, o original precisa ficar retido na farmácia — uma foto não substitui o papel. Faça o pré-pedido, leve a receita em mãos na retirada e pague só na hora.</div>
        </button>
      </div>
    </Modal>
  );
}

// Confirmation before turning recurrence off — shows what the customer would stop saving,
// projected over 3/6/9/12 months at the current cadence, so "desativar" is never one accidental
// click away from silently losing the discount.
function RecurrenceOffModal({ open, unitPrice, qty = 1, freqDays = 30, onClose, onConfirm }) {
  const deliveriesPerMonth = 30 / (freqDays || 30);
  const monthlySavings = Number(unitPrice || 0) * qty * 0.15 * deliveriesPerMonth;
  const projections = [3, 6, 9, 12].map((months) => ({ months, amount: monthlySavings * months }));
  return (
    <Modal open={open} onClose={onClose} icon="repeat" title="Você vai perder os 15% de desconto"
      sub="A recorrência garante esse desconto em todas as próximas entregas deste produto — ao desativar, ele deixa de ser aplicado.">
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
        {projections.map(({ months, amount }) => (
          <div key={months} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '9px 0', borderBottom: '1px solid var(--fa-mist)' }}>
            <span className="fa-muted">Economia em {months} meses</span><span style={{ fontWeight: 800 }}>{brl(amount)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="fa-btn fa-btn-soft fa-btn-block" onClick={onConfirm}>Desativar</button>
        <button className="fa-btn fa-btn-primary fa-btn-block" onClick={onClose}>Manter recorrência</button>
      </div>
    </Modal>
  );
}

// Confirmation before removing a cart item — mirrors RecurrenceOffModal's honesty about what the
// customer stands to lose: a promotional discount already baked into the catalog price (product.old),
// a recurrence discount if the item is subscribed, or both. Shown only when there is something real
// to lose, never as friction for friction's sake.
function RemoveItemModal({ open, product, qty = 1, isSubscribed = false, onClose, onConfirm }) {
  const price = Number((product && product.price) || 0);
  const oldPrice = Number((product && product.old) || 0);
  const saleLoss = Math.max(0, oldPrice - price) * qty;
  const recurringLoss = isSubscribed ? price * qty * 0.15 : 0;
  const totalLoss = saleLoss + recurringLoss;
  const hasLoss = totalLoss > 0.004;
  return (
    <Modal open={open} onClose={onClose} icon="trash"
      title={hasLoss ? 'Você vai perder o desconto' : 'Remover item do carrinho?'}
      sub={hasLoss ? 'Esse desconto só vale enquanto o produto estiver no carrinho — ao remover, ele deixa de ser aplicado.' : 'Você pode adicioná-lo de novo a qualquer momento.'}>
      {hasLoss && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--fa-warn-soft)', border: '1px solid var(--fa-warn)', borderRadius: 'var(--fa-r-card)', padding: '12px 16px', marginTop: 4, fontSize: 13.5, fontWeight: 700, color: 'var(--fa-warn-ink)' }}>
          <span>Você está perdendo</span><span style={{ fontFamily: 'var(--fa-mono)' }}>{brl(totalLoss)}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="fa-btn fa-btn-soft fa-btn-block" onClick={onConfirm}>Remover</button>
        <button className="fa-btn fa-btn-primary fa-btn-block" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

// ---- Checkout phase bar: the 3-phase journey (Revisão → Entrega → Pagamento) spans two routes —
// the cart page is phase 1, the checkout page covers phases 2-3 — so this lives here rather than
// in either screen file, to avoid a circular import (checkout-screen.jsx already imports from
// cart-screen.jsx). A phase is clickable only once reached (index <= activeIndex); the caller
// decides what "select phase N" means (cart has nowhere to go back to; checkout may cross routes).
const CHECKOUT_PHASES = [
  { id: 'review', label: 'Revisão' },
  { id: 'delivery', label: 'Entrega' },
  { id: 'payment', label: 'Pagamento' },
];

function CheckoutPhaseBar({ phases, activeIndex, onSelect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {phases.map((phase, index) => (
        <React.Fragment key={phase.id}>
          <button
            type="button"
            onClick={() => index <= activeIndex && onSelect(index)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: 0, cursor: index <= activeIndex ? 'pointer' : 'default', font: 'inherit' }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, flex: 'none', background: index < activeIndex ? 'var(--fa-success)' : index === activeIndex ? 'var(--fa-primary)' : 'var(--fa-mist)', color: index <= activeIndex ? '#fff' : 'var(--fa-ink-3)' }}>
              {index < activeIndex ? <Icon name="check" size={16} stroke={2.6} /> : index + 1}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, color: index === activeIndex ? 'var(--fa-primary)' : 'var(--fa-ink-2)' }}>{phase.label}</span>
          </button>
          {index < phases.length - 1 && <span style={{ flex: 1, minWidth: 20, height: 2, background: index < activeIndex ? 'var(--fa-success)' : 'var(--fa-mist)' }} />}
        </React.Fragment>
      ))}
    </div>
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

// "Tendências": admin-curated product list (Marketplace → Tendências, console interno) — same
// ref-matching principle as resolveDealOfTheDayProducts above, just off/on instead of deal's
// off/manual/auto/scheduled (see normalizeHomeTrends, marketplace-app.jsx).
function resolveHomeTrendsProducts(homeTrends, products) {
  const mode = (homeTrends && homeTrends.mode) || 'off';
  const refs = (homeTrends && homeTrends.productRefs) || [];
  if (mode !== 'on' || !refs.length) {
    return [];
  }
  return refs
    .map((ref) => products.find((product) => product.id === ref || (product.aliases || []).includes(ref)))
    .filter(Boolean);
}

// GET /catalog/most-searched returns InventoryItem.product_id (the InventoryProduct id shared by
// every store/lot of the same product — app_private.public_monthly_product_sales groups by
// ii.product_id), not the marketplace's own public "mkt-<slug>" ids — so matching by `product.id`
// directly never hits, and it's not the same id as the "inv-<InventoryItem.id>" aliases either
// (that's the per-lot id). Matched against the "prod-<InventoryItem.product_id>" alias
// marketplace_projection.py adds alongside "inv-", same ref-normalization principle as
// `resolveDealOfTheDayProducts`. Real order preserved (real sales-volume rank), capped to `limit`.
function resolveMostSearchedProducts(mostSearchedProductIds, products, limit = 10) {
  const rank = new Map((mostSearchedProductIds || []).map((id, index) => ['prod-' + id, index]));
  if (!rank.size) {
    return [];
  }
  return products
    .map((product) => {
      const ref = product.aliases && product.aliases.find((alias) => rank.has(alias));
      return ref ? { product, rank: rank.get(ref) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, limit)
    .map((entry) => entry.product);
}

// GET /catalog/products/{id}/also-bought (app_private.public_also_bought_products) — same
// "prod-<InventoryProduct.id>" alias matching as resolveMostSearchedProducts above, ranked by real
// co-occurrence in paid orders/PDV sales, not a fabricated "customers who bought this also bought"
// claim. Same shape, kept separate since the two rankings come from different endpoints/callers.
function resolveAlsoBoughtProducts(alsoBoughtProductIds, products, limit = 10) {
  const rank = new Map((alsoBoughtProductIds || []).map((id, index) => ['prod-' + id, index]));
  if (!rank.size) {
    return [];
  }
  return products
    .map((product) => {
      const ref = product.aliases && product.aliases.find((alias) => rank.has(alias));
      return ref ? { product, rank: rank.get(ref) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, limit)
    .map((entry) => entry.product);
}

// Faixa de urgência com contador regressivo até o horário de reset configurado no console (Ofertas
// do dia → horário do ciclo, default 00:00) — reforça que é a oferta "de hoje", sem relação com a
// curadoria em si (nos modos manual/agendado a lista permanece igual até o admin trocar/o dia mudar;
// no modo automático, é exatamente esse horário que dispara o próximo sorteio — ver
// PortalService._deal_cycle_elapsed/_current_cycle_date).
// Remounting the face span on every digit change (via `key`) is what drives the flip: React
// tears down the old node and mounts a fresh one, whose CSS `animation` (a one-shot, not a
// transition) plays automatically from its keyframe start state — no manual timing/refs needed.
function FlipDigit({ value }) {
  return (
    <span className="fa-flipdigit">
      <span className="fa-flipdigit-face" key={value}>{value}</span>
    </span>
  );
}

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
  const hours = pad(Math.floor(remaining / 3600000));
  const minutes = pad(Math.floor((remaining % 3600000) / 60000));
  const seconds = pad(Math.floor((remaining % 60000) / 1000));
  return (
    <div className="fa-deal-countdown" aria-label="Tempo restante da oferta de hoje">
      <div className="fa-deal-countdown-unit">
        <span className="fa-deal-countdown-digits"><FlipDigit value={hours[0]} /><FlipDigit value={hours[1]} /></span>
        <span className="fa-deal-countdown-label">horas</span>
      </div>
      <span className="fa-deal-countdown-colon">:</span>
      <div className="fa-deal-countdown-unit">
        <span className="fa-deal-countdown-digits"><FlipDigit value={minutes[0]} /><FlipDigit value={minutes[1]} /></span>
        <span className="fa-deal-countdown-label">min</span>
      </div>
      <span className="fa-deal-countdown-colon">:</span>
      <div className="fa-deal-countdown-unit fa-deal-countdown-unit--seconds">
        <span className="fa-deal-countdown-digits"><FlipDigit value={seconds[0]} /><FlipDigit value={seconds[1]} /></span>
        <span className="fa-deal-countdown-label">seg</span>
      </div>
    </div>
  );
}

export {
  brl,
  AuraLayer,
  CHECKOUT_PHASES,
  CheckoutPhaseBar,
  DealCountdown,
  FlagBadge,
  InfoTip,
  Modal,
  ModalShell,
  PrescriptionKindModal,
  ProductCard,
  ProductVisual,
  QtyStepper,
  RecurrenceInfoModal,
  RecurrenceOffModal,
  RemoveItemModal,
  resolveAlsoBoughtProducts,
  resolveDealOfTheDayProducts,
  resolveHomeTrendsProducts,
  resolveMostSearchedProducts,
  ScrollRail,
  Stars,
  StarPicker,
  Toggle,
  useModalStack,
};
