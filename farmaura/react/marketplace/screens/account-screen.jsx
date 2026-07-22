/* FARMAURA — Account: LoginScreen + AccountScreen shell + Summary + Order pieces. */
import React, { useEffect, useState } from "react";
import { MARKETPLACE_LOGO_MARK_URL } from "../core/marketplace-assets.js";
import { AuraLayer, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { faCashback } from "./account-shared.jsx";
import { ConversationsInbox, HealthServices, MyOrders, SavedProducts } from "./account-health-screen.jsx";
import { buildAddressLine, buildAddressSecondaryLine, normalizeAddress } from "../core/marketplace-address.js";
import { DataPrivacy, MyCards, ProfileManage } from "./account-profile-screen.jsx";


const initials = (name) => name.split(' ').map((s) => s[0]).slice(0, 2).join('');

const isStrongPassword = (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const PASSWORD_STRENGTH_HINT = 'A senha deve ter pelo menos 8 caracteres, com letra minúscula, maiúscula, número e caractere especial (ex: @, !, ?).';

const LOGIN_MODE_ORDER = ['login', 'register', 'first-access'];
const LOGIN_MODE_LABELS = { login: 'Entrar', register: 'Criar conta', 'first-access': 'Primeiro acesso' };

function LoginScreen({ ctx }) {
  const { onNav, authClient, finalizeAuthenticatedSession } = ctx;
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'first-access'
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('credentials'); // 'credentials' | 'two_factor' | 'password_change'
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [firstAccessEmail, setFirstAccessEmail] = useState('');
  const [firstAccessBusy, setFirstAccessBusy] = useState(false);
  const [firstAccessError, setFirstAccessError] = useState('');
  const [firstAccessDone, setFirstAccessDone] = useState(false);

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerShow, setRegisterShow] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const switchMode = (id) => {
    setMode(id);
    setError('');
    setStage('credentials');
    setFirstAccessDone(false);
    setFirstAccessError('');
    setRegisterError('');
  };
  const showModeSwitch = !(mode === 'login' && stage !== 'credentials') && !(mode === 'first-access' && firstAccessDone);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (stage === 'two_factor') {
        const flow = await authClient.verifyTwoFactor({
          challenge_token: challengeToken,
          code: code.trim(),
        });
        await finalizeAuthenticatedSession(flow, remember);
        return;
      }
      if (stage === 'password_change') {
        if (newPassword.length < 8 || !isStrongPassword(newPassword)) {
          setError(PASSWORD_STRENGTH_HINT);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('As senhas não coincidem.');
          return;
        }
        const flow = await authClient.completeFirstAccess({
          challenge_token: challengeToken,
          new_password: newPassword,
        });
        await finalizeAuthenticatedSession(flow, remember);
        return;
      }
      const flow = await authClient.login({
        email: email.trim(),
        password: pass,
        remember_session: remember,
      });
      if (flow.stage === 'two_factor_required') {
        setChallengeToken(flow.challenge_token);
        setStage('two_factor');
        setCode('');
        return;
      }
      if (flow.stage === 'password_change_required') {
        setChallengeToken(flow.challenge_token);
        setStage('password_change');
        setNewPassword('');
        setConfirmPassword('');
        return;
      }
      await finalizeAuthenticatedSession(flow, remember);
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : 'Não foi possível autenticar sua sessão.');
    } finally {
      setBusy(false);
    }
  };

  const submitFirstAccess = async (e) => {
    e.preventDefault();
    setFirstAccessBusy(true);
    setFirstAccessError('');
    try {
      await authClient.requestFirstAccess({ email: firstAccessEmail.trim() });
      setFirstAccessDone(true);
    } catch (requestError) {
      setFirstAccessError(requestError && requestError.message ? requestError.message : 'Não foi possível processar sua solicitação agora.');
    } finally {
      setFirstAccessBusy(false);
    }
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');
    if (registerPassword.length < 8 || !isStrongPassword(registerPassword)) {
      setRegisterError(PASSWORD_STRENGTH_HINT);
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('As senhas não coincidem.');
      return;
    }
    setRegisterBusy(true);
    try {
      const flow = await authClient.register({
        full_name: registerName.trim(),
        email: registerEmail.trim(),
        phone: registerPhone.trim(),
        password: registerPassword,
        remember_session: remember,
      });
      await finalizeAuthenticatedSession(flow, remember);
    } catch (requestError) {
      setRegisterError(requestError && requestError.message ? requestError.message : 'Não foi possível criar sua conta agora.');
    } finally {
      setRegisterBusy(false);
    }
  };

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 980 }}>
      <div className="fa-card fa-login-grid" style={{ overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 540 }}>
        <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--fa-primary)', color: '#fff', padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <AuraLayer tone="#fff" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="fa-logo">
              <span className="fa-logo-tile"><img src={MARKETPLACE_LOGO_MARK_URL} alt="" /></span>
              <span className="fa-logo-word" style={{ color: '#fff' }}>Farmaura</span>
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="fa-h1" style={{ color: '#fff', fontSize: 'clamp(24px,2.6vw,32px)' }}>Cuidado que acompanha você</h2>
            <p style={{ opacity: .9, marginTop: 12, fontSize: 15, lineHeight: 1.55, maxWidth: 320 }}>Entre para acompanhar pedidos, gerenciar assinaturas e falar com seu farmacêutico.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              {[['truck', 'Acompanhe entregas em tempo real'], ['repeat', 'Gerencie suas assinaturas'], ['rx', 'Guarde suas receitas digitais']].map(([ic, l]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500, opacity: .95 }}><Icon name={ic} size={18} />{l}</span>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1, opacity: .7, fontSize: 12.5 }}>Atendimento farmacêutico 24h</div>
        </div>

        <div style={{ padding: 'clamp(28px,3.5vw,44px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {mode === 'register' ? (
            <React.Fragment>
              <h1 className="fa-h2" style={{ marginBottom: 6 }}>Vamos começar</h1>
              <p className="fa-muted" style={{ fontSize: 14, marginBottom: 22 }}>Crie sua conta em menos de um minuto.</p>
              <form onSubmit={submitRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="fa-field"><label>Nome completo</label>
                  <input className="fa-input" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="fa-field"><label>E-mail</label>
                  <input className="fa-input" type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="voce@email.com" />
                </div>
                <div className="fa-field"><label>Telefone (opcional)</label>
                  <input className="fa-input" type="tel" value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div className="fa-field"><label>Senha</label>
                  <div style={{ position: 'relative' }}>
                    <input className="fa-input" type={registerShow ? 'text' : 'password'} value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} style={{ paddingRight: 44 }} placeholder="Mín. 8 car., maiúscula, número e especial" />
                    <button type="button" onClick={() => setRegisterShow(!registerShow)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                      <Icon name={registerShow ? 'eyeoff' : 'eye'} size={18} />
                    </button>
                  </div>
                </div>
                <div className="fa-field"><label>Confirmar senha</label>
                  <input className="fa-input" type={registerShow ? 'text' : 'password'} value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} placeholder="Repita a senha" />
                </div>
                <label className="fa-check" data-on={remember ? '1' : '0'} onClick={() => setRemember(!remember)} style={{ marginTop: -4 }}>
                  <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Continuar conectada
                </label>
                {registerError && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{registerError}</div>}
                <button type="submit" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={registerBusy || !registerName.trim() || !registerEmail.trim() || !registerPassword}>
                  {registerBusy ? 'Criando conta...' : 'Criar conta'}
                  <Icon name="arrowR" size={18} />
                </button>
              </form>
            </React.Fragment>
          ) : mode === 'first-access' ? (
            <React.Fragment>
              <h1 className="fa-h2" style={{ marginBottom: 6 }}>Primeiro acesso</h1>
              <p className="fa-muted" style={{ fontSize: 14, marginBottom: 22 }}>Foi cadastrada na farmácia? Confirme seu e-mail para receber uma senha temporária.</p>
              {firstAccessDone ? (
                <React.Fragment>
                  <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-mist-2)', color: 'var(--fa-ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>
                    Se o e-mail informado estiver cadastrado, enviaremos uma senha temporária para acesso. Verifique sua caixa de entrada e volte para entrar.
                  </div>
                  <button type="button" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 16 }} onClick={() => { switchMode('login'); setFirstAccessEmail(''); }}>
                    Voltar para o login
                    <Icon name="arrowR" size={18} />
                  </button>
                </React.Fragment>
              ) : (
                <form onSubmit={submitFirstAccess} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="fa-field"><label>E-mail cadastrado</label>
                    <input className="fa-input" type="email" value={firstAccessEmail} onChange={(e) => setFirstAccessEmail(e.target.value)} placeholder="voce@email.com" />
                  </div>
                  {firstAccessError && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{firstAccessError}</div>}
                  <button type="submit" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={firstAccessBusy || !firstAccessEmail.trim()}>
                    {firstAccessBusy ? 'Enviando...' : 'Confirmar e-mail'}
                    <Icon name="arrowR" size={18} />
                  </button>
                </form>
              )}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1 className="fa-h2" style={{ marginBottom: 6 }}>{stage === 'password_change' ? 'Defina sua nova senha' : 'Bem-vinda de volta'}</h1>
              <p className="fa-muted" style={{ fontSize: 14, marginBottom: 22 }}>{stage === 'password_change' ? 'Este é o seu primeiro acesso — crie uma senha só sua para continuar.' : 'Acesse sua conta Farmaura.'}</p>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {stage === 'credentials' && (
                  <React.Fragment>
                    <div className="fa-field"><label>E-mail</label>
                      <input className="fa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                    </div>
                    <div className="fa-field">
                      <label style={{ display: 'flex', justifyContent: 'space-between' }}>Senha</label>
                      <div style={{ position: 'relative' }}>
                        <input className="fa-input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 44 }} />
                        <button type="button" onClick={() => setShow(!show)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                          <Icon name={show ? 'eyeoff' : 'eye'} size={18} />
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                )}
                {stage === 'two_factor' && (
                  <div className="fa-field">
                    <label>Código de verificação</label>
                    <input className="fa-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 8))} placeholder="000000" />
                  </div>
                )}
                {stage === 'password_change' && (
                  <React.Fragment>
                    <div className="fa-field"><label>Nova senha</label>
                      <div style={{ position: 'relative' }}>
                        <input className="fa-input" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ paddingRight: 44 }} placeholder="Mín. 8 car., maiúscula, número e especial" />
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                          <Icon name={showNewPassword ? 'eyeoff' : 'eye'} size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="fa-field"><label>Confirmar nova senha</label>
                      <input className="fa-input" type={showNewPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
                    </div>
                  </React.Fragment>
                )}
                {stage === 'credentials' && (
                  <label className="fa-check" data-on={remember ? '1' : '0'} onClick={() => setRemember(!remember)} style={{ marginTop: -4 }}>
                    <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Continuar conectada
                  </label>
                )}
                {error && <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{error}</div>}
                {stage === 'two_factor' && (
                  <button type="button" className="fa-btn fa-btn-soft fa-btn-block" onClick={() => { setStage('credentials'); setChallengeToken(''); setCode(''); setError(''); }}>
                    Voltar para senha
                  </button>
                )}
                <button type="submit" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={busy}>
                  {busy ? 'Validando...' : stage === 'two_factor' ? 'Confirmar código' : stage === 'password_change' ? 'Salvar nova senha' : 'Entrar'}
                  <Icon name="arrowR" size={18} />
                </button>
              </form>

              {stage === 'credentials' && (
                <div className="fa-card" style={{ marginTop: 20, padding: '14px 16px', background: 'var(--fa-mist-2)', color: 'var(--fa-ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>
                  O acesso neste ambiente está habilitado apenas por e-mail e senha. Login social, incluindo Google, permanece desativado.
                </div>
              )}
              {stage === 'two_factor' && (
                <p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 18 }}>
                  A dupla autenticação está ativa para esta conta. Informe o código temporário do aplicativo autenticador para concluir o acesso.
                </p>
              )}
              {stage === 'password_change' && (
                <p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 18 }}>
                  Você recebeu uma senha temporária por e-mail. Depois de salvar sua nova senha, o acesso à sua conta é liberado normalmente.
                </p>
              )}
            </React.Fragment>
          )}

          {showModeSwitch && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', color: 'var(--fa-ink-3)', fontSize: 12, fontWeight: 600 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
                ou
                <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {LOGIN_MODE_ORDER.filter((id) => id !== mode).map((id) => (
                  <button key={id} type="button" className="fa-btn fa-btn-soft fa-btn-block" onClick={() => switchMode(id)}>
                    {LOGIN_MODE_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="fa-muted" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>Ao continuar, você concorda com os <a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 600 }}>Termos</a> e a <a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 600 }}>Política de Privacidade</a>.</p>
        </div>
      </div>
    </div>
  );
}

