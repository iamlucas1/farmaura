import React, { useEffect, useState } from "react";
import { AuraLayer, ProductCard } from "../core/marketplace-components.jsx";
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
  const categoryShortcuts = (cats || []).map((cat) => ({
    id: 'qc-cat-' + cat.id,
    label: cat.label,
    glyph: cat.glyph || 'pill',
    go: { name: 'category', cat: cat.id },
  }));
  const shortcuts = [
    { id: 'qc-buscados', label: 'Mais buscados', glyph: 'search', go: { name: 'discover' } },
    { id: 'qc-salvos', label: 'Produtos salvos', glyph: 'heart', go: { name: 'saved' } },
    { id: 'qc-ofertas', label: 'Ofertas', glyph: 'percent', go: { name: 'offers' } },
    ...categoryShortcuts,
    { id: 'qc-servicos', label: 'Serviços de saúde', glyph: 'activity', go: { name: 'services' } },
  ];
  return (
    <nav className="fa-quickcats fa-noscroll" aria-label="Atalhos">
      {shortcuts.map((c) => (
        <button key={c.id} className="fa-quickcat" onClick={() => onNav(c.go)}>
          <span className="fa-quickcat-tile"><Icon name={c.glyph} size={26} stroke={2} /></span>
          <span className="fa-quickcat-label">{c.label}</span>
        </button>
      ))}
    </nav>
  );
}

const BANNER_SLIDES = [
  {
    id: 'cuidado', bg: 'var(--fa-primary)', color: '#fff', auraTone: '#fff',
    badge: 'Nova forma de cuidar', glyph: 'bag',
    title: 'Cuidado que acompanha você',
    lead: 'Saúde, bem-estar e conveniência numa experiência mais próxima. Entrega em 60 minutos e farmacêutico sempre por perto.',
    actions: [
      { label: 'Ver ofertas', icon: 'percent', cls: 'fa-btn-vital', go: { name: 'offers' } },
      { label: 'Enviar receita', icon: 'rx', cls: '', soft: true, rx: true },
    ],
  },
  {
    id: 'desconto', bg: 'var(--fa-vital)', color: '#fff', auraTone: '#fff',
    badge: 'Semana do desconto', glyph: 'tag',
    title: 'Produtos com até 95% de desconto',
    lead: 'Uma seleção de medicamentos, dermocosméticos e bem-estar com preços que cuidam do seu bolso. Por tempo limitado.',
    actions: [
      { label: 'Aproveitar agora', icon: 'bolt', cls: 'fa-btn', light: true, go: { name: 'offers' } },
    ],
  },
  {
    id: 'servicos', bg: 'var(--fa-rose-soft)', color: 'var(--fa-primary-ink)', auraTone: 'var(--fa-primary)',
    badge: 'Na sua farmácia', glyph: 'activity', dark: true,
    title: 'Serviços de saúde sem sair do bairro',
    lead: 'Vacinas, testes rápidos, aferições e aplicações com nossos farmacêuticos. Agende em poucos toques.',
    actions: [
      { label: 'Ver serviços', icon: 'activity', cls: 'fa-btn-primary', go: { name: 'services' } },
      { label: 'Receita digital', icon: 'rx', cls: 'fa-btn-ghost', rx: true },
    ],
  },
];

