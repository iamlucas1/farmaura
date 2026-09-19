/* FARMAURA Console — Shell (migrated design)
   AppShell + Rail + breadcrumb bar + Login + AccountModal, plus the fulfillment/
   SLA helpers shared by screens. Visual system: internal.css + internal-ui.jsx.
   Screens still render <Topbar> (now a thin PageHead wrapper) until they are
   migrated to <PageHead> directly. */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { MARKETPLACE_LOGO_MARK_URL } from "../../marketplace/core/marketplace-assets.js";
import { TwoFactorModal } from "../../shared/two-factor-modal.jsx";
import {
  Icon, PageHead, Modal, Tabs, Field, SwitchToggle,
  ConfirmHost, ToastHost, Avatar, Badge,
} from "./internal-ui.jsx";

/* Below 860px the rail becomes an off-canvas drawer. The burger (in the breadcrumb
   bar) and the scrim/close (in the rail) share one open/setOpen pair without
   threading a prop through every screen, so it travels via context. */
const MobileNavContext = React.createContext({ open: false, setOpen: () => {} });


/* ============================================================
   Shared fulfillment / status / SLA helpers (unchanged)
   ============================================================ */

/* ---------- Metadados de status de pedido ---------- */
const OC_STATUS = {
  new:        { label: 'Novo', short: 'Novos', color: 'var(--info)', bg: 'var(--info-soft)', tone: 'neutral', icon: 'bell' },
  separating: { label: 'Em separação', short: 'Separando', color: 'var(--warning)', bg: 'var(--warning-soft)', tone: 'warning', icon: 'box' },
  ready:      { label: 'Pronto', short: 'Prontos', color: 'var(--good)', bg: 'var(--good-soft)', tone: 'good', icon: 'check' },
  dispatched: { label: 'Despachado', short: 'Despachados', color: 'var(--text-muted)', bg: 'var(--surface-2)', tone: 'neutral', icon: 'truck' },
  delivered:  { label: 'Entregue', short: 'Entregues', color: 'var(--good)', bg: 'var(--good-soft)', tone: 'good', icon: 'check' },
  cancelled:  { label: 'Cancelado', short: 'Cancelados', color: 'var(--critical)', bg: 'var(--critical-soft)', tone: 'critical', icon: 'close' },
  unknown:    { label: 'Em análise', short: 'Em análise', color: 'var(--text-secondary)', bg: 'var(--surface-2)', tone: 'neutral', icon: 'clock' },
};
const OC_FLOW = ['new', 'separating', 'ready', 'dispatched'];

/* Still needs work (not yet dispatched, not finished). Any screen that lists "pending" orders
   (Pedidos Online, Entregas & rota) should filter through this, not just `!== 'dispatched'` —
   that alone lets delivered/cancelled orders linger on a "pending" list forever. */
function isActiveOrderStatus(status) {
  return status === 'new' || status === 'separating' || status === 'ready';
}
/* "dispatched" (left the store) and "delivered" (confirmed in the customer's hands) are two
   distinct terminal statuses — both count as done for a driver/order-progress UI. */
function isFinishedOrderStatus(status) {
  return status === 'dispatched' || status === 'delivered';
}

function normalizeOrderStatusValue(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return 'new';
  if (raw in OC_STATUS) return raw;
  const aliases = {
    draft: 'new',
    created: 'new',
    queued: 'new',
    pending: 'new',
    pending_review: 'new',
    pendingreview: 'new',
    picking: 'separating',
    preparing: 'separating',
    in_separation: 'separating',
    inseparation: 'separating',
    separated: 'ready',
    completed: 'ready',
    shipped: 'dispatched',
    delivered: 'dispatched',
    finished: 'dispatched',
  };
  return aliases[raw] || 'unknown';
}

function orderStatusMeta(status) {
  return OC_STATUS[normalizeOrderStatusValue(status)] || OC_STATUS.unknown;
}

function FulfillBadge({ f }) {
  return f === 'pickup'
    ? <Badge tone="neutral"><Icon name="store" size={12} />Retirada</Badge>
    : <Badge tone="critical"><Icon name="truck" size={12} />Entrega</Badge>;
}

