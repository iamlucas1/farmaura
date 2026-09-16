import React, { useEffect, useMemo, useRef, useState } from "react";
import { DealCountdown, ProductCard, brl, resolveDealOfTheDayProducts, resolveHomeTrendsProducts, useModalStack } from "../core/marketplace-components.jsx";
import { FullBleedBand } from "../core/marketplace-bands.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Catalog screen: category / search / offers with filters + sort. */

// Category accent, copied from the demo's fixed per-category `--acc` assignment (Medicamentos =
// primary, Vitaminas = success, Higiene = info, Infantil = warn-ink, Perfumaria = vital,
// Bem-estar = primary-ink, Serviços = ink-2). The real catalog's category set/order doesn't match
// the demo's 7 one-for-one, so match by label first and only fall back to the demo's own rotation
// (by index) for a real category the demo never named.
const FA_CATEGORY_ACCENTS = ['var(--fa-primary)', 'var(--fa-success)', 'var(--fa-info)', 'var(--fa-warn-ink)', 'var(--fa-vital)', 'var(--fa-primary-ink)', 'var(--fa-ink-2)'];
const FA_CATEGORY_ACCENT_BY_LABEL = [
  ['medicamentos', 'var(--fa-primary)'],
  ['vitaminas', 'var(--fa-success)'],
  ['higiene', 'var(--fa-info)'],
  ['infantil', 'var(--fa-warn-ink)'],
  ['perfumaria', 'var(--fa-vital)'],
  ['bem-estar', 'var(--fa-primary-ink)'],
  ['bem estar', 'var(--fa-primary-ink)'],
  ['servicos', 'var(--fa-ink-2)'],
  ['ofertas', 'var(--fa-vital)'],
  ['mais buscados', 'var(--fa-success)'],
];
const FA_DIACRITIC_RE = new RegExp('[̀-ͯ]', 'g');
const normalizeCategoryLabel = (label) => String(label || '').toLowerCase().normalize('NFD').replace(FA_DIACRITIC_RE, '');
const categoryAccent = (index, label) => {
  const normalized = normalizeCategoryLabel(label);
  const match = FA_CATEGORY_ACCENT_BY_LABEL.find(([key]) => normalized.startsWith(key));
  return match ? match[1] : FA_CATEGORY_ACCENTS[index % FA_CATEGORY_ACCENTS.length];
};

// The demo only ever rails real categories + Serviços de saúde, but the real app also has two
// more "browse everything" listing modes (Ofertas, Mais buscados) that deserve the same always-
// visible submenu treatment — so the rail here is real categories plus those three fixed routes,
// in the same order they already appear across the header nav / drawer.
function buildRailItems(cats) {
  return [
    ...cats.map((cat) => ({ id: cat.id, label: cat.label, route: { name: 'category', cat: cat.id } })),
    { id: '__offers__', label: 'Ofertas', route: { name: 'offers' } },
    { id: '__mostsearched__', label: 'Mais buscados', route: { name: 'discover' } },
    { id: '__services__', label: 'Serviços de saúde', route: { name: 'services' } },
  ];
}

// The demo's "submenu para as outras categorias" — a horizontal rail of every category (plus, in
// this app, Ofertas/Mais buscados/Serviços de saúde), always visible while browsing one, so
// switching never requires a trip back to the header nav.
function CategoryRail({ items, activeId, onNav }) {
  return (
    <div className="fa-cat-rail">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className="fa-cat-rail-item"
          data-active={item.id === activeId ? '1' : '0'}
          style={{ '--acc': categoryAccent(index, item.label) }}
          onClick={() => item.id !== activeId && onNav(item.route)}
        >
          <span className="dot" />{item.label}
        </button>
      ))}
    </div>
  );
}

function CheckRow({ label, count, on, onToggle }) {
  return (
    <label className="fa-check" data-on={on ? '1' : '0'} onClick={onToggle}>
      <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
      <span style={{ flex: 1 }}>{label}</span>
      {count != null && <span className="fa-faint" style={{ fontSize: 12.5 }}>{count}</span>}
    </label>
  );
}

