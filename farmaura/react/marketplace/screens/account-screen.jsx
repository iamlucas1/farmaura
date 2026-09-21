/* FARMAURA — Account: LoginScreen + AccountScreen shell + Summary + Order pieces. */
import React, { useEffect, useRef, useState } from "react";
import { MARKETPLACE_LOGO_FULL_URL } from "../core/marketplace-assets.js";
import { AuraLayer, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { ConversationsInbox, HealthServices, MyOrders, SavedProducts } from "./account-health-screen.jsx";
import { buildAddressLine, buildAddressSecondaryLine, normalizeAddress } from "../core/marketplace-address.js";
import { AccountSettings, MyCards, ProfileManage } from "./account-profile-screen.jsx";
import { ACCOUNT_NAV_LINKS, AccountNavShell } from "./account-shared.jsx";


const initials = (name) => name.split(' ').map((s) => s[0]).slice(0, 2).join('');

const isStrongPassword = (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const PASSWORD_STRENGTH_HINT = 'A senha deve ter pelo menos 8 caracteres, com letra minúscula, maiúscula, número e caractere especial (ex: @, !, ?).';

const LOGIN_MODE_ORDER = ['login', 'register', 'first-access'];
const LOGIN_MODE_LABELS = { login: 'Entrar', register: 'Criar conta', 'first-access': 'Primeiro acesso' };

function LoginScreen({ ctx }) {
  const { onNav, authClient, finalizeAuthenticatedSession, route, googleOauthClientId } = ctx;
  // Deep-link support (?mode=register) so a "Criar conta" CTA elsewhere (e.g. the logged-out
  // account gate) can land straight on the register tab instead of always defaulting to login.
  const [mode, setMode] = useState(route && route.mode === 'register' ? 'register' : 'login'); // 'login' | 'register' | 'first-access'
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
      await applyLoginFlow(flow);
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

  const googleButtonRef = useRef(null);
  const [googleError, setGoogleError] = useState('');
  const showGoogleButton = !!googleOauthClientId && (mode === 'register' || (mode === 'login' && stage === 'credentials'));

  const applyLoginFlow = async (flow) => {
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
  };

  const handleGoogleCredential = async (idToken) => {
    setGoogleError('');
    setBusy(true);
    try {
      const flow = await authClient.loginWithGoogle({ id_token: idToken, remember_session: remember });
      await applyLoginFlow(flow);
    } catch (requestError) {
      setGoogleError(requestError && requestError.message ? requestError.message : 'Não foi possível entrar com o Google agora.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!showGoogleButton || !googleButtonRef.current || !window.FA_GOOGLE_IDENTITY) {
      return;
    }
    window.FA_GOOGLE_IDENTITY.renderGoogleButton(googleButtonRef.current, {
      clientId: googleOauthClientId,
      text: mode === 'register' ? 'signup_with' : 'continue_with',
      onCredential: handleGoogleCredential,
      onError: () => setGoogleError('Não foi possível carregar o login do Google agora.'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGoogleButton, mode]);

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
    <div className="fa-wrap fa-fadein fa-login-aureola" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 1180 }}>
      <div className="fa-login-aureola-bg" aria-hidden="true" />
      <img className="fa-login-aureola-mark" src={MARKETPLACE_LOGO_FULL_URL} alt="" aria-hidden="true" />
      <div className="fa-login-aureola-row">
        <div className="fa-card fa-login-aureola-card" style={{ padding: 'clamp(28px,3.5vw,44px)' }}>
          <span className="fa-logo" style={{ marginBottom: 22 }}>
            <img className="fa-logo-full-img" src={MARKETPLACE_LOGO_FULL_URL} alt="Farmaura" />
          </span>
          {mode === 'register' ? (
            <React.Fragment>
              <h1 className="fa-h2" style={{ marginBottom: 6 }}>Vamos começar</h1>
              <p className="fa-muted" style={{ fontSize: 14, marginBottom: 22 }}>Crie sua conta em menos de um minuto.</p>
              {showGoogleButton && (
                <React.Fragment>
                  <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
                  {googleError && <div className="fa-card" style={{ padding: '14px 16px', marginTop: 12, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{googleError}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', color: 'var(--fa-ink-3)', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
                    ou continue com e-mail
                    <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
                  </div>
                </React.Fragment>
              )}
              <form onSubmit={submitRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="fa-field"><label htmlFor="register-name">Nome completo</label>
                  <input id="register-name" className="fa-input" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="fa-field"><label htmlFor="register-email">E-mail</label>
                  <input id="register-email" className="fa-input" type="email" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="voce@email.com" />
                </div>
                <div className="fa-field"><label htmlFor="register-phone">Telefone (opcional)</label>
                  <input id="register-phone" className="fa-input" type="tel" value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div className="fa-field"><label htmlFor="register-password">Senha</label>
                  <div style={{ position: 'relative' }}>
                    <input id="register-password" className="fa-input" type={registerShow ? 'text' : 'password'} value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} style={{ paddingRight: 44 }} placeholder="Mín. 8 car., maiúscula, número e especial" />
                    <button type="button" onClick={() => setRegisterShow(!registerShow)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                      <Icon name={registerShow ? 'eyeoff' : 'eye'} size={18} />
                    </button>
                  </div>
                </div>
                <div className="fa-field"><label htmlFor="register-confirm-password">Confirmar senha</label>
                  <input id="register-confirm-password" className="fa-input" type={registerShow ? 'text' : 'password'} value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} placeholder="Repita a senha" />
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
                  <div className="fa-field"><label htmlFor="first-access-email">E-mail cadastrado</label>
                    <input id="first-access-email" className="fa-input" type="email" value={firstAccessEmail} onChange={(e) => setFirstAccessEmail(e.target.value)} placeholder="voce@email.com" />
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

              {showGoogleButton && (
                <React.Fragment>
                  <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
                  {googleError && <div className="fa-card" style={{ padding: '14px 16px', marginTop: 12, background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)', fontWeight: 600, fontSize: 13.5 }}>{googleError}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 4px', color: 'var(--fa-ink-3)', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
                    ou continue com e-mail
                    <span style={{ flex: 1, height: 1, background: 'var(--fa-mist)' }} />
                  </div>
                </React.Fragment>
              )}

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {stage === 'credentials' && (
                  <React.Fragment>
                    <div className="fa-field"><label htmlFor="login-email">E-mail</label>
                      <input id="login-email" className="fa-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                    </div>
                    <div className="fa-field">
                      <label htmlFor="login-password" style={{ display: 'flex', justifyContent: 'space-between' }}>Senha</label>
                      <div style={{ position: 'relative' }}>
                        <input id="login-password" className="fa-input" type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 44 }} />
                        <button type="button" onClick={() => setShow(!show)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                          <Icon name={show ? 'eyeoff' : 'eye'} size={18} />
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                )}
                {stage === 'two_factor' && (
                  <div className="fa-field">
                    <label htmlFor="login-2fa-code">Código de verificação</label>
                    <input id="login-2fa-code" className="fa-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 8))} placeholder="000000" />
                  </div>
                )}
                {stage === 'password_change' && (
                  <React.Fragment>
                    <div className="fa-field"><label htmlFor="password-change-new">Nova senha</label>
                      <div style={{ position: 'relative' }}>
                        <input id="password-change-new" className="fa-input" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ paddingRight: 44 }} placeholder="Mín. 8 car., maiúscula, número e especial" />
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} aria-label="mostrar senha" style={{ position: 'absolute', right: 6, top: 5, width: 36, height: 36, border: 'none', background: 'transparent', color: 'var(--fa-ink-3)', borderRadius: 8 }}>
                          <Icon name={showNewPassword ? 'eyeoff' : 'eye'} size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="fa-field"><label htmlFor="password-change-confirm">Confirmar nova senha</label>
                      <input id="password-change-confirm" className="fa-input" type={showNewPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
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

          <p className="fa-muted" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 20, lineHeight: 1.5 }}>Ao continuar, você concorda com os <a role="button" onClick={() => onNav({ name: 'terms' })} style={{ color: 'var(--fa-primary)', fontWeight: 600 }}>Termos</a> e a <a role="button" onClick={() => onNav({ name: 'privacy' })} style={{ color: 'var(--fa-primary)', fontWeight: 600 }}>Política de Privacidade</a>.</p>
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
function AccountScreen({ ctx }) {
  const { user, onNav, logout, route } = ctx;
  // "Resumo da conta" removed (no longer part of the account nav — see
  // 2026-09-04-shell-de-conta-unificado-conforme-demo ADR): the demo has no dashboard concept,
  // and every real entry point into /account already targets a specific tab, so "Meu perfil" is
  // the new default landing when none is given.
  const [tab, setTab] = useState(route.tab || 'profile');
  useEffect(() => { if (route.tab) setTab(route.tab); }, [route.tab]);

  const [profile, setProfile] = useState({ ...ctx.profile, name: ctx.profile.name || (user && user.name), email: ctx.profile.email || (user && user.email) });
  useEffect(() => {
    setProfile({ ...ctx.profile, name: ctx.profile.name || (user && user.name), email: ctx.profile.email || (user && user.email) });
  }, [ctx.profile, user && user.name, user && user.email]);
  const [programs, setPrograms] = useState(ctx.privacyPrograms);
  const [channels, setChannels] = useState(ctx.commChannels);
  useEffect(() => { setPrograms(ctx.privacyPrograms); }, [ctx.privacyPrograms]);
  useEffect(() => { setChannels(ctx.commChannels); }, [ctx.commChannels]);

  const acct = { profile, setProfile, programs, setPrograms, channels, setChannels };

  if (!user) {
    return (
      <div className="fa-wrap fa-fadein" style={{ paddingTop: 28, paddingBottom: 80 }}>
        <section className="fa-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--fa-rose-soft)', border: 'none', padding: 'clamp(30px,5vw,52px)', minHeight: 'clamp(420px, 56vh, 620px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
          <AuraLayer tone="var(--fa-primary)" />
          <img className="fa-account-gate-mark" src={MARKETPLACE_LOGO_FULL_URL} alt="" aria-hidden="true" />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto' }}>
            <span className="fa-eyebrow">Sua conta Farmaura</span>
            <h1 className="fa-h1" style={{ color: 'var(--fa-primary)', marginTop: 10 }}>Cuidado que acompanha cada compra</h1>
            <p className="fa-lead" style={{ marginTop: 14, color: 'var(--fa-primary-ink)' }}>
              Crie sua conta para acumular cashback, acompanhar pedidos e comprar com poucos cliques da próxima vez — leva menos de um minuto.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
              <button type="button" className="fa-btn fa-btn-primary fa-btn-lg" onClick={() => onNav({ name: 'login', mode: 'register' })}>
                Criar minha conta<Icon name="arrowR" size={16} />
              </button>
              <button type="button" className="fa-btn fa-btn-ghost fa-btn-lg" onClick={() => onNav({ name: 'login' })}>Já tenho conta</button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  let content;
  switch (tab) {
    case 'profile': content = <ProfileManage ctx={ctx} acct={acct} />; break;
    case 'settings': case 'privacy': content = <AccountSettings ctx={ctx} acct={acct} />; break;
    case 'orders': content = <MyOrders ctx={ctx} />; break;
    case 'conversations': content = <ConversationsInbox ctx={ctx} />; break;
    case 'health': content = <HealthServices ctx={ctx} />; break;
    case 'saved': content = <SavedProducts ctx={ctx} />; break;
    case 'cards': content = <MyCards ctx={ctx} acct={acct} />; break;
    default: content = <ProfileManage ctx={ctx} acct={acct} />;
  }

  // The shared shell (account-shared.jsx) keys its active-link highlight and crumb off its own
  // link keys, which don't always equal the internal tab id (payments -> tab "cards", messages ->
  // tab "conversations", settings absorbs the old standalone "privacy" tab).
  const activeKey = tab === 'cards' ? 'payments' : tab === 'conversations' ? 'messages' : tab === 'privacy' ? 'settings' : tab;
  const crumbLabel = (ACCOUNT_NAV_LINKS.find((item) => item.key === activeKey) || {}).label || 'Minha conta';

  return (
    <AccountNavShell ctx={ctx} activeKey={activeKey} crumbLabel={crumbLabel}>
      <div key={tab} className="fa-fadein">{content}</div>
    </AccountNavShell>
  );
}


export { AccountScreen, LoginScreen, OrderCard, OrderTracker, UnlockAccountScreen, initials, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderStatusMeta };
