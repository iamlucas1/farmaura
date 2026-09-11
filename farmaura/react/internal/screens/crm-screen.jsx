import React, { useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { FulfillBadge } from "../core/internal-shell.jsx";
import { BarChart, Donut } from "./analytics-screen.jsx";
import { Icon, PageHead, Badge, StatCard, SearchInput, Avatar, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — CRM do cliente (visão 360). */

function tierTone(tier) {
  return { Ouro: "warning", Prata: "neutral", Bronze: "warning", Novo: "accent" }[tier] || "accent";
}

function CrmScreen({ ctx }) {
  const { crmFocus, openCustomer, orders, openChatForName, customers = [] } = ctx;
  const [query, setQuery] = useState("");
  const customer = customers.find((entry) => entry.name === crmFocus) || customers[0];
  const list = customers.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));

  if (!customer) {
    return (
      <div className="route-fade">
        <PageHead eyebrow="Clientes & vendas" title="CRM de clientes" desc="Carregando clientes…" />
        <div className="card"><EmptyState icon="user" title="Nenhum cliente carregado ainda" /></div>
      </div>
    );
  }

  const recencyLabel = customer.lastDays === 0 ? "Comprou hoje" : customer.lastDays === 1 ? "Ontem" : `Há ${customer.lastDays} dias`;
  const months = ["Jul", "Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
  const monthData = customer.monthly.map((value, index) => ({ v: value, d: months[index] }));
  const catColors = ["var(--brand)", "var(--critical)", "var(--info)", "var(--warning)"];
  const customerOrders = orders.filter((order) => order.customer === customer.name);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Clientes & vendas" title="CRM de clientes" desc={`${customers.length} clientes · visão 360 de relacionamento`}
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Buscar cliente" />}
      />
      <div className="grid" style={{ gridTemplateColumns: "288px 1fr", gap: 18, alignItems: "start" }}>
        <div className="card" style={{ padding: 8 }}>
          {list.map((entry) => (
            <button
              key={entry.name} onClick={() => openCustomer(entry.name)}
              style={{ width: "100%", textAlign: "left", border: "none", background: entry.name === customer.name ? "var(--surface-2)" : "transparent", borderRadius: "var(--radius-md)", padding: 11, display: "flex", gap: 11, cursor: "pointer", marginBottom: 2 }}
            >
              <Avatar initials={entry.avatar} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Badge tone={tierTone(entry.tier)}>{entry.tier}</Badge>
                  {entry.recurring && <span className="cell-muted"><Icon name="repeat" size={11} /> recorrente</span>}
                </div>
              </div>
            </button>
          ))}
          {list.length === 0 && <EmptyState icon="user" title="Nenhum cliente" />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <Avatar initials={customer.avatar} size={72} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontWeight: 800, fontSize: 23, margin: 0 }}>{customer.name}</h2>
                <Badge tone={tierTone(customer.tier)}><Icon name="sparkle" size={11} />Cliente {customer.tier}</Badge>
                {customer.recurring ? <Badge tone="good"><Icon name="repeat" size={11} />Recorrente</Badge> : <Badge tone="neutral"><Icon name="sparkle" size={11} />Novo cliente</Badge>}
              </div>
              <div className="cell-muted" style={{ fontSize: 13.5, marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span><Icon name="mail" size={13} /> {customer.email}</span>
                <span><Icon name="phone" size={13} /> {customer.phone}</span>
                <span><Icon name="pin" size={13} /> {customer.district}, {customer.city}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openChatForName(customer.name)}><Icon name="chat" size={15} />Conversar</button>
              <button className="btn btn-secondary btn-sm"><Icon name="phone" size={15} />Ligar</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            <StatCard icon="money" value={brl(customer.totalSpent)} label="Total gasto" tone="good" />
            <StatCard icon="bag" value={customer.orders} label="Pedidos" />
            <StatCard icon="card" value={brl(customer.avgTicket)} label="Ticket médio" />
            <StatCard icon="gift" value={brl(customer.cashback)} label="Cashback" tone="accent" />
            <StatCard icon="clock" value={recencyLabel} label="Última compra" />
            <StatCard icon="calendar" value={customer.tenureMonths + " meses"} label={"Cliente desde " + customer.since} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="card card-pad">
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Produtos mais comprados</div>
                {customer.topProducts.map((product, index) => {
                  const max = customer.topProducts[0].q;
                  return (
                    <div key={index} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: index ? "1px solid var(--border)" : "none" }}>
                      <span className="stat-icon" style={{ width: 34, height: 34 }}><Icon name="pill" size={16} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{product.n}</div>
                        <div style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", marginTop: 6, maxWidth: 220, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: Math.round(product.q / max * 100) + "%", background: "var(--brand)" }} /></div>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{product.q}<span className="cell-muted" style={{ fontWeight: 600, fontSize: 11 }}> un</span></span>
                    </div>
                  );
                })}
              </div>
              <div className="card card-pad">
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Pedidos nos últimos 12 meses</div>
                  <div className="cell-muted">{customer.freqDays ? `compra a cada ~${customer.freqDays} dias` : "sem recorrência ainda"}</div>
                </div>
                <BarChart data={monthData} valueKey="v" labelKey="d" height={120} accent="var(--info)" />
              </div>
              {customerOrders.length > 0 && (
                <div className="card card-pad">
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Pedidos em aberto</div>
                  {customerOrders.map((order, i) => (
                    <div key={order.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{order.id}</span>
                      <FulfillBadge f={order.fulfillment} />
                      <span className="cell-muted" style={{ marginLeft: "auto" }}>{order.placed} · {brl(order.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div className="card card-pad">
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Mix de compras</div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <Donut size={120} segments={customer.catMix.map(([name, value], index) => ({ value, color: catColors[index % catColors.length] }))} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                    {customer.catMix.map(([name, value], index) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: catColors[index % catColors.length], flex: "none" }} />
                        <span style={{ flex: 1 }}>{name}</span><b>{value}%</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Recorrências ativas</span>
                  <Icon name="repeat" size={17} style={{ color: "var(--good)" }} />
                </div>
                {customer.subscriptions.length === 0 ? <div className="cell-muted">Sem assinaturas ativas.</div> : customer.subscriptions.map((subscription, i) => (
                  <div key={subscription} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <span className="stat-icon" style={{ width: 32, height: 32, background: "var(--good-soft)", color: "var(--good)" }}><Icon name="repeat" size={15} /></span>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{subscription}</span>
                  </div>
                ))}
              </div>
              <div className="card card-pad">
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Favoritos <span className="cell-muted" style={{ fontWeight: 600, fontSize: 12 }}>(salvos no site)</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {customer.favorites.map((favorite) => <Badge key={favorite} tone="neutral"><Icon name="heart" size={13} style={{ color: "var(--critical)" }} />{favorite}</Badge>)}
                </div>
              </div>
              <div className="card card-pad">
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Interesses</div>
                <div className="cell-muted" style={{ marginBottom: 12 }}>Inferidos da navegação e do histórico</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {customer.interests.map((interest) => <Badge key={interest} tone="accent">{interest}</Badge>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { CrmScreen, tierTone };
