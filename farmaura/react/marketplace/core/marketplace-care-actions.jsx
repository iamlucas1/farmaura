import React, { useEffect as _useEffCA, useRef as _useRefCA, useState as _useCA } from "react";

import { Icon } from "./marketplace-icons.jsx";
import { ModalShell } from "./marketplace-components.jsx";

/* FARMAURA — Care actions: pharmacist chat + digital prescription upload modals. */

// A thread always has *some* reference number to show: the linked order's code when there is
// one, otherwise the thread's own protocol code (`thread_code` server-side, e.g. "CHAT-A1B2C3D4")
// — never a bare "Atendimento geral" with nothing to point to, which made two general threads
// indistinguishable from each other once more than one could exist in the same session.
function threadReferenceLabel(thread) {
  if (!thread) {
    return '';
  }
  return thread.orderCode ? 'Pedido ' + thread.orderCode : 'Protocolo ' + (thread.protocol || '—');
}

function MarketplaceThreadBadge({ thread }) {
  const isOrderThread = !!(thread && thread.orderCode);
  const label = threadReferenceLabel(thread);
  return (
    <span className="fa-badge" style={{ background: isOrderThread ? 'var(--fa-rose-soft)' : 'var(--fa-mist-2)', color: isOrderThread ? 'var(--fa-primary)' : 'var(--fa-ink-2)' }}>
      <Icon name={thread && thread.fulfillment === 'pickup' ? 'bag' : isOrderThread ? 'truck' : 'chat'} size={11} />
      {label}
    </span>
  );
}

function resolvePharmacistIdentity(thread) {
  const name = String(thread && (thread.pharmacistName || thread.pharmacist_name) || 'Equipe farmacêutica Farmaura').trim();
  const initials = name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'FA';
  return { name, initials };
}