function BannerSlider({ onNav, onPrescription }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = BANNER_SLIDES.length;
  const go = (nextIndex) => setIndex((nextIndex + total) % total);

  useEffect(() => {
    if (paused) {
      return undefined;
    }
    const timer = setInterval(() => setIndex((current) => (current + 1) % total), 5800);
    return () => clearInterval(timer);
  }, [paused, total]);

  return (
    <section className="fa-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carrossel">
      <div className="fa-slider-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {BANNER_SLIDES.map((slide) => (
          <div key={slide.id} className="fa-slide" style={{ background: slide.bg, color: slide.color }}>
            <AuraLayer tone={slide.auraTone} />
            <div className="fa-slide-content">
              <span className="fa-badge fa-badge-rose" style={slide.dark ? { background: 'var(--fa-primary)', color: '#fff' } : {}}>
                <Icon name="sparkle" size={13} stroke={2} />{slide.badge}
              </span>
              <h1 className="fa-h1" style={{ color: slide.color, marginTop: 16 }}>{slide.title}</h1>
              <p className="fa-slide-lead" style={{ color: slide.dark ? 'var(--fa-ink-2)' : 'rgba(255,255,255,.92)' }}>{slide.lead}</p>
              <div className="fa-slide-actions">
                {slide.actions.map((action, actionIndex) => (
                  <button
                    key={actionIndex}
                    className={`fa-btn fa-btn-lg ${action.cls}`}
                    style={action.soft ? { background: 'rgba(255,255,255,.16)', color: '#fff' } : action.light ? { background: '#fff', color: 'var(--fa-vital)' } : undefined}
                    onClick={() => {
                      if (action.rx) {
                        onPrescription && onPrescription();
                      } else if (action.go) {
                        onNav(action.go);
                      }
                    }}
                  >
                    <Icon name={action.icon} size={18} stroke={2} />{action.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fa-slide-art fa-hero-art">
              <div className="fa-slide-art-box" style={{ borderColor: slide.dark ? 'var(--fa-rose)' : 'rgba(255,255,255,.18)', background: slide.dark ? 'rgba(122,13,22,.06)' : 'rgba(255,255,255,.10)' }}>
                <Icon name={slide.glyph} size={86} stroke={1.1} style={{ color: slide.dark ? 'var(--fa-primary)' : 'rgba(255,255,255,.5)' }} />
                <span className="fa-mono" style={{ position: 'absolute', bottom: 16, fontSize: 11, letterSpacing: '.06em', color: slide.dark ? 'var(--fa-ink-3)' : 'rgba(255,255,255,.55)' }}>banner image</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="fa-slider-arrow" data-side="prev" onClick={() => go(index - 1)} aria-label="Anterior"><Icon name="chevL" size={20} stroke={2.2} /></button>
      <button className="fa-slider-arrow" data-side="next" onClick={() => go(index + 1)} aria-label="Próximo"><Icon name="chevR" size={20} stroke={2.2} /></button>

      <div className="fa-slider-dots">
        {BANNER_SLIDES.map((slide, dotIndex) => (
          <button key={slide.id} className="fa-slider-dot" data-on={dotIndex === index ? '1' : '0'} onClick={() => go(dotIndex)} aria-label={`Banner ${dotIndex + 1}`} />
        ))}
      </div>
    </section>
  );
}

function Differentials({ ctx }) {
  const { onNav, requireAuth, openPrescription } = ctx;
  const items = [
    { icon: 'truck', t: 'Entrega em até 1 hora', d: 'Receba seu pedido em casa no mesmo dia.', cta: 'Ver ofertas', acc: 'var(--fa-success)', action: () => onNav({ name: 'offers' }) },
    { icon: 'gift', t: 'Cashback da farmácia', d: 'Acumule e use em compras futuras.', cta: 'Meu saldo', acc: 'var(--fa-warn)', action: () => requireAuth(() => onNav({ name: 'cashback' })) },
    { icon: 'pin', t: 'Retire na farmácia em 20 min', d: 'Compre online e busque na loja mais perto.', cta: 'Ver medicamentos', acc: 'var(--fa-info)', action: () => onNav({ name: 'category', cat: 'medicamentos' }) },
    { icon: 'rx', t: 'Receita digital', d: 'Envie sua receita e compre com facilidade.', cta: 'Enviar receita', acc: 'var(--fa-primary)', action: () => openPrescription() },
  ];
  return (
    <div className="fa-grid" style={{ '--fa-grid-min': '236px' }}>
      {items.map((item) => (
        <button key={item.t} className="fa-diff" style={{ '--acc': item.acc }} onClick={item.action}>
          <Icon name={item.icon} size={104} stroke={1.4} className="fa-diff-glyph" />
          <span className="fa-diff-badge"><Icon name={item.icon} size={24} stroke={2} /></span>
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

function HomeScreen({ ctx }) {
  const { products, cats, onNav, openPrescription, cardVariant, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, recent } = ctx;
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
      <BannerSlider onNav={onNav} onPrescription={openPrescription} />
      <Differentials ctx={ctx} />
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

export { BANNER_SLIDES, BannerSlider, Differentials, HomeScreen, QuickCategories, SectionHead };
