import React, { useEffect, useRef, useState } from "react";
import { ProductCard } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Home / painel principal. */

function SectionHead({ eyebrow, title, action, onAction }) {
  return (
    <div className="fa-section-head">
      <div>
        {eyebrow && <p className="fa-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</p>}
        <h2 className="fa-h2">{title}</h2>
      </div>
      {action && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={onAction}>{action}<Icon name="arrowR" size={16} /></button>}
    </div>
  );
}

function QuickCategories({ cats, onNav }) {
  // One single row: four real, backend-driven shortcuts first, then the real category
  // catalog managed in the internal console (Categorias) — not a mix of decorative
  // atalhos, every tile here navigates somewhere backed by real data:
  // - "Mais buscados" ranks by real sales volume (online + PDV), see catalog_service.list_most_searched_products.
  // - "Produtos salvos" is the customer's real favorites list.
  // - "Ofertas" is products with an active PricingPromotion/product_discount applied.
  // - "Serviços de saúde" is the real procedure catalog managed in Catálogo → Serviços de saúde.
  // - the rest are the tenant's real product categories.
  const shortcuts = [
    { id: 'sc-buscados', label: 'Mais buscados', glyph: 'search', go: { name: 'discover' } },
    { id: 'sc-salvos', label: 'Produtos salvos', glyph: 'heart', go: { name: 'saved' } },
    { id: 'sc-ofertas', label: 'Ofertas', glyph: 'percent', go: { name: 'offers' } },
    { id: 'sc-servicos', label: 'Serviços de saúde', glyph: 'activity', go: { name: 'services' } },
  ];
  const categoryItems = (cats || []).map((cat) => ({
    id: 'qc-cat-' + cat.id,
    label: cat.label,
    glyph: cat.glyph || 'pill',
    go: { name: 'category', cat: cat.id },
  }));
  const items = [...shortcuts, ...categoryItems];
  return (
    <nav className="fa-quickcats" aria-label="Atalhos e categorias">
      {items.map((c) => (
        <button key={c.id} className="fa-quickcat" onClick={() => onNav(c.go)}>
          <span className="fa-quickcat-tile"><Icon name={c.glyph} size={26} stroke={2} /></span>
          <span className="fa-quickcat-label">{c.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Home banner: mode/slides come from PortalService (admin-configured in Catálogo/Marketplace
// → Banner da vitrine). "off" renders nothing; "image" is a real carousel (or a static single
// banner when there's only one slide) whose slides can each be an image or the tenant's own
// sanitized HTML (nh3-cleaned server-side, see PortalService._sanitize_home_banner_html).
function resolveBannerSlideNav(slide, { onNav, onPrescription }) {
  switch (slide.linkType) {
    case 'offers': return () => onNav({ name: 'offers' });
    case 'services': return () => onNav({ name: 'services' });
    case 'prescricao': return () => onPrescription && onPrescription();
    case 'category': return slide.linkCategory ? () => onNav({ name: 'category', cat: slide.linkCategory }) : null;
    case 'external': return /^https?:\/\//i.test(slide.linkUrl) ? () => window.open(slide.linkUrl, '_blank', 'noopener,noreferrer') : null;
    default: return null;
  }
}

function BannerSlider({ banner, onNav, onPrescription }) {
  const slides = (banner && banner.slides) || [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = slides.length;
  const go = (nextIndex) => setIndex((nextIndex + total) % total);

  useEffect(() => { setIndex(0); }, [total]);

  useEffect(() => {
    if (paused || total <= 1) {
      return undefined;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % total), 3200);
    return () => clearInterval(timer);
  }, [paused, total]);

  if (!total) {
    return null;
  }

  return (
    <section className="fa-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carrossel">
      <div className="fa-slider-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide) => {
          if (slide.kind === 'html') {
            return (
              <div key={slide.id} className="fa-slide-item">
                <div className="fa-slide-item-html" dangerouslySetInnerHTML={{ __html: slide.html }} />
              </div>
            );
          }
          const onClick = resolveBannerSlideNav(slide, { onNav, onPrescription });
          return (
            <div key={slide.id} className="fa-slide-item">
              {onClick ? (
                <button onClick={onClick} aria-label={slide.altText || 'Banner'}>
                  <img src={slide.image} alt={slide.altText || ''} />
                </button>
              ) : (
                <img src={slide.image} alt={slide.altText || ''} />
              )}
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <>
          <button className="fa-slider-arrow" data-side="prev" onClick={() => go(index - 1)} aria-label="Anterior"><Icon name="chevL" size={20} stroke={2.2} /></button>
          <button className="fa-slider-arrow" data-side="next" onClick={() => go(index + 1)} aria-label="Próximo"><Icon name="chevR" size={20} stroke={2.2} /></button>
          <div className="fa-slider-dots">
            {slides.map((slide, dotIndex) => (
              <button key={slide.id} className="fa-slider-dot" data-on={dotIndex === index ? '1' : '0'} onClick={() => go(dotIndex)} aria-label={`Banner ${dotIndex + 1}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function HomeBanner({ banner, onNav, onPrescription }) {
  const mode = (banner && banner.mode) || 'off';
  if (mode === 'image') {
    return <BannerSlider banner={banner} onNav={onNav} onPrescription={onPrescription} />;
  }
  return null;
}

function Differentials({ ctx }) {
  const { onNav, requireAuth, openPrescription } = ctx;
  const items = [
    { icon: 'truck', t: 'Entrega em até 1 hora', d: 'Receba seu pedido em casa no mesmo dia.', cta: 'Ver ofertas', acc: 'var(--fa-success)', action: () => onNav({ name: 'offers' }) },
    { icon: 'gift', t: 'Cashback nas suas compras', d: 'Acumule e use em compras futuras.', cta: 'Meu saldo', acc: 'var(--fa-warn)', action: () => requireAuth(() => onNav({ name: 'cashback' })) },
    { icon: 'pin', t: 'Retire na farmácia em 15 min', d: 'Compre online e busque na loja mais perto.', cta: 'Ver medicamentos', acc: 'var(--fa-info)', action: () => onNav({ name: 'category', cat: 'medicamentos' }) },
    { icon: 'rx', t: 'Receita digital', d: 'Envie sua receita e compre com facilidade.', cta: 'Enviar receita', acc: 'var(--fa-primary)', action: () => openPrescription() },
    { icon: 'card', t: 'Parcele em até 3x sem juros', d: 'Divida o valor da sua compra sem taxas extras.', cta: 'Ver carrinho', acc: 'var(--fa-vital)', action: () => onNav({ name: 'cart' }) },
  ];
  return (
    <div className="fa-diff-grid">
      {items.map((item) => (
        <button key={item.t} className="fa-diff" style={{ '--acc': item.acc }} onClick={item.action}>
          <Icon name={item.icon} size={108} stroke={1} className="fa-diff-glyph" />
          <Icon name={item.icon} size={28} stroke={1.6} className="fa-diff-icon" />
          <div className="fa-diff-t">{item.t}</div>
          <p className="fa-diff-d">{item.d}</p>
          <span className="fa-diff-link">
            {item.cta}
            <span className="fa-diff-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

// Marcas em destaque: tira de círculos configurada no console interno (Marketplace → Marcas em
// destaque). Cada círculo leva para a vitrine já filtrada pela marca (ShopScreen mode="brand"),
// filtro comparado client-side contra CatalogItem.brand — mesmo esquema de `route.cat`. Layout
// espalha os círculos de ponta a ponta do container, igual ao menu de atalhos/categorias
// (QuickCategories, `.fa-quickcats`) logo acima. Até 7 círculos cabem numa fileira só; a partir do
// 8º, vira carrossel (mesmo idioma de rail com setas + scroll-snap já usado em
// CartRecommendations, em cart-screen.jsx) em vez de quebrar linha.
const BRAND_CIRCLES_VISIBLE = 7;

function BrandCircles({ brands, onNav }) {
  const trackRef = useRef(null);
  const mode = (brands && brands.mode) || 'off';
  const circles = (brands && brands.circles) || [];
  if (mode !== 'on' || !circles.length) {
    return null;
  }

  const scrollTrack = (direction) => {
    if (!trackRef.current) return;
    const amount = trackRef.current.clientWidth * 0.9;
    trackRef.current.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  const items = circles.map((circle) => (
    <button key={circle.id} className="fa-brand-circle" onClick={() => onNav({ name: 'brand', brand: circle.brandName })} title={circle.altText || circle.brandName}>
      <span className="fa-brand-circle-img"><img src={circle.image} alt={circle.altText || circle.brandName} /></span>
      <span className="fa-brand-circle-label">{circle.brandName}</span>
    </button>
  ));

  if (circles.length <= BRAND_CIRCLES_VISIBLE) {
    return <div className="fa-brands-strip">{items}</div>;
  }

  return (
    <div className="fa-brand-carousel">
      <button type="button" className="fa-brand-carousel-arrow" data-side="prev" aria-label="Ver marcas anteriores" onClick={() => scrollTrack(-1)}><Icon name="chevL" size={17} /></button>
      <button type="button" className="fa-brand-carousel-arrow" data-side="next" aria-label="Ver mais marcas" onClick={() => scrollTrack(1)}><Icon name="chevR" size={17} /></button>
      <div ref={trackRef} className="fa-brands-strip fa-brands-strip--scroll fa-noscroll">{items}</div>
    </div>
  );
}

function HomeScreen({ ctx }) {
  const { products, cats, onNav, openPrescription, cardVariant, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, recent, homeBanner, homeBrands } = ctx;
  const offers = products.filter((product) => product.discount > 0).slice(0, 10);
  const bestsellers = products.filter((product) => product.tags.includes('mais-vendido'));
  const featuredFill = products.filter((product) => product.rating >= 4.7 && !bestsellers.includes(product));
  const featured = [...bestsellers, ...featuredFill].slice(0, 10);
  const recentProducts = (recent || []).map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const fallback = products.filter((product) => product.reviews > 200 && !recentProducts.includes(product));
  const seen = [...recentProducts, ...fallback].filter((product, index, list) => list.indexOf(product) === index).slice(0, 10);
  const personal = products.filter((product) => product.cat && product.cat !== 'medicamentos').slice(0, 10);
  const cardProps = { variant: cardVariant, onOpen: (product) => onNav({ name: 'product', id: product.id }), onAdd: addToCart, onFav: toggleFav, onNotify: subscribeAvailabilityAlert };
  const grid = (list) => <div className="fa-grid-5">{list.map((product) => <ProductCard key={product.id} product={product} {...cardProps} fav={fav.includes(product.id)} notified={availabilityAlerts.includes(product.id)} />)}</div>;

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 28, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 44 }}>
      <QuickCategories cats={cats} onNav={onNav} />
      <HomeBanner banner={homeBanner} onNav={onNav} onPrescription={openPrescription} />
      <Differentials ctx={ctx} />
      <BrandCircles brands={homeBrands} onNav={onNav} />
      <div className="fa-feed">
        <section className="fa-feed-sec fa-feed-tight">
          <SectionHead eyebrow="Economize" title="Produtos com até 95% de desconto" action="Ver todas" onAction={() => onNav({ name: 'offers' })} />
          {grid(offers)}
        </section>
        <section className="fa-feed-sec">
          <SectionHead eyebrow="Hoje" title="Destaque do dia" action="Ver mais" onAction={() => onNav({ name: 'category', cat: 'medicamentos' })} />
          {grid(featured)}
        </section>
        <section className="fa-feed-sec">
          <SectionHead eyebrow="Continue de onde parou" title="Vistos recentemente" />
          {grid(seen)}
        </section>
        <section className="fa-feed-sec">
          <SectionHead eyebrow="Tendência" title="Cuidados pessoais" action="Ver tudo" onAction={() => onNav({ name: 'category', cat: 'perfumaria' })} />
          {grid(personal)}
        </section>
      </div>
    </div>
  );
}

export { BannerSlider, BrandCircles, Differentials, HomeBanner, HomeScreen, QuickCategories, SectionHead };