/* Landing page for the link sent in the account-lockout e-mail (?token=...). */
function UnlockAccountScreen({ ctx }) {
  const { route, authClient, onNav } = ctx;
  const token = (route && route.token || '').trim();
  const [status, setStatus] = useState(token ? 'idle' : 'missing'); // 'idle' | 'busy' | 'done' | 'error' | 'missing'
  const [message, setMessage] = useState('');

  const submitUnlock = async () => {
    setStatus('busy');
    setMessage('');
    try {
      const response = await authClient.unlockAccount({ token });
      setMessage((response && response.detail) || 'Conta desbloqueada com sucesso.');
      setStatus('done');
    } catch (requestError) {
      setMessage(requestError && requestError.message ? requestError.message : 'Não foi possível desbloquear sua conta agora.');
      setStatus('error');
    }
  };

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 520 }}>
      <div className="fa-card" style={{ padding: 'clamp(28px,4vw,44px)', textAlign: 'center' }}>
        <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 64, height: 64 }}>
          <Icon name={status === 'done' ? 'check' : 'lock'} size={26} />
        </span>

        {status === 'missing' ? (
          <React.Fragment>
            <h1 className="fa-h2" style={{ marginBottom: 8 }}>Link de desbloqueio inválido</h1>
            <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
              Este link não traz um código de desbloqueio válido. Verifique se você copiou o endereço completo do e-mail que enviamos.
            </p>
          </React.Fragment>
        ) : status === 'done' ? (
          <React.Fragment>
            <h1 className="fa-h2" style={{ marginBottom: 8 }}>Conta desbloqueada</h1>
            <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 22 }}>{message}</p>
            <button type="button" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" onClick={() => onNav({ name: 'login' })}>
              Ir para o login
              <Icon name="arrowR" size={18} />
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h1 className="fa-h2" style={{ marginBottom: 8 }}>Desbloquear sua conta</h1>
            <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 22 }}>
              Detectamos várias tentativas de login com senha incorreta e bloqueamos o acesso por segurança. Se foi você quem errou a senha, confirme abaixo para liberar o acesso imediatamente.
            </p>
            {status === 'error' && (
              <div className="fa-card" style={{ padding: '14px 16px', marginBottom: 18, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{message}</div>
            )}
            <button type="button" className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={status === 'busy'} onClick={submitUnlock}>
              {status === 'busy' ? 'Desbloqueando...' : 'Desbloquear minha conta'}
              <Icon name="arrowR" size={18} />
            </button>
            <p className="fa-muted" style={{ fontSize: 12.5, marginTop: 16, lineHeight: 1.5 }}>
              Se você não reconhece essas tentativas, recomendamos trocar sua senha assim que entrar novamente.
            </p>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ---------------- Order pieces (shared by Summary + MyOrders) ---------------- */
function OrderTracker({ step, fulfillment }) {
  const isPickup = fulfillment === 'pickup';
  const stages = [['bag', 'Aguardando confirmação'], ['clock', 'Preparando'], [isPickup ? 'store' : 'truck', isPickup ? 'Retirada na loja' : 'A caminho'], ['check', 'Entregue']];
  const active = Number.isFinite(Number(step)) ? Number(step) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 2px' }}>
      {stages.map(([ic, l], i) => {
        const done = i <= active;
        return (
          <React.Fragment key={l}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none' }}>
              <span style={{ width: 34, height: 34, borderRadius: 99, display: 'grid', placeItems: 'center', background: done ? 'var(--fa-primary)' : 'var(--fa-mist-2)', color: done ? '#fff' : 'var(--fa-ink-3)', flex: 'none' }}><Icon name={ic} size={17} stroke={2} /></span>
              <span style={{ fontSize: 11, fontWeight: 600, color: done ? 'var(--fa-ink)' : 'var(--fa-ink-3)' }}>{l}</span>
            </div>
            {i < stages.length - 1 && <span style={{ flex: 1, height: 3, borderRadius: 2, margin: '0 6px', marginTop: -18, background: i < active ? 'var(--fa-primary)' : 'var(--fa-mist)' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function resolveOrderStatusMeta(statusMap, order) {
  return statusMap[order.status] || statusMap.preparing || { cls: 'fa-badge-mist', icon: 'clock', label: order.rawStatus || 'Em processamento', step: 0 };
}

function resolveOrderLineProduct(item, products) {
  const product = products.find((entry) => entry.id === item.id);
  if (product) {
    return product;
  }
  return {
    id: item.id,
    cat: 'medicamentos',
    name: item.name || 'Produto Farmaura',
    brand: item.brand || 'Farmaura',
    price: Number(item.unitPrice || 0),
  };
}

function resolveOrderLineTotal(item, product) {
  if (Number.isFinite(Number(item.lineTotal)) && Number(item.lineTotal) > 0) {
    return Number(item.lineTotal);
  }
  const unitPrice = item.sub ? Number(product.price || 0) * 0.85 : Number(item.unitPrice || product.price || 0);
  return unitPrice * Number(item.qty || 0);
}

function OrderCard({ order, products, statusMap, onReorder, onOpenProduct, onTrackOrder, onOpenSupport, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen != null ? defaultOpen : order.status === 'transit');
  const st = resolveOrderStatusMeta(statusMap, order);
  const total = Number(order.total || 0) || order.items.reduce((sum, item) => {
    const product = resolveOrderLineProduct(item, products);
    return sum + resolveOrderLineTotal(item, product);
  }, 0);
  const count = order.items.reduce((s, it) => s + it.qty, 0);
  const pickup = order.fulfillment === 'pickup';
  const shipping = order.fulfillment === 'shipping';
  const cancelled = order.status === 'cancelled';
  return (
    <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: open ? '1px solid var(--fa-mist)' : 'none' }}>
        <span className={'fa-badge ' + st.cls}><Icon name={st.icon} size={12} stroke={2.2} />{st.label}</span>
        <span className="fa-badge fa-badge-outline"><Icon name={pickup ? 'bag' : shipping ? 'nav' : 'truck'} size={12} />{pickup ? 'Retirado na loja' : shipping ? 'Envio por transportadora' : 'Entregue em casa'}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }} className="fa-mono">#{order.id}</span>
          <span className="fa-faint" style={{ fontSize: 12.5 }}>{order.date} · {count} {count === 1 ? 'item' : 'itens'}</span>
          {pickup && order.pickupCode && !cancelled ? <span className="fa-badge fa-badge-rx" style={{ width: 'fit-content', marginTop: 8, fontSize: 11 }}><Icon name="bag" size={11} />Codigo {order.pickupCode}</span> : null}
          {shipping && order.trackingCode && !cancelled ? <span className="fa-badge fa-badge-rx" style={{ width: 'fit-content', marginTop: 8, fontSize: 11 }}><Icon name="nav" size={11} />Rastreio {order.trackingCode}</span> : null}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="fa-faint" style={{ fontSize: 12 }}>Total</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{brl(total)}</div>
          </div>
          <button className="fa-iconbtn" onClick={() => setOpen(!open)} aria-label="detalhes" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><Icon name="chevD" size={18} /></button>
        </div>
      </div>

      {open && (
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {cancelled
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--fa-error)', fontWeight: 600 }}><Icon name="close" size={16} stroke={2.4} />Pedido cancelado</div>
            : order.status !== 'delivered'
            ? <div style={{ background: 'var(--fa-rose-soft)', borderRadius: 'var(--fa-r-card)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, color: 'var(--fa-primary)', marginBottom: 12 }}><Icon name="truck" size={16} />Chega {order.eta}</div>
                <OrderTracker step={st.step} fulfillment={order.fulfillment} />
              </div>
            : <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--fa-success)', fontWeight: 600 }}><Icon name="check" size={16} stroke={2.4} />{order.eta}{pickup && order.store ? ' · ' + order.store : ''}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {order.items.map((it) => {
              const p = resolveOrderLineProduct(it, products);
              const lineTotal = resolveOrderLineTotal(it, p);
              return (
                <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="fa-ph" data-cat={p.cat} style={{ width: 52, height: 52, aspectRatio: 'auto', flex: 'none', cursor: 'pointer' }} onClick={() => p.id && onOpenProduct(p)}>
                    <Icon name={p.cat === 'medicamentos' ? 'pill' : p.cat === 'perfumaria' ? 'sparkle' : p.cat === 'bem-estar' ? 'leaf' : 'heart'} size={22} style={{ color: 'var(--fa-primary)', opacity: .5 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{p.name}</div>
                    <div className="fa-faint" style={{ fontSize: 12 }}>{it.qty}x · {p.brand}{it.sub ? ' · assinatura' : ''}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{brl(lineTotal)}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--fa-ink-2)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="card" size={15} />{order.payment}</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="pin" size={15} />{pickup && order.store ? order.store : order.address}</span>
            {pickup && order.pickupCode && !cancelled ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="bag" size={15} />Codigo {order.pickupCode}</span> : null}
            {shipping && order.trackingCode && !cancelled ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name="nav" size={15} />Rastreio {order.trackingCode}</span> : null}
          </div>
          {pickup && order.pickupCode && !cancelled ? <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-info-soft)', border: '1px solid var(--fa-mist)', fontSize: 13.5, lineHeight: 1.5 }}><b style={{ display: 'block', marginBottom: 4 }}>Use este código na retirada</b><span className="fa-mono" style={{ fontSize: 18, fontWeight: 800 }}>{order.pickupCode}</span><div className="fa-muted" style={{ marginTop: 6 }}>Informe esse código ao farmacêutico para validar a entrega no sistema.</div></div> : null}
          {shipping && !cancelled ? (
            order.trackingCode ? (
              <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-info-soft)', border: '1px solid var(--fa-mist)', fontSize: 13.5, lineHeight: 1.5 }}>
                <b style={{ display: 'block', marginBottom: 4 }}>Código de rastreio{order.carrierName ? ' · ' + order.carrierName : ''}</b>
                <span className="fa-mono" style={{ fontSize: 18, fontWeight: 800 }}>{order.trackingCode}</span>
              </div>
            ) : (
              <div className="fa-card" style={{ padding: '14px 16px', background: 'var(--fa-mist-2)', fontSize: 13, lineHeight: 1.5 }}>
                O código de rastreio aparece aqui assim que o pedido for postado na transportadora.
              </div>
            )
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="fa-btn fa-btn-primary" onClick={() => onReorder(order)}><Icon name="repeat" size={16} />Comprar novamente</button>
            {order.status !== 'delivered' && !cancelled && <button className="fa-btn fa-btn-ghost" onClick={() => onTrackOrder && onTrackOrder(order)}><Icon name="pin" size={16} />{pickup ? 'Acompanhar retirada' : 'Acompanhar entrega'}</button>}
            <button className="fa-btn fa-btn-soft" onClick={() => onOpenSupport && onOpenSupport(order)}><Icon name="chat" size={16} />Falar com farmacêutico</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Account shell ---------------- */
const ACCT_TABS = [
  { id: 'summary', label: 'Resumo da conta', icon: 'grid' },
  { id: 'profile', label: 'Gerenciar perfil', icon: 'cog' },
  { id: 'privacy', label: 'Privacidade de dados', icon: 'shield' },
  { id: 'orders', label: 'Meus pedidos', icon: 'bag' },
  { id: 'conversations', label: 'Minhas conversas', icon: 'chat' },
  { id: 'health', label: 'Serviços de saúde', icon: 'activity' },
  { id: 'cards', label: 'Meus cartões', icon: 'card' },
  { id: 'logout', label: 'Sair', icon: 'logout' },
];

function AccountScreen({ ctx }) {
  const { user, onNav, logout, route } = ctx;
  const [tab, setTab] = useState(route.tab || 'summary');
  useEffect(() => { if (route.tab) setTab(route.tab); }, [route.tab]);

  const [profile, setProfile] = useState({ ...ctx.profile, name: ctx.profile.name || user.name, email: ctx.profile.email || user.email });
  useEffect(() => {
    setProfile({ ...ctx.profile, name: ctx.profile.name || user.name, email: ctx.profile.email || user.email });
  }, [ctx.profile, user.name, user.email]);
  const [programs, setPrograms] = useState(ctx.privacyPrograms);
  const [channels, setChannels] = useState(ctx.commChannels);

  const acct = { profile, setProfile, programs, setPrograms, channels, setChannels };

  if (!user) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 60, paddingBottom: 80, textAlign: 'center' }}>
        <span className="fa-iconbox" style={{ margin: '0 auto 18px', width: 72, height: 72 }}><Icon name="bag" size={32} /></span>
        <h1 className="fa-h2">Entre para acessar sua conta</h1>
        <p className="fa-lead" style={{ marginTop: 8 }}>Acompanhe pedidos, serviços de saúde, cartões e mais em um só lugar.</p>
        <button className="fa-btn fa-btn-primary fa-btn-lg" style={{ marginTop: 22 }} onClick={() => onNav({ name: 'login' })}>Entrar na conta</button>
      </div>
    );
  }

  const go = (id) => { if (id === 'logout') { logout(); return; } setTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const active = ACCT_TABS.find((t) => t.id === tab) || ACCT_TABS[0];

  let content;
  switch (tab) {
    case 'profile': content = <ProfileManage ctx={ctx} acct={acct} />; break;
    case 'privacy': content = <DataPrivacy ctx={ctx} acct={acct} />; break;
    case 'orders': content = <MyOrders ctx={ctx} />; break;
    case 'conversations': content = <ConversationsInbox ctx={ctx} />; break;
    case 'health': content = <HealthServices ctx={ctx} />; break;
    case 'saved': content = <SavedProducts ctx={ctx} />; break;
    case 'cards': content = <MyCards ctx={ctx} acct={acct} />; break;
    default: content = <AccountSummary ctx={ctx} acct={acct} setTab={go} />;
  }

  return (
    <div className={'fa-wrap fa-fadein fa-acct--' + (ctx.accountNav || 'side')} style={{ paddingTop: 24, paddingBottom: 28, maxWidth: 1160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <a role="button" onClick={() => go('summary')} style={{ color: tab === 'summary' ? 'var(--fa-ink-2)' : undefined, fontWeight: tab === 'summary' ? 600 : 400 }}>Minha conta</a>
        {tab !== 'summary' && <><Icon name="chevR" size={13} /><span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>{active.label}</span></>}
      </div>

      <div className="fa-acct-grid">
        <aside className="fa-acct-side">
          <div className="fa-card fa-acct-userbox">
            <span className="fa-avatar fa-avatar-sm">{profile.photo ? <img src={profile.photo} alt="" /> : initials(profile.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name}</div>
              <div className="fa-faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</div>
            </div>
          </div>
          <nav className="fa-card fa-acct-nav">
            {ACCT_TABS.map((t) => (
              <button key={t.id} className="fa-acct-navlink" data-active={tab === t.id ? '1' : '0'} data-danger={t.id === 'logout' ? '1' : '0'} onClick={() => go(t.id)}>
                <span className="fa-acct-navic"><Icon name={t.icon} size={19} /></span>{t.label}
                {t.id !== 'logout' && <Icon name="chevR" size={15} className="fa-acct-navchev" />}
              </button>
            ))}
          </nav>
        </aside>

        <div style={{ minWidth: 0 }} key={tab} className="fa-fadein">{content}</div>
      </div>
    </div>
  );
}

/* ---------------- Resumo da conta ---------------- */
function AccountSummary({ ctx, acct, setTab }) {
  const { orders, statusMap, products, onNav, reorder, openChat, openPrescription, addresses, cards } = ctx;
  const { profile } = acct;
  const safeProfileName = profile.name || 'Cliente';
  const firstName = safeProfileName.trim().split(/\s+/).filter(Boolean)[0] || 'Cliente';
  const primaryAddrSource = addresses.find((a) => a.primary) || addresses[0] || null;
  const primaryAddr = primaryAddrSource ? normalizeAddress(primaryAddrSource) : null;
  const primaryCard = cards.find((c) => c.primary) || cards[0] || null;
  const recent = orders.slice(0, 2);

  const care = [
    { icon: 'chat', t: 'Atendimento farmacêutico', d: 'Tire dúvidas com um farmacêutico 24h.', act: () => openChat() },
    { icon: 'rx', t: 'Receita digital', d: 'Envie e organize suas receitas.', act: () => openPrescription() },
    { icon: 'repeat', t: 'Compras recorrentes', d: '15% off e reposição automática.', act: () => onNav({ name: 'subscriptions' }) },
    { icon: 'heart', t: 'Programa de cuidado', d: 'Serviços de saúde e benefícios.', act: () => setTab('health') },
  ];
  const summaryCards = [
    ['bag', orders.length, 'Pedidos', null],
    ['repeat', (ctx.subs || []).filter((s) => !s.paused).length, 'Assinaturas ativas', { name: 'subscriptions' }],
    ['gift', brl(faCashback(orders, products).available), 'Em cashback', { name: 'cashback' }],
    ['activity', '3', 'Serviços de saúde', null],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="fa-acct-head">
        <span className="fa-avatar">{profile.photo ? <img src={profile.photo} alt="" /> : initials(safeProfileName)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="fa-h1" style={{ fontSize: 'clamp(24px,2.6vw,32px)' }}>Olá, {firstName}</h1>
          <p className="fa-muted" style={{ fontSize: 14 }}>{profile.memberSince}</p>
        </div>
        <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => setTab('profile')}><Icon name="edit" size={16} />Editar perfil</button>
      </div>

      <div className="fa-grid" style={{ '--fa-grid-min': '160px', gap: 14 }}>
        {summaryCards
          .filter(([ic]) => ic !== 'gift' || ctx.showCashback !== false)
          .map(([ic, v, l, go]) => (
          <div
            key={l}
            onClick={go ? () => onNav(go) : undefined}
            className="fa-card"
            style={{ padding: '18px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 106, textAlign: 'center', cursor: go ? 'pointer' : 'default' }}
          >
            <span className="fa-iconbox" style={{ width: 40, height: 40, flex: 'none' }}><Icon name={ic} size={20} /></span>
            <div style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 'clamp(24px, 2.2vw, 32px)', lineHeight: 0.95, whiteSpace: 'nowrap' }}>{v}</div>
              <div className="fa-faint" style={{ width: '100%', fontSize: 12.5, lineHeight: 1.1, marginTop: 6, whiteSpace: 'nowrap' }}>{l}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="fa-grid" style={{ '--fa-grid-min': '280px' }}>
        <div className="fa-block">
          <div className="fa-block-head"><Icon name="pin" size={18} style={{ color: 'var(--fa-primary)' }} /><div style={{ flex: 1 }}><div className="fa-block-title">Endereço principal</div></div><a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13 }} onClick={() => setTab('profile')}>Gerenciar</a></div>
          <div className="fa-block-body">
            {primaryAddr ? (
              <>
                <span className="fa-badge fa-badge-rose" style={{ marginBottom: 10 }}>{primaryAddr.label}</span>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{buildAddressLine(primaryAddr) || "Endereço não informado"}</div>
                <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 4 }}>{buildAddressSecondaryLine(primaryAddr)}</div>
                <div className="fa-faint fa-mono" style={{ fontSize: 12.5, marginTop: 4 }}>CEP {primaryAddr.cep}</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>Nenhum endereço salvo</div>
                <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 4 }}>Adicione um endereço para agilizar suas próximas compras.</div>
              </>
            )}
          </div>
        </div>
        <div className="fa-block">
          <div className="fa-block-head"><Icon name="card" size={18} style={{ color: 'var(--fa-primary)' }} /><div style={{ flex: 1 }}><div className="fa-block-title">Cartão principal</div></div><a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13 }} onClick={() => setTab('cards')}>Gerenciar</a></div>
          <div className="fa-block-body">
            {primaryCard ? (
              <div className="fa-paycard" data-brand={primaryCard.brand}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 800, letterSpacing: '.04em' }}>{primaryCard.brand}</span><Icon name="card" size={22} style={{ opacity: .7 }} /></div>
                <div className="fa-mono" style={{ fontSize: 17, letterSpacing: '.12em' }}>•••• •••• •••• {primaryCard.last4}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, opacity: .85 }}><span>{primaryCard.holder}</span><span>val {primaryCard.exp}</span></div>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>Nenhum cartão salvo</div>
                <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 4 }}>Cadastre um cartão para acelerar o pagamento no checkout.</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="fa-section-head" style={{ marginBottom: 14 }}><h2 className="fa-h3" style={{ fontSize: 20 }}>Cuidado Farmaura</h2><a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13.5 }} onClick={() => onNav({ name: 'care' })}>Conhecer todos<Icon name="arrowR" size={15} style={{ marginLeft: 4, verticalAlign: 'middle' }} /></a></div>
        <div className="fa-grid" style={{ '--fa-grid-min': '220px', gap: 14 }}>
          {care.map((c) => (
            <div key={c.t} className="fa-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }} onClick={c.act}>
              <span className="fa-iconbox" style={{ width: 44, height: 44 }}><Icon name={c.icon} size={22} /></span>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{c.t}</div>
              <p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45, flex: 1 }}>{c.d}</p>
              <span style={{ color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>Acessar<Icon name="arrowR" size={14} /></span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="fa-section-head" style={{ marginBottom: 14 }}><h2 className="fa-h3" style={{ fontSize: 20 }}>Pedidos recentes</h2><a role="button" style={{ color: 'var(--fa-primary)', fontWeight: 700, fontSize: 13.5 }} onClick={() => setTab('orders')}>Ver todos<Icon name="arrowR" size={15} style={{ marginLeft: 4, verticalAlign: 'middle' }} /></a></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {recent.map((o) => <OrderCard key={o.id} order={o} products={products} statusMap={statusMap} onReorder={reorder} onOpenProduct={(p) => onNav({ name: 'product', id: p.id })} onTrackOrder={(order) => onNav({ name: 'account', tab: 'orders', trackOrderId: order.id })} onOpenSupport={(order) => openChat({ order })} />)}
        </div>
      </div>
    </div>
  );
}

export { ACCT_TABS, AccountScreen, AccountSummary, LoginScreen, OrderCard, OrderTracker, UnlockAccountScreen, initials, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderStatusMeta };
