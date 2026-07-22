/* FARMAURA Console — Shell: Login (e-mail), Sidebar, Topbar, helpers compartilhados. */
import React, { useEffect, useRef, useState } from "react";
import { MARKETPLACE_LOGO_MARK_URL } from "../../marketplace/core/marketplace-assets.js";
import { AuraLayer, ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { TwoFactorModal } from "../../shared/two-factor-modal.jsx";


/* ---------- Metadados de status de pedido ---------- */
const OC_STATUS = {
  new:        { label: 'Novo', short: 'Novos', color: 'var(--fa-info)', cls: 'fa-badge-rx', icon: 'bell' },
  separating: { label: 'Em separação', short: 'Separando', color: 'var(--fa-warn)', cls: 'fa-badge-warn', icon: 'box' },
  ready:      { label: 'Pronto', short: 'Prontos', color: 'var(--fa-success)', cls: 'fa-badge-health', icon: 'check' },
  dispatched: { label: 'Despachado', short: 'Despachados', color: 'var(--fa-ink-3)', cls: 'fa-badge-mist', icon: 'truck' },
  delivered:  { label: 'Entregue', short: 'Entregues', color: 'var(--fa-success)', cls: 'fa-badge-health', icon: 'check' },
  cancelled:  { label: 'Cancelado', short: 'Cancelados', color: 'var(--fa-error)', cls: 'fa-badge-vital', icon: 'close' },
  unknown:    { label: 'Em análise', short: 'Em análise', color: 'var(--fa-ink-2)', cls: 'fa-badge-mist', icon: 'clock' },
};
const OC_FLOW = ['new', 'separating', 'ready', 'dispatched'];

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
    ? <span className="fa-badge fa-badge-mist"><Icon name="store" size={12} />Retirada</span>
    : <span className="fa-badge fa-badge-rose"><Icon name="truck" size={12} />Entrega</span>;
}

/* Status de estoque a partir de qty / min */
function stockState(it) {
  const qty = Number(it && it.qty || 0);
  const lowThreshold = Number(it && (it.lowThreshold ?? it.min) || 0);
  const attentionThreshold = Number(it && (it.attentionThreshold ?? lowThreshold) || lowThreshold);
  if (qty <= 0) return { key: 'out', label: 'Esgotado', color: 'var(--fa-error)', bg: '#FBEAE9' };
  if (qty <= lowThreshold) return { key: 'low', label: 'Baixo', color: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)' };
  if (qty <= attentionThreshold) return { key: 'attention', label: 'Atenção', color: 'var(--fa-info)', bg: 'var(--fa-info-soft)' };
  return { key: 'normal', label: 'Normal', color: 'var(--fa-success)', bg: 'var(--fa-success-soft)' };
}

/* ---------- Tempo / SLA ---------- */
const _hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function minsSince(placed, nowLabel) { const current = nowLabel || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return Math.max(0, _hm(current) - _hm(placed)); }
function fmtDur(min) { if (min < 60) return min + ' min'; const h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? String(m).padStart(2, '0') : ''); }
// estado de SLA: verde / âmbar / vermelho conforme o alvo (min)
function slaState(min, target) {
  const r = min / target;
  if (r < 0.6) return { color: 'var(--fa-success)', bg: 'var(--fa-success-soft)', label: 'no prazo' };
  if (r < 1) return { color: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)', label: 'atenção' };
  return { color: 'var(--fa-error)', bg: '#FBEAE9', label: 'atrasado' };
}
// alvo padrão por tipo (min)
const SLA_TARGET = { delivery: 90, pickup: 45 };

/* Cliente recorrente (lookup por nome) */
function customerOf(name, customerByName) { return customerByName ? customerByName[name] || null : null; }
function RecurringBadge({ name, small, customerByName }) {
  const c = customerOf(name, customerByName);
  if (!c) return null;
  return c.recurring
    ? <span className="fa-badge fa-badge-health" style={small ? { fontSize: 10 } : undefined}><Icon name="repeat" size={small ? 10 : 11} />Recorrente</span>
    : <span className="fa-badge fa-badge-mist" style={small ? { fontSize: 10 } : undefined}><Icon name="sparkle" size={small ? 10 : 11} />Novo cliente</span>;
}

