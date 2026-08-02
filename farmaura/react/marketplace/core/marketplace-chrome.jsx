import React, { useState as _useStateChrome } from "react";

import { fetchViaCepAddress, formatCep } from "./marketplace-address.js";
import { MARKETPLACE_LOGO_MARK_URL, MARKETPLACE_LOGO_FULL_URL, MARKETPLACE_LOGO_FULL_WHITE_TAGLINE_URL } from "./marketplace-assets.js";
import { useModalStack } from "./marketplace-components.jsx";
import { Icon } from "./marketplace-icons.jsx";

/* FARMAURA — chrome: Header, Footer, MobileDrawer. */

function ProfileAvatar({ user, className = '', fallbackIconSize = 18 }) {
  return (
    <span className={className}>
      {user && user.photo
        ? <img src={user.photo} alt="" />
        : user
          ? user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')
          : <Icon name="user" size={fallbackIconSize} />}
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
    address: store && store.address ? store.address : '',
  };
}

const DELIVERY_LOCATION_STORAGE_KEY = 'delivery_location';

function readDeliveryLocation() {
  return window.FA_PORTAL_CACHE.readLocal('marketplace', null, DELIVERY_LOCATION_STORAGE_KEY, null);
}

function writeDeliveryLocation(location) {
  window.FA_PORTAL_CACHE.writeLocal('marketplace', null, DELIVERY_LOCATION_STORAGE_KEY, location);
}

async function fetchDeliveryCoverage(authClient, address) {
  const params = new URLSearchParams({
    district: address.district || '',
    city: address.city || '',
    state_code: address.state || '',
    postal_code: address.cep || '',
  });
  return authClient.publicRequest(`/orders/delivery-coverage/public?${params.toString()}`, { method: 'GET' });
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
    <div style={{ position: 'relative' }} ref={ref}>
      <a onClick={() => setOpen((o) => !o)} role="button"><Icon name="pin" size={15} /> Entregar em <b style={{ marginLeft: 2 }}>{label}</b> <Icon name="chevD" size={13} /></a>
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
    footerNote: meta.footerNote || meta.footer_note || '',
    pharmacistName: pharmacist.name || 'Equipe farmacêutica Farmaura',
    pharmacistRegistrationCode: pharmacist.registrationCode || pharmacist.registration_code || '',
  };
}

