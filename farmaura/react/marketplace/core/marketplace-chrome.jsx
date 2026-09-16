import React, { useState as _useStateChrome } from "react";
import { createPortal } from "react-dom";

import { fetchDeliveryCoverage, fetchViaCepAddress, formatCep } from "./marketplace-address.js";
import { MARKETPLACE_LOGO_MARK_URL, MARKETPLACE_LOGO_FULL_URL, MARKETPLACE_LOGO_FULL_WHITE_TAGLINE_URL } from "./marketplace-assets.js";
import { brl, useModalStack } from "./marketplace-components.jsx";
import { Icon } from "./marketplace-icons.jsx";

/* FARMAURA — chrome: Header, Footer, MobileDrawer. */

// Gradient-ring avatar (outer ring + inner disc), matching the demo's `.profile-avatar` /
// `.profile-avatar-inner` two-layer structure.
function ProfileAvatar({ user, className = '', innerClassName = '', fallbackIconSize = 18 }) {
  return (
    <span className={className}>
      <span className={innerClassName}>
        {user && user.photo
          ? <img src={user.photo} alt="" />
          : user
            ? user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')
            : <Icon name="user" size={fallbackIconSize} />}
      </span>
    </span>
  );
}

function resolveStoreMeta(portalData) {
  const store = portalData && Array.isArray(portalData.stores) ? portalData.stores[0] : null;
  return {
    name: store && store.name ? store.name : 'Farmaura',
    topbarLabel: store && (store.district || store.postalCode)
      ? [store.district, store.postalCode].filter(Boolean).join(' · ')
      : (store && store.postalCode ? store.postalCode : 'Consulte a disponibilidade'),
    address: store && store.addr ? store.addr : '',
  };
}

const DELIVERY_LOCATION_STORAGE_KEY = 'delivery_location';

function readDeliveryLocation() {
  return window.FA_PORTAL_CACHE.readLocal('marketplace', null, DELIVERY_LOCATION_STORAGE_KEY, null);
}

function writeDeliveryLocation(location) {
  window.FA_PORTAL_CACHE.writeLocal('marketplace', null, DELIVERY_LOCATION_STORAGE_KEY, location);
}

function DeliveryCoverageNote({ coverage }) {
  if (coverage.loading) {
    return <div className="fa-faint" style={{ fontSize: 12, marginTop: 8 }}>Verificando cobertura de entrega...</div>;
  }
  if (!coverage.data) return null;
  const { covered, requires_shipping } = coverage.data;
  const tone = !covered ? 'var(--fa-warn)' : requires_shipping ? 'var(--fa-info)' : 'var(--fa-success)';
  const icon = !covered ? 'pin' : requires_shipping ? 'clock' : 'truck';
  const text = !covered
    ? 'Fora da área de entrega no momento.'
    : requires_shipping
      ? 'Nessa região a entrega é feita por transportadora (Correios/logística), sem motoboy expresso.'
      : 'Entrega expressa por motoboy disponível nessa região.';
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8, fontSize: 12.5, lineHeight: 1.4, color: tone }}>
      <Icon name={icon} size={14} style={{ flex: 'none', marginTop: 1 }} />
      <span>{text}</span>
    </div>
  );
}

