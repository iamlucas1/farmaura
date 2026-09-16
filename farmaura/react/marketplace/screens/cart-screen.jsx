import React, { useEffect, useState } from "react";
import { CHECKOUT_PHASES, CheckoutPhaseBar, ProductCard, ProductVisual, QtyStepper, RecurrenceInfoModal, RecurrenceOffModal, RemoveItemModal, ScrollRail, brl, resolveAlsoBoughtProducts } from "../core/marketplace-components.jsx";
import { FullBleedBand } from "../core/marketplace-bands.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { resolvePaymentBreakdown } from "../../shared/payment-pricing.js";

/* FARMAURA — Cart. */

const DEFAULT_DELIVERY_ESTIMATE = { freeAboveSubtotal: 120, baseFee: 9.9 };

function normalizeMarketplaceCouponCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMarketplaceCouponTargetList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

/** Classify a coupon's local availability status — a preview only, never the source of truth (see resolveMarketplaceCoupon). */
function classifyMarketplaceCouponStatus(coupon) {
  const now = Date.now();
  const startsAt = coupon && coupon.startsAt ? new Date(coupon.startsAt).getTime() : null;
  const endsAt = coupon && coupon.endsAt ? new Date(coupon.endsAt).getTime() : null;
  const usageLimit = coupon && coupon.usageLimit != null && coupon.usageLimit !== '' ? Number(coupon.usageLimit || 0) : null;
  const usageCount = Number((coupon && coupon.usageCount) || 0);
  if (!coupon || coupon.active === false) return 'inactive';
  if (startsAt != null && !Number.isNaN(startsAt) && startsAt > now) return 'scheduled';
  if (usageLimit != null && usageLimit > 0 && usageCount >= usageLimit) return 'exhausted';
  if (endsAt != null && !Number.isNaN(endsAt) && endsAt < now) return 'expired';
  return 'active';
}

const MARKETPLACE_COUPON_STATUS_MESSAGES = {
  inactive: 'Este cupom foi pausado e não está mais disponível.',
  scheduled: 'Este cupom ainda não começou a valer.',
  expired: 'Este cupom expirou.',
  exhausted: 'Este cupom atingiu o limite de usos e não está mais disponível.',
};

function isMarketplaceCouponActive(coupon) {
  return classifyMarketplaceCouponStatus(coupon) === 'active';
}

function computeMarketplaceDeliveryFee(subtotal, deliveryEstimate) {
  const estimate = deliveryEstimate || DEFAULT_DELIVERY_ESTIMATE;
  const qualifiesForFreeShipping = estimate.freeAboveSubtotal > 0 && Math.max(0, Number(subtotal || 0)) >= estimate.freeAboveSubtotal;
  return qualifiesForFreeShipping ? 0 : estimate.baseFee;
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

function resolveMarketplaceCoupon(coupons, products, items, rawCode, orders, deliveryEstimate) {
  const code = normalizeMarketplaceCouponCode(rawCode);
  if (!code) {
    return { ok: false, message: 'Informe um cupom para aplicar.' };
  }
  const availableCoupons = Array.isArray(coupons) ? coupons : [];
  const coupon = availableCoupons.find((entry) => normalizeMarketplaceCouponCode(entry && entry.code) === code);
  if (!coupon) {
    return { ok: false, message: 'Cupom inválido.' };
  }
  if (coupon.channelScope === 'pdv') {
    return { ok: false, message: 'Este cupom é válido apenas nas lojas físicas, não no site.' };
  }
  const status = classifyMarketplaceCouponStatus(coupon);
  if (status !== 'active') {
    return { ok: false, message: MARKETPLACE_COUPON_STATUS_MESSAGES[status] || 'Este cupom não está ativo no momento.' };
  }
  const hasPreviousOrders = Array.isArray(orders) && orders.length > 0;
  if (coupon.firstPurchaseOnly && hasPreviousOrders) {
    return { ok: false, message: 'Este cupom é válido apenas para a primeira compra.' };
  }
  if (coupon.audience === 'new_customers' && hasPreviousOrders) {
    return { ok: false, message: 'Este cupom é exclusivo para clientes novos.' };
  }
  if (coupon.audience === 'recurring' && !hasPreviousOrders) {
    return { ok: false, message: 'Este cupom é exclusivo para clientes que já compraram antes.' };
  }
  if (coupon.perCustomerLimit) {
    const previousUses = (Array.isArray(orders) ? orders : []).filter((entry) => normalizeMarketplaceCouponCode(entry && entry.couponCode) === code).length;
    if (previousUses >= coupon.perCustomerLimit) {
      return { ok: false, message: 'Você já atingiu o limite de uso deste cupom.' };
    }
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
  if (coupon.audience === 'prescription' && !lines.some((line) => line.product && line.product.rx)) {
    return { ok: false, message: 'Este cupom é válido apenas para pedidos com produtos sob prescrição.' };
  }
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
  const shippingFee = computeMarketplaceDeliveryFee(subtotal, deliveryEstimate);
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
      maxDiscountValue: coupon.discountType === 'percent' && coupon.maxDiscountValue != null && coupon.maxDiscountValue !== '' ? Number(coupon.maxDiscountValue) : null,
      discountAmount,
      pct: coupon.discountType === 'percent' ? Number(coupon.discountValue || 0) / 100 : 0,
    },
  };
}