function FilterPanel({ source, filters, setFilters, maxPrice }) {
  const subcats = useMemo(() => {
    const map = {};
    source.forEach((product) => {
      if (product.sub) {
        map[product.sub] = (map[product.sub] || 0) + 1;
      }
    });
    return Object.entries(map).sort((left, right) => right[1] - left[1]);
  }, [source]);
  const brands = useMemo(() => {
    const map = {};
    source.forEach((product) => {
      map[product.brand] = (map[product.brand] || 0) + 1;
    });
    return Object.entries(map).sort((left, right) => right[1] - left[1]).slice(0, 8);
  }, [source]);

  const toggle = (key, value) => {
    const values = filters[key];
    setFilters({ ...filters, [key]: values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value] });
  };

  const Group = ({ title, children }) => (
    <div style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid var(--fa-mist)' }}>
      <div className="fa-cat-fgroup-title">{title}</div>
      {children}
    </div>
  );

  return (
    <div>
      <Group title="Filtros rápidos">
        <CheckRow label="Somente ofertas" on={filters.onlyOffers} onToggle={() => setFilters({ ...filters, onlyOffers: !filters.onlyOffers })} />
        <CheckRow label="Disponível p/ assinatura" on={filters.onlySub} onToggle={() => setFilters({ ...filters, onlySub: !filters.onlySub })} />
        <CheckRow label="Sem receita" on={filters.noRx} onToggle={() => setFilters({ ...filters, noRx: !filters.noRx })} />
      </Group>
      {subcats.length > 1 && (
        <Group title="Tipo">
          {subcats.map(([subcat, count]) => <CheckRow key={subcat} label={subcat} count={count} on={filters.subs.includes(subcat)} onToggle={() => toggle('subs', subcat)} />)}
        </Group>
      )}
      <Group title="Preço máximo">
        <input type="range" style={{ width: '100%', accentColor: 'var(--fa-primary)' }} min={10} max={maxPrice} step={5} value={filters.maxPrice} onChange={(event) => setFilters({ ...filters, maxPrice: Number(event.target.value) })} />
        <div className="fa-cat-price-labels">
          <span>R$ 10</span><span style={{ color: 'var(--fa-primary)' }}>até {brl(filters.maxPrice)}</span>
        </div>
      </Group>
      <Group title="Marca">
        {brands.map(([brand, count]) => <CheckRow key={brand} label={brand} count={count} on={filters.brands.includes(brand)} onToggle={() => toggle('brands', brand)} />)}
      </Group>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--fa-success)', flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--fa-success)', fontWeight: 600 }}>Avaliação 4,0★ ou mais</span>
        <button className="fa-toggle-mini" onClick={() => setFilters({ ...filters, topRated: !filters.topRated })} style={{ marginLeft: 'auto', flex: 'none', width: 34, height: 20, borderRadius: 99, border: 'none', background: filters.topRated ? 'var(--fa-success)' : 'var(--fa-mist)', position: 'relative', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 2, left: filters.topRated ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: '#fff', transition: 'left .15s' }} />
        </button>
      </div>
    </div>
  );
}

function brandInitials(name) {
  return String(name || '').split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'FA';
}

const SORTS = [
  { id: 'relevance', label: 'Relevância' },
  { id: 'price-asc', label: 'Menor preço' },
  { id: 'price-desc', label: 'Maior preço' },
  { id: 'discount', label: 'Maior desconto' },
  { id: 'rating', label: 'Melhor avaliados' },
];

