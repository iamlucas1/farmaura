import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { OC_STATUS, SLA_TARGET, Topbar, fmtDur, minsSince, slaState } from "../core/internal-shell.jsx";

/* FARMAURA Console — Pedidos online: board operacional por status. */

function OrderTypeBadge({ fulfillment, label }) {
  const icon = fulfillment === 'pickup' ? 'store' : fulfillment === 'shipping' ? 'nav' : 'truck';
  const defaultLabel = fulfillment === 'pickup' ? 'Retirada na loja' : fulfillment === 'shipping' ? 'Envio por transportadora' : 'Entrega em domicilio';
  return (
    <span className="fa-badge" style={{ background: fulfillment === 'pickup' ? 'var(--fa-info-soft)' : 'var(--fa-rose-soft)', color: fulfillment === 'pickup' ? 'var(--fa-info)' : 'var(--fa-primary)' }}>
      <Icon name={icon} size={11} />{label || defaultLabel}
    </span>
  );
}

function OrderCardPH({ o, onOpen, nowLabel }) {
  const count = o.items.reduce((s, it) => s + it.qty, 0);
  const min = minsSince(o.placed, nowLabel);
  const target = SLA_TARGET[o.fulfillment] || 90;
  const sla = slaState(min, target);
  const finishedLabel = o.fulfillment === 'pickup' ? 'Retirada concluida' : 'Despachado';
  return (
    <div className="ph-oc" onClick={() => onOpen(o.id)}>
      <div className="ph-oc-top">
        <span className="ph-oc-id">{o.id}</span>
        {o.status === 'dispatched'
          ? <span className="fa-badge fa-badge-health" style={{ marginLeft: 'auto', fontSize: 10 }}><Icon name="check" size={10} />{finishedLabel}</span>
          : <span className="fa-badge" style={{ marginLeft: 'auto', background: sla.bg, color: sla.color, fontSize: 10.5 }}><Icon name="clock" size={10} />{fmtDur(min)}</span>}
      </div>
      <div className="ph-oc-cust">{o.customer}</div>
      <div className="ph-oc-meta" style={{ flexWrap: 'wrap' }}>
        <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
        <span className={'fa-badge ' + OC_STATUS[o.status].cls}><Icon name={OC_STATUS[o.status].icon} size={10} />{OC_STATUS[o.status].short}</span>
        {o.priority === 'express' && <span className="fa-badge fa-badge-vital" style={{ fontSize: 10 }}><Icon name="bolt" size={10} stroke={2.2} />Express</span>}
      </div>
      {o.rx && (
        <div style={{ marginTop: 9 }}>
          {o.rxStatus === 'pending'
            ? <span className="fa-badge fa-badge-warn"><Icon name="rx" size={11} />Receita pendente</span>
            : <span className="fa-badge fa-badge-health"><Icon name="check" size={11} />Receita validada</span>}
        </div>
      )}
      <div className="ph-oc-foot">
        <span className="fa-mono" style={{ fontWeight: 800, fontSize: 14 }}>{brl(o.total)}</span>
        <span className="ph-cell-sub" style={{ marginLeft: 'auto' }}>{count} {count === 1 ? 'item' : 'itens'}</span>
      </div>
    </div>
  );
}

function StatusLane({ lane, orders, onOpen, nowLabel }) {
  return (
    <div className="ph-col" style={{ minWidth: 0 }}>
      <div className="ph-col-head" style={{ marginBottom: 14 }}>
        <span className="ph-col-dot" style={{ background: lane.color }} />
        <span className="ph-col-title">{lane.label}</span>
        <span className="ph-col-n">{orders.length}</span>
      </div>
      <div className="fa-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220 }}>
        {orders.length
          ? orders.map((order) => <OrderCardPH key={order.id} o={order} onOpen={onOpen} nowLabel={nowLabel} />)
          : <div style={{ fontSize: 12.5, color: 'var(--fa-ink-3)', textAlign: 'center', padding: '8px 4px', margin: 'auto 0' }}>Nenhum pedido nesta etapa.</div>}
      </div>
    </div>
  );
}

