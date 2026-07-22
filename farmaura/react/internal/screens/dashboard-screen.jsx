import React from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { FulfillBadge, RecurringBadge, Topbar, orderStatusMeta, stockState } from "../core/internal-shell.jsx";

/* FARMAURA Console — Painel: visão geral do dia. */

function BarChart({ data, height = 130, accent = 'var(--fa-primary)', valueKey = 'v', labelKey = 'h' }) {
  const max = Math.max(...data.map((entry) => entry[valueKey]));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height }}>
      {data.map((entry, index) => {
        const barHeight = Math.max(4, Math.round((entry[valueKey] / max) * (height - 26)));
        return (
          <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fa-ink-3)' }}>{entry[valueKey]}</div>
            <div title={entry[valueKey]} style={{ width: '100%', maxWidth: 30, height: barHeight, borderRadius: 6, background: index === data.length - 1 ? accent : 'color-mix(in srgb, ' + accent + ' 55%, var(--fa-mist))', transition: 'height .3s' }} />
            <div style={{ fontSize: 10.5, color: 'var(--fa-ink-3)', fontWeight: 600 }}>{entry[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ segments, size = 132, centerTop, centerSub = 'pedidos' }) {
  const total = segments.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fa-mist-2)" strokeWidth="14" />
        {segments.map((segment, index) => {
          const length = (segment.value / total) * circumference;
          const element = <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth="14" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += length;
          return element;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><div style={{ fontWeight: 800, fontSize: centerTop ? 17 : 24, lineHeight: 1 }}>{centerTop != null ? centerTop : total}</div><div className="fa-faint" style={{ fontSize: 11 }}>{centerSub}</div></div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, trend, trendDir, tint }) {
  return (
    <div className="ph-stat">
      <div className="ph-stat-top">
        <span className="ph-stat-ic" style={tint ? { background: tint.bg, color: tint.fg } : undefined}><Icon name={icon} size={20} /></span>
        {trend && <span className={'ph-stat-trend ' + (trendDir === 'down' ? 'ph-trend-down' : 'ph-trend-up')}><Icon name={trendDir === 'down' ? 'chevD' : 'chevD'} size={13} style={trendDir === 'up' ? { transform: 'rotate(180deg)' } : undefined} />{trend}</span>}
      </div>
      <div className="ph-stat-val">{value}</div>
      <div className="ph-stat-label">{label}</div>
    </div>
  );
}

function Dashboard({ ctx }) {
  const { orders, prescriptions, inventory, onNav, openOrder, onLogout, openCustomer, customers = [], chartSeed = {}, pharmacistProfile = {}, customerByName = {} } = ctx;
  const byHour = Array.isArray(chartSeed.byHour) ? chartSeed.byHour : Array.isArray(chartSeed.hours) ? chartSeed.hours : [];
  const week = Array.isArray(chartSeed.week) ? chartSeed.week : Array.isArray(chartSeed.sales) ? chartSeed.sales : [];
  const pharmacist = Object.keys(pharmacistProfile || {}).length ? pharmacistProfile : { name: 'Equipe Farmaura', store: 'Console interno' };
  const pharmacistFirstName = pharmacist.name.split(' ')[1] || pharmacist.name;
  const active = orders.filter((order) => order.status !== 'dispatched');
  const deliveries = orders.filter((order) => order.fulfillment === 'delivery' && order.status !== 'dispatched');
  const pickups = orders.filter((order) => order.fulfillment === 'pickup' && order.status !== 'dispatched');
  const pendingRx = prescriptions.filter((prescription) => prescription.status === 'pending');
  const stockAlerts = inventory.filter((item) => stockState(item).key !== 'normal');
  const newOrders = orders.filter((order) => order.status === 'new');
  const dayCustomers = [...new Set(active.map((order) => order.customer))];
  const customerMap = Object.fromEntries((customers || []).map((entry) => [entry.name, entry]));
  const recurringShare = dayCustomers.length ? Math.round(dayCustomers.filter((name) => { const customer = customerMap[name]; return customer && customer.recurring; }).length / dayCustomers.length * 100) : 0;

  return (
    <>
      <Topbar title="Painel" sub={'Bom dia, ' + pharmacistFirstName + ' · ' + pharmacist.store} onLogout={onLogout} ctx={ctx} />
      <div className="ph-content ph-content-wide">
        <div className="ph-stats">
          <StatCard icon="bag" value={active.length} label="Pedidos em aberto" trend="+3 hoje" trendDir="up" />
          <StatCard icon="truck" value={deliveries.length} label="Entregas a despachar" />
          <StatCard icon="rx" value={pendingRx.length} label="Receitas a validar" tint={pendingRx.length ? { bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' } : null} />
          <StatCard icon="alert" value={stockAlerts.length} label="Itens com alerta de estoque" tint={stockAlerts.length ? { bg: '#FBEAE9', fg: 'var(--fa-error)' } : null} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, marginTop: 18 }} className="ph-dash-cols">
          <div className="fa-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><div style={{ fontWeight: 800, fontSize: 15 }}>Pedidos por hora</div><div className="ph-cell-sub">Hoje · pico às 11h</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 800, fontSize: 22, color: 'var(--fa-primary)' }}>{byHour.reduce((sum, entry) => sum + (Number(entry && entry.v) || 0), 0)}</div><div className="ph-cell-sub">no total</div></div>
            </div>
            <BarChart data={byHour.length ? byHour : [{ h: '0h', v: 0 }]} />
            <div style={{ borderTop: '1px solid var(--fa-mist)', marginTop: 16, paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Últimos 7 dias</div>
                <div className="ph-stat-trend ph-trend-up"><Icon name="chevD" size={13} style={{ transform: 'rotate(180deg)' }} />+12% vs. semana anterior</div>
              </div>
              <BarChart data={week.length ? week : [{ d: 'Hoje', v: 0 }]} valueKey="v" labelKey="d" height={92} accent="var(--fa-info)" />
            </div>
          </div>
          <div className="fa-card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Entrega × Retirada</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <Donut segments={[{ value: deliveries.length, color: 'var(--fa-primary)' }, { value: pickups.length, color: 'var(--fa-vital)' }]} />
              <div style={{ flex: 1, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-primary)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Entrega</span></div><div className="fa-faint" style={{ fontSize: 12.5, marginLeft: 19 }}>{deliveries.length} pedidos a despachar</div></div>
                <div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-vital)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>Retirada</span></div><div className="fa-faint" style={{ fontSize: 12.5, marginLeft: 19 }}>{pickups.length} para o balcão</div></div>
                <div style={{ borderTop: '1px solid var(--fa-mist)', paddingTop: 10, marginTop: 2 }}><div style={{ fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="repeat" size={15} style={{ color: 'var(--fa-success)' }} />{recurringShare}% recorrentes</div><div className="fa-faint" style={{ fontSize: 12, marginTop: 2 }}>dos clientes do dia já compraram antes</div></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginTop: 22, alignItems: 'start' }} className="ph-dash-cols">
          <div>
            <div className="ph-sec-head">
              <div style={{ flex: 1 }}>
                <div className="ph-sec-title">Fila do dia</div>
                <div className="ph-sec-sub">{newOrders.length} novos · {active.length} aguardando ação</div>
              </div>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('orders')}>Ver todos<Icon name="arrowR" size={15} /></button>
            </div>
            <div className="ph-table-wrap">
              <table className="ph-table">
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {active.slice(0, 6).map((order) => {
                    const status = orderStatusMeta(order.status);
                    return (
                      <tr key={order.id} onClick={() => openOrder(order.id)} style={{ cursor: 'pointer' }}>
                        <td><span className="fa-mono" style={{ fontWeight: 700 }}>{order.id}</span><div className="ph-cell-sub">{order.placed} · {order.channel}</div></td>
                        <td className="ph-td-name">
                          <button onClick={(event) => { event.stopPropagation(); openCustomer(order.customer); }} style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 700, color: 'var(--fa-ink)', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{order.customer}</button>
                          <div style={{ marginTop: 4 }}><RecurringBadge name={order.customer} small customerByName={customerByName} /></div>
                          {order.rx && order.rxStatus === 'pending' && <div className="ph-cell-sub" style={{ color: 'var(--fa-warn)', fontWeight: 700 }}>receita pendente</div>}
                        </td>
                        <td><FulfillBadge f={order.fulfillment} /></td>
                        <td><span className={'fa-badge ' + status.cls}><Icon name={status.icon} size={11} />{status.label}</span></td>
                        <td style={{ textAlign: 'right' }}><Icon name="chevR" size={16} style={{ color: 'var(--fa-ink-3)' }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="fa-card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Para organizar agora</div>
              <button onClick={() => onNav('deliveries')} style={{ width: '100%', textAlign: 'left', border: '1px solid var(--fa-mist)', background: 'var(--fa-surface)', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10 }}>
                <span className="fa-iconbox" style={{ background: 'var(--fa-rose-soft)' }}><Icon name="truck" size={20} /></span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{deliveries.length} entregas</div><div className="ph-cell-sub">Montar rota e despachar</div></div>
                <Icon name="chevR" size={16} style={{ color: 'var(--fa-ink-3)' }} />
              </button>
              <button onClick={() => onNav('orders')} style={{ width: '100%', textAlign: 'left', border: '1px solid var(--fa-mist)', background: 'var(--fa-surface)', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <span className="fa-iconbox" style={{ background: 'var(--fa-mist-2)', color: 'var(--fa-ink-2)' }}><Icon name="store" size={20} /></span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{pickups.length} retiradas</div><div className="ph-cell-sub">Separar para balcão</div></div>
                <Icon name="chevR" size={16} style={{ color: 'var(--fa-ink-3)' }} />
              </button>
            </div>
            <div className="fa-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Receitas a validar</span>
                <span className="fa-badge fa-badge-warn">{pendingRx.length}</span>
              </div>
              {pendingRx.length === 0 ? <div className="fa-faint" style={{ fontSize: 13 }}>Tudo validado. 🎉</div> : pendingRx.slice(0, 3).map((prescription) => (
                <button key={prescription.id} onClick={() => onNav('rx')} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '9px 0', borderBottom: '1px solid var(--fa-mist)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <span className="fa-iconbox" style={{ width: 36, height: 36, background: 'var(--fa-info-soft)', color: 'var(--fa-info)' }}><Icon name="rx" size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{prescription.patient}</div><div className="ph-cell-sub">{prescription.meds[0].name} · {prescription.sentAt}</div></div>
                  <Icon name="chevR" size={15} style={{ color: 'var(--fa-ink-3)' }} />
                </button>
              ))}
            </div>
            <div className="fa-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Alertas de estoque</span>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('inventory')}>Repor</button>
              </div>
              {stockAlerts.slice(0, 4).map((item) => {
                const state = stockState(item);
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--fa-mist)' }}>
                    <span className="fa-iconbox" style={{ width: 34, height: 34, background: state.bg, color: state.color }}><Icon name={state.key === 'normal' ? 'check' : 'alert'} size={16} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div><div className="ph-cell-sub">{item.qty} un · baixo até {item.lowThreshold || item.min || 0} · atenção até {item.attentionThreshold || item.lowThreshold || item.min || 0}</div></div>
                    <span className="fa-badge" style={{ background: state.bg, color: state.color }}>{state.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { BarChart, Dashboard, Donut, StatCard };