function ShopScreen({ ctx, mode }) {
  const { cats, products, route, onNav, addToCart, fav, toggleFav, availabilityAlerts, subscribeAvailabilityAlert, cardVariant, mostSearchedProductIds, dealOfTheDay, homeTrends, authClient } = ctx;
  const category = mode === 'category' ? cats.find((entry) => entry.id === route.cat) : null;
  const query = mode === 'search' ? (route.query || '') : '';
  const source = useMemo(() => {
    if (mode === 'category') return products.filter((product) => product.cat === route.cat);
    if (mode === 'brand') return products.filter((product) => product.brand === route.brand);
    if (mode === 'offers') return resolveDealOfTheDayProducts(dealOfTheDay, products);
    if (mode === 'trends') return resolveHomeTrendsProducts(homeTrends, products);
    if (mode === 'mostsearched') {
      // Real demand ranking (online + PDV sales volume) first, in server-computed order;
      // products with no sales history yet fall back after it, sorted by reviews so the
      // listing is never emptier than the plain catalog. GET /catalog/most-searched returns
      // InventoryItem.product_id, not this catalog's public "mkt-<slug>" ids — matched against
      // `product.aliases` ("prod-<product_id>"), same ref-normalization principle as
      // resolveDealOfTheDayProducts/resolveMostSearchedProducts.
      const rank = new Map((mostSearchedProductIds || []).map((id, index) => ['prod-' + id, index]));
      const rankOf = (product) => {
        const ref = product.aliases && product.aliases.find((alias) => rank.has(alias));
        return ref ? rank.get(ref) : Infinity;
      };
      return [...products].sort((left, right) => {
        const leftRank = rankOf(left);
        const rightRank = rankOf(right);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return right.reviews - left.reviews;
      });
    }
    if (mode === 'saved') return products.filter((product) => fav.includes(product.id));
    if (mode === 'search') {
      const normalizedQuery = query.toLowerCase();
      return products.filter((product) => (product.name + ' ' + product.brand + ' ' + product.sub + ' ' + product.cat).toLowerCase().includes(normalizedQuery));
    }
    return products;
  }, [dealOfTheDay, homeTrends, fav, mode, products, query, route.cat, route.brand]);
  const maxPrice = useMemo(() => Math.max(60, ...source.map((product) => Math.ceil(product.price / 10) * 10)), [source]);
  const createInitialFilters = () => ({ subs: [], brands: [], onlyOffers: false, onlySub: false, noRx: false, topRated: false, maxPrice });
  const [filters, setFilters] = useState(createInitialFilters);
  const [sort, setSort] = useState('relevance');
  const [mobileFilters, setMobileFilters] = useState(false);
  // Grows open left-to-right and, on close, retreats right-to-left (see .fa-drawer-grow) — the
  // panel stays mounted for the retreat's duration instead of unmounting instantly, so the close
  // animation has something to play against.
  const [mobileFiltersClosing, setMobileFiltersClosing] = useState(false);
  const mobileFiltersCloseTimer = useRef(null);
  const openMobileFilters = () => {
    if (mobileFiltersCloseTimer.current) { clearTimeout(mobileFiltersCloseTimer.current); mobileFiltersCloseTimer.current = null; }
    setMobileFiltersClosing(false);
    setMobileFilters(true);
  };
  const closeMobileFilters = () => {
    // Skip the animation delay entirely for reduced-motion — otherwise closing would sit on a
    // blank/invisible 220ms wait with no animation to justify it.
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { setMobileFilters(false); return; }
    setMobileFiltersClosing(true);
    mobileFiltersCloseTimer.current = setTimeout(() => {
      setMobileFilters(false);
      setMobileFiltersClosing(false);
      mobileFiltersCloseTimer.current = null;
    }, 220);
  };
  useEffect(() => () => { if (mobileFiltersCloseTimer.current) clearTimeout(mobileFiltersCloseTimer.current); }, []);
  useModalStack(mobileFilters, closeMobileFilters);

  // Brand identity (logo/description) is real catalog data (Brand.description/logo_url,
  // internal Catálogo → Marcas) but isn't part of the marketplace bootstrap — most brands have
  // it blank today, so this always degrades gracefully (avatar falls back to initials, the
  // description paragraph just doesn't render) rather than inventing copy.
  const [brandInfo, setBrandInfo] = useState(null);
  useEffect(() => {
    if (mode !== 'brand' || !route.brand) {
      setBrandInfo(null);
      return undefined;
    }
    let cancelled = false;
    authClient.publicRequest('/brands/public/' + encodeURIComponent(route.brand))
      .then((data) => { if (!cancelled) setBrandInfo(data); })
      .catch(() => { if (!cancelled) setBrandInfo(null); });
    return () => { cancelled = true; };
  }, [mode, route.brand]);

  useEffect(() => {
    setFilters(createInitialFilters());
  }, [mode, route.cat, route.brand, route.query, maxPrice]);

  const result = useMemo(() => {
    const filtered = source.filter((product) => {
      if (filters.onlyOffers && product.discount <= 0) return false;
      if (filters.onlySub && !product.tags.includes('assinatura')) return false;
      if (filters.noRx && product.rx) return false;
      if (filters.topRated && product.rating < 4) return false;
      if (product.price > filters.maxPrice) return false;
      if (filters.subs.length && !filters.subs.includes(product.sub)) return false;
      if (filters.brands.length && !filters.brands.includes(product.brand)) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((left, right) => left.price - right.price);
    else if (sort === 'price-desc') sorted.sort((left, right) => right.price - left.price);
    else if (sort === 'discount') sorted.sort((left, right) => right.discount - left.discount);
    else if (sort === 'rating') sorted.sort((left, right) => right.rating - left.rating);
    return sorted;
  }, [filters, sort, source]);

  const activeChips = [
    ...filters.subs.map((value) => ({ k: 'subs', v: value, l: value })),
    ...filters.brands.map((value) => ({ k: 'brands', v: value, l: value })),
    ...(filters.onlyOffers ? [{ k: 'onlyOffers', l: 'Ofertas' }] : []),
    ...(filters.onlySub ? [{ k: 'onlySub', l: 'Assinatura' }] : []),
    ...(filters.noRx ? [{ k: 'noRx', l: 'Sem receita' }] : []),
    ...(filters.topRated ? [{ k: 'topRated', l: '4★+' }] : []),
  ];
  const clearChip = (chip) => {
    if (Array.isArray(filters[chip.k])) {
      setFilters({ ...filters, [chip.k]: filters[chip.k].filter((entry) => entry !== chip.v) });
      return;
    }
    setFilters({ ...filters, [chip.k]: false });
  };

  const header = mode === 'category'
    ? { eyebrow: 'Categoria', title: category ? category.label : '', desc: category ? category.desc : '' }
    : mode === 'brand'
      ? { eyebrow: 'Marca', title: route.brand || '', desc: `${result.length} ${result.length === 1 ? 'produto encontrado' : 'produtos encontrados'} da marca ${route.brand || ''}.` }
    : mode === 'offers'
      ? { eyebrow: 'Economize', title: (dealOfTheDay && dealOfTheDay.title) || 'Ofertas do dia', desc: (dealOfTheDay && dealOfTheDay.subtitle) || 'Descontos selecionados com proporção controlada — aproveite enquanto duram.' }
      : mode === 'mostsearched'
        ? { eyebrow: 'Em alta', title: 'Mais buscados', desc: 'Os produtos que a comunidade Farmaura mais procura agora.' }
        : mode === 'trends'
          ? { eyebrow: 'Em alta', title: 'Tendências', desc: 'O que está em alta na sua região agora.' }
          : mode === 'catalog'
            ? { eyebrow: 'Catálogo', title: 'Catálogo completo', desc: `${result.length} ${result.length === 1 ? 'produto disponível' : 'produtos disponíveis'}.` }
            : mode === 'saved'
              ? { eyebrow: 'Sua seleção', title: 'Produtos salvos', desc: `${result.length} ${result.length === 1 ? 'item favoritado' : 'itens favoritados'} · toque no coração para guardar mais.` }
              : { eyebrow: 'Resultados', title: query ? `“${query}”` : 'Busca', desc: `${result.length} ${result.length === 1 ? 'produto encontrado' : 'produtos encontrados'}` };

  const cardProps = { variant: cardVariant, onOpen: (product) => onNav({ name: 'product', id: product.id }), onAdd: addToCart, onBuyNow: (product) => { addToCart(product); onNav({ name: 'cart' }); }, onFav: toggleFav, onNotify: subscribeAvailabilityAlert };

  // Category/Ofertas/Mais buscados all get the demo's plain (uncolored) crumb + two-tone masthead
  // + submenu rail — distinct from every other listing mode here, which keeps the full-bleed band
  // treatment the demo doesn't define an equivalent page for. The rail itself always lists every
  // real category plus Ofertas/Mais buscados/Serviços de saúde, so switching between any of them
  // never requires a trip back to the header nav.
  const isRailMode = mode === 'category' || mode === 'offers' || mode === 'mostsearched';
  const railItems = buildRailItems(cats);
  const activeRailId = mode === 'category' ? route.cat : mode === 'offers' ? '__offers__' : mode === 'mostsearched' ? '__mostsearched__' : null;
  const activeRailIndex = Math.max(0, railItems.findIndex((item) => item.id === activeRailId));
  const acc = categoryAccent(activeRailIndex, header.title);

  const headerBlock = isRailMode ? (
    <div className="fa-wrap">
      <div className="fa-cat-crumb">
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a>
        <Icon name="chevR" size={13} />
        <span className="fa-cat-crumb-current">{header.title}</span>
      </div>
      <div className="fa-cat-masthead" style={{ '--acc': acc }}>
        <h1 className="fa-cat-title"><span className="fa-cat-title-mark">{header.title.slice(0, 1)}</span><span className="fa-cat-title-rest">{header.title.slice(1)}</span></h1>
      </div>
      <CategoryRail items={railItems} activeId={activeRailId} onNav={onNav} />
    </div>
  ) : (
    <FullBleedBand index={2}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a>
        <Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>{header.title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        {mode === 'brand' && (
          <span className="fa-avatar" style={{ flex: 'none' }}>
            {brandInfo && brandInfo.logo_url ? <img src={brandInfo.logo_url} alt={header.title} /> : brandInitials(header.title)}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="fa-eyebrow">{header.eyebrow}</p>
          <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,36px)', marginTop: 6 }}>{header.title}</h1>
          {mode === 'brand' && brandInfo && brandInfo.description ? (
            <p className="fa-lead" style={{ marginTop: 8 }}>{brandInfo.description}</p>
          ) : null}
          <p className="fa-lead" style={{ marginTop: 8 }}>{header.desc}</p>
        </div>
      </div>
    </FullBleedBand>
  );

  return (
    <div className="fa-fadein">
      {headerBlock}
      <div className="fa-wrap" style={{ paddingTop: isRailMode ? 0 : 28, paddingBottom: 20 }}>
      {mode === 'offers' && result.length > 0 && dealOfTheDay && dealOfTheDay.showCountdown !== false && (
        <div className="fa-card" style={{ background: 'var(--fa-vital)', color: '#fff', border: 'none', padding: '18px 26px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="fa-iconbox" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}><Icon name="percent" size={22} stroke={2.2} /></span>
          <div style={{ flex: 1, minWidth: 200, fontWeight: 700, fontSize: 14.5 }}>
            Preços válidos só até às {(dealOfTheDay && dealOfTheDay.resetTime) || '00:00'}
          </div>
          <DealCountdown resetTime={dealOfTheDay && dealOfTheDay.resetTime} />
        </div>
      )}
      <div className="fa-shop-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--fa-gap)', alignItems: 'start' }}>
        <aside className="fa-card fa-shop-side fa-cat-side" style={{ padding: 20, position: 'sticky', top: 130, maxHeight: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
          <div className="fa-cat-side-head" style={{ marginBottom: 16, flex: 'none' }}>
            <span style={{ fontWeight: 800, fontSize: 14.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="filter" size={17} />Filtros</span>
            <button className="fa-cat-clear" onClick={() => setFilters(createInitialFilters())}>Limpar</button>
          </div>
          <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
            <FilterPanel source={source} filters={filters} setFilters={setFilters} maxPrice={maxPrice} />
          </div>
        </aside>
        <div>
          <div className="fa-cat-toolbar" style={{ gap: 12 }}>
            <button className="fa-btn fa-btn-soft fa-btn-sm fa-mobile-filter-btn" style={{ display: 'none' }} onClick={openMobileFilters}><Icon name="filter" size={16} />Filtros</button>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="fa-muted fa-cat-sort-label" style={{ fontSize: 13 }}>Ordenar</span>
              <select className="fa-input" style={{ height: 40, width: 'auto', paddingRight: 32 }} value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </div>
          </div>
          {activeChips.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {activeChips.map((chip, index) => (
                <button key={index} className="fa-chip" data-active="1" onClick={() => clearChip(chip)} style={{ background: 'var(--fa-primary)', color: '#fff', borderColor: 'var(--fa-primary)' }}>
                  {chip.l}<Icon name="close" size={13} stroke={2.4} />
                </button>
              ))}
            </div>
          )}
          {result.length === 0 ? (
            <div className="fa-card" style={{ padding: 48, textAlign: 'center' }}>
              <span className="fa-iconbox" style={{ margin: '0 auto 12px', width: 56, height: 56 }}><Icon name={mode === 'saved' ? 'heart' : 'search'} size={26} /></span>
              <div className="fa-h3">{mode === 'saved' ? 'Nenhum produto salvo ainda' : 'Nada por aqui'}</div>
              <p className="fa-muted" style={{ marginTop: 6 }}>{mode === 'saved' ? 'Toque no coração de qualquer produto para guardá-lo aqui.' : 'Tente ajustar os filtros ou buscar outro termo.'}</p>
              <button className="fa-btn fa-btn-ghost" style={{ marginTop: 16 }} onClick={() => mode === 'saved' ? onNav({ name: 'discover' }) : setFilters(createInitialFilters())}>{mode === 'saved' ? 'Ver mais buscados' : 'Limpar filtros'}</button>
            </div>
          ) : (
            <div className="fa-grid">
              {result.map((product) => <ProductCard key={product.id} product={product} {...cardProps} fav={fav.includes(product.id)} notified={availabilityAlerts.includes(product.id)} />)}
            </div>
          )}
        </div>
      </div>
      </div>
      {(mobileFilters || mobileFiltersClosing) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(43,26,26,.4)' }} />
          <div className="fa-drawer-grow" data-closing={mobileFiltersClosing ? '1' : '0'} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(360px,90vw)', background: 'var(--fa-bg)', padding: 20, overflowY: 'auto', boxShadow: 'var(--fa-shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Filtros</span>
              <button className="fa-iconbtn" onClick={closeMobileFilters}><Icon name="close" /></button>
            </div>
            <FilterPanel source={source} filters={filters} setFilters={setFilters} maxPrice={maxPrice} />
            <button className="fa-btn fa-btn-primary fa-btn-block fa-btn-lg" style={{ marginTop: 12 }} onClick={closeMobileFilters}>Ver {result.length} itens</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CategoryRail, CheckRow, FilterPanel, SORTS, ShopScreen, buildRailItems, categoryAccent };
