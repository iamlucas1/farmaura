import React, { useEffect, useRef, useState } from "react";
import { FlagBadge, ProductCard, ProductVisual, QtyStepper, RecurrenceInfoModal, RecurrenceOffModal, ScrollRail, Toggle, brl, resolveAlsoBoughtProducts } from "../core/marketplace-components.jsx";
import { DeliveryCoverageNote } from "../core/marketplace-chrome.jsx";
import { fetchDeliveryCoverage, fetchViaCepAddress, formatCep } from "../core/marketplace-address.js";
import { Icon } from "../core/marketplace-icons.jsx";
import { resolvePaymentBreakdown } from "../../shared/payment-pricing.js";

/* FARMAURA — Product detail page.

3-column layout: gallery (left) | name/description/dosage (middle) | price/actions (right) — per
explicit request. Real data and functionality throughout, not a static mock. Where a demo element
had no real backend counterpart (per-item payment-method picker, a coupon box, fabricated
regulatory specs like "Registro MS"/"Princípio ativo"), it was dropped instead of faked, per the
standing rule that this product never simulates commerce or invents content — see 06_Pendencias
for the ones worth reconsidering later. Where the demo mocked something this app already does for
real (CEP/coverage lookup, quantity stepper, subscription toggle, dosage/size variant chips), this
page wires the real implementation instead of copying the mock. */

function StarRow({ value }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="pd-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        n <= rounded
          ? <Icon key={n} name="star" size={15} />
          : <span key={n} className="is-empty"><Icon name="star" size={15} /></span>
      ))}
    </span>
  );
}

function PriceBlock({ p, paymentRules, sub }) {
  // When a recurrence discount (-15%) stacks on top of an existing sale price, the two
  // discounts must always combine into one shown percentage — never let one silently hide
  // the other. wasBase is the true original reference price; effectiveUnit is what the
  // customer actually pays per unit right now (recurrence included when active).
  const wasBase = p.old != null ? Number(p.old) : Number(p.price);
  const effectiveUnit = sub ? Number(p.price) * 0.85 : Number(p.price);
  const breakdown = resolvePaymentBreakdown(effectiveUnit, paymentRules, { productRef: p.name });
  const bestInstallment = breakdown.bestInstallmentLabel;
  const hasInstallmentText = bestInstallment && bestInstallment.n > 1;
  // Pix restated at an identical value to the price already shown big above is pure noise, not
  // information — only worth a second line when Pix is genuinely cheaper than the sticker price.
  const hasPixDiscount = breakdown.pixPrice < effectiveUnit - 0.005;
  const hasDiscount = effectiveUnit < wasBase - 0.005;
  const isSuperpromo = hasDiscount && p.promotionHighlight === 'superpromo';
  const isFixedDiscount = !sub && p.discountType === 'fixed';
  const discountAmount = hasDiscount ? Math.max(0, wasBase - effectiveUnit) : 0;
  const combinedPct = hasDiscount ? Math.round((1 - effectiveUnit / wasBase) * 100) : 0;
  const shortDiscountLabel = isFixedDiscount && discountAmount > 0 ? brl(discountAmount) + ' OFF' : '-' + combinedPct + '%';
  return (
    <div>
      <div className="pd-price-block">
        <span className={'pd-price' + (hasDiscount ? ' is-discounted' : '')}>{brl(effectiveUnit)}</span>
        {hasDiscount && <span className="pd-price-was">{brl(wasBase)}</span>}
        {hasDiscount && <span className="pd-price-off">{shortDiscountLabel}</span>}
      </div>
      {discountAmount > 0 && (
        <div style={{ fontWeight: 800, fontSize: isSuperpromo ? 15 : 13, color: 'var(--fa-success)', marginBottom: 4 }}>
          Você economiza {brl(discountAmount)}
        </div>
      )}
      {p.urgencyLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--fa-warn-ink)', marginBottom: 4 }}>
          <Icon name="alert" size={13} stroke={2.6} />{p.urgencyLabel}
        </div>
      )}
      {(hasInstallmentText || hasPixDiscount) && (
        <div className="pd-installment">
          {hasInstallmentText && (
            <>ou <b>{bestInstallment.n}x de {brl(bestInstallment.installmentValue)}</b>{bestInstallment.hasInterest ? '' : ' sem juros'}</>
          )}
          {hasPixDiscount && (
            <>{hasInstallmentText ? ' · ' : ''}<b style={{ color: 'var(--fa-success)' }}>{brl(breakdown.pixPrice)}</b> no Pix</>
          )}
        </div>
      )}
    </div>
  );
}