function OrdersScreen({ ctx }) {
  const { orders, openOrder, onLogout, nowLabel } = ctx;
  const [filter, setFilter] = useState('all');
  const visible = orders.filter((o) => filter === 'all' || o.fulfillment === filter);

  const counts = {
    all: orders.filter((o) => o.status !== 'dispatched').length,
    delivery: orders.filter((o) => o.fulfillment === 'delivery' && o.status !== 'dispatched').length,
    pickup: orders.filter((o) => o.fulfillment === 'pickup' && o.status !== 'dispatched').length,
  };

  const lanes = [
    { key: 'new', label: 'Novo', color: OC_STATUS.new.color, predicate: (order) => order.status === 'new' },
    { key: 'separating', label: 'Em separacao', color: OC_STATUS.separating.color, predicate: (order) => order.status === 'separating' },
    { key: 'ready', label: 'Pronto', color: OC_STATUS.ready.color, predicate: (order) => order.status === 'ready' },
    { key: 'dispatched_delivery', label: 'Despachado', color: OC_STATUS.dispatched.color, predicate: (order) => order.status === 'dispatched' && order.fulfillment === 'delivery' },
    { key: 'dispatched_pickup', label: 'Retirada', color: 'var(--fa-info)', predicate: (order) => order.status === 'dispatched' && order.fulfillment === 'pickup' },
  ];

  return (
    <>
      <Topbar title="Pedidos online" sub="Kanban por etapa operacional com retirada e despacho em colunas separadas" onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch"><Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar pedido ou cliente" /></div>
      </Topbar>
      <div className="ph-content ph-content-wide">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="ph-seg">
            <button data-on={filter === 'all' ? '1' : '0'} onClick={() => setFilter('all')}>Todos <span className="ph-seg-n">{counts.all}</span></button>
            <button data-on={filter === 'delivery' ? '1' : '0'} onClick={() => setFilter('delivery')}><Icon name="truck" size={15} />Entrega <span className="ph-seg-n">{counts.delivery}</span></button>
            <button data-on={filter === 'pickup' ? '1' : '0'} onClick={() => setFilter('pickup')}><Icon name="store" size={15} />Retirada <span className="ph-seg-n">{counts.pickup}</span></button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="filter" size={15} />Filtros</button>
            <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="printer" size={15} />Imprimir fila</button>
          </div>
        </div>

        <div className="ph-kanban" style={{ alignItems: 'start', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          {lanes.map((lane) => (
            <StatusLane key={lane.key} lane={lane} orders={visible.filter((order) => lane.predicate(order))} onOpen={openOrder} nowLabel={nowLabel} />
          ))}
        </div>
      </div>
    </>
  );
}

function OrderDrawer({ ctx }) {
  const { orders, drawerOrder, closeDrawer, advanceOrder, confirmPickupCode, updateOrderItemLocation, toggleOrderItemPicked, dispatchShippingOrder, inventoryLocations = [], openChatFor, onNav, nowLabel } = ctx;
  const o = orders.find((x) => x.id === drawerOrder);
  const [pickupCode, setPickupCode] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState('');
  const [togglingItemId, setTogglingItemId] = useState('');
  const [pickupBusy, setPickupBusy] = useState(false);
  const [dispatchingShipping, setDispatchingShipping] = useState(false);
  useEffect(() => {
    setPickupCode('');
    setUpdatingItemId('');
    setTogglingItemId('');
    setPickupBusy(false);
    setDispatchingShipping(false);
  }, [drawerOrder]);
  if (!o) return null;

  const st = OC_STATUS[o.status];
  const blockRx = o.rx && o.rxStatus === 'pending';
  const allPicked = o.items.every((it) => it.picked);
  const locationOptions = inventoryLocations.filter((location) => location.active && (!location.controlledOnly || o.rx));
  const nextLabel = { new: 'Iniciar separação', separating: 'Marcar como pronto', ready: 'Despachar para entrega' }[o.status];

  const handleTogglePicked = async (itemId, nextPicked) => {
    if (!o.recordId) {
      return;
    }
    setTogglingItemId(itemId);
    try {
      await toggleOrderItemPicked(o.recordId, itemId, nextPicked);
    } finally {
      setTogglingItemId('');
    }
  };

  const handleLocationChange = async (itemId, locationCode) => {
    if (!locationCode || !o.recordId) {
      return;
    }
    setUpdatingItemId(itemId);
    try {
      await updateOrderItemLocation(o.recordId, itemId, locationCode);
    } finally {
      setUpdatingItemId('');
    }
  };

  const handlePickupValidation = async () => {
    if (!pickupCode.trim() || !o.recordId) {
      return;
    }
    setPickupBusy(true);
    try {
      await confirmPickupCode(o.id, pickupCode.trim());
      closeDrawer();
    } finally {
      setPickupBusy(false);
    }
  };

  return (
    <>
      <div className="ph-drawer-overlay" onClick={closeDrawer} />
      <div className="ph-drawer" role="dialog" aria-modal="true">
        <div className="ph-drawer-head">
          <span className="fa-iconbox" style={{ width: 46, height: 46, flex: 'none' }}><Icon name={o.fulfillment === 'pickup' ? 'store' : 'truck'} size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="fa-mono" style={{ fontWeight: 800, fontSize: 17 }}>{o.id}</span>
              <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
              <span className={'fa-badge ' + st.cls}><Icon name={st.icon} size={11} />{st.label}</span>
              {o.priority === 'express' && <span className="fa-badge fa-badge-vital"><Icon name="bolt" size={11} />Express</span>}
            </div>
            <div className="ph-cell-sub" style={{ marginTop: 4 }}>Recebido às {o.placed} · {o.channel} · {o.payment}</div>
          </div>
          <button className="fa-modal-x" style={{ position: 'static' }} onClick={closeDrawer} aria-label="fechar"><Icon name="close" size={18} /></button>
        </div>

        <div className="ph-drawer-body">
          {(() => {
            const min = minsSince(o.placed, nowLabel);
            const target = SLA_TARGET[o.fulfillment] || 90;
            const sla = slaState(min, target);
            const done = o.status === 'dispatched';
            const doneLabel = o.fulfillment === 'pickup' ? 'Retirado pelo cliente' : 'Despachado para entrega';
            return (
              <div className="fa-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--fa-mist-2)', border: 'none' }}>
                <span className="fa-iconbox" style={{ width: 42, height: 42, background: done ? 'var(--fa-success-soft)' : sla.bg, color: done ? 'var(--fa-success)' : sla.color }}><Icon name={done ? 'check' : 'clock'} size={20} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{done ? doneLabel : `${fmtDur(min)} em aberto`}</div>
                  <div className="ph-cell-sub">{o.fulfillmentLabel} · meta operacional de {fmtDur(target)}</div>
                </div>
                {!done && <span className="fa-badge" style={{ background: sla.bg, color: sla.color }}>{sla.label}</span>}
              </div>
            );
          })()}

          {blockRx && (
            <div style={{ display: 'flex', gap: 12, padding: 14, background: 'var(--fa-warn-soft)', borderRadius: 12, alignItems: 'flex-start' }}>
              <Icon name="rx" size={20} style={{ color: 'var(--fa-warn)', flex: 'none', marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#9a6b1f' }}>Receita aguardando validação</div>
                <div style={{ fontSize: 12.5, color: '#9a6b1f', marginTop: 2 }}>Há item com retenção de receita. Valide antes de finalizar a separação.</div>
                <button className="fa-btn fa-btn-sm" style={{ marginTop: 10, background: 'var(--fa-warn)', color: '#fff' }} onClick={() => onNav('rx')}>Validar receita<Icon name="arrowR" size={14} /></button>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{o.fulfillment === 'pickup' ? 'Cliente / retirada' : 'Paciente / entrega'}</span>
              <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 'auto', padding: '5px 10px' }} onClick={() => ctx.openCustomer(o.customer)}><Icon name="user" size={13} />Ver CRM</button>
            </div>
            <dl className="ph-kv">
              <dt>Nome</dt><dd>{o.customer}</dd>
              <dt>Telefone</dt><dd>{o.phone}</dd>
              <dt>CPF</dt><dd>{o.doc}</dd>
              {o.fulfillment === 'delivery'
                ? <><dt>Entrega</dt><dd>{o.address}<br />{o.district} · {o.cep}</dd></>
                : <><dt>Retirada</dt><dd>{o.store || 'Loja principal'}<br /><span className="ph-cell-sub">O código permanece visível apenas para o cliente.</span></dd></>}
              {o.note && <><dt>Observação</dt><dd style={{ color: 'var(--fa-ink-2)', fontWeight: 500 }}>{o.note}</dd></>}
            </dl>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => openChatFor(o)}><Icon name="chat" size={15} />Conversar</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="phone" size={15} />Ligar</button>
              {o.fulfillment === 'delivery' && <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('deliveries')}><Icon name="map" size={15} />Ver no mapa</button>}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>Separação · {o.items.length} {o.items.length === 1 ? 'item' : 'itens'}</span>
              <span className="ph-cell-sub">{o.items.filter((it) => it.picked).length}/{o.items.length} conferidos</span>
            </div>
            <div className="fa-card" style={{ padding: '4px 16px' }}>
              {o.items.map((it) => (
                <div className="ph-pickrow" key={it.id} data-done={it.picked ? '1' : '0'} style={{ alignItems: 'center' }}>
                  <button className="ph-pickbox" disabled={togglingItemId === it.id} onClick={() => handleTogglePicked(it.id, !it.picked)} aria-label="conferir item">
                    {it.picked && <Icon name="check" size={14} stroke={2.8} />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ph-pick-name" style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div>
                    <div className="ph-cell-sub">Qtd {it.qty}{it.rx ? ' · item com receita' : ''}</div>
                  </div>
                  <div style={{ minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="ph-cell-sub" style={{ textAlign: 'right' }}>Origem no estoque</span>
                    <select className="fa-input" value={it.loc || ''} disabled={updatingItemId === it.id} onChange={(event) => handleLocationChange(it.id, event.target.value)} style={{ minWidth: 160, paddingRight: 26 }}>
                      <option value="">Selecionar endereço</option>
                      {locationOptions.map((location) => <option key={location.code} value={location.code}>{location.code} · {location.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontWeight: 800, fontSize: 15 }}>
              <span>Total</span><span className="fa-mono">{brl(o.total)}</span>
            </div>
          </div>

          {o.fulfillment === 'pickup' && o.status === 'ready' && (
            <div className="fa-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--fa-mist)' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Validar retirada sem exibir o código</div>
              <div className="ph-cell-sub">Peça o código ao cliente e digite abaixo para o sistema conferir.</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input className="fa-input" value={pickupCode} onChange={(event) => setPickupCode(event.target.value.toUpperCase())} placeholder="Digite o código informado pelo cliente" />
                <button className="fa-btn fa-btn-primary" disabled={pickupBusy || !pickupCode.trim()} onClick={handlePickupValidation}><Icon name="check" size={16} />{pickupBusy ? 'Validando...' : 'Validar retirada'}</button>
              </div>
            </div>
          )}
        </div>

        <div className="ph-drawer-foot">
          <button className="fa-btn fa-btn-soft" onClick={closeDrawer}>Fechar</button>
          {o.status !== 'dispatched' && o.fulfillment === 'delivery' && (
            <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} disabled={(o.status === 'separating' && (!allPicked || blockRx)) || (o.status === 'new' && blockRx)} onClick={() => { advanceOrder(o.id).then(() => { if (o.status === 'ready') closeDrawer(); }).catch(() => {}); }}>
              <Icon name={o.status === 'ready' ? 'truck' : 'arrowR'} size={17} />{nextLabel}
            </button>
          )}
          {o.status !== 'dispatched' && o.fulfillment === 'pickup' && o.status !== 'ready' && (
            <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} disabled={(o.status === 'separating' && (!allPicked || blockRx)) || (o.status === 'new' && blockRx)} onClick={() => advanceOrder(o.id).catch(() => {})}>
              <Icon name="arrowR" size={17} />{nextLabel || 'Avançar pedido'}
            </button>
          )}
          {o.status !== 'dispatched' && o.fulfillment === 'shipping' && o.status !== 'ready' && (
            <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} disabled={(o.status === 'separating' && (!allPicked || blockRx)) || (o.status === 'new' && blockRx)} onClick={() => advanceOrder(o.id).catch(() => {})}>
              <Icon name="arrowR" size={17} />{nextLabel || 'Avançar pedido'}
            </button>
          )}
          {o.status === 'ready' && o.fulfillment === 'shipping' && (
            <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} disabled={dispatchingShipping} onClick={() => { setDispatchingShipping(true); dispatchShippingOrder(o.recordId).finally(() => setDispatchingShipping(false)); }}>
              <Icon name="nav" size={17} />{dispatchingShipping ? 'Gerando etiqueta...' : 'Gerar etiqueta e despachar'}
            </button>
          )}
          {o.status === 'dispatched' && <div style={{ flex: 1, textAlign: 'center', color: 'var(--fa-success)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Icon name="check" size={17} />Pedido concluido</div>}
        </div>
      </div>
    </>
  );
}

export { OrderCardPH, OrderDrawer, OrderTypeBadge, OrdersScreen, StatusLane };
