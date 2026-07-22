import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

/* FARMAURA Console — Conversas com clientes (lado farmacêutico). */

function ChatScreen({ ctx }) {
  const { threads, activeThread, setActiveThread, sendChat, onLogout, validateRx } = ctx;
  const [decidingId, setDecidingId] = useState('');
  const [resolvedStatuses, setResolvedStatuses] = useState({}); // override otimista: prescriptionId -> status, até o backend confirmar
  const thread = threads.find((entry) => entry.id === activeThread) || threads[0];
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [thread && thread.msgs.length, activeThread]);

  const send = (event) => {
    event && event.preventDefault();
    const value = input.trim();
    if (!value || !thread) {
      return;
    }
    sendChat(thread.id, value);
    setInput('');
  };
  const totalUnread = threads.reduce((sum, entry) => sum + entry.unread, 0);

  return (
    <>
      <Topbar title="Conversas" sub={threads.length + ' clientes · ' + totalUnread + ' não lidas'} onLogout={onLogout} ctx={ctx} />
      <div className="ph-content ph-content-wide" style={{ paddingBottom: 24 }}>
        <div className="ph-chat-grid">
          <div className="ph-thread-list">
            {threads.map((entry) => (
              <div key={entry.id} className="ph-thread" data-active={thread && thread.id === entry.id ? '1' : '0'} onClick={() => setActiveThread(entry.id)}>
                <div style={{ position: 'relative', flex: 'none' }}>
                  <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{entry.customer.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                  {entry.online && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 99, background: 'var(--fa-success)', border: '2px solid var(--fa-bg)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ph-thread-name">{entry.customer}</span>
                    <span className="ph-thread-time">{entry.lastAt}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ph-thread-last">{entry.msgs.length ? entry.msgs[entry.msgs.length - 1].text : 'Sem mensagens'}</span>
                    {entry.unread > 0 && <span className="ph-thread-unread" style={{ marginLeft: 'auto' }}>{entry.unread}</span>}
                  </div>
                  <div style={{ marginTop: 4 }}><span className="fa-badge fa-badge-mist" style={{ fontSize: 10 }}><Icon name="bag" size={10} />{entry.order}</span></div>
                </div>
              </div>
            ))}
          </div>
          {thread ? (
            <div className="ph-chat-pane">
              <div className="fa-chat-head" style={{ paddingRight: 18 }}>
                <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-primary)', color: '#fff' }}>{thread.customer.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{thread.customer}</div>
                  <div style={{ fontSize: 12.5, color: thread.online ? 'var(--fa-success)' : 'var(--fa-ink-3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{thread.online && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--fa-success)', display: 'inline-block' }} />}{thread.online ? 'Online agora' : 'Visto ' + thread.lastAt} · {thread.topic}</div>
                </div>
                <button className="fa-iconbtn" aria-label="ligar"><Icon name="phone" size={17} /></button>
                <button className="fa-iconbtn" aria-label="ver pedido"><Icon name="bag" size={17} /></button>
              </div>
              <div className="fa-chat-body" ref={bodyRef}>
                <div style={{ textAlign: 'center', margin: '4px 0 8px' }}><span className="fa-badge fa-badge-mist" style={{ fontSize: 11 }}>Pedido {thread.order} · {thread.topic}</span></div>
                {thread.msgs.map((message, index) => (
                  <div key={index} className="fa-chat-msg" data-from={message.from === 'cust' ? 'pharm' : 'me'}>
                    {message.prescriptionId ? (
                      <div style={{ minWidth: 220 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                          <Icon name="rx" size={14} />Validação de receita
                        </div>
                        <div style={{ fontSize: 12.5, marginBottom: 8, wordBreak: 'break-all' }}>{message.text}</div>
                        {(() => {
                          const effectiveStatus = resolvedStatuses[message.prescriptionId] || message.prescriptionStatus;
                          if (effectiveStatus === 'pending') {
                            return (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  className="fa-btn fa-btn-sm fa-btn-block"
                                  style={{ background: 'var(--fa-error)', color: '#fff', border: 'none' }}
                                  disabled={decidingId === message.prescriptionId}
                                  onClick={async () => { setDecidingId(message.prescriptionId); await validateRx(message.prescriptionId, 'rejected'); setResolvedStatuses((prev) => ({ ...prev, [message.prescriptionId]: 'rejected' })); setDecidingId(''); }}
                                >
                                  Recusar
                                </button>
                                <button
                                  className="fa-btn fa-btn-primary fa-btn-sm fa-btn-block"
                                  disabled={decidingId === message.prescriptionId}
                                  onClick={async () => { setDecidingId(message.prescriptionId); await validateRx(message.prescriptionId, 'approved'); setResolvedStatuses((prev) => ({ ...prev, [message.prescriptionId]: 'approved' })); setDecidingId(''); }}
                                >
                                  Validar
                                </button>
                              </div>
                            );
                          }
                          return (
                            <span className="fa-badge" style={{ background: effectiveStatus === 'approved' ? 'var(--fa-success-soft)' : '#FBEAE9', color: effectiveStatus === 'approved' ? 'var(--fa-success)' : 'var(--fa-error)' }}>
                              {effectiveStatus === 'approved' ? 'Validada' : 'Recusada'}
                            </span>
                          );
                        })()}
                      </div>
                    ) : message.text}
                    <div style={{ fontSize: 10.5, opacity: .6, marginTop: 4, textAlign: 'right' }}>{message.at}</div>
                  </div>
                ))}
                {thread.typing && <div className="fa-chat-msg" data-from="pharm"><span className="fa-typing"><i /><i /><i /></span></div>}
              </div>
              <form className="fa-chat-input" onSubmit={send}>
                <button type="button" className="fa-iconbtn" style={{ border: 'none', background: 'transparent' }} aria-label="anexar"><Icon name="rx" size={18} /></button>
                <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escreva uma resposta…" aria-label="mensagem" />
                <button type="submit" className="fa-btn fa-btn-primary" aria-label="enviar" disabled={!input.trim()}><Icon name="send" size={17} /></button>
              </form>
            </div>
          ) : (
            <div className="ph-empty" style={{ alignSelf: 'center', margin: 'auto' }}><span className="fa-iconbox"><Icon name="chat" size={28} /></span><div>Selecione uma conversa.</div></div>
          )}
        </div>
      </div>
    </>
  );
}

export { ChatScreen };