function RxNotice() {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-info-soft)', borderRadius: 'var(--fa-r-card)', alignItems: 'flex-start', marginBottom: 14 }}>
      <Icon name="rx" size={20} style={{ color: 'var(--fa-info)', flex: 'none', marginTop: 1 }} />
      <div style={{ fontSize: 13, color: 'var(--fa-info)' }}>
        <b>Medicamento com retenção de receita.</b> Você poderá enviar a receita digital no checkout — nosso farmacêutico valida antes do envio.
      </div>
    </div>
  );
}

// Short, real marketing bullets (unit count, size, how it acts, etc.) — set per-product in the
// internal console (marketing_highlights). No fabricated copy: an empty list renders nothing.
function ProductHighlights({ items }) {
  if (!items || !items.length) return null;
  return (
    <ul className="pd-highlights">
      {items.map((topic, index) => (
        <li key={index}><Icon name="check" size={16} stroke={2.4} />{topic}</li>
      ))}
    </ul>
  );
}

// Dosage/size picker — each chip is a real, independent catalog product (its own price/stock/
// reviews), linked via variant_group_id. Picking one navigates to that product's own real page
// rather than swapping state in place, since the two are genuinely different inventory records.
function ProductVariantPicker({ product, onNav }) {
  if (!product.variants || product.variants.length < 2) return null;
  return (
    <div className="pd-variant-group">
      <div className="pd-variant-label">Dosagem / tamanho</div>
      <div className="pd-variant-options">
        {product.variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            className={'pd-variant-btn' + (variant.id === product.id ? ' is-active' : '')}
            onClick={() => { if (variant.id !== product.id) onNav({ name: 'product', id: variant.id }); }}
          >
            {variant.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Real short marketing paragraph, set per-product in the internal console (short_description) —
// distinct from the full package insert, which now lives on its own page (bula-screen.jsx).
function ProductDescription({ text }) {
  const trimmed = String(text || '').trim();
  return (
    <div className="pd-panel">
      <div className="pd-panel-head"><h2>Descrição</h2><p>Tudo o que você precisa saber sobre esse produto.</p></div>
      {trimmed ? (
        <p className="pd-desc">{trimmed}</p>
      ) : (
        <p className="pd-desc">Descrição ainda não cadastrada para este produto.</p>
      )}
    </div>
  );
}

// Card linking to the product's own bula page (bula-screen.jsx) — only rendered when a real bula
// is on file, so it never dead-ends into an empty page.
function BulaCta({ product, onNav }) {
  if (!String(product.bulaMarkdown || '').trim()) return null;
  return (
    <button type="button" className="pd-bula-cta" onClick={() => onNav({ name: 'bula', id: product.id })}>
      <span className="pd-bula-cta-text">
        <b>Bula do medicamento</b>
        <small>Indicações, contraindicações e modo de uso</small>
      </span>
      <Icon name="chevR" size={18} stroke={2.4} />
    </button>
  );
}

// Mobile-only floating buy bar (hidden via CSS above the same 1080px breakpoint where the
// buybox itself stops being sticky). Appears once the real buy button in the buybox scrolls out
// of view, so a distracted, one-handed customer never has to hunt for price/checkout after the
// first screen — same price/qty/sub state as the buybox, never a second source of truth.
function MobileStickyBuyBar({ product, sub, buyBtnRef, outOfStock, notified, onBuy, onNotify }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = buyBtnRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;
    // No negative bottom margin here: on the tablet 2-column layout (adapt pass) the real buy
    // button often already sits inside a short first viewport, and a -15% margin was treating it
    // as "scrolled out" while it was still fully visible on screen — showing both CTAs at once.
    // Trigger only once the button has genuinely left the viewport.
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { rootMargin: '0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [buyBtnRef, product.id]);

  // The WhatsApp chat button (ChatWidget) is rendered at the app-shell level, not inside this
  // screen, and floats at the same bottom-right corner this bar occupies — nudge it up via a
  // body class instead of permanently repositioning it for every other page.
  useEffect(() => {
    document.body.classList.toggle('pd-sticky-bar-active', visible);
    return () => document.body.classList.remove('pd-sticky-bar-active');
  }, [visible]);

  const effectiveUnit = sub ? Number(product.price) * 0.85 : Number(product.price);

  return (
    <div className={'pd-sticky-bar' + (visible ? ' is-visible' : '')} aria-hidden={!visible}>
      <span className="pd-sticky-bar-price">{brl(effectiveUnit)}</span>
      {outOfStock ? (
        <button className="fa-btn fa-btn-primary" tabIndex={visible ? 0 : -1} disabled={!!notified} onClick={onNotify}>
          {notified ? 'Vamos avisar' : 'Avise-me'}
        </button>
      ) : (
        <button className="fa-btn fa-btn-primary" tabIndex={visible ? 0 : -1} onClick={onBuy}>Comprar agora</button>
      )}
    </div>
  );
}

// Real CEP → coverage lookup, same flow as the header's "Entregar em" popover
// (marketplace-chrome.jsx) — reused via marketplace-address.js rather than duplicated.
function ProductShipping({ authClient }) {
  const [cep, setCep] = useState('');
  const [status, setStatus] = useState({ loading: false, error: '', result: null });
  const [coverage, setCoverage] = useState({ loading: false, error: '', data: null });

  const submit = async (e) => {
    e.preventDefault();
    if (formatCep(cep).replace(/\D/g, '').length !== 8) {
      setStatus({ loading: false, error: 'Informe um CEP válido.', result: null });
      setCoverage({ loading: false, error: '', data: null });
      return;
    }
    setStatus({ loading: true, error: '', result: null });
    setCoverage({ loading: false, error: '', data: null });
    try {
      const address = await fetchViaCepAddress(cep);
      setStatus({ loading: false, error: '', result: address });
      setCoverage({ loading: true, error: '', data: null });
      try {
        const data = await fetchDeliveryCoverage(authClient, address);
        setCoverage({ loading: false, error: '', data });
      } catch (coverageError) {
        setCoverage({ loading: false, error: (coverageError && coverageError.message) || '', data: null });
      }
    } catch (requestError) {
      setStatus({ loading: false, error: (requestError && requestError.message) || 'Não foi possível consultar o CEP.', result: null });
    }
  };

  return (
    <div className="pd-shipping">
      <div className="pd-shipping-head">
        <span className="pd-shipping-head-label"><Icon name="truck" size={15} />Frete e entrega</span>
      </div>
      <form className="pd-shipping-form" onSubmit={submit}>
        <input className="fa-input" type="text" inputMode="numeric" maxLength={9} placeholder="00000-000" aria-label="CEP" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} />
        <button className="fa-btn fa-btn-primary" type="submit" disabled={status.loading}>{status.loading ? '...' : 'Calcular'}</button>
      </form>
      {status.error ? <div className="pd-shipping-result is-error">{status.error}</div> : null}
      {status.result ? (
        <div className="pd-shipping-result">
          <b>{[status.result.district, status.result.city].filter(Boolean).join(' - ')}</b>
          <DeliveryCoverageNote coverage={coverage} />
        </div>
      ) : null}
    </div>
  );
}

// Only real, already-known fields — never the demo's fabricated regulatory rows ("Registro MS",
// "Princípio ativo", "Fabricante", dosage as its own field, etc.), which this catalog has no
// source of truth for. A field with no real value is omitted, not shown blank or guessed.
function ProductSpecs({ p }) {
  const rows = [
    ['Marca', p.brand],
    ['Categoria', p.sub],
    p.sku ? ['Código do produto', p.sku] : null,
    p.ean ? ['EAN', p.ean] : null,
    ['Necessita receita', p.rx ? 'Sim' : 'Não'],
    ['Compra recorrente', p.tags.includes('assinatura') ? 'Disponível — 15% off' : 'Não disponível'],
  ].filter(Boolean);
  return (
    <dl className="pd-specs">
      {rows.map(([label, value]) => (
        <div className="pd-spec" key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

// Module-level, not component state — ProductScreen fully unmounts and remounts on every product
// navigation (confirmed: the screen switch in marketplace-app.jsx tears down the whole tree per
// route), so a useRef/useState inside the component can never survive a dosage/size chip click.
// This is the one piece of state that genuinely needs to survive that remount: the quantity a
// customer already chose while comparing variants of the same product. Session-only (resets on a
// full page reload), and only consulted for products sharing the same variant_group_id — a
// completely different product still starts at 1, as expected.
let lastPickedQty = { variantGroupId: null, qty: 1 };

function ProductScreen({ ctx }) {
  const { user, products, route, onNav, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, cardVariant, paymentRules, authClient } = ctx;
  const product = products.find((entry) => entry.id === route.id) || products[0];
  const isFav = !!(product && fav.includes(product.id));
  const [qty, setQty] = useState(() => (
    product && product.variantGroupId && product.variantGroupId === lastPickedQty.variantGroupId
      ? lastPickedQty.qty
      : 1
  ));
  const [sub, setSub] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showSubInfo, setShowSubInfo] = useState(false);
  const [confirmingSubOff, setConfirmingSubOff] = useState(false);
  const [alsoBoughtIds, setAlsoBoughtIds] = useState([]);
  const buyBtnRef = useRef(null);
  // Buybox and the mobile sticky bar render their own copies of the same buy/notify action, and
  // a real double-click or a laggy double-tap fires the onClick handler twice before either
  // button can re-render/disable — for "Comprar agora" that silently doubles the cart quantity
  // with zero feedback, since the click also navigates away. A ref (not state) latches
  // synchronously across both clicks of the same burst without waiting for a re-render.
  const pendingActionRef = useRef(false);
  const guardOnce = (fn) => (...args) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    fn(...args);
    setTimeout(() => { pendingActionRef.current = false; }, 400);
  };

  useEffect(() => {
    setSub(false);
    setSelectedImageIndex(0);
    window.scrollTo(0, 0);
  }, [route.id]);

  useEffect(() => {
    if (product && product.variantGroupId) lastPickedQty = { variantGroupId: product.variantGroupId, qty };
  }, [qty, product && product.variantGroupId]);

  // "Outros clientes também compraram" — real co-purchase ranking (GET /catalog/products/{id}/also-bought,
  // app_private.public_also_bought_products), keyed by the InventoryProduct id carried in the
  // "prod-<id>" alias, not this screen's own "mkt-<slug>" display id. No fabricated social proof:
  // the rail below only renders once real ids come back.
  const alsoBoughtRef = (() => {
    const alias = (product && product.aliases || []).find((entry) => entry.startsWith('prod-'));
    return alias ? alias.slice(5) : '';
  })();
  useEffect(() => {
    setAlsoBoughtIds([]);
    if (!alsoBoughtRef) return undefined;
    let cancelled = false;
    authClient.publicRequest('/catalog/products/' + alsoBoughtRef + '/also-bought?limit=10', { method: 'GET' })
      .then((response) => {
        if (!cancelled) setAlsoBoughtIds(Array.isArray(response.items) ? response.items.map((item) => item.product_id).filter(Boolean) : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [alsoBoughtRef]);

  // Alimenta o motor de "Oportunidades de venda" do PDV: um cliente que volta a olhar o
  // mesmo produto várias vezes sem comprar ainda é um sinal real de interesse. Só para
  // clientes identificados (sem isso não há a quem atribuir o sinal) — melhor esforço,
  // nunca bloqueia a navegação se a chamada falhar.
  useEffect(() => {
    if (!user || !alsoBoughtRef) return;
    authClient.request('/portal/marketplace/products/' + alsoBoughtRef + '/view', { method: 'POST' }).catch(() => {});
  }, [user, alsoBoughtRef]);

  if (!product) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 20, paddingBottom: 20, textAlign: 'center' }}>
        <p className="fa-muted" style={{ fontSize: 15, margin: '40px 0 16px' }}>
          {products.length ? 'Produto não encontrado.' : 'Carregando catálogo...'}
        </p>
        <button className="fa-btn fa-btn-primary" onClick={() => onNav({ name: 'home' })}>Voltar para a loja</button>
      </div>
    );
  }

  const sameCategory = products.filter((entry) => entry.cat === product.cat && entry.id !== product.id);
  const relatedFill = products.filter((entry) => entry.id !== product.id && !sameCategory.includes(entry)).sort((left, right) => right.reviews - left.reviews);
  const related = [...sameCategory, ...relatedFill].slice(0, 10);
  const alsoBought = resolveAlsoBoughtProducts(alsoBoughtIds, products, 10).filter((entry) => entry.id !== product.id);
  const cardProps = { variant: cardVariant, onOpen: (entry) => onNav({ name: 'product', id: entry.id }), onAdd: (entry) => addToCart(entry), onBuyNow: (entry) => { addToCart(entry); onNav({ name: 'cart' }); }, onFav: toggleFav, onNotify: subscribeAvailabilityAlert };
  const supportsGallery = product.imagePolicy === 'brand_image';
  const galleryImages = supportsGallery ? Array.from(new Set((Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.imageUrl]).filter(Boolean))) : [];
  const activeImageUrl = supportsGallery ? (galleryImages[selectedImageIndex] || '') : '';
  const hasGalleryOptions = supportsGallery && galleryImages.length > 1;
  const outOfStock = Number(product.stock || 0) <= 0;
  const hasReviews = Number(product.reviews || 0) > 0;
  const notified = availabilityAlerts.includes(product.id);
  const handleBuyNow = guardOnce(() => { addToCart(product, qty, sub); onNav({ name: 'cart' }); });
  const handleNotify = guardOnce(() => { if (!notified && subscribeAvailabilityAlert) subscribeAvailabilityAlert(product.id, product.name); });
  const handleAddToCart = guardOnce(() => addToCart(product, qty, sub));

  const gallery = (
    <div className="pd-gallery">
      <ProductVisual product={product} imageUrl={activeImageUrl} label="Imagem do produto" loading="eager" style={{ aspectRatio: '1/1', borderRadius: 'var(--fa-r-card)', border: '1px solid var(--fa-mist)' }} />
      {hasGalleryOptions && (
        <div className="pd-gallery-thumbs">
          {galleryImages.map((imageUrl, index) => (
            <button key={imageUrl + index} type="button" onClick={() => setSelectedImageIndex(index)} aria-label={index === selectedImageIndex ? 'Imagem selecionada do produto' : 'Selecionar imagem do produto'} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flex: 'none' }}>
              <ProductVisual product={product} imageUrl={imageUrl} label={product.sub} style={{ width: 58, height: 58, aspectRatio: 'auto', borderRadius: 12, border: index === selectedImageIndex ? '2px solid var(--fa-primary)' : '1px solid var(--fa-mist)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const middle = (
    <div className="pd-info">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {product.tags.map((tag) => <FlagBadge key={tag} tag={tag} />)}
      </div>
      <div className="pd-brand">{product.brand}</div>
      <h1 className="pd-name">{product.name}</h1>
      <div className="pd-rating-row">
        {hasReviews ? (
          <>
            <StarRow value={product.rating} />
            <span>{product.rating.toFixed(1)} · {product.reviews} avaliações</span>
          </>
        ) : (
          <span style={{ color: 'var(--fa-ink-3)' }}>Produto novo — ainda sem avaliações</span>
        )}
        {outOfStock && (
          <>
            <span className="fa-faint">·</span>
            <span style={{ color: 'var(--fa-ink-3)' }}>Sem estoque no momento</span>
          </>
        )}
      </div>
      {product.rx && <RxNotice />}
      <ProductHighlights items={product.marketingHighlights} />
      <ProductVariantPicker product={product} onNav={onNav} />
    </div>
  );

  const buybox = (
    <div className="pd-buybox">
      <PriceBlock p={product} paymentRules={paymentRules} sub={sub} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <QtyStepper value={qty} onChange={setQty} />
      </div>
      {product.tags.includes('assinatura') && (
        <div className="pd-recurrence">
          <span className="pd-recurrence-title">
            Assinar e economizar 15%
            <button className="pd-recurrence-info" type="button" aria-label="Como funciona a compra recorrente" onClick={() => setShowSubInfo(true)}><Icon name="info" size={13} /></button>
          </span>
          <Toggle on={sub} ariaLabel="Ativar compra recorrente" onChange={(next) => (next ? setSub(true) : setConfirmingSubOff(true))} />
        </div>
      )}
      <ProductShipping authClient={authClient} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {outOfStock ? (
          <button ref={buyBtnRef} className="fa-btn fa-btn-primary pd-add-btn" disabled={!!notified} onClick={handleNotify}>
            <Icon name="bell" size={18} stroke={2} />{notified ? 'Vamos te avisar por e-mail' : 'Avise-me quando chegar'}
          </button>
        ) : (
          <>
            <button ref={buyBtnRef} className="fa-btn fa-btn-primary pd-add-btn" onClick={handleBuyNow}>Comprar agora</button>
            <button className="fa-btn fa-btn-ghost pd-add-btn" onClick={handleAddToCart}><Icon name="cart" size={16} stroke={2.2} />Adicionar ao carrinho</button>
          </>
        )}
        <button type="button" className="fa-btn fa-btn-soft pd-add-btn pd-save-btn" onClick={() => toggleFav(product.id)}>
          <Icon name="heart" size={16} stroke={2.2} style={isFav ? { fill: 'currentColor', color: 'var(--fa-vital)' } : undefined} />
          {isFav ? 'Nos seus desejos' : 'Adicionar aos desejos'}
        </button>
      </div>
      <BulaCta product={product} onNav={onNav} />
    </div>
  );

  return (
    <>
    <div className="fa-fadein">
      <div className="fa-wrap" style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)' }}>
            <button type="button" className="fa-crumb-link" onClick={() => onNav({ name: 'home' })}>Início</button><Icon name="chevR" size={13} />
            <button type="button" className="fa-crumb-link" onClick={() => onNav({ name: 'category', cat: product.cat })} style={{ textTransform: 'capitalize' }}>{product.cat.replace('-', ' ')}</button><Icon name="chevR" size={13} />
            <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>{product.sub}</span>
          </div>
          <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => onNav({ name: 'category', cat: product.cat })}>
            <Icon name="chevL" size={14} />Voltar para <span style={{ textTransform: 'capitalize' }}>{product.cat.replace('-', ' ')}</span>
          </button>
        </div>

        <div className="pd-layout">
          {gallery}
          {middle}
          {buybox}
        </div>

        <div className="pd-section">
          <div className="pd-two-col">
            <ProductDescription text={product.shortDescription} />
            <div className="pd-panel">
              <div className="pd-panel-head"><h2>Especificações</h2><p>Informações do produto disponíveis no nosso catálogo.</p></div>
              <ProductSpecs p={product} />
            </div>
          </div>
        </div>

        {alsoBought.length > 0 && (
          <div className="pd-section">
            <div className="pd-carousel-head"><h2>Outros clientes também compraram</h2></div>
            <ScrollRail
              items={alsoBought}
              itemWidth={220}
              ariaLabel="Outros clientes também compraram"
              renderItem={(entry) => <ProductCard product={entry} {...cardProps} fav={fav.includes(entry.id)} notified={availabilityAlerts.includes(entry.id)} />}
            />
          </div>
        )}

        {related.length > 0 && (
          <div className="pd-section">
            <div className="pd-carousel-head"><h2>Recomendados para você</h2></div>
            <ScrollRail
              items={related}
              itemWidth={220}
              ariaLabel="Recomendados para você"
              renderItem={(entry) => <ProductCard product={entry} {...cardProps} fav={fav.includes(entry.id)} notified={availabilityAlerts.includes(entry.id)} />}
            />
          </div>
        )}

        <div className="pd-section">
          <h2>Avaliações</h2>
          {hasReviews ? (
            <>
              <div className="pd-reviews-summary">
                <div className="pd-rating-big">{product.rating.toFixed(1)}</div>
                <div className="pd-reviews-meta"><StarRow value={product.rating} /><span className="pd-reviews-count">{product.reviews} avaliações</span></div>
              </div>
              {Array.isArray(product.reviewComments) && product.reviewComments.length ? (
                <div className="pd-review-list">
                  {product.reviewComments.map((review, index) => (
                    <div className="pd-review" key={review.id || index}>
                      <div className="pd-review-head">
                        <span className="pd-review-avatar">{review.reviewer_avatar_initials || (review.reviewer_name || '?').slice(0, 2).toUpperCase()}</span>
                        <div className="pd-review-id">
                          <div className="pd-review-name">{review.reviewer_name || 'Cliente Farmaura'}</div>
                          {review.submitted_at && <div className="pd-review-date">{review.submitted_at}</div>}
                        </div>
                        <StarRow value={Number(review.rating || 0)} />
                      </div>
                      {review.title ? <div className="fa-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{review.title}</div> : null}
                      <p className="pd-review-text">{review.body || 'Sem comentário adicional.'}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="fa-muted" style={{ fontSize: 14 }}>Ainda não há avaliações publicadas para este produto. Seja a primeira pessoa a avaliar depois da compra.</p>
          )}
        </div>
      </div>
    </div>

    {/* Outside .fa-fadein deliberately: its completed entrance animation leaves a non-"none"
        computed transform (animation-fill-mode: both resolves to a matrix, not the literal
        keyword), which creates a new containing block for any position:fixed descendant — the
        same bug already diagnosed and fixed once for the sticky header. Anything meant to be
        fixed to the real viewport (modals, the mobile buy bar) has to live outside it. */}
    <RecurrenceInfoModal open={showSubInfo} onClose={() => setShowSubInfo(false)} />
    <RecurrenceOffModal
      open={confirmingSubOff}
      unitPrice={product.price}
      qty={qty}
      freqDays={30}
      onClose={() => setConfirmingSubOff(false)}
      onConfirm={() => { setSub(false); setConfirmingSubOff(false); }}
    />
    <MobileStickyBuyBar
      product={product}
      sub={sub}
      buyBtnRef={buyBtnRef}
      outOfStock={outOfStock}
      notified={notified}
      onBuy={handleBuyNow}
      onNotify={handleNotify}
    />
    </>
  );
}

export { PriceBlock, ProductScreen, RxNotice };
