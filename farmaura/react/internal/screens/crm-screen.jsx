import React, { useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { FulfillBadge, Topbar } from "../core/internal-shell.jsx";
import { BarChart, Donut } from "./dashboard-screen.jsx";

/* FARMAURA Console — CRM do cliente (visão 360). */

function tierStyle(tier) {
  const map = {
    Ouro: { bg: '#FBF1D8', fg: '#9A7B1F' },
    Prata: { bg: '#ECEEF1', fg: '#5B6675' },
    Bronze: { bg: '#F3E6DC', fg: '#8A5A33' },
    Novo: { bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' },
  };
  return map[tier] || map.Novo;
}

function CrmStat({ icon, value, label, tint }) {
  return (
    <div className="fa-card" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="ph-stat-ic" style={{ width: 36, height: 36, ...(tint || {}) }}><Icon name={icon} size={18} /></span>
      <div><div style={{ fontWeight: 800, fontSize: 21, lineHeight: 1 }}>{value}</div><div className="fa-faint" style={{ fontSize: 12, marginTop: 3 }}>{label}</div></div>
    </div>
  );
}

function CrmScreen({ ctx }) {
  const { crmFocus, openCustomer, orders, openChatForName, onLogout, customers = [] } = ctx;
  const [query, setQuery] = useState('');
  const customer = customers.find((entry) => entry.name === crmFocus) || customers[0];
  const list = customers.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));
  const tier = tierStyle(customer.tier);
  const recencyLabel = customer.lastDays === 0 ? 'Comprou hoje' : customer.lastDays === 1 ? 'Ontem' : `Há ${customer.lastDays} dias`;
  const months = ['Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
  const monthData = customer.monthly.map((value, index) => ({ v: value, d: months[index] }));
  const catColors = ['var(--fa-primary)', 'var(--fa-vital)', 'var(--fa-info)', 'var(--fa-warn)'];
  const customerOrders = orders.filter((order) => order.customer === customer.name);

  return (
    <>
      <Topbar title="CRM de clientes" sub={customers.length + ' clientes · visão 360 de relacionamento'} onLogout={onLogout}>
        <div className="ph-topsearch"><Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar cliente" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </Topbar>
      <div className="ph-content ph-content-wide">
        <div style={{ display: 'grid', gridTemplateColumns: '288px 1fr', gap: 18, alignItems: 'start' }} className="ph-crm-grid">
          <div className="fa-card" style={{ padding: 8 }}>
            {list.map((entry) => {
              const style = tierStyle(entry.tier);
              return (
                <button key={entry.name} onClick={() => openCustomer(entry.name)} style={{ width: '100%', textAlign: 'left', border: 'none', background: entry.name === customer.name ? 'var(--fa-rose-soft)' : 'transparent', borderRadius: 12, padding: 11, display: 'flex', gap: 11, cursor: 'pointer', marginBottom: 2 }}>
                  <span className="fa-avatar fa-avatar-sm" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>{entry.avatar}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span className="fa-badge" style={{ background: style.bg, color: style.fg, fontSize: 10 }}>{entry.tier}</span>
                      {entry.recurring && <span className="fa-faint" style={{ fontSize: 11 }}><Icon name="repeat" size={11} /> recorrente</span>}
                    </div>
                  </div>
                </button>
              );
            })}
            {list.length === 0 && <div className="fa-faint" style={{ fontSize: 13, padding: 16, textAlign: 'center' }}>Nenhum cliente.</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="fa-card" style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <span className="fa-avatar" style={{ width: 72, height: 72, fontSize: 26 }}>{customer.avatar}</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ fontWeight: 800, fontSize: 23, margin: 0 }}>{customer.name}</h2>
                  <span className="fa-badge" style={{ background: tier.bg, color: tier.fg }}><Icon name="sparkle" size={11} />Cliente {customer.tier}</span>
                  {customer.recurring ? <span className="fa-badge fa-badge-health"><Icon name="repeat" size={11} />Recorrente</span> : <span className="fa-badge fa-badge-mist"><Icon name="sparkle" size={11} />Novo cliente</span>}
                </div>
                <div className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span><Icon name="mail" size={13} /> {customer.email}</span>
                  <span><Icon name="phone" size={13} /> {customer.phone}</span>
                  <span><Icon name="pin" size={13} /> {customer.district}, {customer.city}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={() => openChatForName(customer.name)}><Icon name="chat" size={15} />Conversar</button>
                <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="phone" size={15} />Ligar</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }} className="ph-crm-stats">
              <CrmStat icon="money" value={brl(customer.totalSpent)} label="Total gasto" tint={{ background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }} />
              <CrmStat icon="bag" value={customer.orders} label="Pedidos" />
              <CrmStat icon="card" value={brl(customer.avgTicket)} label="Ticket médio" />
              <CrmStat icon="gift" value={brl(customer.cashback)} label="Cashback" tint={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }} />
              <CrmStat icon="clock" value={recencyLabel} label="Última compra" />
              <CrmStat icon="calendar" value={customer.tenureMonths + ' meses'} label={'Cliente desde ' + customer.since} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, alignItems: 'start' }} className="ph-crm-cols">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Produtos mais comprados</div>
                  {customer.topProducts.map((product, index) => {
                    const max = customer.topProducts[0].q;
                    return (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: index < customer.topProducts.length - 1 ? '1px solid var(--fa-mist)' : 'none' }}>
                        <span className="fa-iconbox" style={{ width: 34, height: 34 }}><Icon name="pill" size={16} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{product.n}</div>
                          <div className="ph-stockbar" style={{ width: '100%', maxWidth: 220 }}><i style={{ width: Math.round(product.q / max * 100) + '%', background: 'var(--fa-primary)' }} /></div>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 14 }}>{product.q}<span className="fa-faint" style={{ fontWeight: 600, fontSize: 11 }}> un</span></span>
                      </div>
                    );
                  })}
                </div>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Pedidos nos últimos 12 meses</div>
                    <div className="fa-faint" style={{ fontSize: 12.5 }}>{customer.freqDays ? `compra a cada ~${customer.freqDays} dias` : 'sem recorrência ainda'}</div>
                  </div>
                  <BarChart data={monthData} valueKey="v" labelKey="d" height={120} accent="var(--fa-info)" />
                </div>
                {customerOrders.length > 0 && (
                  <div className="fa-card" style={{ padding: 20 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Pedidos em aberto</div>
                    {customerOrders.map((order) => (
                      <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--fa-mist)' }}>
                        <span className="fa-mono" style={{ fontWeight: 700, fontSize: 13 }}>{order.id}</span>
                        <FulfillBadge f={order.fulfillment} />
                        <span className="fa-faint" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{order.placed} · {brl(order.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Mix de compras</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Donut size={120} segments={customer.catMix.map(([name, value], index) => ({ value, color: catColors[index % catColors.length] }))} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {customer.catMix.map(([name, value], index) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: catColors[index % catColors.length], flex: 'none' }} />
                          <span style={{ flex: 1 }}>{name}</span><b>{value}%</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Recorrências ativas</span>
                    <Icon name="repeat" size={17} style={{ color: 'var(--fa-success)' }} />
                  </div>
                  {customer.subscriptions.length === 0 ? <div className="fa-faint" style={{ fontSize: 13 }}>Sem assinaturas ativas.</div> : customer.subscriptions.map((subscription) => (
                    <div key={subscription} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--fa-mist)' }}>
                      <span className="fa-iconbox" style={{ width: 32, height: 32, background: 'var(--fa-success-soft)', color: 'var(--fa-success)' }}><Icon name="repeat" size={15} /></span>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{subscription}</span>
                    </div>
                  ))}
                </div>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Favoritos <span className="fa-faint" style={{ fontWeight: 600, fontSize: 12 }}>(salvos no site)</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {customer.favorites.map((favorite) => <span key={favorite} className="fa-chip"><Icon name="heart" size={13} style={{ color: 'var(--fa-vital)' }} />{favorite}</span>)}
                  </div>
                </div>
                <div className="fa-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Interesses</div>
                  <div className="fa-faint" style={{ fontSize: 12.5, marginBottom: 12 }}>Inferidos da navegação e do histórico</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {customer.interests.map((interest) => <span key={interest} className="fa-badge fa-badge-rose">{interest}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { CrmScreen, CrmStat, tierStyle };