// Shared by OrderSummary and the checkout's cashback block, so both size the "how much can be
// redeemed" preview against the exact same gross total the order summary already shows — server
// still re-caps for real when the order is actually placed (see CashbackService.apply_on_order).
function computeMarketplaceOrderTotal(items, products, coupon, deliveryEstimate) {
  const getProduct = (itemId) => products.find((entry) => entry.id === itemId) || null;
  const sumItem = (item) => {
    const product = getProduct(item.id);
    if (!product) return 0;
    const unit = item.sub ? product.price * 0.85 : product.price;
    return unit * item.qty;
  };
  const subtotal = items.reduce((sum, item) => sum + sumItem(item), 0);
  const discount = coupon ? Number(coupon.discountAmount || 0) : 0;
  const shipping = computeMarketplaceDeliveryFee(subtotal, deliveryEstimate);
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

function OrderSummary({ items, products, coupon, children, beforeTotal, deliveryEstimate, paymentRules, cashbackApplied }) {
  const getProduct = (itemId) => products.find((entry) => entry.id === itemId) || null;
  const { subtotal, discount, shipping } = computeMarketplaceOrderTotal(items, products, coupon, deliveryEstimate);
  const subSavings = items.reduce((sum, item) => {
    const product = getProduct(item.id);
    if (!product) return sum;
    return sum + (item.sub ? product.price * 0.15 * item.qty : 0);
  }, 0);
  const cashback = Math.max(0, Number(cashbackApplied || 0));
  const total = Math.max(0, subtotal - discount + shipping - cashback);
  const Row = ({ l, v, c, discount: isDiscount }) => (
    <div className={'fa-cart-summary-row' + (isDiscount ? ' is-discount' : '')}>
      <span>{l}</span><span style={c ? { color: c } : undefined}>{v}</span>
    </div>
  );
  return (
    <div>
      <Row l={`Subtotal (${items.reduce((sum, item) => sum + item.qty, 0)} itens)`} v={brl(subtotal)} />
      {coupon && <Row l={`Cupom ${coupon.code}`} v={'-' + brl(discount)} discount />}
      {subSavings > 0 && <Row l="Economia assinatura" v={'-' + brl(subSavings)} discount />}
      <Row l="Entrega" v={shipping === 0 ? 'Grátis' : brl(shipping)} c={shipping === 0 ? 'var(--fa-success)' : undefined} />
      {cashback > 0 && <Row l="Cashback" v={'-' + brl(cashback)} discount />}
      {beforeTotal}
      <div className="fa-cart-summary-total"><span>Total</span><span>{brl(total)}</span></div>
      {(() => {
        const bestInstallment = resolvePaymentBreakdown(total, paymentRules, { cartTotal: total }).bestInstallmentLabel;
        if (!bestInstallment || bestInstallment.n <= 1) return null;
        return (
          <div className="fa-muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 4 }}>
            ou {bestInstallment.n}x de {brl(bestInstallment.installmentValue)}{bestInstallment.hasInterest ? '' : ' sem juros'}
          </div>
        );
      })()}
      {children}
    </div>
  );
}

function FreeShipBar({ subtotal, deliveryEstimate }) {
  const freeAboveSubtotal = (deliveryEstimate || DEFAULT_DELIVERY_ESTIMATE).freeAboveSubtotal;
  if (freeAboveSubtotal <= 0) {
    return null;
  }
  const pct = Math.min(100, (subtotal / freeAboveSubtotal) * 100);
  const left = Math.max(0, freeAboveSubtotal - subtotal);
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

// Two real recommendation rails, same sourcing as the product page (no third, invented
// heuristic): "Outros clientes também compraram" from the real co-purchase endpoint
// (GET /catalog/products/{id}/also-bought, aggregated across every item in the cart instead of
// a single product), "Recomendados para você" from the same same-category-then-reviews fallback
// already used there. Either rail is simply omitted when it has nothing real to show.
function CartRecommendations({ items, products, alsoBoughtIds, cardProps, fav, availabilityAlerts }) {
  const inCart = new Set(items.map((item) => item.id));
  const cartCategories = new Set(items.map((item) => products.find((product) => product.id === item.id)?.cat));

  const alsoBought = resolveAlsoBoughtProducts(alsoBoughtIds, products, 10).filter((product) => !inCart.has(product.id));
  const alsoBoughtIdSet = new Set(alsoBought.map((product) => product.id));

  const pool = products.filter((product) => !inCart.has(product.id) && !alsoBoughtIdSet.has(product.id));
  const sameCategory = pool.filter((product) => cartCategories.has(product.cat));
  const relatedFill = pool.filter((product) => !cartCategories.has(product.cat)).sort((left, right) => right.reviews - left.reviews);
  const related = [...sameCategory, ...relatedFill].slice(0, 10);

  const renderCard = (product) => <ProductCard product={product} {...cardProps} fav={fav.includes(product.id)} notified={availabilityAlerts.includes(product.id)} />;

  if (!alsoBought.length && !related.length) return null;

  return (
    <>
      {alsoBought.length > 0 && (
        <div className="pd-section">
          <div className="pd-carousel-head"><h2>Outros clientes também compraram</h2></div>
          <ScrollRail items={alsoBought} itemWidth={220} ariaLabel="Outros clientes também compraram" renderItem={renderCard} />
        </div>
      )}
      {related.length > 0 && (
        <div className="pd-section">
          <div className="pd-carousel-head"><h2>Recomendados para você</h2></div>
          <ScrollRail items={related} itemWidth={220} ariaLabel="Recomendados para você" renderItem={renderCard} />
        </div>
      )}
    </>
  );
}

function CartScreen({ ctx }) {
  const { items, products, onNav, updateQty, removeItem, coupon, setCoupon, patchItem, addToCart, beginCheckout, orders, coupons, deliveryEstimate, availabilityAlerts, subscribeAvailabilityAlert, paymentRules, fav, toggleFav, cardVariant, authClient } = ctx;
  const cardProps = { variant: cardVariant, onOpen: (product) => onNav({ name: 'product', id: product.id }), onAdd: addToCart, onBuyNow: (product) => addToCart(product), onFav: toggleFav, onNotify: subscribeAvailabilityAlert };
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [confirmingSubOffId, setConfirmingSubOffId] = useState('');
  const [confirmingRemoveId, setConfirmingRemoveId] = useState('');
  const [recurrenceInfoOpen, setRecurrenceInfoOpen] = useState(false);
  const [couponJustApplied, setCouponJustApplied] = useState(false);
  const [alsoBoughtIds, setAlsoBoughtIds] = useState([]);
  const getProduct = (itemId) => products.find((entry) => entry.id === itemId) || null;
  // Fixed alphabetical order by product name — independent of insertion order or of whatever
  // order a cart mutation's server response happens to come back in (e.g. toggling recurrence),
  // so the list never visibly reshuffles from an action that isn't reordering anything on purpose.
  const sortedItems = [...items].sort((a, b) => {
    const nameA = (getProduct(a.id) && getProduct(a.id).name) || '';
    const nameB = (getProduct(b.id) && getProduct(b.id).name) || '';
    return nameA.localeCompare(nameB, 'pt-BR');
  });
  // "Outros clientes também compraram" aggregated across every item in the cart — same real
  // endpoint the product page uses per-product, just fetched once per cart item and merged
  // (first occurrence wins) instead of a single product's own ranking.
  const itemProductRefs = items.map((item) => {
    const product = getProduct(item.id);
    const alias = product && Array.isArray(product.aliases) ? product.aliases.find((entry) => entry.startsWith('prod-')) : null;
    return alias ? alias.slice(5) : '';
  }).filter(Boolean);
  const itemProductRefsKey = itemProductRefs.join(',');
  useEffect(() => {
    setAlsoBoughtIds([]);
    if (!itemProductRefsKey) return undefined;
    let cancelled = false;
    Promise.all(itemProductRefsKey.split(',').map((ref) =>
      authClient.publicRequest('/catalog/products/' + ref + '/also-bought?limit=10', { method: 'GET' }).catch(() => ({ items: [] }))
    )).then((responses) => {
      if (cancelled) return;
      const merged = [];
      const seen = new Set();
      responses.forEach((response) => {
        (Array.isArray(response.items) ? response.items : []).forEach((entry) => {
          if (entry && entry.product_id && !seen.has(entry.product_id)) {
            seen.add(entry.product_id);
            merged.push(entry.product_id);
          }
        });
      });
      setAlsoBoughtIds(merged);
    });
    return () => { cancelled = true; };
  }, [itemProductRefsKey, authClient]);
  const subtotal = items.reduce((sum, item) => {
    const product = getProduct(item.id);
    if (!product) return sum;
    return sum + (item.sub ? product.price * 0.85 : product.price) * item.qty;
  }, 0);
  const hasUnavailableItems = items.some((item) => {
    const product = getProduct(item.id);
    return !product || Number(product.stock || 0) <= 0;
  });

  const apply = () => {
    const result = resolveMarketplaceCoupon(coupons, products, items, code, orders, deliveryEstimate);
    if (result.ok) {
      setCoupon(result.coupon);
      setErr('');
      setCouponJustApplied(true);
      setTimeout(() => setCouponJustApplied(false), 1800);
      return;
    }
    setCoupon(null);
    setErr(result.message || 'Cupom inválido.');
  };

  useEffect(() => {
    if (!coupon || !coupon.code) return;
    const result = resolveMarketplaceCoupon(coupons, products, items, coupon.code, orders, deliveryEstimate);
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
    <div className="fa-fadein">
    <FullBleedBand index={0} contentStyle={{ paddingTop: 22, paddingBottom: 22 }}>
      <CheckoutPhaseBar phases={CHECKOUT_PHASES} activeIndex={0} onSelect={() => {}} />
    </FullBleedBand>
    <div className="fa-wrap" style={{ paddingTop: 24, paddingBottom: 20 }}>
      <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)', marginBottom: 24 }}>Seu carrinho</h1>
      <div className="fa-cart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 'var(--fa-gap)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div className="fa-cart-section-head">
            <h2>{items.length} {items.length === 1 ? 'produto' : 'produtos'}</h2>
            <button className="fa-cart-link-btn" type="button" onClick={() => setRecurrenceInfoOpen(true)}>
              <Icon name="info" size={14} />Como funciona a recorrência?
            </button>
          </div>
          {sortedItems.map((item) => {
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
                      <button onClick={() => removeItem(item.id)} className="fa-cart-item-remove" style={{ flex: 'none' }} aria-label="remover"><Icon name="trash" size={13} />Remover</button>
                    </div>
                    <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 8 }}>Remova este item do carrinho para continuar com o pedido.</div>
                  </div>
                </div>
              );
            }
            if (Number(product.stock || 0) <= 0) {
              const alreadyNotified = availabilityAlerts.includes(product.id);
              return (
                <div key={item.id} className="fa-card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 96, flex: 'none', opacity: .5 }}>
                    <ProductVisual product={product} label={product.sub} style={{ width: 96, height: 96, aspectRatio: 'auto' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div className="fa-pc-brand">{product.brand}</div>
                        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{product.name}</div>
                        <span className="fa-badge fa-badge-mist" style={{ marginTop: 6 }}><Icon name="minus" size={11} stroke={2.2} />Sem estoque no momento</span>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="fa-cart-item-remove" style={{ flex: 'none' }} aria-label="remover"><Icon name="trash" size={13} />Remover</button>
                    </div>
                    <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 8 }}>Remova este item para finalizar a compra, ou peça para te avisarmos quando ele voltar.</div>
                    <button
                      className="fa-btn fa-btn-soft fa-btn-sm"
                      style={{ marginTop: 10 }}
                      disabled={alreadyNotified}
                      onClick={() => subscribeAvailabilityAlert(product.id, product.name)}
                    >
                      <Icon name="bell" size={14} stroke={2.1} />{alreadyNotified ? 'Vamos te avisar' : 'Avise-me quando chegar'}
                    </button>
                  </div>
                </div>
              );
            }
            const unit = item.sub ? product.price * 0.85 : product.price;
            return (
              <div key={item.id} className="fa-card fa-cart-item" style={{ padding: 16 }}>
                <div className="fa-cart-item-media" onClick={() => onNav({ name: 'product', id: product.id })}>
                  <ProductVisual product={product} label={product.sub} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} />
                </div>
                <div className="fa-cart-item-info">
                  <div className="fa-pc-brand">{product.brand}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, cursor: 'pointer' }} onClick={() => onNav({ name: 'product', id: product.id })}>{product.name}</div>
                  {product.rx && (
                    // Just a notice here — no CTA. Sending/choosing digital-vs-física now lives
                    // entirely on the payment step, where it actually blocks something; showing
                    // it again here (with its own button and its own modal) was the confusing
                    // duplicate flow the user flagged.
                    <div className="fa-cart-item-badges">
                      <span className="fa-badge fa-badge-rx"><Icon name="rx" size={11} stroke={2.1} />Receita obrigatória para este item</span>
                    </div>
                  )}
                  <div style={{ marginTop: product.rx ? 8 : 12, border: item.sub ? '1.5px solid var(--fa-success)' : '1px solid var(--fa-mist)', borderRadius: 'var(--fa-r-input)', background: item.sub ? 'var(--fa-success-soft)' : 'var(--fa-surface)', overflow: 'hidden', transition: 'all .15s' }}>
                    <button onClick={() => (item.sub ? setConfirmingSubOffId(item.id) : patchItem(item.id, { sub: true, freq: item.freq || 30 }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', flex: 'none', background: item.sub ? 'var(--fa-success)' : 'var(--fa-success-soft)', color: item.sub ? '#fff' : 'var(--fa-success)' }}><Icon name="repeat" size={17} stroke={2} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: item.sub ? 'var(--fa-success)' : 'var(--fa-ink)' }}>Compra recorrente <span style={{ color: 'var(--fa-success)' }}>· -15%</span></div>
                        <div className="fa-faint" style={{ fontSize: 11.5 }}>Receba automaticamente, sem precisar refazer o pedido</div>
                      </div>
                      <span className="fa-toggle-mini" style={{ width: 36, height: 21, borderRadius: 99, background: item.sub ? 'var(--fa-success)' : 'var(--fa-mist)', position: 'relative', flex: 'none', transition: 'background .15s' }}><span style={{ position: 'absolute', top: 2, left: item.sub ? 17 : 2, width: 17, height: 17, borderRadius: 99, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(43,26,26,.2)' }} /></span>
                    </button>
                    {item.sub && (
                      <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fa-ink-2)' }}>Entregar</span>
                          <select className="fa-input" value={item.freq || 30} onChange={(event) => patchItem(item.id, { freq: Number(event.target.value) })} style={{ height: 36, width: 'auto', paddingRight: 30, fontSize: 13, flex: 'none' }}>
                            {freqs.map((freq) => <option key={freq.v} value={freq.v}>{freq.l}</option>)}
                          </select>
                          <span className="fa-badge fa-badge-health" style={{ marginLeft: 'auto' }}><Icon name="bell" size={11} stroke={2} />Lembrete incluso</span>
                        </div>
                        {/* The quantity stepper in the aside already controls item.qty — this is
                            the same value/handler, just surfaced inside the recurrence panel
                            itself so it's unmistakable how many units ship on every cycle. */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--fa-surface)', borderRadius: 'var(--fa-r-input)', border: '1px solid var(--fa-mist)' }}>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Quantidade por entrega</div>
                            <div className="fa-faint" style={{ fontSize: 11 }}>{item.qty} {item.qty === 1 ? 'unidade enviada' : 'unidades enviadas'} a cada ciclo</div>
                          </div>
                          <QtyStepper value={item.qty} onChange={(qty) => updateQty(item.id, qty)} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="fa-cart-item-aside">
                  <div style={{ textAlign: 'right' }}>
                    {item.sub && <span className="fa-price-old" style={{ fontSize: 12 }}>{brl(product.price * item.qty)}</span>}
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{brl(unit * item.qty)}</div>
                  </div>
                  <QtyStepper value={item.qty} onChange={(qty) => updateQty(item.id, qty)} />
                  <button onClick={() => setConfirmingRemoveId(item.id)} className="fa-cart-item-remove" aria-label="remover"><Icon name="trash" size={13} />Remover</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="fa-card fa-cart-summary" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FreeShipBar subtotal={subtotal} deliveryEstimate={deliveryEstimate} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>Resumo do pedido</div>
          <OrderSummary
            items={items} products={products} coupon={coupon} deliveryEstimate={deliveryEstimate} paymentRules={paymentRules}
            beforeTotal={
              <div style={{ margin: '10px 0' }}>
                <div className="fa-cart-coupon">
                  <input className="fa-input" placeholder="Cupom" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setErr(''); }} style={{ textTransform: 'uppercase' }} />
                  <button className={'fa-btn fa-btn-soft fa-cart-coupon-btn' + (couponJustApplied ? ' is-applied' : '')} onClick={apply}>{couponJustApplied ? <><Icon name="check" size={14} stroke={2.6} />Aplicado</> : 'Aplicar'}</button>
                </div>
                {err && <div style={{ color: 'var(--fa-error)', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
                {coupon && <div style={{ color: 'var(--fa-success)', fontSize: 12.5, marginTop: 6, fontWeight: 600 }}><Icon name="check" size={13} stroke={2.6} style={{ verticalAlign: -2 }} /> Cupom {coupon.code} aplicado {coupon.discountType === 'shipping' ? coupon.shippingDiscountMode === 'percent' ? '(' + Math.round(Number(coupon.discountValue || 0)) + '% no frete)' : coupon.shippingDiscountMode === 'fixed' ? '(' + brl(coupon.discountValue) + ' no frete)' : '(frete grátis)' : coupon.discountType === 'percent' ? '(' + Math.round(Number(coupon.discountValue || 0)) + '%' + (coupon.maxDiscountValue != null ? ', até ' + brl(coupon.maxDiscountValue) : '') + ')' : '(' + brl(coupon.discountAmount) + ')'}</div>}
                {coupon && coupon.discountType === 'percent' && coupon.maxDiscountValue != null && coupon.discountAmount >= coupon.maxDiscountValue && (
                  <div style={{ color: 'var(--fa-ink-3)', fontSize: 11.5, marginTop: 4 }}>Desconto limitado ao teto máximo de {brl(coupon.maxDiscountValue)} deste cupom.</div>
                )}
              </div>
            }
          />
          {hasUnavailableItems && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--fa-warn)', background: 'var(--fa-warn-soft)', borderRadius: 'var(--fa-r-input)', padding: '10px 12px' }}>
              <Icon name="info" size={15} style={{ flex: 'none' }} />Remova os itens indisponíveis para finalizar a compra.
            </div>
          )}
          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={hasUnavailableItems} onClick={beginCheckout}>Finalizar compra<Icon name="arrowR" size={18} /></button>
          <button className="fa-cart-continue-link" type="button" onClick={() => onNav({ name: 'home' })}>Continuar comprando</button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--fa-ink-3)' }}><Icon name="shield" size={15} />Pagamento 100% seguro</div>
        </div>
      </div>
      <CartRecommendations items={items} products={products} alsoBoughtIds={alsoBoughtIds} cardProps={cardProps} fav={fav} availabilityAlerts={availabilityAlerts} />
      <RecurrenceOffModal
        open={!!confirmingSubOffId}
        unitPrice={(getProduct(confirmingSubOffId) || {}).price}
        qty={(items.find((item) => item.id === confirmingSubOffId) || {}).qty || 1}
        freqDays={(items.find((item) => item.id === confirmingSubOffId) || {}).freq || 30}
        onClose={() => setConfirmingSubOffId('')}
        onConfirm={() => { patchItem(confirmingSubOffId, { sub: false }); setConfirmingSubOffId(''); }}
      />
      <RemoveItemModal
        open={!!confirmingRemoveId}
        product={getProduct(confirmingRemoveId)}
        qty={(items.find((item) => item.id === confirmingRemoveId) || {}).qty || 1}
        isSubscribed={!!(items.find((item) => item.id === confirmingRemoveId) || {}).sub}
        onClose={() => setConfirmingRemoveId('')}
        onConfirm={() => { removeItem(confirmingRemoveId); setConfirmingRemoveId(''); }}
      />
      <RecurrenceInfoModal open={recurrenceInfoOpen} onClose={() => setRecurrenceInfoOpen(false)} />
    </div>
    </div>
  );
}

export { CartRecommendations, CartScreen, FreeShipBar, OrderSummary, computeMarketplaceCouponDiscount, computeMarketplaceDeliveryFee, computeMarketplaceOrderTotal, isMarketplaceCouponActive, normalizeMarketplaceCouponCode, normalizeMarketplaceCouponTargetList, resolveMarketplaceCoupon };
