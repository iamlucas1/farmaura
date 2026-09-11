import React, { useState } from "react";
import { Icon, PageHead, Drawer, Badge, EmptyState, money } from "../core/internal-ui.jsx";
import { OC_STATUS, SLA_TARGET, fmtDur, minsSince, slaState } from "../core/internal-shell.jsx";

/* FARMAURA Console — Pedidos online: board operacional por status. */

function OrderTypeBadge({ fulfillment, label }) {
  const icon = fulfillment === "pickup" ? "store" : fulfillment === "shipping" ? "nav" : "truck";
  const defaultLabel = fulfillment === "pickup" ? "Retirada na loja" : fulfillment === "shipping" ? "Envio por transportadora" : "Entrega em domicilio";
  return <Badge tone={fulfillment === "pickup" ? "neutral" : "critical"}><Icon name={icon} size={11} />{label || defaultLabel}</Badge>;
}

function OrderCardPH({ o, onOpen, nowLabel }) {
  const count = o.items.reduce((s, it) => s + it.qty, 0);
  const min = minsSince(o.placed, nowLabel);
  const target = SLA_TARGET[o.fulfillment] || 90;
  const sla = slaState(min, target);
  const finishedLabel = o.fulfillment === "pickup" ? "Retirada concluida" : "Despachado";
  return (
    <div className="card card-pad" style={{ cursor: "pointer" }} onClick={() => onOpen(o.id)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono cell-strong">{o.id}</span>
        {o.status === "dispatched"
          ? <Badge tone="good" dot><Icon name="check" size={10} />{finishedLabel}</Badge>
          : <span className="badge" style={{ marginLeft: "auto", background: sla.bg, color: sla.color }}><Icon name="clock" size={10} />{fmtDur(min)}</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 8 }}>{o.customer}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
        <span className="badge" style={{ background: OC_STATUS[o.status].color + "22", color: OC_STATUS[o.status].color }}><Icon name={OC_STATUS[o.status].icon} size={10} />{OC_STATUS[o.status].short}</span>
        {o.priority === "express" && <Badge tone="critical"><Icon name="bolt" size={10} />Express</Badge>}
      </div>
      {o.rx && (
        <div style={{ marginTop: 8 }}>
          {o.rxStatus === "pending" ? <Badge tone="warning"><Icon name="rx" size={11} />Receita pendente</Badge> : <Badge tone="good"><Icon name="check" size={11} />Receita validada</Badge>}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <span className="mono" style={{ fontWeight: 800, fontSize: 14 }}>{money(o.total)}</span>
        <span className="cell-muted" style={{ marginLeft: "auto", fontSize: 12 }}>{count} {count === 1 ? "item" : "itens"}</span>
      </div>
    </div>
  );
}

function StatusLane({ lane, orders, onOpen, nowLabel }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: lane.color, flex: "none" }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{lane.label}</span>
        <span className="tab-count" style={{ marginLeft: "auto" }}>{orders.length}</span>
      </div>
      <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 10, minHeight: 200 }}>
        {orders.length
          ? orders.map((order) => <OrderCardPH key={order.id} o={order} onOpen={onOpen} nowLabel={nowLabel} />)
          : <div className="page-desc" style={{ textAlign: "center", padding: "20px 4px", margin: "auto 0" }}>Nenhum pedido nesta etapa.</div>}
      </div>
    </div>
  );
}

