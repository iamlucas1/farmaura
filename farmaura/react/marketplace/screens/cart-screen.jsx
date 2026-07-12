import React, { useEffect, useRef, useState } from "react";
import { ProductVisual, QtyStepper, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Cart. */

const FREE_SHIP = 120;

function normalizeMarketplaceCouponCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMarketplaceCouponTargetList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function isMarketplaceCouponActive(coupon) {
  const now = Date.now();
  const startsAt = coupon && coupon.startsAt ? new Date(coupon.startsAt).getTime() : null;
  const endsAt = coupon && coupon.endsAt ? new Date(coupon.endsAt).getTime() : null;
  const usageLimit = coupon && coupon.usageLimit != null && coupon.usageLimit !== '' ? Number(coupon.usageLimit || 0) : null;
  const usageCount = Number((coupon && coupon.usageCount) || 0);
  if (!coupon || coupon.active === false) return false;
  if (startsAt != null && !Number.isNaN(startsAt) && startsAt > now) return false;
  if (endsAt != null && !Number.isNaN(endsAt) && endsAt < now) return false;
  if (usageLimit != null && usageLimit > 0 && usageCount >= usageLimit) return false;
  return true;
}

function computeMarketplaceDeliveryFee(subtotal) {
  return Math.max(0, Number(subtotal || 0)) >= FREE_SHIP ? 0 : 9.9;
}

function computeMarketplaceCouponDiscount(coupon, eligibleSubtotal, shippingFee) {
  const subtotal = Math.max(0, Number(eligibleSubtotal || 0));
  if (subtotal <= 0) {
    return 0;
  }
  if (coupon.discountType === 'shipping') {
    const shippingMode = coupon.shippingDiscountMode || 'full';
    const currentShippingFee = Math.max(0, Number(shippingFee || 0));
    if (shippingMode === 'percent') {
      return Math.min(currentShippingFee, currentShippingFee * Math.max(0, Number(coupon.discountValue || 0)) / 100);
    }
    if (shippingMode === 'fixed') {
      return Math.min(currentShippingFee, Math.max(0, Number(coupon.discountValue || 0)));
    }
    return currentShippingFee;
  }
  if (coupon.discountType === 'fixed') {
    return Math.min(subtotal, Math.max(0, Number(coupon.discountValue || 0)));
  }
  const rawDiscount = subtotal * Math.max(0, Number(coupon.discountValue || 0)) / 100;
  const maxDiscountValue = coupon.maxDiscountValue == null || coupon.maxDiscountValue === '' ? null : Math.max(0, Number(coupon.maxDiscountValue || 0));
  if (maxDiscountValue == null || Number.isNaN(maxDiscountValue)) {
    return rawDiscount;
  }
  return Math.min(rawDiscount, maxDiscountValue);
}

function resolveMarketplaceCoupon(coupons, products, items, rawCode, orders) {
  const code = normalizeMarketplaceCouponCode(rawCode);
  if (!code) {
    return { ok: false, message: 'Informe um cupom para aplicar.' };
  }
  const availableCoupons = Array.isArray(coupons) ? coupons : [];
  const coupon = availableCoupons.find((entry) => normalizeMarketplaceCouponCode(entry && entry.code) === code);
  if (!coupon) {
    return { ok: false, message: 'Cupom inválido.' };
  }
  if (!isMarketplaceCouponActive(coupon)) {
    return { ok: false, message: 'Este cupom não está ativo no momento.' };
  }
  const hasPreviousOrders = Array.isArray(orders) && orders.length > 0;
  if (coupon.firstPurchaseOnly && hasPreviousOrders) {
    return { ok: false, message: 'Este cupom é válido apenas para a primeira compra.' };
  }
  const lines = (Array.isArray(items) ? items : []).map((item) => {
    const product = (Array.isArray(products) ? products : []).find((entry) => entry.id === item.id) || null;
    if (!product) {
      return null;
    }
    const unitPrice = item.sub ? Number(product.price || 0) * 0.85 : Number(product.price || 0);
    return {
      item,
      product,
      lineTotal: unitPrice * Number(item.qty || 0),
      categoryKey: String(product.cat || '').trim().toLowerCase(),
      productKey: String(product.name || '').trim().toLowerCase(),
    };
  }).filter(Boolean);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const minimumOrderValue = Math.max(0, Number(coupon.minimumOrderValue || 0));
  if (minimumOrderValue > 0 && subtotal < minimumOrderValue) {
    return { ok: false, message: 'Este cupom exige pedido mínimo de ' + brl(minimumOrderValue) + '.' };
  }
  const targetCategories = new Set(normalizeMarketplaceCouponTargetList(coupon.targetCategories));
  const targetProducts = new Set(normalizeMarketplaceCouponTargetList(coupon.targetProducts));
  const eligibleLines = lines.filter((line) => {
    if (coupon.scopeType === 'categories') {
      return targetCategories.has(line.categoryKey);
    }
    if (coupon.scopeType === 'products') {
      return targetProducts.has(line.productKey);
    }
    return true;
  });
  if (!eligibleLines.length) {
    return { ok: false, message: 'Este cupom não se aplica aos itens atuais do carrinho.' };
  }
  const eligibleSubtotal = eligibleLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shippingFee = computeMarketplaceDeliveryFee(subtotal);
  const discountAmount = computeMarketplaceCouponDiscount(coupon, eligibleSubtotal, shippingFee);
  if (coupon.discountType === 'shipping' && shippingFee <= 0) {
    return { ok: false, message: 'Este pedido já está com frete grátis.' };
  }
  if (discountAmount <= 0) {
    return { ok: false, message: 'Não foi possível aplicar desconto com este cupom.' };
  }
  return {
    ok: true,
    coupon: {
      code,
      title: coupon.title || '',
      scopeType: coupon.scopeType || 'all',
      discountType: coupon.discountType || 'percent',
      shippingDiscountMode: coupon.discountType === 'shipping' ? (coupon.shippingDiscountMode || 'full') : 'full',
      discountValue: Number(coupon.discountValue || 0),
      discountAmount,
      pct: coupon.discountType === 'percent' ? Number(coupon.discountValue || 0) / 100 : 0,
    },
  };
}

function OrderSummary({ items, products, coupon, children }) {
  const getProduct = (itemId) => products.find((entry) => entry.id === itemId) || null;
  const sumItem = (item) => {
    const product = getProduct(item.id);
    if (!product) return 0;
    const unit = item.sub ? product.price * 0.85 : product.price;
    return unit * item.qty;
  };
  const subtotal = items.reduce((sum, item) => sum + sumItem(item), 0);
  const subSavings = items.reduce((sum, item) => {
    const product = getProduct(item.id);
    if (!product) return sum;
    return sum + (item.sub ? product.price * 0.15 * item.qty : 0);
  }, 0);
  const discount = coupon ? Number(coupon.discountAmount || 0) : 0;
  const shipping = computeMarketplaceDeliveryFee(subtotal);
  const total = subtotal - discount + shipping;
  const Line = ({ l, v, c, strong }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: strong ? 16 : 14, fontWeight: strong ? 800 : 500, color: c || (strong ? 'var(--fa-ink)' : 'var(--fa-ink-2)') }}>
      <span>{l}</span><span>{v}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Line l={`Subtotal (${items.reduce((sum, item) => sum + item.qty, 0)} itens)`} v={brl(subtotal)} />
      {coupon && <Line l={`Cupom ${coupon.code}`} v={'- ' + brl(discount)} c="var(--fa-success)" />}
      {subSavings > 0 && <Line l="Economia assinatura" v={'- ' + brl(subSavings)} c="var(--fa-success)" />}
      <Line l="Entrega" v={shipping === 0 ? 'Grátis' : brl(shipping)} c={shipping === 0 ? 'var(--fa-success)' : undefined} />
      <hr className="fa-divider" style={{ margin: '6px 0' }} />
      <Line l="Total" v={brl(total)} strong />
      <div className="fa-muted" style={{ fontSize: 12.5 }}>ou 3x de {brl(total / 3)} sem juros</div>
      {children}
    </div>
  );
}