function AccountMenu({ user, onNav, onPrescription, className = '' }) {
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
    { ic: 'user', l: 'Minha conta', d: 'Pedidos, perfil e cartões', act: () => onNav({ name: 'account', tab: 'summary' }) },
    { ic: 'gift', l: 'Cashback', d: 'Saldo e histórico de volta', act: () => onNav({ name: 'cashback' }) },
    { ic: 'repeat', l: 'Compras recorrentes', d: 'Gerencie suas assinaturas', act: () => onNav({ name: 'subscriptions' }) },
    { ic: 'heart', l: 'Produtos salvos', d: 'Seus favoritos guardados', act: () => onNav({ name: 'saved' }) },
    { ic: 'activity', l: 'Serviços de saúde', d: 'Exames, aplicações e aferições', act: () => onNav({ name: 'services' }) },
    { ic: 'rx', l: 'Receita digital', d: 'Envie e organize receitas', act: () => onPrescription && onPrescription() },
  ];
  const run = (act) => { setOpen(false); act(); };
  const firstName = user ? user.name.split(' ')[0] : '';

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
        {user
          ? <ProfileAvatar user={user} className="fa-am-avatar" fallbackIconSize={15} />
          : <Icon name="user" size={17} />}
        <span className="fa-am-label">{user ? firstName : 'Entrar / Criar conta'}</span>
        <Icon name="chevD" size={14} style={{ transition: 'transform .18s', transform: open ? 'rotate(180deg)' : 'none', flex: 'none' }} />
      </button>
      {open && (
        <div className="fa-caremenu-pop" role="menu">
          <div className="fa-caremenu-head">
            <ProfileAvatar user={user} className="fa-cm-avatar" fallbackIconSize={18} />
            <div style={{ minWidth: 0, flex: 1 }}>
              {user
                ? <><div className="fa-cm-l" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div><div className="fa-cm-d">Bem-vinda de volta</div></>
                : <><div className="fa-cm-l">Sua conta Farmaura</div><div className="fa-cm-d">Entre para usar todos os recursos</div></>}
            </div>
          </div>
          {!user && (
            <button className="fa-btn fa-btn-primary fa-btn-block fa-btn-sm" style={{ margin: '6px 6px 4px', width: 'calc(100% - 12px)' }} onClick={() => run(() => onNav({ name: 'login' }))}>Entrar / Criar conta</button>
          )}
          {items.map((it) => (
            <button key={it.l} className="fa-caremenu-item" role="menuitem" onClick={() => run(it.act)}>
              <span className="fa-cm-ic"><Icon name={it.ic} size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="fa-cm-l" style={{ display: 'block' }}>{it.l}</span>
                <span className="fa-cm-d" style={{ display: 'block' }}>{it.d}</span>
              </span>
              <Icon name="chevR" size={15} style={{ color: 'var(--fa-ink-3)', flex: 'none' }} />
            </button>
          ))}
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

function Header({ cats, route, cartCount, query, user, portalData, onNav, onSearch, onChat, onPrescription, authClient }) {
  const [q, setQ] = _useStateChrome(query || '');
  const [drawer, setDrawer] = _useStateChrome(false);
  const activeCat = route.name === 'category' ? route.cat : null;
  const storeMeta = resolveStoreMeta(portalData);

  React.useEffect(() => { setQ(query || ''); }, [query]);

  const submit = (e) => { e.preventDefault(); onSearch(q.trim()); };

  return (
    <header className="fa-header">
      <div className="fa-topbar">
        <div className="fa-wrap">
          <DeliveryLocationMenu fallbackLabel={storeMeta.topbarLabel} authClient={authClient} />
          <div style={{ display: 'flex', gap: 20 }}>
            <a onClick={() => onNav({ name: user ? 'account' : 'login', tab: 'orders' })} role="button"><Icon name="bag" size={15} /> {user ? 'Meus pedidos' : 'Entrar'}</a>
            <a onClick={() => onChat && onChat()} role="button"><Icon name="chat" size={15} /> Falar com farmacêutico</a>
            <a role="button"><Icon name="truck" size={15} /> Entrega conforme disponibilidade</a>
          </div>
        </div>
      </div>

      <div className="fa-wrap">
        <div className="fa-header-main">
          <button className="fa-iconbtn fa-burger" onClick={() => setDrawer(true)} aria-label="menu"><Icon name="menu" /></button>
          <Logo onClick={() => onNav({ name: 'home' })} />
          <form className="fa-search" onSubmit={submit}>
            <Icon name="search" size={20} style={{ color: 'var(--fa-ink-3)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque por remédios, marcas, sintomas..." />
            <button type="submit" className="fa-btn fa-btn-primary fa-btn-sm" style={{ borderRadius: 'var(--fa-r-pill)' }}>Buscar</button>
          </form>
          <div style={{ display: 'flex', gap: 8, flex: 'none', alignItems: 'center' }}>
            <AccountMenu user={user} onNav={onNav} onPrescription={onPrescription} />
            <button className="fa-iconbtn" onClick={() => onNav({ name: 'cart' })} aria-label="carrinho">
              <Icon name="cart" />
              {cartCount > 0 && <span className="fa-cart-count">{cartCount}</span>}
            </button>
          </div>
        </div>

        {route.name !== 'home' && (
          <nav className="fa-navrow">
            {cats.map((c) => (
              <a key={c.id} className="fa-navlink" data-active={activeCat === c.id ? '1' : '0'} onClick={() => onNav({ name: 'category', cat: c.id })}>{c.label}</a>
            ))}
            <a className="fa-navlink" data-active={route.name === 'offers' ? '1' : '0'} onClick={() => onNav({ name: 'offers' })} style={{ color: 'var(--fa-vital)' }}>
              <Icon name="percent" size={16} stroke={2.2} />Ofertas
            </a>
            <a className="fa-navlink" data-active={route.name === 'services' ? '1' : '0'} onClick={() => onNav({ name: 'services' })}><Icon name="activity" size={16} />Serviços de saúde</a>
            <a className="fa-navlink" onClick={() => onPrescription && onPrescription()} style={{ marginLeft: 'auto' }}><Icon name="rx" size={16} />Receita digital</a>
          </nav>
        )}
      </div>

      {drawer && <MobileDrawer cats={cats} user={user} onNav={(r) => { setDrawer(false); onNav(r); }} onClose={() => setDrawer(false)} onChat={() => { setDrawer(false); onChat && onChat(); }} onPrescription={() => { setDrawer(false); onPrescription && onPrescription(); }} />}
    </header>
  );
}

function MobileDrawer({ cats, user, onNav, onClose, onChat, onPrescription }) {
  useModalStack(true, onClose);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(43,26,26,.4)', backdropFilter: 'blur(2px)' }} />
      <div className="fa-fadein" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(320px, 84vw)', background: 'var(--fa-bg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--fa-shadow-lg)', animationDuration: '.25s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Logo onClick={() => onNav({ name: 'home' })} />
          <button className="fa-iconbtn" onClick={onClose} aria-label="fechar"><Icon name="close" /></button>
        </div>
        {cats.map((c) => (
          <a key={c.id} className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: 'category', cat: c.id })}>{c.label}<Icon name="chevR" size={16} style={{ marginLeft: 'auto' }} /></a>
        ))}
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px', color: 'var(--fa-vital)' }} onClick={() => onNav({ name: 'offers' })}><Icon name="percent" size={18} stroke={2.2} />Ofertas</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: 'services' })}><Icon name="activity" size={18} />Serviços de saúde</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: 'cashback' })}><Icon name="gift" size={18} />Cashback</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: 'subscriptions' })}><Icon name="repeat" size={18} />Compras recorrentes</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: 'saved' })}><Icon name="heart" size={18} />Produtos salvos</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onPrescription && onPrescription()}><Icon name="rx" size={18} />Receita digital</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onChat && onChat()}><Icon name="chat" size={18} />Falar com farmacêutico</a>
        <a className="fa-navlink" style={{ fontSize: 16, padding: '12px 14px' }} onClick={() => onNav({ name: user ? 'account' : 'login', tab: 'orders' })}><Icon name="bag" size={18} />{user ? 'Meus pedidos' : 'Entrar / Criar conta'}</a>
        <div style={{ marginTop: 'auto', padding: 14, background: 'var(--fa-rose-soft)', borderRadius: 'var(--fa-r-card)' }}>
          <div style={{ fontWeight: 800, marginBottom: 4, color: 'var(--fa-primary)' }}>Cuidado que acompanha você</div>
          <div className="fa-muted" style={{ fontSize: 13 }}>Atendimento farmacêutico com dados sincronizados do portal.</div>
        </div>
      </div>
    </div>
  );
}

function Footer({ cats, portalData, onNav }) {
  const cols = [
    { h: 'Categorias', items: cats.map((c) => ({ l: c.label, r: { name: 'category', cat: c.id } })) },
    { h: 'Farmaura', items: [{ l: 'Sobre nós' }, { l: 'Assinatura Farmaura' }, { l: 'Programa de cuidado' }, { l: 'Trabalhe conosco' }] },
    { h: 'Ajuda', items: [{ l: 'Central de atendimento' }, { l: 'Receita digital' }, { l: 'Trocas e devoluções' }, { l: 'Política de privacidade' }] },
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
                {col.items.map((it, i) => <a key={i} role="button" onClick={() => it.r && onNav(it.r)}>{it.l}</a>)}
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

export { AccountMenu, Footer, Header, Logo, MobileDrawer };
