import React from "react";
import { createPortal } from "react-dom";

import { resolveMarketplaceAssetUrl } from "./marketplace-assets.js";
import { Icon } from "./marketplace-icons.jsx";

/* FARMAURA — shared UI components. Depends on Icon (icons.jsx). */

const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',');

const MARKETPLACE_CATEGORY_PLACEHOLDER_MAP = {
  medicamentos: 'PlaceHolder-generico.png',
  perfumaria: 'PlaceHolder.png',
  'bem-estar': 'PlaceHolder.png',
  cuidados: 'PlaceHolder.png',
};

function normalizeMarketplaceImageText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function resolveMarketplacePlaceholderAssetName(product) {
  const category = normalizeMarketplaceImageText(product && product.cat);
  const name = normalizeMarketplaceImageText(product && product.name);
  const brand = normalizeMarketplaceImageText(product && product.brand);
  const sub = normalizeMarketplaceImageText(product && product.sub);
  const joined = [name, brand, sub].join(' ');
  const isGeneric = joined.includes('generico');
  const hasPrescription = !!(product && product.rx);
  const hasBlackStripe = joined.includes('tarja preta') || joined.includes('tarjapreta') || joined.includes('psicotrop');
  const hasRetention = joined.includes('retencao') || joined.includes('receita');

  if (hasPrescription) {
    if (hasBlackStripe) {
      return hasRetention
        ? 'PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta.png'
        : 'PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-tarja-preta-generico.png';
    }
    if (hasRetention) {
      return isGeneric
        ? 'PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita-generico.png'
        : 'PlaceHolder-venda-sob-prescricao-medica-com-retencao-receita.png';
    }
    return isGeneric
      ? 'PlaceHolder-venda-sob-prescricao-medica-generico.png'
      : 'PlaceHolder-venda-sob-prescricao-medica.png';
  }

  if (isGeneric) {
    return 'PlaceHolder-generico.png';
  }

  return MARKETPLACE_CATEGORY_PLACEHOLDER_MAP[category] || 'PlaceHolder.png';
}

function resolveMarketplacePlaceholderImageUrl(product) {
  return resolveMarketplaceAssetUrl(resolveMarketplacePlaceholderAssetName(product));
}

function ProductVisual({ product: p, label = '', glyph, style, imageUrl = '' }) {
  const imagePolicy = p && p.imagePolicy ? p.imagePolicy : 'placeholder_only';
  const allowsBrandImage = imagePolicy === 'brand_image';
  const brandImageUrl = imageUrl || (p && p.imageUrl ? p.imageUrl : '');
  const fallbackImageUrl = resolveMarketplacePlaceholderImageUrl(p);
  const [currentImageUrl, setCurrentImageUrl] = React.useState(allowsBrandImage && brandImageUrl ? brandImageUrl : fallbackImageUrl);

  React.useEffect(() => {
    setCurrentImageUrl(allowsBrandImage && brandImageUrl ? brandImageUrl : fallbackImageUrl);
  }, [p && p.id, allowsBrandImage, brandImageUrl, fallbackImageUrl, imagePolicy]);

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
function ProductCard({ product: p, variant = 'standard', onOpen, onAdd, fav, onFav }) {
  const discount = p.discount > 0;
  const outOfStock = Number(p.stock || 0) <= 0;
  const flags = (
    <div className="fa-pc-flags">
      {discount && <span className="fa-badge fa-badge-vital">-{p.discount}%</span>}
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

  if (variant === 'list') {
    return (
      <div className="fa-pc" data-style="list" data-out={outOfStock ? '1' : '0'} onClick={() => onOpen(p)}>
        <ProductVisual product={p} label={p.sub} />
        <div className="fa-pc-body">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{flags}</div>
          <div className="fa-pc-brand">{p.brand}</div>
          <div className="fa-pc-name" style={{ minHeight: 0 }}>{p.name}</div>
          <Stars value={p.rating} reviews={p.reviews} />
          <div className="fa-pc-price-row">
            <span className="fa-price">{brl(p.price)}</span>
            {p.old && <span className="fa-price-old">{brl(p.old)}</span>}
            {p.tags.includes('assinatura') && <span className="fa-badge fa-badge-health"><Icon name="repeat" size={11} stroke={2.1} />Assinar</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="fa-btn fa-btn-primary" disabled={outOfStock} onClick={(e) => { e.stopPropagation(); if (!outOfStock) onAdd(p); }}>
            <Icon name={outOfStock ? 'minus' : 'plus'} size={16} stroke={2.2} />{outOfStock ? 'Sem estoque' : 'Adicionar'}
          </button>
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
      <div className="fa-pc-foot">
        <button className="fa-btn fa-btn-primary fa-btn-sm" disabled={outOfStock} onClick={(e) => { e.stopPropagation(); if (!outOfStock) onAdd(p); }}>
          <Icon name={outOfStock ? 'minus' : 'cart'} size={16} stroke={2} />{outOfStock ? 'Sem estoque' : 'Adicionar'}
        </button>
      </div>
    </>
  );

  if (variant === 'image') {
    return (
      <div className="fa-pc" data-style="image" data-out={outOfStock ? '1' : '0'} onClick={() => onOpen(p)}>
        {flags}{favBtn}
        <ProductVisual product={p} label={p.sub} style={{ aspectRatio: '4/3' }} />
        <div className="fa-pc-body">{body}</div>
      </div>
    );
  }

  // standard
  return (
    <div className="fa-pc" data-out={outOfStock ? '1' : '0'} onClick={() => onOpen(p)}>
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

// ---- Modal shell (portaled to <body>; full-viewport overlay, viewport-centered,
//      body scroll locked). Use directly for custom layouts (e.g. chat). ----
function ModalShell({ open, onClose, children, maxw = 440, padded = true, className = '' }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);
  if (!open) return null;
  const node = (
    <div className="fa-modal-overlay" onClick={onClose}>
      <div className={'fa-modal ' + className} style={{ maxWidth: maxw, padding: padded ? undefined : 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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

export {
  brl,
  MARKETPLACE_CATEGORY_PLACEHOLDER_MAP,
  AuraLayer,
  FlagBadge,
  Modal,
  ModalShell,
  ProductCard,
  ProductVisual,
  QtyStepper,
  Stars,
  Toggle,
  normalizeMarketplaceImageText,
  resolveMarketplacePlaceholderAssetName,
  resolveMarketplacePlaceholderImageUrl,
};