/* ===================== LOGIN (mesmo design, por e-mail) ===================== */
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
  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (challengeActive) {
        await onLogin({
          stage: 'verify-2fa',
          challengeToken,
          code: code.trim(),
          rememberSession: remember,
        });
        return;
      }
      const response = await onLogin({
        stage: 'login',
        email: email.trim(),
        password: pass,
        rememberSession: remember,
      });
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
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 48, paddingBottom: 60, maxWidth: 980, minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <div className="fa-card fa-login-grid" style={{ overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 560, width: '100%' }}>
        {/* painel de marca */}
        <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--fa-primary)', color: '#fff', padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <AuraLayer tone="#fff" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="fa-logo">
              <span className="fa-logo-tile"><img src={MARKETPLACE_LOGO_MARK_URL} alt="" /></span>
              <span className="fa-logo-word" style={{ color: '#fff' }}>Farmaura</span>
            </div>
            <span className="fa-badge" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', marginTop: 16, letterSpacing: '.08em' }}>PORTAL INTERNO</span>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="fa-h1" style={{ color: '#fff', fontSize: 'clamp(24px,2.6vw,32px)' }}>Operação segregada por perfil</h2>
            <p style={{ opacity: .9, marginTop: 12, fontSize: 15, lineHeight: 1.55, maxWidth: 330 }}>Gerencie pedidos online, valide receitas, organize entregas e cuide do estoque — tudo em um só lugar.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              {[['box', 'Separe entregas e retiradas'], ['route', 'Rota de entrega otimizada'], ['rx', 'Validação de receita digital'], ['boxes', 'Controle de estoque em tempo real']].map(([ic, l]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500, opacity: .95 }}><Icon name={ic} size={18} />{l}</span>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1, opacity: .7, fontSize: 12.5 }}>Acesso restrito · uso profissional</div>
        </div>

        {/* painel de formulário */}
        <div style={{ padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="fa-h2" style={{ marginBottom: 6 }}>Acesso profissional</h1>
          <p className="fa-muted" style={{ fontSize: 14, marginBottom: 22 }}>Entre com um perfil interno. Cada papel recebe apenas os módulos permitidos.</p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!challengeActive && (
              <React.Fragment>
                <div className="fa-field"><label>E-mail corporativo</label>
                  <input className="fa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome.sobrenome@farmaura.com.br" />
                </div>
                <div className="fa-field">
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>Senha <a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 700 }}>Esqueci a senha</a></label>
                  <div style={{ position: 'relative' }}>
                    <input className="fa-input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 44 }} />
                    <button type="button" onClick={() => setShow(!show)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                      <Icon name={show ? 'eyeoff' : 'eye'} size={18} />
                    </button>
                  </div>
                </div>
                <label className="fa-check" data-on={remember ? '1' : '0'} onClick={() => setRemember(!remember)} style={{ marginTop: -4 }}>
                  <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Manter sessão neste dispositivo
                </label>
              </React.Fragment>
            )}
            {challengeActive && (
              <div className="fa-field">
                <label>Código do autenticador</label>
                <input className="fa-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 8))} placeholder="000000" />
              </div>
            )}
            {error && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{error}</div>}
            {challengeActive && (
              <button type="button" className="fa-btn fa-btn-soft fa-btn-block" onClick={() => { setChallengeActive(false); setChallengeToken(''); setCode(''); setError(''); }}>
                Voltar para senha
              </button>
            )}
            <button type="submit" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={busy}>
              {busy ? 'Validando...' : challengeActive ? 'Confirmar código' : 'Entrar no portal'}
              <Icon name="arrowR" size={18} />
            </button>
          </form>

          <p className="fa-muted" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 22, lineHeight: 1.5, display: 'inline-flex', gap: 7, justifyContent: 'center', alignItems: 'center' }}>
            <Icon name="lock" size={14} />Ambiente seguro · acesso monitorado conforme a RDC.
          </p>
          {challengeActive && (
            <p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 14 }}>
              A verificação em duas etapas está ativa para esta conta. Confirme o código TOTP para liberar o acesso interno.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== SIDEBAR ===================== */
function Sidebar({ route, onNav, counts, collapsed, onToggle, onLogout, onAccount, user }) {
  const P = user;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const groups = [
    { label: null, items: [
      { id: 'dash', label: 'Painel', icon: 'layout' },
    ]},
    { label: 'Operação', items: [
      { id: 'pdv', label: 'Balcão (PDV)', icon: 'receipt', count: counts.pdv },
      { id: 'orders', label: 'Pedidos online', icon: 'bag', count: counts.activeOrders },
      { id: 'deliveries', label: 'Entregas & rota', icon: 'route', count: counts.deliveries },
      { id: 'driver-route', label: 'Minhas entregas', icon: 'truck', count: counts.myDeliveryStops },
      { id: 'rx', label: 'Receitas', icon: 'rx', count: counts.pendingRx },
      { id: 'chat', label: 'Conversas', icon: 'chat', count: counts.unread },
      { id: 'team', label: 'Equipe', icon: 'user' },
    ]},
    { label: 'Relacionamento', items: [
      { id: 'crm', label: 'Clientes (CRM)', icon: 'user' },
    ]},
    { label: 'Financeiro', items: [
      { id: 'sales', label: 'Vendas & Notas', icon: 'money', count: counts.salesPending, alert: true },
      { id: 'analytics', label: 'Análises', icon: 'chart' },
    ]},
    { label: 'Catálogo', items: [
      { id: 'products', label: 'Produtos', icon: 'capsule' },
      { id: 'inventory', label: 'Estoque', icon: 'boxes', count: counts.lowStock, alert: true },
      { id: 'brands', label: 'Marcas', icon: 'tag' },
      { id: 'categories', label: 'Categorias', icon: 'grid' },
      { id: 'therapeutic-classes', label: 'Classes terapêuticas', icon: 'pill' },
      { id: 'locations', label: 'Localizações', icon: 'pin' },
      { id: 'suppliers', label: 'Fornecedores', icon: 'truck' },
      { id: 'stores', label: 'Lojas', icon: 'bag' },
      { id: 'product-trace', label: 'Rastreabilidade', icon: 'search' },
      { id: 'inventory-audit', label: 'Auditoria', icon: 'shield' },
      { id: 'acquisition-costs', label: 'Custos de Aquisição', icon: 'receipt' },
      { id: 'construction-costs', label: 'Custo de Construção', icon: 'store' },
    ]},
    { label: 'Marketplace', items: [
      { id: 'pricing', label: 'Precificador', icon: 'tag', count: counts.lowMargin, alert: true },
      { id: 'coupons', label: 'Cupons', icon: 'gift', count: counts.activeCoupons },
      { id: 'promotions', label: 'Promoções', icon: 'sparkle', count: counts.activePromotions },
      { id: 'delivery-zones', label: 'Áreas & Frete', icon: 'pin', count: counts.deliveryAreas },
    ]},
    { label: 'Sistema', items: [
      { id: 'settings', label: 'Configurações', icon: 'bank' },
    ]},
  ];
  const visibleRoutes = new Set(window.FA_ACCESS.getVisibleInternalRoutes(user));
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleRoutes.has(item.id)) }))
    .filter((group) => group.items.length > 0);
  return (
    <aside className="ph-side" data-collapsed={collapsed ? '1' : '0'}>
      <div className="ph-side-brand">
        <span className="fa-logo-tile"><img src={MARKETPLACE_LOGO_MARK_URL} alt="" /></span>
        <div className="ph-side-brand-txt">
          <div className="ph-side-brand-word">Farmaura</div>
          <div className="ph-side-brand-tag">Portal</div>
        </div>
        <button className="ph-side-toggle" onClick={onToggle} aria-label="expandir ou minimizar menu" title={collapsed ? 'Expandir' : 'Minimizar'}>
          <Icon name={collapsed ? 'chevR' : 'chevL'} size={17} />
        </button>
      </div>
      <div className="ph-side-scroll">
        {visibleGroups.map((g, gi) => (
          <div key={gi}>
            {g.label && <div className="ph-nav-group-label">{g.label}</div>}
            {g.items.map((it) => (
              <button key={it.id} className="ph-navlink" data-active={route === it.id ? '1' : '0'} onClick={() => onNav(it.id)} title={it.label}>
                <span className="ph-navic"><Icon name={it.icon} size={20} /></span>
                <span className="lbl">{it.label}</span>
                {it.count > 0 && <span className="ph-nav-count" style={it.alert ? { background: 'var(--fa-warn)' } : undefined}>{it.count}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="ph-side-user" ref={menuRef}>
        <button className="ph-user-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="true" aria-expanded={menuOpen}>
          <span className="fa-avatar fa-avatar-sm">{P.avatar}</span>
          <div className="ph-side-user-info" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{P.name}</div>
            <div style={{ fontSize: 11.5, opacity: .7 }}>{P.crf}</div>
          </div>
          <Icon name="chevD" size={15} className="ph-user-chev" style={{ opacity: .7, transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
        {menuOpen && (
          <div className="ph-user-menu">
            <div className="ph-user-menu-head">
              <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{P.avatar}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{P.name}</div>
                <div className="fa-faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{P.email}</div>
              </div>
            </div>
            {[['user', 'Minha conta', () => { onAccount('profile'); setMenuOpen(false); }],
              ['cog', 'Configurações', () => { onAccount('settings'); setMenuOpen(false); }],
              ['shield', 'Segurança & acesso', () => { onAccount('security'); setMenuOpen(false); }]].map(([ic, l, fn]) => (
              <button key={l} className="ph-user-menu-item" onClick={fn}><Icon name={ic} size={17} />{l}</button>
            ))}
            <div className="ph-user-menu-sep" />
            <button className="ph-user-menu-item" data-danger="1" onClick={onLogout}><Icon name="logout" size={17} />Sair do portal</button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ===================== TOPBAR ===================== */
function Topbar({ title, sub, onLogout, children, ctx }) {
  const isAdmin = !!(ctx && ctx.user && ctx.user.role === window.FA_ACCESS.ROLE.ADMIN);
  const stores = (ctx && ctx.stores) || [];
  return (
    <header className="ph-topbar">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ph-topbar-title">{title}</div>
        {sub && <div className="ph-topbar-sub">{sub}</div>}
      </div>
      {children}
      {isAdmin && stores.length > 0 && (
        <select
          className="fa-select"
          style={{ maxWidth: 220, flex: '0 0 auto' }}
          value={ctx.selectedStoreId || ''}
          onChange={(e) => ctx.setSelectedStoreId && ctx.setSelectedStoreId(e.target.value)}
          title="Loja exibida no console"
          aria-label="Loja exibida no console"
        >
          <option value="">Todas as lojas</option>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
      )}
      <button className="fa-iconbtn" title="Atualizar" aria-label="atualizar"><Icon name="refresh" size={18} /></button>
      <button className="fa-iconbtn" title="Sair" aria-label="sair" onClick={onLogout}><Icon name="logout" size={18} /></button>
    </header>
  );
}

/* ===================== MODAL DE CONTA / CONFIGURAÇÕES ===================== */
function AccountModal({ tab, onClose, user, onLogoutAll, onTwoFactorSetup, onTwoFactorEnable, onTwoFactorDisable, onTwoFactorStatusChange, stores, selectedStoreId }) {
  const P = user;
  const isAdmin = P.role === window.FA_ACCESS.ROLE.ADMIN;
  const [active, setActive] = useState(tab || 'profile');
  const [twoFactorModalMode, setTwoFactorModalMode] = useState('');
  useEffect(() => { if (tab) setActive(tab); }, [tab]);
  const tabs = [['profile', 'Perfil', 'user'], ['settings', 'Preferências', 'cog'], ['security', 'Segurança', 'shield']];
  const Row = ({ label, children }) => (
    <div className="fa-field" style={{ marginBottom: 14 }}><label>{label}</label>{children}</div>
  );
  return (
    <ModalShell open={true} onClose={onClose} maxw={620}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <span className="fa-avatar" style={{ width: 60, height: 60, fontSize: 22 }}>{P.avatar}</span>
        <div><h2 className="fa-h3" style={{ fontSize: 20 }}>{P.name}</h2><div className="fa-faint" style={{ fontSize: 13 }}>{window.FA_ACCESS.INTERNAL_ROLE_LABEL[P.role]}{P.crf ? ' · ' + P.crf : ''}</div></div>
      </div>
      <div className="ph-seg" style={{ marginBottom: 18 }}>
        {tabs.map(([id, l, ic]) => <button key={id} data-on={active === id ? '1' : '0'} onClick={() => setActive(id)}><Icon name={ic} size={15} />{l}</button>)}
      </div>
      {active === 'profile' && (
        <div><Row label="Nome"><input className="fa-input" defaultValue={P.name} /></Row>
          <Row label="E-mail corporativo"><input className="fa-input" defaultValue={P.email} /></Row>
          <Row label="CRF / Registro profissional"><input className="fa-input" defaultValue={P.crf} /></Row>
          <Row label="Loja">
            <input
              className="fa-input"
              disabled
              value={isAdmin
                ? (selectedStoreId ? ((stores || []).find((store) => store.id === selectedStoreId) || {}).name || 'Loja selecionada' : 'Todas as lojas (use o seletor no topo para filtrar)')
                : (((stores || [])[0] || {}).name || 'Loja nao atribuida')}
            />
          </Row>
        </div>
      )}
      {active === 'settings' && (
        <div>
          {[['Notificações de novos pedidos', true], ['Alertas de receita pendente', true], ['Avisos de estoque baixo', true], ['Resumo diário por e-mail', false]].map(([l, on]) => (
            <div className="fa-row" key={l}><div className="fa-row-main"><div className="fa-row-label">{l}</div></div><Toggle on={on} onChange={() => {}} ariaLabel={l} /></div>
          ))}
        </div>
      )}
      {active === 'security' && (
        <div><Row label="Senha"><input className="fa-input" type="password" defaultValue="••••••••••" /></Row>
          <div className="fa-row"><div className="fa-row-main"><div className="fa-row-label">Verificação em duas etapas</div><div className="fa-row-desc">Use o aplicativo autenticador para validar novos logins no portal interno.</div></div><Toggle on={!!P.twoFactorEnabled} onChange={(value) => setTwoFactorModalMode(value ? 'enable' : 'disable')} ariaLabel="2FA" /></div>
          <div className="fa-row"><div className="fa-row-main"><div className="fa-row-label">Encerrar outras sessões</div><div className="fa-row-desc">Desconecta o portal nos demais dispositivos.</div></div><button className="fa-btn fa-btn-soft fa-btn-sm" onClick={onLogoutAll}>Encerrar</button></div></div>
      )}
      <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 18 }} onClick={onClose}>Salvar alterações</button>
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
    </ModalShell>
  );
}

export { AccountModal, FulfillBadge, OC_FLOW, OC_STATUS, PharmLogin, RecurringBadge, SLA_TARGET, Sidebar, Topbar, customerOf, fmtDur, minsSince, normalizeOrderStatusValue, orderStatusMeta, slaState, stockState };