/* Status de estoque a partir de qty / min */
function stockState(it) {
  const qty = Number(it && it.qty || 0);
  const lowThreshold = Number(it && (it.lowThreshold ?? it.min) || 0);
  const attentionThreshold = Number(it && (it.attentionThreshold ?? lowThreshold) || lowThreshold);
  if (qty <= 0) return { key: 'out', label: 'Esgotado', color: 'var(--critical)', bg: 'var(--critical-soft)' };
  if (qty <= lowThreshold) return { key: 'low', label: 'Baixo', color: 'var(--warning)', bg: 'var(--warning-soft)' };
  if (qty <= attentionThreshold) return { key: 'attention', label: 'Atenção', color: 'var(--info)', bg: 'var(--info-soft)' };
  return { key: 'normal', label: 'Normal', color: 'var(--good)', bg: 'var(--good-soft)' };
}

/* ---------- Tempo / SLA ---------- */
const _hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function minsSince(placed, nowLabel) { const current = nowLabel || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return Math.max(0, _hm(current) - _hm(placed)); }
function fmtDur(min) { if (min < 60) return min + ' min'; const h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? String(m).padStart(2, '0') : ''); }
// estado de SLA: verde / âmbar / vermelho conforme o alvo (min)
function slaState(min, target) {
  const r = min / target;
  if (r < 0.6) return { color: 'var(--good)', bg: 'var(--good-soft)', label: 'no prazo' };
  if (r < 1) return { color: 'var(--warning)', bg: 'var(--warning-soft)', label: 'atenção' };
  return { color: 'var(--critical)', bg: 'var(--critical-soft)', label: 'atrasado' };
}
// alvo padrão por tipo (min)
const SLA_TARGET = { delivery: 90, pickup: 45 };

/* Cliente recorrente (lookup por nome) */
function customerOf(name, customerByName) { return customerByName ? customerByName[name] || null : null; }
function RecurringBadge({ name, small, customerByName }) {
  const c = customerOf(name, customerByName);
  if (!c) return null;
  return c.recurring
    ? <span style={small ? { fontSize: 10 } : undefined}><Badge tone="good"><Icon name="repeat" size={small ? 10 : 11} />Recorrente</Badge></span>
    : <span style={small ? { fontSize: 10 } : undefined}><Badge tone="neutral"><Icon name="sparkle" size={small ? 10 : 11} />Novo cliente</Badge></span>;
}


/* ============================================================
   Navigation model
   ============================================================ */

