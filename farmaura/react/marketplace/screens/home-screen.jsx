import React, { useEffect, useRef, useState } from "react";
import { DealCountdown, ProductCard, resolveDealOfTheDayProducts, resolveHomeTrendsProducts, resolveMostSearchedProducts } from "../core/marketplace-components.jsx";
import { FullBleedBand } from "../core/marketplace-bands.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Home / painel principal. */

// CTA de rodapé de faixa, matching o demo's `.band-cta`/`.slide-btn`: um rótulo estático que troca
// pra um segundo rótulo (ação/urgência) ao passar o mouse, via as duas "faces" empilhadas
// deslizando verticalmente — puramente decorativo (nenhuma info nova), então plain hover é o único
// gatilho real; toque em mobile só usa o primeiro rótulo, que já é suficiente sozinho.
function BandCta({ label, hoverLabel, onClick }) {
  return (
    <div className="fa-band-cta">
      <button className="fa-slide-btn" type="button" onClick={onClick}>
        <span className="fa-slide-btn-inner">
          <span className="fa-slide-btn-face">{label}<Icon name="arrowR" size={15} stroke={2.4} /></span>
          <span className="fa-slide-btn-face">{hoverLabel}<Icon name="arrowR" size={15} stroke={2.4} /></span>
        </span>
      </button>
    </div>
  );
}

// Glyph + accent per real category, matched by name to the demo's own `.catjar` icons/colors —
// the backend has no Category.glyph/color field (categories are plain name/description rows
// managed in Catálogo → Categorias), so there's nothing to read a glyph from; this is the closest
// real equivalent, keyed by the same category names the demo itself uses. A category the tenant
// hasn't set up yet (the demo also has "Vitaminas e Suplementos"/"Higiene e Cuidados", not in this
// catalog — see dev-obsidian pendência) just falls through to the generic pill glyph below.
const CATEGORY_GLYPH_BY_LABEL = {
  'Medicamentos': { glyph: 'medsCapsule', acc: 'var(--fa-primary)' },
  'Vitaminas e Suplementos': { glyph: 'vitaminSun', acc: 'var(--fa-success)' },
  'Higiene': { glyph: 'hygieneBottle', acc: 'var(--fa-info)' },
  'Infantil': { glyph: 'babyFace', acc: 'var(--fa-warn-ink)' },
  'Perfumaria': { glyph: 'perfumeDrop', acc: 'var(--fa-vital)' },
  'Bem-estar': { glyph: 'wellbeingHeart', acc: 'var(--fa-primary-ink)' },
};
// Same relative order as the demo's category shelf (whose "Higiene e Cuidados" is this tenant's
// "Higiene") — a category this tenant doesn't have yet is simply absent, not invented; a category
// the demo doesn't recognize sorts after every known one.
const CATEGORY_ORDER = ['Medicamentos', 'Vitaminas e Suplementos', 'Higiene', 'Infantil', 'Perfumaria', 'Bem-estar'];