function OrdersScreen({ ctx }) {
  const { orders, openOrder, nowLabel } = ctx;
  const [filter, setFilter] = useState("all");
  const visible = orders.filter((o) => filter === "all" || o.fulfillment === filter);

  const counts = {
    all: orders.filter((o) => o.status !== "dispatched").length,
    delivery: orders.filter((o) => o.fulfillment === "delivery" && o.status !== "dispatched").length,
    pickup: orders.filter((o) => o.fulfillment === "pickup" && o.status !== "dispatched").length,
  };

  const lanes = [
    { key: "new", label: "Novo", color: OC_STATUS.new.color, predicate: (o) => o.status === "new" },
    { key: "separating", label: "Em separação", color: OC_STATUS.separating.color, predicate: (o) => o.status === "separating" },
    { key: "ready", label: "Pronto", color: OC_STATUS.ready.color, predicate: (o) => o.status === "ready" },
    { key: "dispatched_delivery", label: "Despachado", color: OC_STATUS.dispatched.color, predicate: (o) => o.status === "dispatched" && o.fulfillment === "delivery" },
    { key: "dispatched_pickup", label: "Retirada", color: "var(--info)", predicate: (o) => o.status === "dispatched" && o.fulfillment === "pickup" },
  ];

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento"
        title="Pedidos online"
        desc="Kanban por etapa operacional, com retirada e despacho em colunas separadas."
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "grid", "Todos", counts.all], ["delivery", "truck", "Entrega", counts.delivery], ["pickup", "store", "Retirada", counts.pickup]].map(([key, icon, label, count]) => (
          <button
            key={key} type="button" className="btn btn-sm" onClick={() => setFilter(key)}
            style={filter === key ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" } : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
          >
            <Icon name={icon} size={13} />{label} <span className="tab-count">{count}</span>
          </button>
        ))}
      </div>

      {!visible.length ? <EmptyState icon="bag" title="Nenhum pedido neste filtro" /> : (
        <div className="grid g-5" style={{ alignItems: "start" }}>
          {lanes.map((lane) => (
            <StatusLane key={lane.key} lane={lane} orders={visible.filter((order) => lane.predicate(order))} onOpen={openOrder} nowLabel={nowLabel} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderDrawer({ ctx }) {
  const { orders, drawerOrder, closeDrawer, advanceOrder, confirmPickupCode, updateOrderItemLocation, toggleOrderItemPicked, dispatchShippingOrder, inventoryLocations = [], openChatFor, onNav, nowLabel } = ctx;
  const o = orders.find((x) => x.id === drawerOrder);
  const [pickupCode, setPickupCode] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState("");
  const [togglingItemId, setTogglingItemId] = useState("");
  const [pickupBusy, setPickupBusy] = useState(false);
  const [dispatchingShipping, setDispatchingShipping] = useState(false);
  if (!o) return null;

  const st = OC_STATUS[o.status];
  const blockRx = o.rx && o.rxStatus === "pending";
  const allPicked = o.items.every((it) => it.picked);
  const locationOptions = inventoryLocations.filter((location) => location.active && (!location.controlledOnly || o.rx));
  const nextLabel = { new: "Iniciar separação", separating: "Marcar como pronto", ready: "Despachar para entrega" }[o.status];

  const handleTogglePicked = async (itemId, nextPicked) => {
    if (!o.recordId) return;
    setTogglingItemId(itemId);
    try { await toggleOrderItemPicked(o.recordId, itemId, nextPicked); } finally { setTogglingItemId(""); }
  };
  const handleLocationChange = async (itemId, locationCode) => {
    if (!locationCode || !o.recordId) return;
    setUpdatingItemId(itemId);
    try { await updateOrderItemLocation(o.recordId, itemId, locationCode); } finally { setUpdatingItemId(""); }
  };
  const handlePickupValidation = async () => {
    if (!pickupCode.trim() || !o.recordId) return;
    setPickupBusy(true);
    try { await confirmPickupCode(o.id, pickupCode.trim()); closeDrawer(); } finally { setPickupBusy(false); }
  };

  const min = minsSince(o.placed, nowLabel);
  const target = SLA_TARGET[o.fulfillment] || 90;
  const sla = slaState(min, target);
  const done = o.status === "dispatched";
  const doneLabel = o.fulfillment === "pickup" ? "Retirado pelo cliente" : "Despachado para entrega";

  return (
    <Drawer
      open onClose={closeDrawer}
      title={(
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontWeight: 800, fontSize: 16 }}>{o.id}</span>
          <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
          <Badge tone={st.color === "var(--fa-error)" ? "critical" : "neutral"}><Icon name={st.icon} size={11} />{st.label}</Badge>
          {o.priority === "express" && <Badge tone="critical"><Icon name="bolt" size={11} />Express</Badge>}
        </span>
      )}
      subtitle={`Recebido às ${o.placed} · ${o.channel} · ${o.payment}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)" }}>
          <span className="stat-icon" style={{ background: done ? "var(--good-soft)" : sla.bg, color: done ? "var(--good)" : sla.color }}><Icon name={done ? "check" : "clock"} size={18} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{done ? doneLabel : `${fmtDur(min)} em aberto`}</div>
            <div className="cell-muted" style={{ fontSize: 12 }}>{o.fulfillmentLabel} · meta operacional de {fmtDur(target)}</div>
          </div>
          {!done && <span className="badge" style={{ background: sla.bg, color: sla.color }}>{sla.label}</span>}
        </div>

        {blockRx && (
          <div style={{ display: "flex", gap: 10, padding: 14, background: "var(--warning-soft)", borderRadius: "var(--radius-lg)", alignItems: "flex-start" }}>
            <Icon name="rx" size={18} style={{ color: "var(--warning)", flex: "none", marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--warning)" }}>Receita aguardando validação</div>
              <div className="cell-muted" style={{ fontSize: 12, marginTop: 2 }}>Há item com retenção de receita. Valide antes de finalizar a separação.</div>
              <button className="btn btn-sm" style={{ marginTop: 10, background: "var(--warning)", color: "#fff", border: "none" }} onClick={() => onNav("rx")}>Validar receita<Icon name="arrowR" size={13} /></button>
            </div>
          </div>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13.5 }}>{o.fulfillment === "pickup" ? "Cliente / retirada" : "Paciente / entrega"}</span>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => ctx.openCustomer(o.customer)}><Icon name="user" size={12} />Ver CRM</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
            <div className="kv"><span className="kv-label">Nome</span><span className="kv-value">{o.customer}</span></div>
            <div className="kv"><span className="kv-label">Telefone</span><span className="kv-value">{o.phone}</span></div>
            <div className="kv"><span className="kv-label">CPF</span><span className="kv-value">{o.doc}</span></div>
            {o.fulfillment === "delivery"
              ? <div className="kv"><span className="kv-label">Entrega</span><span className="kv-value">{o.address} · {o.district} · {o.cep}</span></div>
              : <div className="kv"><span className="kv-label">Retirada</span><span className="kv-value">{o.store || "Loja principal"}</span></div>}
            {o.note && <div className="kv"><span className="kv-label">Observação</span><span className="kv-value">{o.note}</span></div>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openChatFor(o)}><Icon name="chat" size={13} />Conversar</button>
            <button className="btn btn-secondary btn-sm"><Icon name="phone" size={13} />Ligar</button>
            {o.fulfillment === "delivery" && <button className="btn btn-secondary btn-sm" onClick={() => onNav("deliveries")}><Icon name="map" size={13} />Ver no mapa</button>}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>Separação · {o.items.length} {o.items.length === 1 ? "item" : "itens"}</span>
            <span className="cell-muted" style={{ fontSize: 12 }}>{o.items.filter((it) => it.picked).length}/{o.items.length} conferidos</span>
          </div>
          <div className="card">
            {o.items.map((it, i) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <button
                  onClick={() => handleTogglePicked(it.id, !it.picked)} disabled={togglingItemId === it.id} aria-label="conferir item"
                  style={{ width: 22, height: 22, borderRadius: 6, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", cursor: "pointer", background: it.picked ? "var(--good)" : "var(--surface)", color: "#fff", borderColor: it.picked ? "var(--good)" : "var(--border-strong)" }}
                >
                  {it.picked && <Icon name="check" size={13} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, textDecoration: it.picked ? "line-through" : "none", color: it.picked ? "var(--text-muted)" : "inherit" }}>{it.name}</div>
                  <div className="cell-muted" style={{ fontSize: 11.5 }}>Qtd {it.qty}{it.rx ? " · item com receita" : ""}</div>
                </div>
                <select className="input" style={{ width: "auto", minWidth: 160 }} value={it.loc || ""} disabled={updatingItemId === it.id} onChange={(e) => handleLocationChange(it.id, e.target.value)}>
                  <option value="">Selecionar endereço</option>
                  {locationOptions.map((location) => <option key={location.code} value={location.code}>{location.code} · {location.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 800, fontSize: 14 }}>
            <span>Total</span><span className="mono">{money(o.total)}</span>
          </div>
        </div>

        {o.fulfillment === "pickup" && o.status === "ready" && (
          <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>Validar retirada sem exibir o código</div>
            <div className="page-desc" style={{ margin: 0 }}>Peça o código ao cliente e digite abaixo para o sistema conferir.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" value={pickupCode} onChange={(e) => setPickupCode(e.target.value.toUpperCase())} placeholder="Digite o código informado pelo cliente" />
              <button className="btn btn-primary" disabled={pickupBusy || !pickupCode.trim()} onClick={handlePickupValidation}><Icon name="check" size={14} />{pickupBusy ? "Validando..." : "Validar"}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={closeDrawer}>Fechar</button>
        {o.status !== "dispatched" && o.fulfillment === "delivery" && (
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={(o.status === "separating" && (!allPicked || blockRx)) || (o.status === "new" && blockRx)} onClick={() => advanceOrder(o.id).then(() => { if (o.status === "ready") closeDrawer(); }).catch(() => {})}>
            <Icon name={o.status === "ready" ? "truck" : "arrowR"} size={15} />{nextLabel}
          </button>
        )}
        {o.status !== "dispatched" && o.fulfillment === "pickup" && o.status !== "ready" && (
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={(o.status === "separating" && (!allPicked || blockRx)) || (o.status === "new" && blockRx)} onClick={() => advanceOrder(o.id).catch(() => {})}>
            <Icon name="arrowR" size={15} />{nextLabel || "Avançar pedido"}
          </button>
        )}
        {o.status !== "dispatched" && o.fulfillment === "shipping" && o.status !== "ready" && (
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={(o.status === "separating" && (!allPicked || blockRx)) || (o.status === "new" && blockRx)} onClick={() => advanceOrder(o.id).catch(() => {})}>
            <Icon name="arrowR" size={15} />{nextLabel || "Avançar pedido"}
          </button>
        )}
        {o.status === "ready" && o.fulfillment === "shipping" && (
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={dispatchingShipping} onClick={() => { setDispatchingShipping(true); dispatchShippingOrder(o.recordId).finally(() => setDispatchingShipping(false)); }}>
            <Icon name="nav" size={15} />{dispatchingShipping ? "Gerando etiqueta..." : "Gerar etiqueta e despachar"}
          </button>
        )}
        {o.status === "dispatched" && <div style={{ flex: 1, textAlign: "center", color: "var(--good)", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="check" size={15} />Pedido concluído</div>}
      </div>
    </Drawer>
  );
}

export { OrderCardPH, OrderDrawer, OrderTypeBadge, OrdersScreen, StatusLane };