const NAV_GROUPS = [
  { label: null, items: [
    { id: 'dash', label: 'Painel', icon: 'layout' },
  ] },
  { label: 'Atendimento', items: [
    { id: 'pdv', label: 'Balcão (PDV)', icon: 'receipt', countKey: 'pdv' },
    { id: 'orders', label: 'Pedidos online', icon: 'bag', countKey: 'activeOrders' },
    { id: 'deliveries', label: 'Entregas & rota', icon: 'route', countKey: 'deliveries' },
    { id: 'driver-route', label: 'Minhas entregas', icon: 'truck', countKey: 'myDeliveryStops' },
    { id: 'rx', label: 'Receitas', icon: 'rx', countKey: 'pendingRx' },
    { id: 'chat', label: 'Conversas', icon: 'chat', countKey: 'unread' },
    { id: 'chat-unblock-requests', label: 'Requisições', icon: 'lock', countKey: 'unblockRequests' },
  ] },
  { label: 'Clientes & Vendas', items: [
    { id: 'crm', label: 'Clientes (CRM)', icon: 'user' },
    { id: 'sales', label: 'Vendas & Notas', icon: 'money', countKey: 'salesPending', alert: true },
    { id: 'analytics', label: 'Análises', icon: 'chart' },
  ] },
  { label: 'Compras', items: [
    { id: 'quotes', label: 'Cotações', icon: 'card' },
    { id: 'quotes-compare', label: 'Comparar fornecedores', icon: 'scale' },
    { id: 'purchase-analytics', label: 'Painel de Compras', icon: 'gauge' },
    { id: 'purchase-receiving', label: 'Confirmar Compra', icon: 'plusCircle' },
  ] },
  { label: 'Catálogo & Estoque', items: [
    { id: 'products', label: 'Produtos', icon: 'capsule' },
    { id: 'inventory', label: 'Estoque', icon: 'boxes', countKey: 'lowStock', alert: true },
    { id: 'inventory-audit', label: 'Auditoria', icon: 'shield' },
    { id: 'product-trace', label: 'Rastreabilidade', icon: 'search' },
    { id: 'brands', label: 'Marcas', icon: 'tag' },
    { id: 'categories', label: 'Categorias', icon: 'grid' },
    { id: 'health-services', label: 'Serviços de saúde', icon: 'activity' },
    { id: 'therapeutic-classes', label: 'Classes terapêuticas', icon: 'pill' },
    { id: 'locations', label: 'Localizações', icon: 'pin' },
  ] },
  { label: 'Parceiros & Lojas', items: [
    { id: 'team', label: 'Equipe', icon: 'user' },
    { id: 'suppliers', label: 'Fornecedores', icon: 'truck' },
    { id: 'stores', label: 'Lojas', icon: 'store' },
  ] },
  { label: 'Custos', items: [
    { id: 'acquisition-costs', label: 'Custos de Aquisição', icon: 'receipt' },
    { id: 'construction-costs', label: 'Custo de Construção', icon: 'bank' },
  ] },
  { label: 'Vitrine', items: [
    { id: 'home-banner', label: 'Banner da vitrine', icon: 'camera' },
    { id: 'home-brands', label: 'Marcas em destaque', icon: 'star' },
    { id: 'home-trends', label: 'Tendências', icon: 'activity' },
    { id: 'launch-mode', label: 'Modo de lançamento', icon: 'clock' },
    { id: 'deal-of-the-day', label: 'Ofertas do dia', icon: 'bolt' },
  ] },
  { label: 'Preço & Promoções', items: [
    { id: 'pricing', label: 'Precificador', icon: 'tag', countKey: 'lowMargin', alert: true },
    { id: 'coupons', label: 'Cupons', icon: 'gift', countKey: 'activeCoupons' },
    { id: 'promotions', label: 'Promoções', icon: 'sparkle', countKey: 'activePromotions' },
    { id: 'delivery-zones', label: 'Áreas & Frete', icon: 'pin', countKey: 'deliveryAreas' },
  ] },
  { label: 'Sistema', items: [
    { id: 'settings', label: 'Configurações', icon: 'cog' },
  ] },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const NAV_BY_ID = Object.fromEntries(ALL_NAV_ITEMS.map((i) => [i.id, i]));
const GROUP_BY_ID = {};
NAV_GROUPS.forEach((g) => g.items.forEach((i) => { GROUP_BY_ID[i.id] = g.label; }));

const readLS = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const writeLS = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ } };
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const CMDK_HINT = IS_MAC ? '⌘K' : 'Ctrl K';


/* ============================================================
   Rail (left navigation)
   ============================================================ */