const PRESCRIPTION_STATUS_LABEL = { pending: 'Em análise', approved: 'Validada', rejected: 'Recusada' };
const PRESCRIPTION_STATUS_TONE = {
  pending: { bg: 'rgba(255,255,255,.18)', fg: '#fff' },
  approved: { bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' },
  rejected: { bg: '#FBEAE9', fg: 'var(--fa-error)' },
};

// Opens a protected attachment (prescription photo/PDF) in a new tab. The download endpoint
// requires the same bearer auth as any other API call — never a plain <img src> or <a href> to
// the API path directly (see app/api/v1/uploads.py: storage_key is an internal id, not a public
// URL, and access is re-checked server-side on every read, so this always goes through
// authClient.download rather than assuming the link is fetchable on its own).
async function openChatAttachment(authClient, fileId) {
  const result = await authClient.download('/uploads/' + encodeURIComponent(fileId), { method: 'GET' });
  const blobUrl = URL.createObjectURL(result.blob);
  window.open(blobUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function ChatAttachmentChip({ attachment, authClient, onError }) {
  const isImage = String(attachment.contentType || '').startsWith('image/');
  return (
    <button
      type="button"
      className="fa-chat-attachment"
      onClick={async () => {
        try {
          await openChatAttachment(authClient, attachment.fileId);
        } catch (error) {
          onError && onError((error && error.message) || 'Não foi possível abrir o anexo.');
        }
      }}
    >
      <Icon name={isImage ? 'camera' : 'rx'} size={15} />
      <span>{attachment.name || 'Anexo'}</span>
    </button>
  );
}

function PharmacistChatPanel({ thread, onSend, onSendAttachment, onRequestUnblock, authClient, compact }) {
  const [input, setInput] = _useCA('');
  const [sending, setSending] = _useCA(false);
  const [sendingFile, setSendingFile] = _useCA(false);
  const [attachError, setAttachError] = _useCA('');
  const [blockMessage, setBlockMessage] = _useCA('');
  const [contestOpen, setContestOpen] = _useCA(false);
  const [contestText, setContestText] = _useCA('');
  const [contestSending, setContestSending] = _useCA(false);
  const [contestSent, setContestSent] = _useCA(false);
  const bodyRef = _useRefCA(null);
  const fileInputRef = _useRefCA(null);
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  const pharmacist = resolvePharmacistIdentity(thread);
  const frozen = !!(thread && thread.threadStatus === 'closed');

  _useEffCA(() => {
    setBlockMessage('');
    setContestOpen(false);
    setContestSent(false);
  }, [thread && thread.id]);

  _useEffCA(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages.length, thread && thread.id]);

  const send = async (event) => {
    event && event.preventDefault();
    const value = input.trim();
    if (!value || !thread || typeof onSend !== 'function' || sending) {
      return;
    }
    setSending(true);
    setBlockMessage('');
    try {
      await onSend(thread.id, value);
      setInput('');
    } catch (error) {
      // Rate-limit/spam-block rejections come back as 429 — surface the "contestar" option;
      // any other failure (network, validation) just keeps the typed text so the customer
      // can retry without losing it (marketplace-app.jsx's showToast already reported it).
      if (error && error.status === 429) {
        setBlockMessage((error && error.message) || 'Você atingiu o limite de mensagens.');
      }
    } finally {
      setSending(false);
    }
  };

  const submitContest = async (event) => {
    event && event.preventDefault();
    const value = contestText.trim();
    if (!value || typeof onRequestUnblock !== 'function' || contestSending) {
      return;
    }
    setContestSending(true);
    try {
      await onRequestUnblock(value);
      setContestSent(true);
      setContestOpen(false);
    } catch (error) {
      setBlockMessage((error && error.message) || 'Não foi possível enviar sua contestação. Tente novamente.');
    } finally {
      setContestSending(false);
    }
  };

  const pickFile = () => fileInputRef.current && fileInputRef.current.click();
  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !thread || typeof onSendAttachment !== 'function') {
      return;
    }
    setAttachError('');
    setSendingFile(true);
    try {
      await onSendAttachment(thread.id, file, input.trim());
      setInput('');
    } catch (error) {
      setAttachError((error && error.message) || 'Não foi possível enviar o arquivo. Envie uma foto ou PDF de até alguns MB.');
      if (error && error.status === 429) {
        setBlockMessage((error && error.message) || 'Você atingiu o limite de mensagens.');
      }
    } finally {
      setSendingFile(false);
    }
  };

  if (!thread) {
    return (
      <div className="fa-chat" style={{ minHeight: 420 }}>
        <div className="fa-chat-body" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64 }}><Icon name="chat" size={28} /></span>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 10 }}>Nenhuma conversa selecionada</div>
          <div className="fa-muted" style={{ maxWidth: 280, fontSize: 13.5 }}>Abra um pedido ou comece um atendimento farmacêutico para acompanhar suas conversas por aqui.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fa-chat" style={{ minHeight: compact ? 0 : 420 }}>
      {!compact && (
        <div className="fa-chat-head">
          <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-primary)', color: '#fff' }}>{pharmacist.initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{pharmacist.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--fa-success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--fa-success)', display: 'inline-block' }} />Atendimento farmacêutico ativo
            </div>
          </div>
          <MarketplaceThreadBadge thread={thread} />
        </div>
      )}
      <div className="fa-chat-body" ref={bodyRef}>
        {messages.map((message) => {
          const statusTone = message.prescriptionStatus ? PRESCRIPTION_STATUS_TONE[message.prescriptionStatus] : null;
          return (
            <div key={message.id} className="fa-chat-msg" data-from={message.from}>
              {message.prescriptionId && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}><Icon name="rx" size={13} />Receita enviada</div>}
              <div>{message.text}</div>
              {message.attachment && <ChatAttachmentChip attachment={message.attachment} authClient={authClient} onError={setAttachError} />}
              {statusTone && (
                <span className="fa-badge" style={{ marginTop: 6, background: statusTone.bg, color: statusTone.fg }}>
                  {PRESCRIPTION_STATUS_LABEL[message.prescriptionStatus] || message.prescriptionStatus}
                </span>
              )}
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 6 }}>{message.at}</div>
            </div>
          );
        })}
      </div>
      {attachError && <div style={{ padding: '0 14px 8px', color: 'var(--fa-error)', fontSize: 12.5 }}>{attachError}</div>}
      {frozen ? (
        <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--fa-ink-2)', background: 'var(--fa-mist-2)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="lock" size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            {thread.closedReason === 'order_completed'
              ? 'Este atendimento foi encerrado porque o pedido foi concluído. Abra um novo atendimento para continuar.'
              : thread.closedReason === 'prescription_rejected'
              ? 'Este atendimento foi encerrado porque a receita foi recusada. Se você acha que foi um engano, abra um novo atendimento e envie uma nova receita.'
              : 'Este atendimento foi encerrado. Abra um novo atendimento para continuar.'}
          </span>
        </div>
      ) : (
        <>
          {blockMessage && (
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--fa-error)', background: '#FBEAE9', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span>{blockMessage}</span>
              {contestSent ? (
                <span style={{ color: 'var(--fa-ink-2)', fontWeight: 700 }}>Contestação em análise.</span>
              ) : contestOpen ? (
                <form onSubmit={submitContest} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={contestText}
                    onChange={(event) => setContestText(event.target.value)}
                    placeholder="Explique por que acha que o bloqueio foi injusto…"
                    rows={2}
                    style={{ resize: 'vertical', border: '1px solid var(--fa-mist)', borderRadius: 10, padding: 8, fontSize: 12.5, fontFamily: 'inherit' }}
                  />
                  <button type="submit" className="fa-btn fa-btn-soft fa-btn-sm" disabled={!contestText.trim() || contestSending}>
                    {contestSending ? 'Enviando…' : 'Enviar contestação'}
                  </button>
                </form>
              ) : (
                typeof onRequestUnblock === 'function' && (
                  <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setContestOpen(true)}>
                    Contestar bloqueio
                  </button>
                )
              )}
            </div>
          )}
          <form className="fa-chat-input" onSubmit={send}>
            {typeof onSendAttachment === 'function' && (
              <>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={handleFile} />
                <button type="button" className="fa-iconbtn" aria-label="anexar receita" disabled={sendingFile} onClick={pickFile} style={{ border: 'none', background: 'transparent', flex: 'none' }}>
                  <Icon name="paperclip" size={18} />
                </button>
              </>
            )}
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={sendingFile ? 'Enviando arquivo...' : 'Escreva sua mensagem...'} aria-label="mensagem" disabled={sendingFile || sending} />
            <button type="submit" className="fa-btn fa-btn-primary" aria-label="enviar" disabled={!input.trim() || sendingFile || sending}><Icon name="arrowR" size={18} /></button>
          </form>
        </>
      )}
    </div>
  );
}