function QuickCategories({ cats, onNav }) {
  // One single row: real, backend-driven shortcuts first, then the tenant's real category catalog
  // (managed in Catálogo → Categorias), then "Serviços de saúde"/"Produtos salvos" last — same
  // position "Serviços de saúde" holds in the demo's own category shelf. Every tile here navigates
  // somewhere backed by real data:
  // - "Ofertas" is products with an active PricingPromotion/product_discount applied.
  // - "Mais buscados" ranks by real sales volume (online + PDV), see catalog_service.list_most_searched_products.
  // - "Serviços de saúde" is the real procedure catalog managed in Catálogo → Serviços de saúde.
  // - "Produtos salvos" is the customer's real favorites list (see toggleFav) — back in this row
  //   per explicit request (it had been moved out into just the account dropdown); the tile itself
  //   works logged-out too, since the destination screen's own LoginGate handles that.
  const leadingShortcuts = [
    { id: 'sc-ofertas', label: 'Ofertas', glyph: 'percent', acc: 'var(--fa-vital)', go: { name: 'offers' } },
    { id: 'sc-buscados', label: 'Mais buscados', glyph: 'search', acc: 'var(--fa-info)', go: { name: 'discover' } },
  ];
  const orderedCats = [...(cats || [])].sort((a, b) => {
    const rankA = CATEGORY_ORDER.indexOf(a.label);
    const rankB = CATEGORY_ORDER.indexOf(b.label);
    return (rankA === -1 ? CATEGORY_ORDER.length : rankA) - (rankB === -1 ? CATEGORY_ORDER.length : rankB);
  });
  const categoryItems = orderedCats.map((cat) => {
    const known = CATEGORY_GLYPH_BY_LABEL[cat.label];
    return {
      id: 'qc-cat-' + cat.id,
      label: cat.label,
      glyph: (known && known.glyph) || 'pill',
      acc: (known && known.acc) || 'var(--fa-primary)',
      go: { name: 'category', cat: cat.id },
    };
  });
  const trailingShortcuts = [
    { id: 'sc-servicos', label: 'Serviços de saúde', glyph: 'activity', acc: 'var(--fa-ink-2)', go: { name: 'services' } },
    { id: 'sc-salvos', label: 'Produtos salvos', glyph: 'heart', acc: 'var(--fa-primary-ink)', go: { name: 'saved' } },
  ];
  const items = [...leadingShortcuts, ...categoryItems, ...trailingShortcuts];
  return (
    <nav className="fa-quickcats" aria-label="Atalhos e categorias">
      {items.map((c) => (
        <button key={c.id} className="fa-quickcat" onClick={() => onNav(c.go)}>
          <span className="fa-quickcat-tile" style={{ '--acc': c.acc }}><Icon name={c.glyph} size={25} stroke={1.8} /></span>
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
              <div key={slide.id} className="fa-slide-item fa-slide-item--html">
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

// Ofertas do dia: lista curada no console interno (Marketplace → Ofertas do dia — manual, sorteio
// automático por ciclo, ou calendário/agendado), substituindo o antigo filtro automático
// `discount > 0`. A home mostra só as 2 primeiras fileiras (cap por CSS, `.fa-deal-grid-limited`,
// mesmos breakpoints de `.fa-grid-5`) com um botão para a extensão completa da mesma lista em
// `/offers` (ver `resolveDealOfTheDayProducts`'s outro uso em `shop-screen.jsx`, mode="offers").
function DealOfTheDayStrip({ deals, title, subtitle, resetTime, showCountdown, cardProps, fav, availabilityAlerts, onNav }) {
  if (!deals.length) {
    return null;
  }
  return (
    <section className="fa-feed-sec fa-feed-tight">
      <div className="fa-deal-band">
        <span className="fa-deal-arc b1" aria-hidden="true" />
        <span className="fa-deal-arc b2" aria-hidden="true" />
        <div className="fa-deal-head">
          <div className="fa-deal-head-left">
            <span className="fa-deal-flame" aria-hidden="true">🔥</span>
            <div>
              <h2 className="fa-deal-title">{title || 'Ofertas do dia'}</h2>
              <p className="fa-deal-sub">{subtitle || `Preços válidos só até às ${resetTime || '00:00'}`}</p>
            </div>
          </div>
          {showCountdown !== false && <DealCountdown resetTime={resetTime} />}
        </div>
        <div className="fa-grid-5 fa-deal-grid fa-deal-grid-limited">
          {deals.map((product) => (
            <ProductCard key={product.id} product={product} {...cardProps} fav={fav.includes(product.id)} notified={availabilityAlerts.includes(product.id)} />
          ))}
        </div>
        <button className="fa-deal-more" onClick={() => onNav({ name: 'offers' })}>
          Ver todas as ofertas<Icon name="arrowR" size={16} />
        </button>
      </div>
    </section>
  );
}

// Pré-lançamento com catálogo vazio é um estado real do produto (ver PRODUCT.md, Princípio 5),
// não um placeholder — mostra uma única reassurance em vez de cabeçalhos de seção sobre grades
// em branco quando não há nada em nenhuma das quatro fontes da home.
function HomeFeedComingSoon() {
  return (
    <div className="fa-card fa-feed-sec" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <span className="fa-iconbox" style={{ margin: '0 auto 14px', width: 56, height: 56 }}><Icon name="sparkle" size={26} /></span>
      <div className="fa-h3">Catálogo chegando em breve</div>
      <p className="fa-muted" style={{ marginTop: 6, maxWidth: 420, marginInline: 'auto' }}>
        Estamos finalizando o estoque da loja. Assim que os produtos entrarem no ar, esta área vai mostrar destaques, itens vistos recentemente e sugestões pra você.
      </p>
    </div>
  );
}

function HomeScreen({ ctx }) {
  const { products, cats, onNav, openPrescription, cardVariant, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, recent, homeBanner, homeBrands, homeTrends, dealOfTheDay, mostSearchedProductIds } = ctx;
  const deals = resolveDealOfTheDayProducts(dealOfTheDay, products);
  const trends = resolveHomeTrendsProducts(homeTrends, products);
  // Real demand ranking (online + PDV sales volume, GET /catalog/most-searched) — no product
  // tag ever gets set to a "mais-vendido" value anywhere in the backend, so filtering by that tag
  // was silently dead code; this is the same real signal QuickCategories' "Mais buscados" shortcut
  // and ShopScreen's mode="mostsearched" already point to.
  const featured = resolveMostSearchedProducts(mostSearchedProductIds, products, 10);
  const recentProducts = (recent || []).map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const fallback = products.filter((product) => product.reviews > 200 && !recentProducts.includes(product));
  const seen = [...recentProducts, ...fallback].filter((product, index, list) => list.indexOf(product) === index).slice(0, 10);
  const personal = products.filter((product) => product.cat && product.cat !== 'medicamentos').slice(0, 10);
  const family = products.filter((product) => product.cat === 'infantil' || product.cat === 'higiene').slice(0, 10);
  const cardProps = { variant: cardVariant, onOpen: (product) => onNav({ name: 'product', id: product.id }), onAdd: addToCart, onBuyNow: (product) => { addToCart(product); onNav({ name: 'cart' }); }, onFav: toggleFav, onNotify: subscribeAvailabilityAlert };
  const grid = (list) => <div className="fa-grid-5">{list.map((product) => <ProductCard key={product.id} product={product} {...cardProps} fav={fav.includes(product.id)} notified={availabilityAlerts.includes(product.id)} />)}</div>;
  const feedIsEmpty = deals.length === 0 && featured.length === 0 && seen.length === 0 && personal.length === 0 && trends.length === 0 && family.length === 0;

  // Composição visual "padrão farmácia": cada seção real da home vira sua própria faixa
  // full-bleed, uma por seção — copiado 1:1 da ordem/cor/rótulo do demo de referência ("Categorias"
  // rose-soft → "Marcas em destaque" rose → "Visto recentemente" beige/flip → "Mais procurados" bg
  // → "Sugestões para você" info-soft/flip → "Tendências" success-soft → "Cuidados e Infantil"
  // warn-soft/flip). O índice de cor de cada banda é fixo por chave, não posicional, então uma
  // banda opcional ausente (sem marcas em destaque, sem tendências configuradas) nunca desloca a
  // cor das bandas seguintes. "Tendências" é curada manualmente pelo admin (Marketplace →
  // Tendências, console interno — home-trends-screen.jsx) em vez de um sinal automático, pelo
  // mesmo motivo que "Ofertas do dia"/"Marcas em destaque" já são curadas: sem um sinal real de
  // "alta" (crescimento período-a-período) no catálogo hoje, curadoria manual é o caminho honesto,
  // não um sinal fabricado — ver dev-obsidian/farmaura/06_Pendencias (nota original, agora resolvida).
  // "Ofertas do dia" (DealOfTheDayStrip) fica FORA da rotação de cor de propósito: no demo é uma
  // faixa sólida separada (`.deal-band`, vermelho), não uma das 7 bandas em rotação.
  const hasBanner = !!(homeBanner && homeBanner.mode === 'image' && (homeBanner.slides || []).length);
  const hasBrands = !!(homeBrands && homeBrands.mode === 'on' && (homeBrands.circles || []).length);
  const bandDefs = [
    {
      key: 'categories',
      index: 0,
      headTitle: 'Categorias',
      headSubtitle: 'Encontre rápido pelo que você precisa hoje.',
      content: <QuickCategories cats={cats} onNav={onNav} />,
    },
    hasBrands && {
      key: 'brands',
      index: 1,
      headTitle: 'Marcas em destaque',
      headSubtitle: 'As marcas em que a nossa região mais confia.',
      content: <BrandCircles brands={homeBrands} onNav={onNav} />,
    },
    seen.length > 0 && {
      key: 'recent',
      index: 2,
      headTitle: 'Visto recentemente',
      headSubtitle: 'Continue de onde parou.',
      content: <>{grid(seen)}<BandCta label="Ver histórico" hoverLabel="Continuar vendo" onClick={() => onNav({ name: 'shop' })} /></>,
    },
    featured.length > 0 && {
      key: 'bestsellers',
      index: 3,
      headTitle: 'Mais procurados',
      headSubtitle: 'O que os clientes da sua região mais compram.',
      content: <>{grid(featured)}<BandCta label="Ver catálogo" hoverLabel="Aproveitar agora" onClick={() => onNav({ name: 'discover' })} /></>,
    },
    personal.length > 0 && {
      key: 'personal',
      index: 4,
      headTitle: 'Sugestões para você',
      headSubtitle: 'Selecionado com base no que você já comprou.',
      content: <>{grid(personal)}<BandCta label="Ver sugestões" hoverLabel="Adicionar ao carrinho" onClick={() => onNav({ name: 'shop' })} /></>,
    },
    trends.length > 0 && {
      key: 'trends',
      index: 5,
      headTitle: 'Tendências',
      headSubtitle: 'O que está em alta na sua região agora.',
      content: <>{grid(trends)}<BandCta label="Ver tendências" hoverLabel="Aproveitar agora" onClick={() => onNav({ name: 'trends' })} /></>,
    },
    family.length > 0 && {
      key: 'family',
      index: 6,
      headTitle: 'Cuidados e Infantil',
      headSubtitle: 'Tudo para a família, num só lugar.',
      // Real Category.id is a generated UUID, not the literal filter key this band groups by
      // (product.cat === 'infantil' — see `family` above) — resolve the actual category by name
      // to link correctly; fall back to the full catalog on the odd chance it's missing.
      content: <>{grid(family)}<BandCta label="Ver categoria" hoverLabel="Cuidar da família" onClick={() => {
        const infantilCat = cats.find((cat) => cat.label === 'Infantil');
        onNav(infantilCat ? { name: 'category', cat: infantilCat.id } : { name: 'shop' });
      }} /></>,
    },
  ].filter(Boolean);

  return (
    <div className="fa-fadein">
      <h1 className="fa-sr-only">Farmaura — farmácia de bairro com entrega rápida, retirada em loja e cashback</h1>
      {hasBanner && (
        <div className="fa-wrap" style={{ paddingTop: 20 }}>
          <HomeBanner banner={homeBanner} onNav={onNav} onPrescription={openPrescription} />
        </div>
      )}
      {feedIsEmpty ? (
        <div className="fa-wrap" style={{ paddingTop: 20, paddingBottom: 90 }}><HomeFeedComingSoon /></div>
      ) : deals.length > 0 && (
        <div className="fa-wrap" style={{ paddingTop: 20, paddingBottom: 90 }}>
          <DealOfTheDayStrip
            deals={deals}
            title={dealOfTheDay && dealOfTheDay.title}
            subtitle={dealOfTheDay && dealOfTheDay.subtitle}
            resetTime={dealOfTheDay && dealOfTheDay.resetTime}
            showCountdown={dealOfTheDay && dealOfTheDay.showCountdown}
            cardProps={cardProps}
            fav={fav}
            availabilityAlerts={availabilityAlerts}
            onNav={onNav}
          />
        </div>
      )}
      {bandDefs.map((band) => (
        <FullBleedBand key={band.key} index={band.index} headTitle={band.headTitle} headSubtitle={band.headSubtitle}>
          {band.content}
        </FullBleedBand>
      ))}
    </div>
  );
}

export { BannerSlider, BrandCircles, DealOfTheDayStrip, HomeBanner, HomeScreen, QuickCategories };