function Rail({ route, onNav, counts = {}, collapsed, onToggle, onLogout, onAccount, user, stores = [], selectedStoreId, setSelectedStoreId }) {
  const { open: mobileOpen, setOpen: setMobileOpen } = useContext(MobileNavContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [groupState, setGroupState] = useState(() => readLS('fa.railGroups', {}));
  const [recents, setRecents] = useState(() => readLS('fa.railRecents', []));
  const menuRef = useRef(null);

  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const visible = new Set(window.FA_ACCESS.getVisibleInternalRoutes(user));

  useEffect(() => {
    if (!route || !NAV_BY_ID[route]) return;
    setRecents((prev) => {
      const next = [route, ...prev.filter((r) => r !== route)].slice(0, 4);
      writeLS('fa.railRecents', next);
      return next;
    });
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => visible.has(i.id)) }))
    .filter((g) => g.items.length);

  const toggleGroup = (label) => setGroupState((prev) => {
    const next = { ...prev, [label]: !prev[label] };
    writeLS('fa.railGroups', next);
    return next;
  });

  const go = (id) => { onNav(id); setMobileOpen(false); };

  const recentItems = recents
    .map((id) => NAV_BY_ID[id])
    .filter((i) => i && visible.has(i.id) && i.id !== route)
    .slice(0, 3);

  const navBtn = (item) => {
    const count = item.countKey ? Number(counts[item.countKey] || 0) : 0;
    return (
      <button
        key={item.id}
        type="button"
        className={"rail-item" + (route === item.id ? " active" : "")}
        onClick={() => go(item.id)}
        title={item.label}
        aria-current={route === item.id ? "page" : undefined}
      >
        <span className="rail-item-icon-wrap">
          <Icon name={item.icon} size={16} />
          {collapsed && count > 0 && <span className="rail-item-dot" />}
        </span>
        {!collapsed && <span className="rail-item-label">{item.label}</span>}
        {!collapsed && count > 0 && (
          <span className="rail-item-badge" style={item.alert ? { background: 'var(--warning)' } : undefined}>{count}</span>
        )}
      </button>
    );
  };

  const currentStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <>
      {mobileOpen && <div className="rail-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={"rail" + (collapsed ? " collapsed" : "") + (mobileOpen ? " open" : "")}>
        <div className="rail-brand">
          <span className="rail-brand-mark"><img src={MARKETPLACE_LOGO_MARK_URL} alt="" width={20} height={20} /></span>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="rail-brand-name">Farmaura</div>
              <div className="rail-brand-sub">Sistema interno</div>
            </div>
          )}
          {!collapsed && (
            <button className="rail-collapse-btn" onClick={onToggle} aria-label="Recolher menu" title="Recolher">
              <Icon name="chevL" size={16} />
            </button>
          )}
        </div>

        {!collapsed && isAdmin && stores.length > 0 && (
          <>
            <button className="rail-store" aria-haspopup="true" aria-expanded={storeOpen} onClick={() => setStoreOpen((o) => !o)}>
              <span className="rail-store-dot" />
              <span className="rail-store-text">
                <span className="rail-store-name">{currentStore ? currentStore.name : 'Todas as lojas'}</span>
                <span className="rail-store-meta">{currentStore ? 'Loja selecionada' : `${stores.length} lojas`}</span>
              </span>
              <Icon name="chevD" size={13} style={{ flex: 'none', opacity: 0.7 }} />
            </button>
            {storeOpen && (
              <div role="menu" aria-label="Selecionar loja" className="rail-persona-menu">
                <button role="menuitemradio" aria-checked={!selectedStoreId} className="rail-store-opt" onClick={() => { setSelectedStoreId(''); setStoreOpen(false); }}>Todas as lojas</button>
                {stores.map((s) => (
                  <button key={s.id} role="menuitemradio" aria-checked={s.id === selectedStoreId} className="rail-store-opt" onClick={() => { setSelectedStoreId(s.id); setStoreOpen(false); }}>{s.name}</button>
                ))}
              </div>
            )}
          </>
        )}

        {collapsed && (
          <button className="rail-collapse-btn" onClick={onToggle} aria-label="Expandir menu" title="Expandir" style={{ margin: '0 auto 8px' }}>
            <Icon name="chevR" size={16} />
          </button>
        )}

        <nav className="rail-nav scrollbar-thin" aria-label="Navegação principal">
          {!collapsed && recentItems.length > 0 && (
            <div className="rail-group">
              <div className="rail-group-label">Recentes</div>
              {recentItems.map(navBtn)}
            </div>
          )}
          {groups.map((g) => {
            const holdsRoute = g.items.some((i) => i.id === route);
            const isCollapsed = !collapsed && g.label && groupState[g.label] && !holdsRoute;
            return (
              <div className="rail-group" key={g.label || '_root'}>
                {!collapsed && g.label && (
                  <button className="rail-group-toggle" onClick={() => toggleGroup(g.label)}>
                    <span>{g.label}</span>
                    <Icon name="chevD" size={12} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
                  </button>
                )}
                {!isCollapsed && g.items.map(navBtn)}
              </div>
            );
          })}
        </nav>

        <div className="rail-foot" ref={menuRef}>
          <button className="rail-user" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="true" aria-expanded={menuOpen}>
            <span className="rail-avatar">{user.avatar}</span>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div className="rail-user-name">{user.name}</div>
                <div className="rail-user-role">{window.FA_ACCESS.INTERNAL_ROLE_LABEL[user.role]}{user.crf ? ' · ' + user.crf : ''}</div>
              </div>
            )}
            {!collapsed && <Icon name="chevD" size={14} style={{ flex: 'none', opacity: 0.6, transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
          </button>
          {menuOpen && (
            <div className="rail-persona-menu" style={{ marginTop: 8 }}>
              {[['user', 'Minha conta', 'profile'], ['cog', 'Preferências', 'settings'], ['shield', 'Segurança & acesso', 'security']].map(([ic, l, tab]) => (
                <button key={tab} className="rail-persona-opt" onClick={() => { onAccount(tab); setMenuOpen(false); }}>
                  <Icon name={ic} size={15} />{l}
                </button>
              ))}
              <button className="rail-persona-opt" style={{ color: 'var(--rail-accent)' }} onClick={onLogout}>
                <Icon name="logout" size={15} />Sair do portal
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
const Sidebar = Rail; // back-compat alias


/* ============================================================
   Command palette (pages only for now)
   ============================================================ */

function CommandPalette({ open, onClose, onNavigate, user }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const visible = useMemo(() => new Set(window.FA_ACCESS.getVisibleInternalRoutes(user)), [user]);
  useEffect(() => {
    if (!open) return undefined;
    setQuery(''); setSel(0);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_NAV_ITEMS
      .filter((i) => visible.has(i.id) && (!q || i.label.toLowerCase().includes(q) || (GROUP_BY_ID[i.id] || '').toLowerCase().includes(q)))
      .slice(0, 9);
  }, [query, visible]);

  useEffect(() => { if (sel > results.length - 1) setSel(0); }, [results.length]);
  if (!open) return null;

  const pick = (item) => { if (item) { onNavigate(item.id); onClose(); } };

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Buscar e navegar">
        <div className="cmdk-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={query}
            placeholder="Buscar páginas…"
            onChange={(e) => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); pick(results[sel]); }
            }}
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <div className="cmdk-list scrollbar-thin">
          {results.length === 0 && <div className="cmdk-empty">Nada encontrado para “{query}”.</div>}
          {results.map((item, i) => (
            <button
              key={item.id}
              className={"cmdk-item" + (i === sel ? " sel" : "")}
              onMouseMove={() => setSel(i)}
              onClick={() => pick(item)}
            >
              <span className="cmdk-item-icon"><Icon name={item.icon} size={15} /></span>
              <span className="cmdk-item-label">{item.label}</span>
              <span className="cmdk-item-sub">{GROUP_BY_ID[item.id] || ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   AppShell — wraps the routed screen
   ============================================================ */

function AppShell({
  route, onNav, counts, collapsed, onToggle, onLogout, onAccount, user,
  stores, selectedStoreId, setSelectedStoreId, mobileNav, onRefresh, children,
}) {
  const [cmdkOpen, setCmdkOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groupLabel = GROUP_BY_ID[route];
  const pageLabel = (NAV_BY_ID[route] || {}).label || 'Painel';

  return (
    <MobileNavContext.Provider value={mobileNav}>
      <div className="app-shell" id="ph-root">
        <Rail
          route={route} onNav={onNav} counts={counts}
          collapsed={collapsed} onToggle={onToggle}
          onLogout={onLogout} onAccount={onAccount} user={user}
          stores={stores} selectedStoreId={selectedStoreId} setSelectedStoreId={setSelectedStoreId}
        />
        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn topbar-menu-btn" onClick={() => mobileNav.setOpen(true)} aria-label="Abrir menu">
              <Icon name="menu" size={18} />
            </button>
            <div className="topbar-crumb">
              {groupLabel && <><span className="topbar-crumb-group">{groupLabel}</span><Icon name="chevR" size={12} /></>}
              <span className="topbar-crumb-page">{pageLabel}</span>
            </div>
            <div className="topbar-actions">
              <button className="topbar-search as-button" onClick={() => setCmdkOpen(true)} aria-label="Buscar e navegar">
                <Icon name="search" size={15} />
                <span style={{ flex: 1, textAlign: 'left' }}>Buscar…</span>
                <kbd className="cmdk-kbd">{CMDK_HINT}</kbd>
              </button>
              {onRefresh && (
                <button className="icon-btn" onClick={onRefresh} aria-label="Atualizar" title="Atualizar">
                  <Icon name="refresh" size={16} />
                </button>
              )}
              <button className="icon-btn" onClick={onLogout} aria-label="Sair" title="Sair">
                <Icon name="logout" size={16} />
              </button>
            </div>
          </header>
          <div className="content" key={route}>{children}</div>
        </div>
      </div>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} onNavigate={onNav} user={user} />
      <ConfirmHost />
      <ToastHost />
    </MobileNavContext.Provider>
  );
}


/* ============================================================
   Topbar — compat wrapper: screens still render it; it now emits
   a PageHead so un-migrated screens pick up the new header style.
   The `ctx`/`onLogout` props are accepted and ignored (the shell
   owns store selection + logout now).
   ============================================================ */

function Topbar({ title, sub, children }) {
  return <PageHead title={title} desc={sub} actions={children} />;
}


/* ============================================================
   Login
   ============================================================ */

function PharmLogin({ onLogin, externalError }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [challengeActive, setChallengeActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (externalError) setError(externalError); }, [externalError]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (challengeActive) {
        await onLogin({ stage: 'verify-2fa', challengeToken, code: code.trim(), rememberSession: remember });
        return;
      }
      const response = await onLogin({ stage: 'login', email: email.trim(), password: pass, rememberSession: remember });
      if (response && response.stage === 'two_factor_required') {
        setChallengeToken(response.challenge_token);
        setChallengeActive(true);
        setCode('');
      }
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : 'Não foi possível iniciar a sessão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" id="ph-root" style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', maxWidth: 940, width: '100%' }}>
        <div style={{ background: 'var(--brand)', color: '#fff', padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span className="rail-brand-mark"><img src={MARKETPLACE_LOGO_MARK_URL} alt="" width={20} height={20} /></span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19 }}>Farmaura</span>
            </div>
            <span className="badge" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', marginTop: 16, letterSpacing: '.08em' }}>PORTAL INTERNO</span>
          </div>
          <div>
            <h2 style={{ color: '#fff', fontSize: 'clamp(22px,2.4vw,30px)', fontWeight: 800, lineHeight: 1.1 }}>Operação segregada por perfil</h2>
            <p style={{ opacity: .9, marginTop: 12, fontSize: 14.5, lineHeight: 1.55, maxWidth: 330 }}>
              Gerencie pedidos online, valide receitas, organize entregas e cuide do estoque — tudo em um só lugar.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              {[['box', 'Separe entregas e retiradas'], ['route', 'Rota de entrega otimizada'], ['rx', 'Validação de receita digital'], ['boxes', 'Controle de estoque em tempo real']].map(([ic, l]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 500, opacity: .95 }}>
                  <Icon name={ic} size={17} />{l}
                </span>
              ))}
            </div>
          </div>
          <div style={{ opacity: .7, fontSize: 12 }}>Acesso restrito · uso profissional</div>
        </div>

        <div style={{ padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.015em', marginBottom: 6 }}>Acesso profissional</h1>
          <p className="page-desc" style={{ marginBottom: 22 }}>Entre com um perfil interno. Cada papel recebe apenas os módulos permitidos.</p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!challengeActive && (
              <>
                <Field label="E-mail corporativo">
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome.sobrenome@farmaura.com.br" />
                </Field>
                <Field label="Senha">
                  <div style={{ position: 'relative' }}>
                    <input className="input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 40 }} />
                    <button type="button" onClick={() => setShow(!show)} aria-label="mostrar senha" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4, width: 30, height: 30, border: 'none', background: 'transparent' }}>
                      <Icon name={show ? 'eyeoff' : 'eye'} size={16} />
                    </button>
                  </div>
                </Field>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  Manter sessão neste dispositivo
                </label>
                <button type="button" onClick={() => setError('Redefinição de senha ainda não é self-service — peça a um administrador do portal.')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
                  Esqueci a senha
                </button>
              </>
            )}
            {challengeActive && (
              <Field label="Código do autenticador">
                <input className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 8))} placeholder="000000" />
              </Field>
            )}
            {error && (
              <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--warning-soft)', color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}>{error}</div>
            )}
            {challengeActive && (
              <button type="button" className="btn btn-secondary" onClick={() => { setChallengeActive(false); setChallengeToken(''); setCode(''); setError(''); }}>
                Voltar para senha
              </button>
            )}
            <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px 16px' }} disabled={busy}>
              {busy ? 'Validando...' : challengeActive ? 'Confirmar código' : 'Entrar no portal'}
              <Icon name="arrowR" size={16} />
            </button>
          </form>

          <p className="page-desc" style={{ textAlign: 'center', marginTop: 22, display: 'inline-flex', gap: 7, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="lock" size={13} />Ambiente seguro · acesso monitorado conforme a RDC.
          </p>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   Account modal
   ============================================================ */

function AccountModal({ tab, onClose, user, onLogoutAll, onTwoFactorSetup, onTwoFactorEnable, onTwoFactorDisable, onTwoFactorStatusChange, stores, selectedStoreId }) {
  const isAdmin = user.role === window.FA_ACCESS.ROLE.ADMIN;
  const [active, setActive] = useState(tab || 'profile');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState('');
  useEffect(() => { if (tab) setActive(tab); }, [tab]);

  const storeValue = isAdmin
    ? (selectedStoreId ? ((stores || []).find((s) => s.id === selectedStoreId) || {}).name || 'Loja selecionada' : 'Todas as lojas (use o seletor do menu)')
    : (((stores || [])[0] || {}).name || 'Loja não atribuída');

  return (
    <Modal
      open
      onClose={onClose}
      title={user.name}
      subtitle={`${window.FA_ACCESS.INTERNAL_ROLE_LABEL[user.role]}${user.crf ? ' · ' + user.crf : ''}`}
      footer={<button className="btn btn-primary" onClick={onClose}><Icon name="check" size={14} />Salvar alterações</button>}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar initials={user.avatar} size={56} />
        <div className="page-desc" style={{ margin: 0 }}>{user.email}</div>
      </div>
      <Tabs
        tabs={[{ key: 'profile', label: 'Perfil' }, { key: 'settings', label: 'Preferências' }, { key: 'security', label: 'Segurança' }]}
        active={active}
        onChange={setActive}
      />

      {active === 'profile' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Nome"><input className="input" defaultValue={user.name} /></Field>
          <Field label="E-mail corporativo"><input className="input" defaultValue={user.email} /></Field>
          <Field label="CRF / Registro profissional"><input className="input" defaultValue={user.crf || ''} /></Field>
          <Field label="Loja"><input className="input" disabled value={storeValue} /></Field>
        </div>
      )}

      {active === 'settings' && (
        <div style={{ display: 'grid', gap: 4 }}>
          {[['Notificações de novos pedidos', true], ['Alertas de receita pendente', true], ['Avisos de estoque baixo', true], ['Resumo diário por e-mail', false]].map(([l, on]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
              <SwitchToggle on={on} onChange={() => {}} label={l} />
            </div>
          ))}
        </div>
      )}

      {active === 'security' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Senha"><input className="input" type="password" defaultValue="••••••••••" /></Field>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Verificação em duas etapas</div>
              <div className="page-desc" style={{ margin: '2px 0 0' }}>Use o aplicativo autenticador para validar novos logins no portal interno.</div>
            </div>
            <SwitchToggle on={!!user.twoFactorEnabled} onChange={(v) => setTwoFactorModalMode(v ? 'enable' : 'disable')} label="2FA" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 0' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Encerrar outras sessões</div>
              <div className="page-desc" style={{ margin: '2px 0 0' }}>Desconecta o portal nos demais dispositivos.</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onLogoutAll}>Encerrar</button>
          </div>
        </div>
      )}

      <TwoFactorModal
        open={!!twoFactorModalMode}
        mode={twoFactorModalMode}
        portalLabel="portal interno"
        onClose={() => setTwoFactorModalMode('')}
        onStartSetup={onTwoFactorSetup}
        onEnable={onTwoFactorEnable}
        onDisable={onTwoFactorDisable}
        onStatusChange={onTwoFactorStatusChange}
      />
    </Modal>
  );
}


export {
  AppShell, Rail, Sidebar, Topbar, AccountModal, PharmLogin, CommandPalette,
  MobileNavContext, NAV_GROUPS,
  OC_STATUS, OC_FLOW, normalizeOrderStatusValue, orderStatusMeta, FulfillBadge,
  isActiveOrderStatus, isFinishedOrderStatus,
  stockState, minsSince, fmtDur, slaState, SLA_TARGET, customerOf, RecurringBadge,
};
