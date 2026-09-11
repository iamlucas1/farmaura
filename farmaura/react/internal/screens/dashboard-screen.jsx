import React from "react";
import { FulfillBadge, RecurringBadge, orderStatusMeta, stockState } from "../core/internal-shell.jsx";
import { BarChart, Donut } from "./analytics-screen.jsx";
import { Icon, PageHead, Badge, StatCard, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — Painel: visão geral do dia. */

const ORDER_STATUS_TONE = { "fa-badge-health": "good", "fa-badge-warn": "warning", "fa-badge-vital": "critical" };

function Dashboard({ ctx }) {
  const { orders, prescriptions, inventory, onNav, openOrder, openCustomer, customers = [], chartSeed = {}, pharmacistProfile = {}, customerByName = {} } = ctx;
  const byHour = Array.isArray(chartSeed.byHour) ? chartSeed.byHour : Array.isArray(chartSeed.hours) ? chartSeed.hours : [];
  const week = Array.isArray(chartSeed.week) ? chartSeed.week : Array.isArray(chartSeed.sales) ? chartSeed.sales : [];
  const pharmacist = Object.keys(pharmacistProfile || {}).length ? pharmacistProfile : { name: "Equipe Farmaura", store: "Console interno" };
  const pharmacistFirstName = pharmacist.name.split(" ")[1] || pharmacist.name;
  const active = orders.filter((order) => order.status !== "dispatched");
  const deliveries = orders.filter((order) => order.fulfillment === "delivery" && order.status !== "dispatched");
  const pickups = orders.filter((order) => order.fulfillment === "pickup" && order.status !== "dispatched");
  const pendingRx = prescriptions.filter((prescription) => prescription.status === "pending");
  const stockAlerts = inventory.filter((item) => stockState(item).key !== "normal");
  const newOrders = orders.filter((order) => order.status === "new");
  const dayCustomers = [...new Set(active.map((order) => order.customer))];
  const customerMap = Object.fromEntries((customers || []).map((entry) => [entry.name, entry]));
  const recurringShare = dayCustomers.length ? Math.round(dayCustomers.filter((name) => { const customer = customerMap[name]; return customer && customer.recurring; }).length / dayCustomers.length * 100) : 0;

  return (
    <div className="route-fade">
      <PageHead title="Painel" desc={"Bom dia, " + pharmacistFirstName + " · " + pharmacist.store} />

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <StatCard icon="bag" value={active.length} label="Pedidos em aberto" delta="+3 hoje" deltaTone="up" />
        <StatCard icon="truck" value={deliveries.length} label="Entregas a despachar" />
        <StatCard icon="rx" value={pendingRx.length} label="Receitas a validar" tone={pendingRx.length ? "warning" : "accent"} />
        <StatCard icon="alert" value={stockAlerts.length} label="Itens com alerta de estoque" tone={stockAlerts.length ? "critical" : "accent"} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr", gap: 18, marginBottom: 22 }}>
        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
            <div><div style={{ fontWeight: 800, fontSize: 15 }}>Pedidos por hora</div><div className="cell-muted">Hoje · pico às 11h</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, fontSize: 22, color: "var(--brand)" }}>{byHour.reduce((sum, entry) => sum + (Number(entry && entry.v) || 0), 0)}</div><div className="cell-muted">no total</div></div>
          </div>
          <BarChart data={byHour.length ? byHour : [{ h: "0h", v: 0 }]} />
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Últimos 7 dias</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13, color: "var(--good)" }}><Icon name="arrowupright" size={14} />+12% vs. semana anterior</div>
            </div>
            <BarChart data={week.length ? week : [{ d: "Hoje", v: 0 }]} valueKey="v" labelKey="d" height={92} accent="var(--info)" />
          </div>
        </div>
        <div className="card card-pad">
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Entrega × Retirada</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Donut segments={[{ value: deliveries.length, color: "var(--brand)" }, { value: pickups.length, color: "var(--critical)" }]} />
            <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--brand)" }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Entrega</span></div><div className="cell-muted" style={{ marginLeft: 19 }}>{deliveries.length} pedidos a despachar</div></div>
              <div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--critical)" }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Retirada</span></div><div className="cell-muted" style={{ marginLeft: 19 }}>{pickups.length} para o balcão</div></div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 2 }}><div style={{ fontWeight: 800, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}><Icon name="repeat" size={15} style={{ color: "var(--good)" }} />{recurringShare}% recorrentes</div><div className="cell-muted" style={{ marginTop: 2 }}>dos clientes do dia já compraram antes</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Fila do dia</div>
              <div className="cell-muted">{newOrders.length} novos · {active.length} aguardando ação</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNav("orders")}>Ver todos<Icon name="arrowR" size={15} /></button>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {active.slice(0, 6).map((order) => {
                    const status = orderStatusMeta(order.status);
                    return (
                      <tr key={order.id} onClick={() => openOrder(order.id)} style={{ cursor: "pointer" }}>
                        <td><span className="mono" style={{ fontWeight: 700 }}>{order.id}</span><div className="cell-muted">{order.placed} · {order.channel}</div></td>
                        <td>
                          <button onClick={(event) => { event.stopPropagation(); openCustomer(order.customer); }} style={{ border: "none", background: "transparent", font: "inherit", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", padding: 0, textAlign: "left" }}>{order.customer}</button>
                          <div style={{ marginTop: 4 }}><RecurringBadge name={order.customer} small customerByName={customerByName} /></div>
                          {order.rx && order.rxStatus === "pending" && <div className="cell-muted" style={{ color: "var(--warning)", fontWeight: 700 }}>receita pendente</div>}
                        </td>
                        <td><FulfillBadge f={order.fulfillment} /></td>
                        <td><Badge tone={ORDER_STATUS_TONE[status.cls] || "neutral"}><Icon name={status.icon} size={11} />{status.label}</Badge></td>
                        <td style={{ textAlign: "right" }}><Icon name="chevR" size={16} style={{ color: "var(--text-muted)" }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!active.length && <EmptyState icon="bag" title="Nenhum pedido em aberto" />}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card card-pad">
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Para organizar agora</div>
            <button onClick={() => onNav("deliveries")} style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 10 }}>
              <span className="stat-icon" style={{ background: "var(--accent-soft)" }}><Icon name="truck" size={20} /></span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{deliveries.length} entregas</div><div className="cell-muted">Montar rota e despachar</div></div>
              <Icon name="chevR" size={16} style={{ color: "var(--text-muted)" }} />
            </button>
            <button onClick={() => onNav("orders")} style={{ width: "100%", textAlign: "left", border: "1px solid var(--border)", background: "var(--surface)", borderRadius: "var(--radius-md)", padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <span className="stat-icon" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}><Icon name="store" size={20} /></span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{pickups.length} retiradas</div><div className="cell-muted">Separar para balcão</div></div>
              <Icon name="chevR" size={16} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Receitas a validar</span>
              <Badge tone="warning">{pendingRx.length}</Badge>
            </div>
            {pendingRx.length === 0 ? <div className="cell-muted">Tudo validado. 🎉</div> : pendingRx.slice(0, 3).map((prescription, i) => (
              <button key={prescription.id} onClick={() => onNav("rx")} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "9px 0", borderTop: i ? "1px solid var(--border)" : "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <span className="stat-icon" style={{ width: 36, height: 36, background: "var(--info-soft)", color: "var(--info)" }}><Icon name="rx" size={17} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{prescription.patient}</div><div className="cell-muted">{prescription.meds[0] ? prescription.meds[0].name : prescription.type} · {prescription.sentAt}</div></div>
                <Icon name="chevR" size={15} style={{ color: "var(--text-muted)" }} />
              </button>
            ))}
          </div>
          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Alertas de estoque</span>
              <button className="btn btn-secondary btn-sm" onClick={() => onNav("inventory")}>Repor</button>
            </div>
            {stockAlerts.slice(0, 4).map((item, i) => {
              const state = stockState(item);
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span className="stat-icon" style={{ width: 34, height: 34, background: state.bg, color: state.color }}><Icon name={state.key === "normal" ? "check" : "alert"} size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div><div className="cell-muted">{item.qty} un · baixo até {item.lowThreshold || item.min || 0} · atenção até {item.attentionThreshold || item.lowThreshold || item.min || 0}</div></div>
                  <span className="badge" style={{ background: state.bg, color: state.color }}>{state.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Dashboard };
