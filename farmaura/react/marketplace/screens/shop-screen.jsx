import React, { useEffect, useMemo, useState } from "react";
import { ProductCard, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";

/* FARMAURA — Catalog screen: category / search / offers with filters + sort. */

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
    <div style={{ paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid var(--fa-mist)' }}>
      <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>{title}</div>
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
        <input type="range" className="twk-slider" style={{ accentColor: 'var(--fa-primary)' }} min={10} max={maxPrice} step={5} value={filters.maxPrice} onChange={(event) => setFilters({ ...filters, maxPrice: Number(event.target.value) })} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fa-ink-2)', fontWeight: 600 }}>
          <span>R$ 10</span><span style={{ color: 'var(--fa-primary)' }}>até {brl(filters.maxPrice)}</span>
        </div>
      </Group>
      <Group title="Marca">
        {brands.map(([brand, count]) => <CheckRow key={brand} label={brand} count={count} on={filters.brands.includes(brand)} onToggle={() => toggle('brands', brand)} />)}
      </Group>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, background: 'var(--fa-success-soft)', borderRadius: 'var(--fa-r-card)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--fa-success)', flex: 'none' }} />
        <span style={{ fontSize: 13, color: 'var(--fa-success)', fontWeight: 600 }}>Avaliação 4,0★ ou mais</span>
        <button className="fa-toggle-mini" onClick={() => setFilters({ ...filters, topRated: !filters.topRated })} style={{ marginLeft: 'auto', width: 34, height: 20, borderRadius: 99, border: 'none', background: filters.topRated ? 'var(--fa-success)' : 'var(--fa-mist)', position: 'relative', transition: 'background .15s' }}>
          <span style={{ position: 'absolute', top: 2, left: filters.topRated ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: '#fff', transition: 'left .15s' }} />
        </button>
      </div>
    </div>
  );
}

const SORTS = [
  { id: 'relevance', label: 'Relevância' },
  { id: 'price-asc', label: 'Menor preço' },
  { id: 'price-desc', label: 'Maior preço' },
  { id: 'discount', label: 'Maior desconto' },
  { id: 'rating', label: 'Melhor avaliados' },
];

