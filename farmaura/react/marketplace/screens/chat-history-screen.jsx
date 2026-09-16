import React, { useEffect, useState } from "react";
import { Icon } from "../core/marketplace-icons.jsx";
import { PharmacistChatInbox } from "../core/marketplace-care-actions.jsx";
import { LoginGate } from "./extra-screen.jsx";

/* FARMAURA — "Falar com farmacêutico" full history: every chat thread the customer has ever
   opened, reachable from the account dropdown (AccountMenu, marketplace-chrome.jsx). Distinct
   from the floating widget, which only ever shows threads touched during the current session —
   this page is the complete archive, with its own "start a new one" affordance when empty. */

function ChatHistoryScreen({ ctx }) {
  const { user, onNav, chatThreads, activeChatThreadId, activateChatThread, sendChatMessage, sendPrescriptionAttachment, sendChatUnblockRequest, openChat, orders, authClient } = ctx;
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);

  if (!user) {
    return <LoginGate icon="chat" title="Entre para falar com o farmacêutico" sub="Acompanhe suas conversas anteriores ou inicie um novo atendimento com a equipe farmacêutica da Farmaura." cta="Entrar na conta" onNav={onNav} />;
  }

  const threads = Array.isArray(chatThreads) ? chatThreads : [];
  const eligibleOrders = (Array.isArray(orders) ? orders : []).filter((order) => order.status !== 'delivered' && order.status !== 'cancelled');

  useEffect(() => {
    if (!threads.length || activeChatThreadId) {
      return;
    }
    activateChatThread(threads[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, activeChatThreadId]);

  return (
    <div className="fa-wrap fa-fadein" style={{ paddingTop: 24, paddingBottom: 40, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fa-ink-3)', marginBottom: 16 }}>
        <a role="button" onClick={() => onNav({ name: 'home' })}>Início</a><Icon name="chevR" size={13} />
        <span style={{ color: 'var(--fa-ink-2)', fontWeight: 600 }}>Falar com farmacêutico</span>
      </div>
      <div className="fa-acct-head" style={{ marginBottom: 18, position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <h1 className="fa-h2">Falar com farmacêutico</h1>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 4 }}>Todas as suas conversas com a equipe farmacêutica, de qualquer pedido ou dúvida geral.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="fa-btn fa-btn-primary" onClick={() => setOrderPickerOpen((prev) => !prev)}><Icon name="chat" size={16} />Novo atendimento<Icon name="chevD" size={13} /></button>
          {orderPickerOpen && (
            <div className="fa-card" style={{ position: 'absolute', right: 0, top: '110%', width: 280, padding: 8, zIndex: 20, boxShadow: '0 12px 32px rgba(0,0,0,.14)' }}>
              <button
                type="button"
                className="fa-btn fa-btn-ghost fa-btn-sm"
                style={{ width: '100%', justifyContent: 'flex-start', marginBottom: eligibleOrders.length ? 4 : 0 }}
                onClick={() => { setOrderPickerOpen(false); openChat(); }}
              >
                Dúvida geral
              </button>
              {eligibleOrders.map((order) => (
                <button
                  key={order.recordId}
                  type="button"
                  className="fa-btn fa-btn-ghost fa-btn-sm"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => { setOrderPickerOpen(false); openChat({ order }); }}
                >
                  Sobre o pedido {order.code}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {threads.length ? (
        <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
          <PharmacistChatInbox
            threads={threads}
            activeThreadId={activeChatThreadId}
            onSelectThread={activateChatThread}
            onSendMessage={sendChatMessage}
            onSendAttachment={sendPrescriptionAttachment}
            onRequestUnblock={sendChatUnblockRequest}
            authClient={authClient}
          />
        </div>
      ) : (
        <div className="fa-card" style={{ padding: 42, textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 14px' }}><Icon name="chat" size={28} /></span>
          <h2 className="fa-h3" style={{ fontSize: 18 }}>Nenhuma conversa ainda</h2>
          <p className="fa-muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>Fale com um farmacêutico sobre uma dúvida geral, ou abra o atendimento direto de dentro de um pedido.</p>
          <button className="fa-btn fa-btn-primary" style={{ marginTop: 18 }} onClick={() => openChat()}>Iniciar atendimento</button>
        </div>
      )}
    </div>
  );
}

export { ChatHistoryScreen };
