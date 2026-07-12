import React, { useEffect as _useEffCA, useRef as _useRefCA, useState as _useCA } from "react";

import { Icon } from "./marketplace-icons.jsx";
import { Modal, ModalShell } from "./marketplace-components.jsx";

/* FARMAURA — Care actions: pharmacist chat + digital prescription upload modals. */

function MarketplaceThreadBadge({ thread }) {
  const isOrderThread = !!(thread && thread.orderCode);
  return (
    <span className="fa-badge" style={{ background: isOrderThread ? 'var(--fa-rose-soft)' : 'var(--fa-mist-2)', color: isOrderThread ? 'var(--fa-primary)' : 'var(--fa-ink-2)' }}>
      <Icon name={thread && thread.fulfillment === 'pickup' ? 'bag' : isOrderThread ? 'truck' : 'chat'} size={11} />
      {isOrderThread ? ('Pedido ' + thread.orderCode) : 'Atendimento geral'}
    </span>
  );
}

function resolvePharmacistIdentity(thread) {
  const name = String(thread && (thread.pharmacistName || thread.pharmacist_name) || 'Equipe farmacêutica Farmaura').trim();
  const initials = name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'FA';
  return { name, initials };
}

function PharmacistChatPanel({ thread, onSend }) {
  const [input, setInput] = _useCA('');
  const bodyRef = _useRefCA(null);
  const messages = thread && Array.isArray(thread.messages) ? thread.messages : [];
  const pharmacist = resolvePharmacistIdentity(thread);

  _useEffCA(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages.length, thread && thread.id]);

  const send = (event) => {
    event && event.preventDefault();
    const value = input.trim();
    if (!value || !thread || typeof onSend !== 'function') {
      return;
    }
    onSend(thread.id, value);
    setInput('');
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
    <div className="fa-chat" style={{ minHeight: 420 }}>
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
      <div className="fa-chat-body" ref={bodyRef}>
        {messages.map((message) => (
          <div key={message.id} className="fa-chat-msg" data-from={message.from}>
            <div>{message.text}</div>
            <div style={{ fontSize: 11, opacity: 0.72, marginTop: 6 }}>{message.at}</div>
          </div>
        ))}
      </div>
      <form className="fa-chat-input" onSubmit={send}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escreva sua mensagem..." aria-label="mensagem" />
        <button type="submit" className="fa-btn fa-btn-primary" aria-label="enviar" disabled={!input.trim()}><Icon name="arrowR" size={18} /></button>
      </form>
    </div>
  );
}

function PharmacistChatInbox({ threads, activeThreadId, onSelectThread, onSendMessage, onOpenAccountConversations }) {
  const orderedThreads = Array.isArray(threads) ? threads : [];
  const activeThread = orderedThreads.find((thread) => thread.id === activeThreadId) || orderedThreads[0] || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', minHeight: 460 }}>
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
        <div style={{ padding: 10, borderTop: '1px solid var(--fa-mist)' }}>
          <button className="fa-btn fa-btn-soft fa-btn-block" onClick={() => onOpenAccountConversations && onOpenAccountConversations()}>
            <Icon name="user" size={16} />Ver caixa de entrada completa
          </button>
        </div>
      </div>
      <PharmacistChatPanel thread={activeThread} onSend={onSendMessage} />
    </div>
  );
}

function PharmacistChatModal({ open, onClose, threads = [], activeThreadId = '', onSelectThread, onSendMessage, onOpenAccountConversations }) {
  return (
    <ModalShell open={open} onClose={onClose} maxw={860} padded={false}>
      <PharmacistChatInbox
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onSendMessage={onSendMessage}
        onOpenAccountConversations={onOpenAccountConversations}
      />
    </ModalShell>
  );
}

function PrescriptionModal({ open, onClose }) {
  const [files, setFiles] = _useCA([]);
  const [sent, setSent] = _useCA(false);
  const [drag, setDrag] = _useCA(false);
  const inputRef = _useRefCA(null);

  const reset = () => { setFiles([]); setSent(false); setDrag(false); };
  const close = () => { onClose(); setTimeout(reset, 200); };
  const addFiles = (list) => {
    const arr = [...list].map((f) => ({ name: f.name, size: (f.size / 1024).toFixed(0) + ' KB', type: f.type }));
    if (arr.length) setFiles((p) => [...p, ...arr]);
  };

  return (
    <Modal open={open} onClose={close} maxw={460}
      icon={sent ? 'check' : 'rx'}
      title={sent ? 'Receita enviada!' : 'Enviar receita digital'}
      sub={sent ? 'Nossa equipe farmacêutica vai validar sua receita e organizar seus medicamentos. Você recebe um aviso em instantes.' : 'Anexe a foto ou o PDF da sua receita. Aceitamos JPG, PNG e PDF.'}>
      {!sent && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={'fa-drop' + (drag ? ' is-drag' : '')}
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
            <input ref={inputRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
            <span className="fa-iconbox" style={{ width: 48, height: 48, margin: '0 auto 10px' }}><Icon name="camera" size={24} /></span>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Toque para anexar ou arraste aqui</div>
            <div className="fa-faint" style={{ fontSize: 12.5, marginTop: 4 }}>JPG, PNG ou PDF · até 10 MB</div>
          </div>

          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--fa-mist-2)', borderRadius: 'var(--fa-r-btn)', padding: '10px 12px' }}>
                  <span className="fa-iconbox" style={{ width: 34, height: 34 }}><Icon name="rx" size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    <div className="fa-faint" style={{ fontSize: 11.5 }}>{f.size}</div>
                  </div>
                  <button className="fa-iconbtn" style={{ width: 32, height: 32 }} aria-label="remover" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button>
                </div>
              ))}
            </div>
          )}

          <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" disabled={files.length === 0} onClick={() => setSent(true)}>
            <Icon name="rx" size={17} />Enviar receita
          </button>
        </div>
      )}
      {sent && (
        <button className="fa-btn fa-btn-primary fa-btn-lg fa-btn-block" style={{ marginTop: 20 }} onClick={close}>Concluir</button>
      )}
    </Modal>
  );
}

export { PharmacistChatInbox, PharmacistChatModal, PharmacistChatPanel, PrescriptionModal };
