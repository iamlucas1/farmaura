/* FARMAURA — Account tabs: Serviços de saúde, Produtos salvos, Meus pedidos. */
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PharmacistChatInbox } from "../core/marketplace-care-actions.jsx";
import { Modal, ProductCard, ProductVisual, StarPicker, brl, useModalStack } from "../core/marketplace-components.jsx";
import { Icon } from "../core/marketplace-icons.jsx";
import { OrderCard, OrderTracker, ProductReviewModal, resolveOrderLineProduct, resolveOrderLineTotal, resolveOrderPillClass, resolveOrderStatusMeta } from "./account-shared.jsx";


/* ============== SERVIÇOS DE SAÚDE ============== */
const HS_TIMES = ['08:00', '09:30', '11:00', '14:00', '15:30', '17:00'];
const hsPrice = (p) => p === 0 ? 'Gratuito' : brl(p);

function HealthServices({ ctx }) {
  const { healthServices, healthHistory, stores, bookHealthAppointment } = ctx;
  const [view, setView] = useState('explore');
  const [picked, setPicked] = useState(healthServices[0]);
  const [booking, setBooking] = useState({ store: stores[0].name, date: '', time: '', couponCode: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedEntry, setConfirmedEntry] = useState(null);
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
            {confirmedEntry && (
              <p style={{ marginTop: 10, fontSize: 15 }}>
                {confirmedEntry.originalPrice > confirmedEntry.price ? (
                  <>
                    <span className="fa-faint" style={{ textDecoration: 'line-through', marginRight: 8 }}>{hsPrice(confirmedEntry.originalPrice)}</span>
                    <span style={{ fontWeight: 800, color: 'var(--fa-success)' }}>{hsPrice(confirmedEntry.price)}</span>
                    {confirmedEntry.couponCode ? <span className="fa-faint" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>Cupom {confirmedEntry.couponCode} aplicado</span> : null}
                  </>
                ) : (
                  <span style={{ fontWeight: 800 }}>{hsPrice(confirmedEntry.price)}</span>
                )}
              </p>
            )}
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
                <div className="fa-field fa-span2"><label htmlFor="hs-service">Serviço</label>
                  <select id="hs-service" className="fa-select" value={picked.id} onChange={(e) => setPicked(healthServices.find((s) => s.id === e.target.value))}>
                    {healthServices.map((s) => <option key={s.id} value={s.id}>{s.name} — {hsPrice(s.price)}</option>)}
                  </select>
                </div>
                <div className="fa-field"><label htmlFor="hs-store">Loja</label>
                  <select id="hs-store" className="fa-select" value={booking.store} onChange={(e) => setBooking((b) => ({ ...b, store: e.target.value }))}>
                    {stores.map((s) => <option key={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="fa-field"><label htmlFor="hs-date">Data</label><input id="hs-date" className="fa-input" type="date" value={booking.date} onChange={(e) => setBooking((b) => ({ ...b, date: e.target.value }))} /></div>
                <div className="fa-field"><label htmlFor="hs-coupon">Cupom (opcional)</label><input id="hs-coupon" className="fa-input" value={booking.couponCode} onChange={(e) => setBooking((b) => ({ ...b, couponCode: e.target.value.toUpperCase() }))} placeholder="Ex.: VACINA10" /></div>
              </div>
              <div className="fa-field" style={{ marginTop: 16 }}><label>Horário</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {HS_TIMES.map((t) => <button key={t} className="fa-chip" data-active={booking.time === t ? '1' : '0'} onClick={() => setBooking((b) => ({ ...b, time: t }))}>{t}</button>)}
                </div>
              </div>
              <p className="fa-faint" style={{ fontSize: 12, marginTop: 8 }}>Promoções ativas para este serviço são aplicadas automaticamente ao confirmar; o cupom é opcional e some no valor final.</p>
              {bookingError ? <div style={{ marginTop: 14, color: 'var(--fa-error)', fontSize: 13 }}>{bookingError}</div> : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
                <div style={{ marginRight: 'auto' }}><div className="fa-faint" style={{ fontSize: 12 }}>Valor do serviço</div><div style={{ fontWeight: 800, fontSize: 18 }}>{hsPrice(picked.price)}</div></div>
                <button className="fa-btn fa-btn-primary fa-btn-lg" disabled={!booking.time || bookingSaving} onClick={async () => {
                  try {
                    setBookingError('');
                    setBookingSaving(true);
                    const selectedStore = stores.find((s) => s.name === booking.store);
                    const history = await bookHealthAppointment({
                      serviceId: picked.id,
                      storeId: selectedStore ? selectedStore.id : '',
                      store: booking.store,
                      date: booking.date,
                      time: booking.time,
                      couponCode: booking.couponCode,
                    });
                    setConfirmedEntry(Array.isArray(history) && history.length ? history[0] : null);
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
              onAdd={(pr) => addToCart(pr)} onBuyNow={(pr) => { addToCart(pr); onNav({ name: 'cart' }); }}
              fav={true} onFav={toggleFav}
              notified={availabilityAlerts.includes(p.id)} onNotify={subscribeAvailabilityAlert} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============== MEUS PEDIDOS ============== */
function OrderSupportDrawer({ order, products, statusMap, onClose, onOpenProduct, onOpenSupport, onReviewItem, onDownloadFiscalDocument }) {
  useModalStack(!!order, onClose);
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', width: '100vw', height: '100vh', background: 'rgba(43, 26, 26, 0.28)' }}>
      <aside className="fa-fadein" style={{ width: 'min(560px, 100vw)', maxWidth: '100vw', height: '100vh', background: 'var(--fa-surface)', boxShadow: 'var(--fa-shadow-lg)', display: 'flex', flexDirection: 'column', borderRadius: 0 }}>
        <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid var(--fa-mist)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className={'order-status ' + resolveOrderPillClass(order.status)}>{statusMeta.label}</span>
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
                      {order.status === 'delivered' && onReviewItem && (
                        <button className="fa-btn fa-btn-ghost fa-btn-sm" style={{ marginTop: 6 }} onClick={() => onReviewItem(item, order)}><Icon name="star" size={13} />Avaliar produto</button>
                      )}
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
            {order.fiscalDocument && onDownloadFiscalDocument && (
              <button className="fa-btn fa-btn-soft" onClick={() => onDownloadFiscalDocument(order)}><Icon name="receipt" size={16} />Baixar nota fiscal</button>
            )}
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
  const { chatThreads, activeChatThreadId, activateChatThread, sendChatMessage, sendPrescriptionAttachment, sendChatUnblockRequest, openChat, orders, authClient } = ctx;
  const threads = Array.isArray(chatThreads) ? chatThreads : [];
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const eligibleOrders = (Array.isArray(orders) ? orders : []).filter((order) => order.status !== 'delivered' && order.status !== 'cancelled');

  useEffect(() => {
    if (!threads.length || activeChatThreadId) {
      return;
    }
    activateChatThread(threads[0].id);
  }, [threads, activeChatThreadId, activateChatThread]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="orders-head" style={{ position: 'relative' }}>
        <div style={{ flex: 1 }}>
          <h1 className="cart-title" style={{ margin: 0 }}>Mensagens</h1>
          <span className="orders-count">Acompanhe todas as conversas abertas no marketplace e fale direto com o farmacêutico.</span>
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

const ORDERS_PER_PAGE = 7;

// "Meus pedidos" — ported from the "Padrão farmácia" demo (data-cat="orders"): benefit strip
// (real cashback + recorrência), a review-prompt for recently delivered items, and the order
// list itself as collapsible order-card entries (see account-shared.jsx). The previous "Por
// produto / Por pedido" toggle is gone — this is order-list only now, by design decision.
function MyOrders({ ctx }) {
  const { orders, products, statusMap, onNav, reorder, route, openChat, authClient, submitProductReview, showToast, cashbackWallet } = ctx;
  const [trackingOrderId, setTrackingOrderId] = useState(route.trackOrderId || '');
  const [reviewTarget, setReviewTarget] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setTrackingOrderId(route.trackOrderId || ''); }, [route.trackOrderId]);

  const downloadOrderFiscalDocument = async (order) => {
    try {
      const result = await authClient.download('/orders/' + order.recordId + '/fiscal-document/printable', { method: 'GET' });
      const blobUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'nota-fiscal-' + order.code + '.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      showToast((error && error.message) || 'Não foi possível baixar a nota fiscal.');
    }
  };

  const trackedOrder = orders.find((order) => order.id === trackingOrderId) || null;
  const wallet = cashbackWallet || { availableBalance: 0, pendingBalance: 0 };

  // No "already reviewed this product" signal exists in the backend yet (see
  // sem-indicador-produto-ja-avaliado pendência) — same limitation the per-item "Avaliar
  // produto" button inside each order card already accepts. This highlight strip just
  // surfaces the 3 most recent delivered items as a low-friction entry point to that same modal.
  const reviewCandidates = orders
    .filter((order) => order.status === 'delivered')
    .flatMap((order) => order.items.map((item) => ({ item, order, product: resolveOrderLineProduct(item, products) })))
    .slice(0, 3);

  const pageCount = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pagedOrders = orders.slice((safePage - 1) * ORDERS_PER_PAGE, safePage * ORDERS_PER_PAGE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {(wallet.availableBalance > 0 || wallet.pendingBalance > 0) && (
        <div className="orders-hero">
          <div className="orders-hero-cashback">
            <span className="orders-hero-label">Cashback disponível</span>
            <span className="orders-hero-value">{brl(wallet.availableBalance)}</span>
            <span className="orders-hero-caption">
              {wallet.pendingBalance > 0 ? `+ ${brl(wallet.pendingBalance)} a liberar quando seus pedidos forem entregues` : 'Aplique no pagamento do próximo pedido'}
            </span>
          </div>
          <div className="orders-hero-divider" />
          <div className="orders-hero-recurrence">
            <span className="orders-hero-recurrence-title">Ative a recorrência nos remédios de uso contínuo</span>
            <span className="orders-hero-recurrence-caption">15% de desconto garantido em toda entrega automática, sem precisar comprar de novo todo mês</span>
            <button className="fa-btn fa-btn-vital fa-btn-sm" type="button" onClick={() => onNav({ name: 'subscriptions' })}>Ativar recorrência</button>
          </div>
        </div>
      )}

      {reviewCandidates.length > 0 && (
        <section className="review-prompt-section">
          <h2 className="review-prompt-heading">Avalie suas compras recentes</h2>
          <div className="review-prompt-list">
            {reviewCandidates.map(({ item, order, product }) => (
              <div className="review-prompt-card" key={order.id + '_' + item.id}>
                <span className="review-prompt-visual"><ProductVisual product={product} style={{ width: '100%', height: '100%', aspectRatio: 'auto' }} /></span>
                <div className="review-prompt-body">
                  <span className="review-prompt-title">{product.name}</span>
                  <span className="review-prompt-sub">Pedido #{order.id} · {order.date}</span>
                </div>
                <div className="review-prompt-action">
                  <span className="review-prompt-hint">Como foi?</span>
                  <StarPicker size={19} value={0} onChange={(rating) => setReviewTarget({ item, order, initialRating: rating })} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="orders-head">
        <h1 className="fa-h2">Meus pedidos</h1>
        <span className="orders-count">{orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}</span>
      </div>

      {orders.length === 0 ? (
        <div className="fa-card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="fa-iconbox" style={{ width: 64, height: 64, margin: '0 auto 16px' }}><Icon name="bag" size={30} /></span>
          <h2 className="fa-h3" style={{ fontSize: 18 }}>Você ainda não fez nenhum pedido</h2>
          <p className="fa-muted" style={{ marginTop: 8, fontSize: 14 }}>Assim que finalizar uma compra, ela aparece aqui.</p>
          <button className="fa-btn fa-btn-primary" style={{ marginTop: 18 }} onClick={() => onNav({ name: 'home' })}>Explorar a loja</button>
        </div>
      ) : (
        <>
          <div className="orders-list">
            {pagedOrders.map((o) => (
              <OrderCard key={o.id} order={o} products={products} statusMap={statusMap} onReorder={reorder} onOpenProduct={(p) => onNav({ name: 'product', id: p.id })} onTrackOrder={(order) => setTrackingOrderId(order.id)} onOpenSupport={(order) => openChat({ order })} onReviewItem={(item, order) => setReviewTarget({ item, order })} onDownloadFiscalDocument={downloadOrderFiscalDocument} defaultOpen={false} />
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="orders-pagination" aria-label="Páginas de pedidos">
              <button className="orders-page-nav" type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Página anterior"><Icon name="chevD" size={15} style={{ transform: 'rotate(90deg)' }} /></button>
              <div className="orders-page-nums">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={'orders-page-btn' + (n === safePage ? ' is-active' : '')} onClick={() => setPage(n)}>{n}</button>
                ))}
              </div>
              <button className="orders-page-nav" type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Próxima página"><Icon name="chevD" size={15} style={{ transform: 'rotate(-90deg)' }} /></button>
            </nav>
          )}
        </>
      )}

      <ProductReviewModal open={!!reviewTarget} item={reviewTarget && reviewTarget.item} initialRating={reviewTarget && reviewTarget.initialRating || 0} onClose={() => setReviewTarget(null)} onSubmit={submitProductReview} showToast={showToast} />

      <OrderSupportDrawer order={trackedOrder} products={products} statusMap={statusMap} onClose={() => setTrackingOrderId('')} onOpenProduct={(product) => onNav({ name: 'product', id: product.id })} onOpenSupport={(order) => openChat({ order })} onReviewItem={(item, order) => setReviewTarget({ item, order })} onDownloadFiscalDocument={downloadOrderFiscalDocument} />
    </div>
  );
}

function addReorderItem(ctx, p) { ctx.addToCart(p); }

export { ConversationsInbox, HealthServices, MyOrders, OrderSupportDrawer, SavedProducts, addReorderItem };