function PharmacistChatInbox({ threads, activeThreadId, onSelectThread, onSendMessage, onSendAttachment, onRequestUnblock, authClient, onOpenAccountConversations }) {
  const orderedThreads = Array.isArray(threads) ? threads : [];
  const activeThread = orderedThreads.find((thread) => thread.id === activeThreadId) || orderedThreads[0] || null;

  return (
    <div className="fa-form-grid" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', minHeight: 460 }}>
      <div style={{ borderRight: '1px solid var(--fa-mist)', background: 'var(--fa-bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--fa-mist)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Conversas</div>
          <div className="fa-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{orderedThreads.length} atendimento(s) no marketplace</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
          {orderedThreads.map((thread) => {
            const active = activeThread && activeThread.id === thread.id;
            const preview = thread.messages && thread.messages.length ? thread.messages[thread.messages.length - 1].text : 'Sem mensagens';
            return (
              <button
                key={thread.id}
                onClick={() => onSelectThread && onSelectThread(thread.id)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: active ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)',
                  background: active ? 'var(--fa-rose-soft)' : 'var(--fa-surface)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.topic}</span>
                  {thread.unread > 0 ? <span className="fa-badge fa-badge-vital" style={{ fontSize: 10 }}>{thread.unread}</span> : null}
                </div>
                <div className="fa-faint" style={{ fontSize: 12, lineHeight: 1.35 }}>{preview}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <MarketplaceThreadBadge thread={thread} />
                  <span className="fa-faint" style={{ fontSize: 11.5 }}>{thread.lastAt}</span>
                </div>
              </button>
            );
          })}
          {!orderedThreads.length && (
            <div className="fa-card" style={{ padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--fa-ink-3)' }}>
              Você ainda não iniciou nenhuma conversa.
            </div>
          )}
        </div>
        {typeof onOpenAccountConversations === 'function' && (
          <div style={{ padding: 10, borderTop: '1px solid var(--fa-mist)' }}>
            <button className="fa-btn fa-btn-soft fa-btn-block" onClick={onOpenAccountConversations}>
              <Icon name="user" size={16} />Ver caixa de entrada completa
            </button>
          </div>
        )}
      </div>
      <PharmacistChatPanel thread={activeThread} onSend={onSendMessage} onSendAttachment={onSendAttachment} onRequestUnblock={onRequestUnblock} authClient={authClient} />
    </div>
  );
}

// Only ever opened while logged in now — openChat() (marketplace-app.jsx) redirects a logged-out
// visitor straight to WhatsApp instead, so the inline-login flow this modal used to fall back to
// is unreachable and was removed with it.
function PharmacistChatModal({ open, onClose, threads = [], activeThreadId = '', onSelectThread, onSendMessage, onSendAttachment, onRequestUnblock, authClient, onOpenAccountConversations }) {
  return (
    <ModalShell open={open} onClose={onClose} maxw={860}>
      <PharmacistChatInbox
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onSendMessage={onSendMessage}
        onSendAttachment={onSendAttachment}
        onRequestUnblock={onRequestUnblock}
        authClient={authClient}
        onOpenAccountConversations={onOpenAccountConversations}
      />
    </ModalShell>
  );
}

// The floating "botão lateral" — visual pulled from the reference demo's `.chat-widget`/
// `.chat-bubble`/`.chat-panel` (bottom-right circular trigger, small popup panel). Logged-out
// visitors get a WhatsApp deep link instead of the panel (see whatsappUrl/openChat); logged-in
// visitors get the real single-thread conversation, with a WhatsApp shortcut still one tap away
// inside the panel header, and an expand button that hands off to the full multi-thread inbox
// (PharmacistChatModal) for anyone who wants their order-linked conversation history.
function ChatWidget({ user, threads, activeThreadId, onSelectThread, onOpen, onSend, onSendAttachment, onRequestUnblock, authClient, whatsappUrl, onExpand, openSignal, chatContext, onDismissContext, onSwitchToPhysical }) {
  // Persisted per-customer (sessionStorage via FA_PORTAL_CACHE, same store the thread list
  // itself is persisted in) so a reload of an already-open conversation reopens the panel
  // expanded, not just remembers which thread it was — clearing `open` back to false is what a
  // real minimize/close should do, not what a reload should do.
  const [open, setOpen] = _useCA(() => {
    try { return !!window.FA_PORTAL_CACHE.readSession('marketplace', user, 'chat_widget_open', false); } catch { return false; }
  });
  const [switcherOpen, setSwitcherOpen] = _useCA(false);
  const [starting, setStarting] = _useCA(false);
  const sessionThreads = Array.isArray(threads) ? threads : [];
  const thread = sessionThreads.find((t) => t.id === activeThreadId) || sessionThreads[0] || null;
  const pharmacist = resolvePharmacistIdentity(thread);
  const hasMultiple = sessionThreads.length > 1;

  // The lazy useState initializer above only ever runs once, at first mount — but this widget
  // mounts immediately with `user` still null (auth restore is async) and never remounts once
  // the real user resolves, so that initializer always saw `user=null` and locked in `false`.
  // This effect is what actually restores the persisted value once `user` is known.
  _useEffCA(() => {
    if (!user) return;
    try {
      const persisted = window.FA_PORTAL_CACHE.readSession('marketplace', user, 'chat_widget_open', false);
      if (persisted) {
        setOpen(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);
  _useEffCA(() => {
    if (!user) return;
    try { window.FA_PORTAL_CACHE.writeSession('marketplace', user, 'chat_widget_open', open); } catch {}
  }, [user, open]);
  // A caller elsewhere in the app (e.g. the checkout payment step's "Enviar receita") wants to
  // pop this same small panel open — `open` is otherwise fully internal/persisted, so this is a
  // signal prop, not a controlled one: any change to `openSignal` (a counter, typically) means
  // "open now," without taking over ownership of `open` itself.
  _useEffCA(() => {
    if (openSignal) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  if (!user) {
    return (
      <a className="fa-chat-widget" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
        <span className="fa-chat-bubble" data-whatsapp="1"><Icon name="whatsapp" size={26} /></span>
      </a>
    );
  }

  // Opening the bubble no longer creates a thread by itself — it only reveals the panel. With
  // nothing active yet, the panel shows a "iniciar conversa" prompt instead (see below); the
  // real thread (and the composer to write/attach into) only comes into existence once that's
  // clicked, not from idle curiosity about what the button does.
  const handleOpen = () => setOpen(true);
  const handleStart = async () => {
    if (typeof onOpen !== 'function' || starting) {
      return;
    }
    setStarting(true);
    try {
      await onOpen();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fa-chat-widget" data-open={open ? '1' : '0'}>
      {!open && (
        <button type="button" className="fa-chat-bubble" onClick={handleOpen} aria-label="Abrir chat com a farmacêutica">
          <Icon name="chat" size={25} />
        </button>
      )}
      {open && (
        <div className="fa-chat-panel">
          <div className="fa-chat-panel-head" style={{ position: 'relative' }}>
            <span className="fa-chat-panel-avatar">{pharmacist.initials}</span>
            {hasMultiple ? (
              <button
                type="button"
                className="fa-chat-panel-id"
                style={{ background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                onClick={() => setSwitcherOpen((prev) => !prev)}
              >
                <div className="fa-chat-panel-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {thread ? threadReferenceLabel(thread) : pharmacist.name}
                  <Icon name="chevD" size={12} style={{ transform: switcherOpen ? 'rotate(180deg)' : 'none' }} />
                </div>
                <div className="fa-chat-panel-status">{sessionThreads.length} conversa{sessionThreads.length === 1 ? '' : 's'} nesta sessão</div>
              </button>
            ) : (
              <div className="fa-chat-panel-id">
                <div className="fa-chat-panel-name">{pharmacist.name}</div>
                <div className="fa-chat-panel-status">{thread ? threadReferenceLabel(thread) : 'Online agora'}</div>
              </div>
            )}
            <div className="fa-chat-panel-actions">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Continuar no WhatsApp"><Icon name="whatsapp" size={14} /></a>
              <button type="button" onClick={onExpand} aria-label="Abrir em tela cheia"><Icon name="expand" size={14} /></button>
              <button type="button" onClick={() => { setOpen(false); onDismissContext && onDismissContext(); }} aria-label="Minimizar"><Icon name="minus" size={14} /></button>
            </div>
            {switcherOpen && hasMultiple && (
              <div className="fa-card" style={{ position: 'absolute', top: '100%', left: 12, right: 12, marginTop: 6, padding: 6, zIndex: 5, boxShadow: '0 12px 28px rgba(0,0,0,.18)' }}>
                {sessionThreads.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="fa-btn fa-btn-ghost fa-btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', color: 'var(--fa-ink)' }}
                    onClick={() => { onSelectThread && onSelectThread(entry.id); setSwitcherOpen(false); }}
                  >
                    {threadReferenceLabel(entry)}
                    {entry.id === (thread && thread.id) ? ' · atual' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          {thread ? (
            <>
              {chatContext === 'prescription_digital' && (
                // Landed here from "Enviar receita" (digital) at checkout — the panel opens with
                // no other explanation of why, so this says exactly what to do (link or clip) and
                // leaves the physical/original-in-hand path one click away, in case the customer
                // realizes here that they never had anything digital to send in the first place.
                <div style={{ padding: '12px 16px', background: 'var(--fa-info-soft)', borderBottom: '1px solid var(--fa-mist)', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--fa-info)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <Icon name="rx" size={13} />Receita digital selecionada
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--fa-info)', marginTop: 6, lineHeight: 1.4 }}>
                    Envie aqui o link da sua receita digital, ou anexe o arquivo pelo clipe <Icon name="paperclip" size={13} style={{ verticalAlign: -2 }} /> abaixo.
                  </p>
                  {typeof onSwitchToPhysical === 'function' && (
                    <button type="button" onClick={onSwitchToPhysical} style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--fa-primary)', textDecoration: 'underline', cursor: 'pointer' }}>
                      Na verdade, minha receita é física
                    </button>
                  )}
                </div>
              )}
              <PharmacistChatPanel thread={thread} onSend={onSend} onSendAttachment={onSendAttachment} onRequestUnblock={onRequestUnblock} authClient={authClient} compact />
            </>
          ) : (
            <div className="fa-chat" style={{ minHeight: 0 }}>
              <div className="fa-chat-body" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                <span className="fa-iconbox" style={{ width: 56, height: 56 }}><Icon name="chat" size={24} /></span>
                <div style={{ fontWeight: 800, fontSize: 15, marginTop: 10 }}>Fale com um farmacêutico</div>
                <div className="fa-muted" style={{ maxWidth: 260, fontSize: 13, marginTop: 4 }}>Tire dúvidas, envie uma receita ou pergunte sobre um pedido.</div>
                <button type="button" className="fa-btn fa-btn-primary" style={{ marginTop: 16 }} onClick={handleStart} disabled={starting}>
                  {starting ? 'Iniciando…' : 'Iniciar conversa com farmacêutico'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { ChatWidget, PharmacistChatInbox, PharmacistChatModal, PharmacistChatPanel };
