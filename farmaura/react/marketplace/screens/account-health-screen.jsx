/* FARMAURA — Account tabs: Serviços de saúde, Produtos salvos, Meus pedidos. */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PharmacistChatInbox } from "../core/marketplace-care-actions.jsx";
import { Modal, ProductCard, brl } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { OrderCard, OrderTracker, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderStatusMeta } from "./account-shared.jsx";


/* ============== SERVIÇOS DE SAÚDE ============== */
const HS_TIMES = ['08:00', '09:30', '11:00', '14:00', '15:30', '17:00'];
const hsPrice = (p) => p === 0 ? 'Gratuito' : brl(p);

function HealthServices({ ctx }) {
  const { healthServices, healthHistory, stores, bookHealthAppointment } = ctx;
  const [view, setView] = useState('explore');
  const [picked, setPicked] = useState(healthServices[0]);
  const [booking, setBooking] = useState({ store: stores[0].name, date: '', time: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const groups = healthServices.reduce((m, s) => { (m[s.group] = m[s.group] || []).push(s); return m; }, {});
  const startBooking = (s) => { setPicked(s); setConfirmed(false); setView('book'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const actions = [
    { id: 'book', icon: 'calendar', t: 'Realizar marcação', d: 'Agende um horário na loja mais perto de você.' },
    { id: 'history', icon: 'clock', t: 'Histórico', d: 'Veja seus atendimentos anteriores e agendados.' },
    { id: 'explore', icon: 'activity', t: 'Conhecer os serviços', d: 'Explore tudo que oferecemos com preços e duração.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 className="fa-h2" style={{ marginBottom: 2 }}>Serviços de saúde</h1>

      <div className="fa-grid" style={{ '--fa-grid-min': '220px', gap: 14 }}>
        {actions.map((a) => (
          <button key={a.id} className="fa-card" data-active={view === a.id ? '1' : '0'} onClick={() => { setView(a.id); setConfirmed(false); }}
            style={{ textAlign: 'left', cursor: 'pointer', padding: 18, display: 'flex', flexDirection: 'column', gap: 10, border: view === a.id ? '1.5px solid var(--fa-primary)' : '1px solid var(--fa-mist)', background: view === a.id ? 'var(--fa-rose-soft)' : 'var(--fa-surface)', font: 'inherit', color: 'inherit' }}>
            <span className="fa-iconbox" style={{ width: 44, height: 44 }}><Icon name={a.icon} size={22} /></span>
            <div style={{ fontWeight: 800, fontSize: 15.5 }}>{a.t}</div>
            <p className="fa-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>{a.d}</p>
          </button>
        ))}
      </div>

      {view === 'explore' && Object.keys(groups).map((g) => (
        <div key={g}>
          <h2 className="fa-h3" style={{ fontSize: 18, marginBottom: 12 }}>{g}</h2>
          <div className="fa-grid" style={{ '--fa-grid-min': '320px' }}>
            {groups[g].map((s) => (
              <div key={s.id} className="fa-hs">
                <span className="fa-iconbox" style={{ width: 46, height: 46 }}><Icon name={s.icon} size={22} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.3 }}>{s.name}</div>
                  <p className="fa-muted" style={{ fontSize: 12.5, lineHeight: 1.45, margin: '5px 0 10px' }}>{s.desc}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="fa-faint" style={{ fontSize: 12.5, display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="clock" size={14} />{s.dur}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: s.price === 0 ? 'var(--fa-success)' : 'var(--fa-ink)' }}>{hsPrice(s.price)}</span>
                    <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => startBooking(s)}><Icon name="calendar" size={15} />Agendar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {view === 'book' && (
        confirmed ? (
          <div className="fa-block"><div className="fa-block-body" style={{ textAlign: 'center', padding: 40 }}>
            <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 16px', background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="check" size={32} stroke={2.4} /></span>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Agendamento confirmado!</h2>
            <p className="fa-muted" style={{ marginTop: 8, fontSize: 14 }}>{picked.name} · {booking.store}<br />{booking.date || 'data a confirmar'}{booking.time ? ' às ' + booking.time : ''}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
              <button className="fa-btn fa-btn-primary" onClick={() => setView('history')}>Ver no histórico</button>
              <button className="fa-btn fa-btn-soft" onClick={() => { setConfirmed(false); setView('explore'); }}>Agendar outro</button>
            </div>
          </div></div>
        ) : (
          <div className="fa-block">
            <div className="fa-block-head"><Icon name="calendar" size={19} style={{ color: 'var(--fa-primary)' }} /><div style={{ flex: 1 }}><div className="fa-block-title">Realizar marcação</div><div className="fa-block-sub">Escolha serviço, loja e horário.</div></div></div>
            <div className="fa-block-body">
              <div className="fa-form2">
                <div className="fa-field fa-span2"><label>Serviço</label>
                  <select className="fa-select" value={picked.id} onChange={(e) => setPicked(healthServices.find((s) => s.id === e.target.value))}>
                    {healthServices.map((s) => <option key={s.id} value={s.id}>{s.name} — {hsPrice(s.price)}</option>)}
                  </select>
                </div>
                <div className="fa-field"><label>Loja</label>
                  <select className="fa-select" value={booking.store} onChange={(e) => setBooking((b) => ({ ...b, store: e.target.value }))}>
                    {stores.map((s) => <option key={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="fa-field"><label>Data</label><input className="fa-input" type="date" value={booking.date} onChange={(e) => setBooking((b) => ({ ...b, date: e.target.value }))} /></div>
              </div>
              <div className="fa-field" style={{ marginTop: 16 }}><label>Horário</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {HS_TIMES.map((t) => <button key={t} className="fa-chip" data-active={booking.time === t ? '1' : '0'} onClick={() => setBooking((b) => ({ ...b, time: t }))}>{t}</button>)}
                </div>
              </div>
              {bookingError ? <div style={{ marginTop: 14, color: 'var(--fa-error)', fontSize: 13 }}>{bookingError}</div> : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
                <div style={{ marginRight: 'auto' }}><div className="fa-faint" style={{ fontSize: 12 }}>Valor do serviço</div><div style={{ fontWeight: 800, fontSize: 18 }}>{hsPrice(picked.price)}</div></div>
                <button className="fa-btn fa-btn-primary fa-btn-lg" disabled={!booking.time || bookingSaving} onClick={async () => {
                  try {
                    setBookingError('');
                    setBookingSaving(true);
                    const selectedStore = stores.find((s) => s.name === booking.store);
                    await bookHealthAppointment({
                      serviceId: picked.id,
                      storeId: selectedStore ? selectedStore.id : '',
                      store: booking.store,
                      date: booking.date,
                      time: booking.time,
                    });
                    setConfirmed(true);
                  } catch (error) {
                    setBookingError(error && error.message ? error.message : 'Não foi possível confirmar o agendamento agora.');
                  } finally {
                    setBookingSaving(false);
                  }
                }}>{bookingSaving ? 'Confirmando...' : 'Confirmar agendamento'}<Icon name="arrowR" size={18} /></button>
              </div>
            </div>
          </div>
        )
      )}

      {view === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {healthHistory.map((h) => {
            const up = h.status === 'upcoming';
            return (
              <div key={h.id} className="fa-card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="fa-iconbox" style={{ width: 46, height: 46, background: up ? 'var(--fa-info-soft)' : 'var(--fa-success-soft)', color: up ? 'var(--fa-info)' : 'var(--fa-success)' }}><Icon name={up ? 'calendar' : 'check'} size={22} stroke={2} /></span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5 }}>{h.service}</div>
                  <div className="fa-muted" style={{ fontSize: 13, marginTop: 2 }}>{h.store} · {h.pro}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={'fa-badge ' + (up ? 'fa-badge-rx' : 'fa-badge-health')}>{up ? 'Agendado' : 'Realizado'}</span>
                  <div className="fa-faint fa-mono" style={{ fontSize: 12.5, marginTop: 6 }}>{h.date} · {h.time}</div>
                </div>
              </div>
            );
          })}
          <button className="fa-btn fa-btn-primary" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setView('explore')}><Icon name="plus" size={16} />Agendar novo serviço</button>
        </div>
      )}
    </div>
  );
}

/* ============== PRODUTOS SALVOS ============== */
function SavedProducts({ ctx }) {
  const { products, fav, toggleFav, addToCart, onNav, availabilityAlerts, subscribeAvailabilityAlert } = ctx;
  const saved = products.filter((p) => fav.includes(p.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fa-acct-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1 }}><h1 className="fa-h2">Produtos salvos</h1><p className="fa-muted" style={{ fontSize: 14, marginTop: 4 }}>{saved.length} {saved.length === 1 ? 'item favoritado' : 'itens favoritados'}</p></div>
      </div>

      {saved.length === 0 ? (
        <div className="fa-card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 16px' }}><Icon name="heart" size={30} /></span>
          <h2 className="fa-h3" style={{ fontSize: 18 }}>Nenhum produto salvo ainda</h2>
          <p className="fa-muted" style={{ marginTop: 8, fontSize: 14 }}>Toque no coração de qualquer produto para guardá-lo aqui.</p>
          <button className="fa-btn fa-btn-primary" style={{ marginTop: 18 }} onClick={() => onNav({ name: 'home' })}>Explorar a loja</button>
        </div>
      ) : (
        <div className="fa-grid" style={{ '--fa-grid-min': '220px' }}>
          {saved.map((p) => (
            <ProductCard key={p.id} product={p} variant="standard"
              onOpen={(pr) => onNav({ name: 'product', id: pr.id })}
              onAdd={(pr) => addToCart(pr)} fav={true} onFav={toggleFav}
              notified={availabilityAlerts.includes(p.id)} onNotify={subscribeAvailabilityAlert} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============== MEUS PEDIDOS ============== */
function OrderSupportDrawer({ order, products, statusMap, onClose, onOpenProduct, onOpenSupport }) {
  if (!order) {
    return null;
  }

  const statusMeta = resolveOrderStatusMeta(statusMap, order) || { label: order.rawStatus || 'Em processamento', cls: 'fa-badge-mist', icon: 'clock', step: 0 };
  const pickup = order.fulfillment === 'pickup';
  const shipping = order.fulfillment === 'shipping';
  const cancelled = order.status === 'cancelled';
  const destinationLabel = pickup ? (order.store || 'Loja Farmaura') : (order.address || 'Endereço não informado');
  const validationCode = !cancelled && (
    pickup ? String(order.pickupCode || '').trim()
    : shipping ? String(order.trackingCode || '').trim()
    : String(order.code || order.id || '').trim()
  );
  const validationLabel = pickup ? 'Codigo de validacao da retirada' : shipping ? 'Código de rastreio' : 'Codigo de validacao da entrega';
  const validationHelp = pickup
    ? 'Informe este código ao farmacêutico para validação no sistema.'
    : shipping
    ? (order.carrierName ? `Rastreie sua encomenda pela ${order.carrierName}.` : 'Rastreie sua encomenda pela transportadora.')
    : 'Use este código como referência da entrega no atendimento e na conferência do pedido.';

  const drawerNode = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', width: '100vw', height: '100vh', background: 'rgba(18, 22, 29, 0.28)' }} onClick={onClose}>
      <aside className="fa-fadein" onClick={(event) => event.stopPropagation()} style={{ width: 'min(560px, 100vw)', maxWidth: '100vw', height: '100vh', background: 'var(--fa-surface)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', flexDirection: 'column', borderRadius: 0 }}>
        <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid var(--fa-mist)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className={'fa-badge ' + statusMeta.cls}><Icon name={statusMeta.icon} size={12} stroke={2.2} />{statusMeta.label}</span>
              <span className="fa-badge fa-badge-outline"><Icon name={pickup ? 'bag' : shipping ? 'nav' : 'truck'} size={12} />{pickup ? 'Retirada na loja' : shipping ? 'Envio por transportadora' : 'Entrega em domicílio'}</span>
            </div>
            <h2 className="fa-h3" style={{ fontSize: 20 }}>Pedido <span className="fa-mono">#{order.id}</span></h2>
            <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6 }}>{order.date} · {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</p>
          </div>
          <button className="fa-iconbtn" aria-label="fechar" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, flex: 1, minHeight: 0 }}>
          <div className="fa-card" style={{ padding: 16, background: 'var(--fa-rose-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: 'var(--fa-primary)', marginBottom: 12 }}>
              <Icon name={pickup ? 'bag' : 'truck'} size={17} />
              {pickup ? 'Acompanhe sua retirada' : 'Acompanhe sua entrega'}
            </div>
            {!cancelled && <OrderTracker step={statusMeta.step} fulfillment={order.fulfillment} />}
            <div className="fa-muted" style={{ fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>
              {cancelled
                ? 'Este pedido foi cancelado.'
                : order.status === 'delivered'
                ? (pickup ? 'Pedido retirado com sucesso.' : 'Pedido concluído com sucesso.')
                : (order.eta || (pickup ? 'Aguardando liberação para retirada.' : 'Aguardando nova atualização de entrega.'))}
            </div>
          </div>

          <div className="fa-grid" style={{ '--fa-grid-min': '200px', gap: 12 }}>
            <div className="fa-card" style={{ padding: 16 }}>
              <div className="fa-faint" style={{ fontSize: 12, marginBottom: 6 }}>Pagamento</div>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{order.payment || 'Método não informado'}</div>
              <div className="fa-muted" style={{ fontSize: 13, marginTop: 4 }}>Total {brl(Number(order.total || 0))}</div>
            </div>
            <div className="fa-card" style={{ padding: 16 }}>
              <div className="fa-faint" style={{ fontSize: 12, marginBottom: 6 }}>{pickup ? 'Local de retirada' : 'Endereço de entrega'}</div>
              <div style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.35 }}>{destinationLabel}</div>
              {validationCode ? <div className="fa-card" style={{ marginTop: 10, padding: '12px 14px', background: 'var(--fa-info-soft)', border: '1px solid var(--fa-mist)' }}><div className="fa-faint" style={{ fontSize: 12, marginBottom: 4 }}>{validationLabel}</div><div className="fa-mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.06em' }}>{validationCode}</div><div className="fa-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{validationHelp}</div></div> : null}
            </div>
          </div>

          <div className="fa-block">
            <div className="fa-block-head"><Icon name="bag" size={18} style={{ color: 'var(--fa-primary)' }} /><div style={{ flex: 1 }}><div className="fa-block-title">Itens do pedido</div><div className="fa-block-sub">Resumo completo para acompanhar e conferir.</div></div></div>
            <div className="fa-block-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {order.items.map((item, index) => {
                const product = resolveOrderLineProduct(item, products);
                const lineTotal = resolveOrderLineTotal(item, product);
                return (
                  <div key={order.id + '_' + item.id + '_' + index} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="fa-ph" data-cat={product.cat} style={{ width: 54, height: 54, aspectRatio: 'auto', flex: 'none', cursor: 'pointer' }} onClick={() => product.id && onOpenProduct && onOpenProduct(product)}>
                      <Icon name={product.cat === 'medicamentos' ? 'pill' : product.cat === 'perfumaria' ? 'sparkle' : product.cat === 'bem-estar' ? 'leaf' : 'heart'} size={23} style={{ color: 'var(--fa-primary)', opacity: .5 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.35 }}>{product.name}</div>
                      <div className="fa-faint" style={{ fontSize: 12.5 }}>{item.qty}x · {product.brand}{item.sub ? ' · assinatura' : ''}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(lineTotal)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="fa-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Precisa de ajuda com este pedido?</div>
            <div className="fa-muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>Abra a conversa do pedido para falar com o farmacêutico, validar dúvidas sobre entrega ou retirada e receber orientação do atendimento.</div>
            <button className="fa-btn fa-btn-primary" onClick={() => onOpenSupport && onOpenSupport(order)}><Icon name="chat" size={16} />Ir para a conversa com o farmacêutico</button>
          </div>
        </div>
      </aside>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return drawerNode;
  }

  return createPortal(drawerNode, document.body);
}

function ConversationsInbox({ ctx }) {
  const { chatThreads, activeChatThreadId, selectChatThread, sendChatMessage, openChat } = ctx;
  const threads = Array.isArray(chatThreads) ? chatThreads : [];

  useEffect(() => {
    if (!threads.length || activeChatThreadId) {
      return;
    }
    selectChatThread(threads[0].id);
  }, [threads, activeChatThreadId, selectChatThread]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fa-acct-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 className="fa-h2">Minhas conversas</h1>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 4 }}>Acompanhe todas as conversas abertas no marketplace e fale direto com o farmacêutico.</p>
        </div>
        <button className="fa-btn fa-btn-primary" onClick={() => openChat()}><Icon name="chat" size={16} />Novo atendimento</button>
      </div>

      {threads.length ? (
        <div className="fa-card" style={{ padding: 0, overflow: 'hidden' }}>
          <PharmacistChatInbox
            threads={threads}
            activeThreadId={activeChatThreadId}
            onSelectThread={selectChatThread}
            onSendMessage={sendChatMessage}
            onOpenAccountConversations={() => {}}
          />
        </div>
      ) : (
        <div className="fa-card" style={{ padding: 42, textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 14px' }}><Icon name="chat" size={28} /></span>
          <h2 className="fa-h3" style={{ fontSize: 18 }}>Nenhuma conversa iniciada</h2>
          <p className="fa-muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>Quando você falar com o farmacêutico ou abrir suporte de um pedido, a conversa aparecerá aqui.</p>
          <button className="fa-btn fa-btn-primary" style={{ marginTop: 18 }} onClick={() => openChat()}>Iniciar atendimento</button>
        </div>
      )}
    </div>
  );
}

function MyOrders({ ctx }) {
  const { orders, products, statusMap, onNav, reorder, route, openChat } = ctx;
  const [view, setView] = useState('pedidos');
  const [filter, setFilter] = useState('all');
  const [confirmP, setConfirmP] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(route.trackOrderId || '');
  useEffect(() => { setTrackingOrderId(route.trackOrderId || ''); }, [route.trackOrderId]);

  const allItems = orders.flatMap((o) => o.items.map((it) => ({ ...it, order: o })));
  const filtered = filter === 'all' ? allItems : allItems.filter((x) => x.order.fulfillment === filter);
  const trackedOrder = orders.find((order) => order.id === trackingOrderId) || null;

  const filters = [['all', 'Todos'], ['delivery', 'Entregue em casa'], ['pickup', 'Retirado na loja']];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fa-acct-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1 }}><h1 className="fa-h2">Meus pedidos</h1><p className="fa-muted" style={{ fontSize: 14, marginTop: 4 }}>{allItems.length} produtos comprados em {orders.length} pedidos</p></div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--fa-mist-2)', padding: 4, borderRadius: 'var(--fa-r-btn)' }}>
          {[['produtos', 'Por produto'], ['pedidos', 'Por pedido']].map(([id, l]) => (
            <button key={id} onClick={() => setView(id)} style={{ border: 'none', padding: '9px 14px', borderRadius: 'calc(var(--fa-r-btn) - 3px)', fontWeight: 700, fontSize: 13, cursor: 'pointer', background: view === id ? 'var(--fa-surface)' : 'transparent', color: view === id ? 'var(--fa-primary)' : 'var(--fa-ink-2)', boxShadow: view === id ? 'var(--fa-shadow-sm)' : 'none' }}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'produtos' ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {filters.map(([id, l]) => <button key={id} className="fa-chip" data-active={filter === id ? '1' : '0'} onClick={() => setFilter(id)}>{l}</button>)}
          </div>
          <div className="fa-block"><div style={{ padding: '4px 22px' }}>
            {filtered.map((x, i) => {
              const p = resolveOrderLineProduct(x, products);
              const lineTotal = resolveOrderLineTotal(x, p);
              const pickup = x.order.fulfillment === 'pickup';
              return (
                <div className="fa-row" key={x.order.id + '-' + x.id + '-' + i} style={{ gap: 14 }}>
                  <div className="fa-ph" data-cat={p.cat} style={{ width: 56, height: 56, aspectRatio: 'auto', flex: 'none', cursor: 'pointer' }} onClick={() => p.id && onNav({ name: 'product', id: p.id })}>
                    <Icon name={p.cat === 'medicamentos' ? 'pill' : p.cat === 'perfumaria' ? 'sparkle' : p.cat === 'bem-estar' ? 'leaf' : 'heart'} size={24} style={{ color: 'var(--fa-primary)', opacity: .5 }} />
                  </div>
                  <div className="fa-row-main">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="fa-row-label">{p.name}</span>
                      <span className={'fa-badge ' + (pickup ? 'fa-badge-mist' : 'fa-badge-health')}><Icon name={pickup ? 'bag' : 'truck'} size={12} />{pickup ? 'Retirado na loja' : 'Entregue em casa'}</span>
                    </div>
                    <div className="fa-row-desc">{x.qty}x · {p.brand}{x.sub ? ' · assinatura' : ''} · pedido <span className="fa-mono">#{x.order.id}</span> · {x.order.date}{pickup && x.order.store ? ' · ' + x.order.store : ''}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{brl(lineTotal)}</div>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setConfirmP(p)}><Icon name="repeat" size={14} />Comprar de novo</button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="fa-muted" style={{ padding: '24px 0', textAlign: 'center' }}>Nenhum produto nesta categoria.</p>}
          </div></div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orders.map((o) => <OrderCard key={o.id} order={o} products={products} statusMap={statusMap} onReorder={reorder} onOpenProduct={(p) => onNav({ name: 'product', id: p.id })} onTrackOrder={(order) => setTrackingOrderId(order.id)} onOpenSupport={(order) => openChat({ order })} defaultOpen={false} />)}
        </div>
      )}

      <Modal open={!!confirmP} onClose={() => setConfirmP(null)} icon="cart" title="Comprar novamente?"
        sub={confirmP ? `“${confirmP.name}” será adicionado ao seu carrinho.` : ''}>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button className="fa-btn fa-btn-primary fa-btn-block" onClick={() => { ctx.addToCart(confirmP); setConfirmP(null); }}><Icon name="cart" size={16} />Adicionar ao carrinho</button>
          <button className="fa-btn fa-btn-soft fa-btn-block" onClick={() => setConfirmP(null)}>Cancelar</button>
        </div>
      </Modal>

      <OrderSupportDrawer order={trackedOrder} products={products} statusMap={statusMap} onClose={() => setTrackingOrderId('')} onOpenProduct={(product) => onNav({ name: 'product', id: product.id })} onOpenSupport={(order) => openChat({ order })} />
    </div>
  );
}

function addReorderItem(ctx, p) { ctx.addToCart(p); }

export { ConversationsInbox, HealthServices, MyOrders, OrderSupportDrawer, SavedProducts, addReorderItem };