function FreeShipBar({ subtotal }) {
  const pct = Math.min(100, (subtotal / FREE_SHIP) * 100);
  const left = Math.max(0, FREE_SHIP - subtotal);
  return (
    <div style={{ background: 'var(--fa-rose-soft)', borderRadius: 'var(--fa-r-card)', padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--fa-primary-ink)' }}>
        {left > 0 ? <>Faltam <b>{brl(left)}</b> para <b>frete grátis</b></> : <><Icon name="check" size={14} stroke={2.6} style={{ verticalAlign: -2 }} /> Você ganhou <b>frete grátis</b>!</>}
      </div>
      <div style={{ height: 7, background: '#fff', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: 'var(--fa-vital)', borderRadius: 99, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function CartRecommendations({ items, products, addToCart, onNav }) {
  const trackRef = useRef(null);
  const inCart = new Set(items.map((item) => item.id));
  const cartCategories = new Set(items.map((item) => products.find((product) => product.id === item.id)?.cat));
  const pool = products.filter((product) => !inCart.has(product.id));
  const scored = pool.map((product) => {
    let score = 0;
    if (cartCategories.has(product.cat)) score += 3;
    if (product.tags.includes('mais-vendido')) score += 2;
    if (product.discount > 0) score += 1;
    return { p: product, s: score };
  }).sort((left, right) => right.s - left.s).slice(0, 8).map((entry) => entry.p);

  const scrollTrack = (direction) => {
    if (!trackRef.current) return;
    trackRef.current.scrollBy({ left: direction * 220, behavior: 'smooth' });
  };

  if (!scored.length) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Icon name="sparkle" size={18} style={{ color: 'var(--fa-vital)' }} />
        <h2 className="fa-h3" style={{ fontSize: 17 }}>Quem levou esses itens também levou</h2>
      </div>
      <p className="fa-faint" style={{ fontSize: 13, marginBottom: 14 }}>Complete seu cuidado — adicione com um toque.</p>
      <div style={{ position: 'relative' }}>
        <button type="button" aria-label="ver produtos anteriores" onClick={() => scrollTrack(-1)} style={{ position: 'absolute', top: '50%', left: -10, transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, border: '1px solid var(--fa-mist)', background: 'rgba(255,255,255,.96)', color: 'var(--fa-primary)', display: 'grid', placeItems: 'center', boxShadow: 'var(--fa-shadow-md)', zIndex: 2, cursor: 'pointer', transition: 'transform .16s ease, background .16s ease, color .16s ease, border-color .16s ease' }} onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--fa-primary)'; event.currentTarget.style.color = '#fff'; event.currentTarget.style.borderColor = 'var(--fa-primary)'; event.currentTarget.style.transform = 'translateY(-50%) scale(1.04)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'rgba(255,255,255,.96)'; event.currentTarget.style.color = 'var(--fa-primary)'; event.currentTarget.style.borderColor = 'var(--fa-mist)'; event.currentTarget.style.transform = 'translateY(-50%)'; }}><Icon name="chevL" size={17} /></button>
        <button type="button" aria-label="ver mais produtos" onClick={() => scrollTrack(1)} style={{ position: 'absolute', top: '50%', right: -10, transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, border: '1px solid var(--fa-mist)', background: 'rgba(255,255,255,.96)', color: 'var(--fa-primary)', display: 'grid', placeItems: 'center', boxShadow: 'var(--fa-shadow-md)', zIndex: 2, cursor: 'pointer', transition: 'transform .16s ease, background .16s ease, color .16s ease, border-color .16s ease' }} onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--fa-primary)'; event.currentTarget.style.color = '#fff'; event.currentTarget.style.borderColor = 'var(--fa-primary)'; event.currentTarget.style.transform = 'translateY(-50%) scale(1.04)'; }} onMouseLeave={(event) => { event.currentTarget.style.background = 'rgba(255,255,255,.96)'; event.currentTarget.style.color = 'var(--fa-primary)'; event.currentTarget.style.borderColor = 'var(--fa-mist)'; event.currentTarget.style.transform = 'translateY(-50%)'; }}><Icon name="chevR" size={17} /></button>
        <div ref={trackRef} className="fa-noscroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '6px 8px 6px', scrollSnapType: 'x proximity' }}>
          {scored.map((product) => (
            <div key={product.id} className="fa-card" style={{ width: 168, flex: 'none', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, scrollSnapAlign: 'start', cursor: 'pointer' }} onClick={() => onNav({ name: 'product', id: product.id })}>
              <div style={{ position: 'relative' }}>
                <ProductVisual product={product} label={product.sub} style={{ borderRadius: 'calc(var(--fa-r-card) - 6px)' }} />
                {product.discount > 0 && <span className="fa-badge fa-badge-vital" style={{ position: 'absolute', top: 8, left: 8 }}>-{product.discount}%</span>}
              </div>
              <div className="fa-pc-brand" style={{ fontSize: 10.5 }}>{product.brand}</div>
              <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.6em' }}>{product.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto' }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{brl(product.price)}</span>
                {product.old && <span className="fa-price-old" style={{ fontSize: 11 }}>{brl(product.old)}</span>}
              </div>
              <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ width: '100%' }} onClick={(event) => { event.stopPropagation(); addToCart(product); }}><Icon name="plus" size={15} stroke={2.3} />Adicionar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CartScreen({ ctx }) {
  const { items, products, onNav, updateQty, removeItem, coupon, setCoupon, patchItem, addToCart, beginCheckout, orders, coupons } = ctx;
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const getProduct = (itemId) => products.find((entry) => entry.id === itemId) || null;
  const subtotal = items.reduce((sum, item) => {
    const product = getProduct(item.id);
    if (!product) return sum;
    return sum + (item.sub ? product.price * 0.85 : product.price) * item.qty;
  }, 0);

  const apply = () => {
    const result = resolveMarketplaceCoupon(coupons, products, items, code, orders);
    if (result.ok) {
      setCoupon(result.coupon);
      setErr('');
      return;
    }
    setCoupon(null);
    setErr(result.message || 'Cupom inválido.');
  };

  useEffect(() => {
    if (!coupon || !coupon.code) return;
    const result = resolveMarketplaceCoupon(coupons, products, items, coupon.code, orders);
    if (!result.ok) {
      setCoupon(null);
      setErr(result.message || 'Cupom removido do carrinho.');
      return;
    }
    const nextCoupon = result.coupon;
    const hasChanged = Number(nextCoupon.discountAmount || 0) !== Number(coupon.discountAmount || 0)
      || Number(nextCoupon.discountValue || 0) !== Number(coupon.discountValue || 0)
      || String(nextCoupon.discountType || '') !== String(coupon.discountType || '')
      || String(nextCoupon.scopeType || '') !== String(coupon.scopeType || '');
    if (hasChanged) {
      setCoupon(nextCoupon);
    }
    setErr((current) => current && current.includes('cupom') ? '' : current);
  }, [coupon, coupons, items, orders, products, setCoupon]);

  if (items.length === 0) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 60, paddingBottom: 80, textAlign: 'center' }}>
        <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="cart" size={34} /></span>
        <h1 className="fa-h2">Seu carrinho está vazio</h1>
        <p className="fa-lead" style={{ marginTop: 8 }}>Que tal começar pelas ofertas da semana?</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
          <button className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'offers' })}>Ver ofertas</button>
          <button className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'home' })}>Voltar ao início</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 20 }}>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 6 }}>Seu carrinho</h1>
      <p className="fa-lead" style={{ marginBottom: 24 }}>{items.reduce((sum, item) => sum + item.qty, 0)} itens · revise antes de finalizar</p>
      <div className="fa-cart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 'var(--fa-gap)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {items.map((item) => {
            const product = getProduct(item.id);
            const freqs = [{ v: 30, l: 'todo mês' }, { v: 60, l: 'a cada 2 meses' }, { v: 90, l: 'a cada 3 meses' }];
            if (!product) {
              return (
                <div key={item.id} className="fa-card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div className="fa-ph" style={{ width: 96, height: 96, aspectRatio: 'auto', flex: 'none' }}><Icon name="bag" size={28} style={{ color: 'var(--fa-primary)', opacity: .35 }} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div className="fa-pc-brand">Item indisponível</div>
                        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>Este produto não está mais disponível no catálogo atual.</div>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="fa-iconbtn" style={{ width: 34, height: 34, flex: 'none', border: 'none', background: 'transparent', color: 'var(--fa-ink-3)' }} aria-label="remover"><Icon name="trash" size={18} /></button>
                    </div>
                    <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 8 }}>Remova este item do carrinho para continuar com o pedido.</div>
                  </div>
                </div>
              );
            }
            const unit = item.sub ? product.price * 0.85 : product.price;
            return (
              <div key={item.id} className="fa-card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 96, flex: 'none', cursor: 'pointer' }} onClick={() => onNav({ name: 'product', id: product.id })}>
                  <ProductVisual product={product} label={product.sub} style={{ width: 96, height: 96, aspectRatio: 'auto' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div className="fa-pc-brand">{product.brand}</div>
                      <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, cursor: 'pointer' }} onClick={() => onNav({ name: 'product', id: product.id })}>{product.name}</div>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="fa-iconbtn" style={{ width: 34, height: 34, flex: 'none', border: 'none', background: 'transparent', color: 'var(--fa-ink-3)' }} aria-label="remover"><Icon name="trash" size={18} /></button>
                  </div>
                  {product.rx && <div style={{ margin: '8px 0' }}><span className="fa-badge fa-badge-rx"><Icon name="rx" size={11} stroke={2.1} />Receita</span></div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                    <QtyStepper value={item.qty} onChange={(qty) => updateQty(item.id, qty)} />
                    <div style={{ textAlign: 'right' }}>
                      {item.sub && <span className="fa-price-old" style={{ fontSize: 12 }}>{brl(product.price * item.qty)}</span>}
                      <div style={{ fontWeight: 800, fontSize: 17 }}>{brl(unit * item.qty)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, border: item.sub ? '1.5px solid var(--fa-success)' : '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-input)', background: item.sub ? 'var(--fa-success-soft)' : 'var(--fa-surface)', overflow: 'hidden', transition: 'all .15s' }}>
                    <button onClick={() => patchItem(item.id, { sub: !item.sub, freq: item.freq || 30 })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flex: 'none', background: item.sub ? 'var(--fa-success)' : 'var(--fa-success-soft)', color: item.sub ? '#fff' : 'var(--fa-success)' }}><Icon name="repeat" size={17} stroke={2} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: item.sub ? 'var(--fa-success)' : 'var(--fa-ink)' }}>Compra recorrente <span style={{ color: 'var(--fa-success)' }}>· -15%</span></div>
                        <div className="fa-faint" style={{ fontSize: 11.5 }}>Receba automaticamente, sem precisar refazer o pedido</div>
                      </div>
                      <span className="fa-toggle-mini" style={{ width: 36, height: 21, borderRadius: 99, background: item.sub ? 'var(--fa-success)' : 'var(--fa-mist)', position: 'relative', flex: 'none', transition: 'background .15s' }}><span style={{ position: 'absolute', top: 2, left: item.sub ? 17 : 2, width: 17, height: 17, borderRadius: 99, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} /></span>
                    </button>
                    {item.sub && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fa-ink-2)' }}>Entregar</span>
                        <select className="fa-input" value={item.freq || 30} onChange={(event) => patchItem(item.id, { freq: Number(event.target.value) })} style={{ height: 36, width: 'auto', paddingRight: 30, fontSize: 13, flex: 'none' }}>
                          {freqs.map((freq) => <option key={freq.v} value={freq.v}>{freq.l}</option>)}
                        </select>
                        <span className="fa-badge fa-badge-health" style={{ marginLeft: 'auto' }}><Icon name="bell" size={11} stroke={2} />Lembrete incluso</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <button className="fa-btn fa-btn-soft" style={{ alignSelf: 'flex-start' }} onClick={() => onNav({ name: 'home' })}><Icon name="chevL" size={16} />Continuar comprando</button>
          <CartRecommendations items={items} products={products} addToCart={addToCart} onNav={onNav} />
        </div>
        <div className="fa-card fa-cart-summary" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 150 }}>
          <FreeShipBar subtotal={subtotal} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Cupom de desconto</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="fa-input" placeholder="Digite seu cupom" value={code} onChange={(event) => { setCode(event.target.value); setErr(''); }} style={{ height: 42 }} />
              <button className="fa-btn fa-btn-soft" onClick={apply}>Aplicar</button>
            </div>
            {err && <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
            {coupon && <div style={{ color: 'var(--fa-success)', fontSize: 12.5, marginTop: 6, fontWeight: 600 }}><Icon name="check" size={13} stroke={2.6} style={{ verticalAlign: -2 }} /> Cupom {coupon.code} aplicado {coupon.discountType === 'shipping' ? coupon.shippingDiscountMode === 'percent' ? '(' + Math.round(Number(coupon.discountValue || 0)) + '% no frete)' : coupon.shippingDiscountMode === 'fixed' ? '(' + brl(coupon.discountValue) + ' no frete)' : '(frete grátis)' : coupon.discountType === 'percent' ? '(' + Math.round(Number(coupon.discountValue || 0)) + '%)' : '(' + brl(coupon.discountAmount) + ')'}</div>}
          </div>
          <hr className="fa-divider" />
          <OrderSummary items={items} products={products} coupon={coupon} />
          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" onClick={beginCheckout}>Finalizar compra<Icon name="arrowR" size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--fa-ink-3)' }}><Icon name="shield" size={15} />Pagamento 100% seguro</div>
        </div>
      </div>
    </div>
  );
}

export { CartRecommendations, CartScreen, FREE_SHIP, FreeShipBar, OrderSummary, computeMarketplaceCouponDiscount, computeMarketplaceDeliveryFee, isMarketplaceCouponActive, normalizeMarketplaceCouponCode, normalizeMarketplaceCouponTargetList, resolveMarketplaceCoupon };