function ShopScreen({ ctx, mode }) {
  const { cats, products, route, onNav, addToCart, fav, toggleFav, cardVariant } = ctx;
  const category = mode === 'category' ? cats.find((entry) => entry.id === route.cat) : null;
  const query = mode === 'search' ? (route.query || '') : '';
  const source = useMemo(() => {
    if (mode === 'category') return products.filter((product) => product.cat === route.cat);
    if (mode === 'offers') return products.filter((product) => product.discount > 0);
    if (mode === 'mostsearched') return [...products].sort((left, right) => right.reviews - left.reviews);
    if (mode === 'saved') return products.filter((product) => fav.includes(product.id));
    if (mode === 'search') {
      const normalizedQuery = query.toLowerCase();
      return products.filter((product) => (product.name + ' ' + product.brand + ' ' + product.sub + ' ' + product.cat).toLowerCase().includes(normalizedQuery));
    }
    return products;
  }, [fav, mode, products, query, route.cat]);
  const maxPrice = useMemo(() => Math.max(60, ...source.map((product) => Math.ceil(product.price / 10) * 10)), [source]);
  const createInitialFilters = () => ({ subs: [], brands: [], onlyOffers: mode === 'offers', onlySub: false, noRx: false, topRated: false, maxPrice });
  const [filters, setFilters] = useState(createInitialFilters);
  const [sort, setSort] = useState('relevance');
  const [view, setView] = useState(cardVariant);
  const [mobileFilters, setMobileFilters] = useState(false);

  useEffect(() => {
    setFilters(createInitialFilters());
    setView(cardVariant);
  }, [cardVariant, mode, route.cat, route.query, maxPrice]);

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
    ...(filters.onlyOffers && mode !== 'offers' ? [{ k: 'onlyOffers', l: 'Ofertas' }] : []),
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
    ? { eyebrow: 'Categoria', title: category.label, desc: category.desc }
    : mode === 'offers'
      ? { eyebrow: 'Economize', title: 'Ofertas da semana', desc: 'Descontos selecionados com proporção controlada — aproveite enquanto duram.' }
      : mode === 'mostsearched'
        ? { eyebrow: 'Em alta', title: 'Mais buscados', desc: 'Os produtos que a comunidade Farmaura mais procura agora.' }
        : mode === 'saved'
          ? { eyebrow: 'Sua seleção', title: 'Produtos salvos', desc: `${result.length} ${result.length === 1 ? 'item favoritado' : 'itens favoritados'} · toque no coração para guardar mais.` }
          : { eyebrow: 'Resultados', title: query ? `“${query}”` : 'Busca', desc: `${result.length} ${result.length === 1 ? 'produto encontrado' : 'produtos encontrados'}` };

  const cardProps = { variant: view, onOpen: (product) => onNav({ name: 'product', id: product.id }), onAdd: addToCart, onFav: toggleFav };

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a>
        <Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>{header.title}</span>
      </div>
      {mode === 'offers' && (
        <div className="fa-card" style={{ background: 'var(--fa-vital)', color: '#fff', border: 'none', padding: '22px 26px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span className="fa-iconbox" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}><Icon name="percent" size={24} stroke={2.2} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 19 }}>Até 30% OFF em itens selecionados</div>
            <div style={{ opacity: .9, fontSize: 14 }}>Vermelho vital é energia: ofertas reais, sem barulho.</div>
          </div>
          <span className="fa-badge" style={{ background: '#fff', color: 'var(--fa-vital)' }}><Icon name="clock" size={13} stroke={2.2} />Termina domingo</span>
        </div>
      )}
      <div style={{ marginBottom: 22 }}>
        <p className="fa-eyebrow">{header.eyebrow}</p>
        <h1 className="fa-h1" style={{ fontSize: 'clamp(26px,3vw,38px)', marginTop: 6 }}>{header.title}</h1>
        <p className="fa-lead" style={{ marginTop: 8 }}>{header.desc}</p>
      </div>
      <div className="fa-shop-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--fa-gap)', alignItems: 'start' }}>
        <aside className="fa-card fa-shop-side" style={{ padding: 20, position: 'sticky', top: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="filter" size={18} />Filtros</span>
            <button onClick={() => setFilters(createInitialFilters())} style={{ border: 'none', background: 'none', color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13 }}>Limpar</button>
          </div>
          <FilterPanel source={source} filters={filters} setFilters={setFilters} maxPrice={maxPrice} />
        </aside>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="fa-btn fa-btn-soft fa-btn-sm fa-mobile-filter-btn" style={{ display: 'none' }} onClick={() => setMobileFilters(true)}><Icon name="filter" size={16} />Filtros</button>
            <span className="fa-muted" style={{ fontSize: 13.5, fontWeight: 600 }}>{result.length} {result.length === 1 ? 'item' : 'itens'}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="fa-muted" style={{ fontSize: 13 }}>Ordenar</span>
                <select className="fa-input" style={{ height: 40, width: 'auto', paddingRight: 32 }} value={sort} onChange={(event) => setSort(event.target.value)}>
                  {SORTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 4 }} className="fa-view-toggle">
                {[['standard', 'menu'], ['list', 'filter']].map(([value]) => (
                  <button key={value} className="fa-iconbtn" data-on={view === value} onClick={() => setView(value)} aria-label={value === 'standard' ? 'grade' : 'lista'} style={{ width: 40, height: 40, background: view === value ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', borderColor: view === value ? 'var(--fa-rose)' : 'var(--fa-mist)', color: view === value ? 'var(--fa-primary)' : 'var(--fa-ink-2)' }}>
                    {value === 'standard'
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.1"/><circle cx="4" cy="12" r="1.1"/><circle cx="4" cy="18" r="1.1"/></svg>}
                  </button>
                ))}
              </div>
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
            <div className={view === 'list' ? '' : 'fa-grid'} style={view === 'list' ? { display: 'flex', flexDirection: 'column', gap: 'var(--fa-gap)' } : {}}>
              {result.map((product) => <ProductCard key={product.id} product={product} {...cardProps} fav={fav.includes(product.id)} />)}
            </div>
          )}
        </div>
      </div>
      {mobileFilters && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setMobileFilters(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(43,26,26,.4)' }} />
          <div className="fa-fadein" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(360px,90vw)', background: 'var(--fa-bg)', padding: 20, overflowY: 'auto', boxShadow: 'var(--fa-shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Filtros</span>
              <button className="fa-iconbtn" onClick={() => setMobileFilters(false)}><Icon name="close" /></button>
            </div>
            <FilterPanel source={source} filters={filters} setFilters={setFilters} maxPrice={maxPrice} />
            <button className="fa-btn fa-btn-primary fa-btn-block fa-btn-lg" style={{ marginTop: 12 }} onClick={() => setMobileFilters(false)}>Ver {result.length} itens</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CheckRow, FilterPanel, SORTS, ShopScreen };