function DeliveryLocationMenu({ fallbackLabel, authClient }) {
  const [open, setOpen] = _useStateChrome(false);
  const [location, setLocation] = _useStateChrome(() => readDeliveryLocation());
  const [cep, setCep] = _useStateChrome('');
  const [status, setStatus] = _useStateChrome({ loading: false, error: '', result: null });
  const [coverage, setCoverage] = _useStateChrome({ loading: false, error: '', data: null });
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc); };
  }, [open]);

  const search = async (e) => {
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
      // Cache and show this address as soon as it resolves — the customer typing a new
      // CEP is the signal that it's their current one, not a separate confirm step.
      const label = [address.district, address.cep].filter(Boolean).join(' · ') || address.cep;
      const next = { ...address, label };
      setLocation(next);
      writeDeliveryLocation(next);
      setCoverage({ loading: true, error: '', data: null });
      try {
        const data = await fetchDeliveryCoverage(authClient, address);
        setCoverage({ loading: false, error: '', data });
      } catch (coverageError) {
        // Best-effort: the address is still confirmable even if the coverage preview fails.
        setCoverage({ loading: false, error: (coverageError && coverageError.message) || '', data: null });
      }
    } catch (requestError) {
      setStatus({ loading: false, error: (requestError && requestError.message) || 'Não foi possível consultar o CEP.', result: null });
    }
  };

  const confirm = () => {
    // The address is already cached and shown as soon as search() resolves it —
    // this just dismisses the popover.
    setOpen(false);
  };

  const label = location && location.label ? location.label : fallbackLabel;

  return (
    <div className="fa-topbar-item" ref={ref}>
      <a onClick={() => setOpen((o) => !o)} role="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="pin" size={15} /> Entregar em <b style={{ marginLeft: 2 }}>{label}</b> <Icon name="chevD" size={13} /></a>
      {open && (
        <div className="fa-delivery-pop" role="dialog" aria-label="Consultar CEP de entrega">
          <div style={{ fontWeight: 800, fontSize: 14 }}>Consultar CEP de entrega</div>
          <div className="fa-muted" style={{ fontSize: 12.5, marginTop: 2, marginBottom: 10 }}>Informe seu CEP para conferir a disponibilidade na sua região.</div>
          <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
            <input className="fa-input" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} placeholder="00000-000" inputMode="numeric" style={{ flex: 1 }} />
            <button type="submit" className="fa-btn fa-btn-primary fa-btn-sm" disabled={status.loading}>{status.loading ? '...' : 'Buscar'}</button>
          </form>
          {status.error ? <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--fa-error)' }}>{status.error}</div> : null}
          {status.result ? (
            <div style={{ marginTop: 10, padding: 10, background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-btn)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{[status.result.district, status.result.city, status.result.state].filter(Boolean).join(' - ')}</div>
              <div className="fa-faint" style={{ fontSize: 12, marginTop: 2 }}>CEP {status.result.cep}</div>
              <DeliveryCoverageNote coverage={coverage} />
              <button type="button" className="fa-btn fa-btn-primary fa-btn-sm fa-btn-block" style={{ marginTop: 8 }} onClick={confirm}>Entregar neste endereço</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function resolveMarketplaceMeta(portalData) {
  const meta = portalData && portalData.marketplace ? portalData.marketplace : {};
  const pharmacist = portalData && portalData.pharmacist ? portalData.pharmacist : {};
  return {
    marketplaceName: meta.name || 'Marketplace Farmaura',
    legalName: meta.legalName || meta.legal_name || '',
    cnpj: meta.cnpj || '',
    stateRegistration: meta.stateRegistration || meta.state_registration || '',
    footerNote: meta.footerNote || meta.footer_note || '',
    pharmacistName: pharmacist.name || 'Equipe farmacêutica Farmaura',
    pharmacistRegistrationCode: pharmacist.registrationCode || pharmacist.registration_code || '',
  };
}

// Matches the demo's `.profile`/`.profile-panel`: bare avatar+chevron trigger (no pill/label), a
// name+email header, a flat icon+label(+chip) item list, and a distinct "Sair" button at the
// bottom — instead of the earlier bordered-pill trigger and icon+description item rows. Real
// destinations only (no fabricated chip values): "Meus pedidos" gets a real order-count chip when
// there's at least one order; "Cashback"/"Assinaturas" have no cheap real balance to show here, so
// they render without a chip rather than a made-up one.
function AccountMenu({ user, onNav, onPrescription, logout, ordersCount, className = '' }) {
  const [open, setOpen] = _useStateChrome(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc); };
  }, [open]);

  const items = [
    { ic: 'user', l: 'Perfil', act: () => onNav({ name: 'account', tab: 'profile' }) },
    { ic: 'bag', l: 'Meus pedidos', chip: ordersCount > 0 ? String(ordersCount) : null, act: () => onNav({ name: 'account', tab: 'orders' }) },
    { ic: 'chat', l: 'Falar com farmacêutico', act: () => onNav({ name: 'chats' }) },
    { ic: 'heart', l: 'Produtos salvos', act: () => onNav({ name: 'saved' }) },
    { ic: 'gift', l: 'Cashback', act: () => onNav({ name: 'cashback' }) },
    { ic: 'repeat', l: 'Assinaturas', act: () => onNav({ name: 'subscriptions' }) },
    { ic: 'cog', l: 'Configurações', act: () => onNav({ name: 'account', tab: 'settings' }) },
  ];
  const run = (act) => { setOpen(false); act(); };

  return (
    <div className={'fa-accmenu ' + className} ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="fa-accmenu-trigger"
        data-logged={user ? '1' : '0'}
        data-active={open ? '1' : '0'}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((o) => !o)}
      >
        <ProfileAvatar user={user} className="fa-am-avatar" innerClassName="fa-am-avatar-inner" fallbackIconSize={14} />
        {!user && <span className="fa-am-label">Entrar / Criar conta</span>}
        <Icon name="chevD" size={13} className="fa-am-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div className="fa-caremenu-pop" role="menu">
          <div className="fa-caremenu-head">
            <ProfileAvatar user={user} className="fa-cm-avatar" innerClassName="fa-cm-avatar-inner" fallbackIconSize={18} />
            <div style={{ minWidth: 0, flex: 1 }}>
              {user
                ? <><div className="fa-cm-l" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div><div className="fa-cm-email">{user.email}</div></>
                : <><div className="fa-cm-l">Sua conta Farmaura</div><div className="fa-cm-email">Entre para usar todos os recursos</div></>}
            </div>
          </div>
          {!user && (
            <button className="fa-btn fa-btn-primary fa-btn-block fa-btn-sm" style={{ margin: '6px 6px 4px', width: 'calc(100% - 12px)' }} onClick={() => run(() => onNav({ name: 'login' }))}>Entrar / Criar conta</button>
          )}
          {user && items.map((it) => (
            <button key={it.l} className="fa-caremenu-item" role="menuitem" onClick={() => run(it.act)}>
              <Icon name={it.ic} size={19} />
              <span className="fa-cm-l">{it.l}</span>
              {it.chip && <span className="fa-cm-chip">{it.chip}</span>}
            </button>
          ))}
          {user && (
            <>
              <div className="fa-caremenu-sep" />
              <button type="button" className="fa-caremenu-signout" onClick={() => run(() => logout && logout())}>
                <Icon name="logout" size={19} />Sair
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Full lockup (isotipo + "Farmaura" already baked into one image) on regular screens; the bare
// isotipo takes over on narrow screens via CSS (media query in marketplace.css) once the full
// wordmark would get too cramped to read next to the rest of the header.
function Logo({ onClick }) {
  return (
    <a className="fa-logo" onClick={onClick} role="button" aria-label="Farmaura — início">
      <img className="fa-logo-full-img" src={MARKETPLACE_LOGO_FULL_URL} alt="Farmaura" />
      <img className="fa-logo-mark-img fa-logo-mark-img-mobile" src={MARKETPLACE_LOGO_MARK_URL} alt="Farmaura" />
    </a>
  );
}

// Real-time product suggestions as the visitor types — matched client-side against the already
// loaded catalog (name/brand/category), no extra request. Shared between the header search and
// the mobile drawer's own search field so both offer the same behavior.
function matchSearchSuggestions(products, query, limit = 7) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return (products || [])
    .filter((product) => (product.name + ' ' + product.brand + ' ' + product.cat).toLowerCase().includes(q))
    .slice(0, limit);
}

function SearchSuggestions({ query, products, onPick }) {
  const matches = React.useMemo(() => matchSearchSuggestions(products, query), [query, products]);
  if (!matches.length) return null;
  return (
    <div className="fa-search-suggest" role="listbox">
      {matches.map((product) => (
        <button key={product.id} type="button" className="fa-search-suggest-item" role="option" onClick={() => onPick(product)}>
          <span className="fa-search-suggest-thumb">
            {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Icon name="pill" size={18} />}
          </span>
          <span className="fa-search-suggest-info">
            <span className="fa-search-suggest-name">{product.name}</span>
            <span className="fa-search-suggest-meta">{product.brand}</span>
          </span>
          <span className="fa-search-suggest-price">{brl(product.price)}</span>
        </button>
      ))}
    </div>
  );
}

function Header({ cats, route, cartCount, query, user, portalData, onNav, onSearch, onChat, onPrescription, authClient, logout, ordersCount, products }) {
  const [q, setQ] = _useStateChrome(query || '');
  const [drawer, setDrawer] = _useStateChrome(false);
  const [suggestOpen, setSuggestOpen] = _useStateChrome(false);
  const searchRef = React.useRef(null);
  const storeMeta = resolveStoreMeta(portalData);

  React.useEffect(() => { setQ(query || ''); }, [query]);

  React.useEffect(() => {
    if (!suggestOpen) return;
    const onDocClick = (event) => { if (searchRef.current && !searchRef.current.contains(event.target)) setSuggestOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') setSuggestOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [suggestOpen]);

  const submit = (e) => { e.preventDefault(); setSuggestOpen(false); onSearch(q.trim()); };
  const pickSuggestion = (product) => { setSuggestOpen(false); setQ(product.name); onNav({ name: 'product', id: product.id }); };

  return (
    // Topbar and the sticky nav are now separate siblings (not nested inside one shared
    // `<header>`) — position:sticky keeps an element pinned only within its own containing
    // block's height, and a wrapper hugging just these two rows gave the sticky nav almost no
    // room to actually stay stuck once you scrolled past it. Both need to be direct children of
    // `#fa-root` (which spans the full page height) for the nav to stay pinned for the whole
    // scroll while the topbar itself scrolls away normally.
    <>
      <div className="fa-topbar">
        <DeliveryLocationMenu fallbackLabel={storeMeta.topbarLabel} authClient={authClient} />
        <a className="fa-topbar-item" onClick={() => onChat && onChat()} role="button"><Icon name="chat" size={15} />Falar com farmacêutico</a>
        <span className="fa-topbar-item"><Icon name="truck" size={15} />Entrega em até 1 hora</span>
        <a className="fa-topbar-item" onClick={() => onNav({ name: 'cashback' })} role="button"><Icon name="gift" size={15} />Cashback nas compras</a>
        <span className="fa-topbar-item"><Icon name="pin" size={15} />Retirada em 15 min</span>
        <a className="fa-topbar-item" onClick={() => onPrescription && onPrescription()} role="button"><Icon name="rx" size={15} />Receita digital</a>
        <span className="fa-topbar-item"><Icon name="card" size={15} />Parcele em até 3x</span>
      </div>

      <header className="fa-header-sticky">
        <div className="fa-wrap">
          <div className="fa-header-main">
            <div className="fa-header-start">
              <button className="fa-iconbtn fa-burger" onClick={() => setDrawer(true)} aria-label="menu"><Icon name="menu" /></button>
              <Logo onClick={() => onNav({ name: 'home' })} />
            </div>
            <form className="fa-search" ref={searchRef} onSubmit={submit}>
              <Icon name="search" size={18} style={{ color: 'var(--fa-ink-3)' }} />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setSuggestOpen(true); }}
                onFocus={() => setSuggestOpen(true)}
                placeholder="Busque por remédios, marcas, sintomas..."
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestOpen}
              />
              {suggestOpen && <SearchSuggestions query={q} products={products} onPick={pickSuggestion} />}
            </form>
            <div style={{ display: 'flex', gap: 8, flex: 'none', alignItems: 'center' }}>
              <AccountMenu user={user} onNav={onNav} onPrescription={onPrescription} logout={logout} ordersCount={ordersCount} />
              <button className="fa-hact" onClick={() => onNav({ name: 'cart' })} aria-label="carrinho">
                <span className="fa-hact-icon-wrap">
                  <Icon name="cart" size={21} />
                  {cartCount > 0 && <span className="fa-cart-count">{cartCount}</span>}
                </span>
                <span className="fa-hact-label">Carrinho</span>
              </button>
            </div>
          </div>
        </div>

        {drawer && <MobileDrawer cats={cats} user={user} products={products} onNav={(r) => { setDrawer(false); onNav(r); }} onClose={() => setDrawer(false)} onChat={() => { setDrawer(false); onChat && onChat(); }} onPrescription={() => { setDrawer(false); onPrescription && onPrescription(); }} onSearch={(term) => { setDrawer(false); onSearch(term); }} />}
      </header>
    </>
  );
}

// Same 7-color rotation the demo hand-assigns per category (--fa-primary, --fa-success,
// --fa-info, --fa-warn-ink, --fa-vital, --fa-primary-ink, --fa-ink-2) — the real category list
// has no stored per-category color, so it cycles through the same set by position.
const DRAWER_CAT_COLORS = [
  'var(--fa-primary)', 'var(--fa-success)', 'var(--fa-info)', 'var(--fa-warn-ink)',
  'var(--fa-vital)', 'var(--fa-primary-ink)', 'var(--fa-ink-2)',
];

function MobileDrawer({ cats, user, onNav, onClose, onChat, onPrescription, onSearch, products }) {
  const [drawerQuery, setDrawerQuery] = _useStateChrome('');
  const submitDrawerSearch = (e) => { e.preventDefault(); onSearch(drawerQuery.trim()); };
  const pickDrawerSuggestion = (product) => onNav({ name: 'product', id: product.id });
  useModalStack(true, onClose);
  // Portaled to <body>: MobileDrawer renders inside <header className="fa-header-sticky">, whose
  // backdrop-filter creates a new containing block for position:fixed descendants — without the
  // portal, "inset:0" resolves against the header's own (short) box instead of the viewport, so
  // the panel's content overflows past its real bottom edge with no background under it, and the
  // home page bleeds through. Same escape hatch ModalShell already uses for the same reason.
  const node = (
    // z-index above .fa-header-sticky's 400 — now that this is portaled to <body> it shares
    // the header's stacking context, and would otherwise render its own top row (logo + close)
    // underneath the real page header instead of above it.
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(43,26,26,.4)', backdropFilter: 'blur(2px)' }} />
      <div className="fa-fadein fa-drawer-panel" style={{ animationDuration: '.25s' }}>
        <div className="fa-drawer-head">
          <Logo onClick={() => onNav({ name: 'home' })} />
          <button className="fa-iconbtn" onClick={onClose} aria-label="fechar"><Icon name="close" /></button>
        </div>
        <form className="fa-search" style={{ margin: '0 16px 10px' }} onSubmit={submitDrawerSearch}>
          <Icon name="search" size={20} style={{ color: 'var(--fa-ink-3)' }} />
          <input value={drawerQuery} onChange={(e) => setDrawerQuery(e.target.value)} placeholder="Busque por remédios, marcas, sintomas..." autoComplete="off" />
          <SearchSuggestions query={drawerQuery} products={products} onPick={pickDrawerSuggestion} />
        </form>
        <div className="fa-drawer-section-title">Categorias</div>
        <nav className="fa-drawer-cats">
          {cats.map((c, index) => (
            <button key={c.id} type="button" className="fa-drawer-cat" onClick={() => onNav({ name: 'category', cat: c.id })}>
              <span className="fa-drawer-cat-icon" style={{ background: DRAWER_CAT_COLORS[index % DRAWER_CAT_COLORS.length] }}>
                <Icon name={c.glyph || 'pill'} size={17} stroke={1.8} />
              </span>
              {c.label}
            </button>
          ))}
        </nav>
        <div className="fa-drawer-section-title">Mais</div>
        <nav className="fa-drawer-cats" style={{ paddingBottom: 20 }}>
          <a className="fa-drawer-cat" style={{ color: 'var(--fa-vital)' }} onClick={() => onNav({ name: 'offers' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-vital)' }}><Icon name="percent" size={17} stroke={2.2} /></span>Ofertas</a>
          <a className="fa-drawer-cat" onClick={() => onNav({ name: 'services' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-info)' }}><Icon name="activity" size={17} /></span>Serviços de saúde</a>
          {user && <a className="fa-drawer-cat" onClick={() => onNav({ name: 'cashback' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-warn-ink)' }}><Icon name="gift" size={17} /></span>Cashback</a>}
          {user && <a className="fa-drawer-cat" onClick={() => onNav({ name: 'subscriptions' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-primary-ink)' }}><Icon name="repeat" size={17} /></span>Compras recorrentes</a>}
          {user && <a className="fa-drawer-cat" onClick={() => onNav({ name: 'saved' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-ink-2)' }}><Icon name="heart" size={17} /></span>Produtos salvos</a>}
          <a className="fa-drawer-cat" onClick={() => onPrescription && onPrescription()}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-primary)' }}><Icon name="rx" size={17} /></span>Receita digital</a>
          <a className="fa-drawer-cat" onClick={() => onChat && onChat()}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-success)' }}><Icon name="chat" size={17} /></span>Falar com farmacêutico</a>
          <a className="fa-drawer-cat" onClick={() => onNav({ name: user ? 'account' : 'login', tab: 'orders' })}><span className="fa-drawer-cat-icon" style={{ background: 'var(--fa-vital)' }}><Icon name="bag" size={17} /></span>{user ? 'Meus pedidos' : 'Entrar / Criar conta'}</a>
        </nav>
        <div style={{ margin: '0 16px 20px', padding: 14, background: 'var(--fa-rose-soft)', borderRadius: 'var(--fa-r-card)', flex: 'none' }}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: 'var(--fa-primary)' }}>Cuidado que acompanha você</div>
          <div className="fa-muted" style={{ fontSize: 13 }}>Atendimento farmacêutico com dados sincronizados do portal.</div>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

function Footer({ cats, portalData, onNav, onPrescription }) {
  // Only "Assinatura Farmaura" and "Receita digital" have a real destination today (a route and
  // the existing prescription-upload flow, respectively) — the rest were rendered as clickable
  // <a role="button"> links that silently did nothing on click. Wiring the two real ones and
  // rendering the others as plain (non-interactive) text is honest about what actually exists;
  // inventing "Sobre nós"/"Trabalhe conosco"/etc. destinations would fabricate content that isn't
  // there yet.
  const cols = [
    { h: 'Categorias', items: cats.map((c) => ({ l: c.label, r: { name: 'category', cat: c.id } })) },
    { h: 'Farmaura', items: [{ l: 'Sobre nós' }, { l: 'Assinatura Farmaura', r: { name: 'subscriptions' } }, { l: 'Programa de cuidado' }, { l: 'Trabalhe conosco' }] },
    { h: 'Ajuda', items: [{ l: 'Central de atendimento' }, { l: 'Receita digital', act: onPrescription }, { l: 'Trocas e devoluções' }, { l: 'Termos de uso', r: { name: 'terms' } }, { l: 'Política de privacidade', r: { name: 'privacy' } }, { l: 'Exclusão e retenção de dados', r: { name: 'data-retention' } }] },
  ];
  const meta = resolveMarketplaceMeta(portalData);
  const storeMeta = resolveStoreMeta(portalData);
  const legalLine = [meta.marketplaceName, meta.legalName, meta.cnpj].filter(Boolean).join(' · ');
  const pharmacistLine = [meta.pharmacistName, meta.pharmacistRegistrationCode].filter(Boolean).join(' · ');

  return (
    <footer className="fa-footer">
      <div className="fa-wrap" style={{ paddingTop: 48, paddingBottom: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 40 }} className="fa-footer-grid">
          <div>
            <div className="fa-logo" style={{ marginBottom: 14 }}>
              <img className="fa-logo-full-img" src={MARKETPLACE_LOGO_FULL_WHITE_TAGLINE_URL} alt="Farmaura — Cuidado é o que nos move" />
            </div>
            <p style={{ opacity: .82, fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>Cuidado que acompanha você. Saúde, bem-estar e conveniência numa experiência mais próxima e humana.</p>
            {storeMeta.address ? <p style={{ opacity: .68, fontSize: 12.5, lineHeight: 1.6, maxWidth: 320, marginTop: 10 }}>{storeMeta.address}</p> : null}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <span className="fa-badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}><Icon name="truck" size={13} />Entrega rápida</span>
              <span className="fa-badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}><Icon name="shield" size={13} />Compra segura</span>
            </div>
          </div>
          {cols.map((col) => (
            <div key={col.h}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>{col.h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {col.items.map((it, i) => {
                  const onClick = it.act || (it.r && (() => onNav(it.r)));
                  return onClick
                    ? <a key={i} role="button" onClick={onClick}>{it.l}</a>
                    : <span key={i} style={{ cursor: 'default', opacity: .68 }}>{it.l}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,.16)', margin: '36px 0 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: 12.5, opacity: .72 }}>
          <span>{legalLine || 'Marketplace Farmaura · dados sincronizados do portal'}</span>
          <span>{pharmacistLine || meta.footerNote || 'Atendimento farmacêutico sincronizado com a operação'}</span>
        </div>
      </div>
    </footer>
  );
}

export { AccountMenu, DeliveryCoverageNote, Footer, Header, Logo, MobileDrawer, resolveMarketplaceMeta, resolveStoreMeta };
