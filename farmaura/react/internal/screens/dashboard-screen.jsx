import React, { useState } from "react";
import { OC_STATUS, orderStatusMeta, stockState } from "../core/internal-shell.jsx";
import { getPromotionStatusKey, getPromotionAudienceBadges, formatPromotionDiscount } from "./promotions-screen.jsx";
import { getCouponStatusKey, formatCouponDiscount, COUPON_AUDIENCE_LABELS } from "./coupons-screen.jsx";
import { Icon, PageHead, Badge, StatCard, PillNav, DataTable, Avatar, VBars, money } from "../core/internal-ui.jsx";

/* FARMAURA Console — Painel: visão do dia, uma variante por papel (admin/gerente/farmacêutico/
   caixa), replicando a estrutura da tela "Painel" do protótipo Farmaura Operações (cada papel via
   um recorte diferente do mesmo dia operacional, não uma única visão genérica).

   Toda variante consome só dado real já disponível em ctx — nada é inventado. Onde o protótipo
   pedia algo que o backend não expõe hoje, a variante usa o sinal real mais próximo (nunca um
   número fixo) ou omite o cartão:
   - "Vendas hoje"/"Faturamento hoje" em R$: não há agregado confiável de receita do dia no ctx
     (chartSeed só soma CONTAGEM de pedidos+vendas, não valor) — os StatCards usam essa contagem
     real em vez de inventar uma soma em R$.
   - "Equipe hoje" (gerente, com status "atendendo"/"disponível" ao vivo): omitido — o endpoint
     de equipe é admin-only no backend (ver app/api/v1/team.py) e não existe status de atividade
     ao vivo por pessoa; o espaço vai para o gráfico de vendas em largura cheia.
   - "Tempo médio de espera" (caixa): omitido — não há métrica de tempo de fila no backend. */

function greetingWord() {
  const hour = new Date().getHours();
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
const NAME_TITLE_PREFIXES = new Set(["dr", "dr.", "dra", "dra.", "sr", "sr.", "sra", "sra."]);
function firstName(name) {
  const parts = String(name || "").trim().split(" ").filter(Boolean);
  const first = NAME_TITLE_PREFIXES.has((parts[0] || "").toLowerCase()) ? parts[1] : parts[0];
  return first || "Equipe";
}
function storeNameOf(stores, storeId) {
  const found = (stores || []).find((s) => s.id === storeId);
  return found ? found.name : "";
}

/* ---------- cartões compartilhados entre variantes de papel ---------- */

function OpenOrdersCard({ byHour, week, openCount }) {
  const [mode, setMode] = useState("hora");
  const hourData = (byHour.length ? byHour : [{ h: "0h", v: 0 }]).map((entry) => ({ label: entry.h, value: entry.v }));
  const dayData = (week.length ? week : [{ d: "Hoje", v: 0 }]).map((entry) => ({ label: entry.d, value: entry.v }));
  return (
    <div className="card">
      <div className="card-head">
        <div><h3>Pedidos e vendas</h3><div className="card-head-sub">{openCount} pedidos aguardando conclusão agora</div></div>
        <PillNav options={[{ key: "hora", label: "Por hora" }, { key: "dia", label: "Por dia" }]} active={mode} onChange={setMode} />
      </div>
      <div className="card-pad">
        <VBars
          data={mode === "hora" ? hourData : dayData}
          labelEvery={mode === "hora" ? 2 : 1}
          label={mode === "hora" ? "Pedidos e vendas por hora, hoje" : "Pedidos e vendas por dia, últimos 7 dias"}
        />
      </div>
    </div>
  );
}

function OrganizeNowCard({ readyPickup, toDispatch, onNav, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-head">
        <div><h3>Para organizar agora</h3><div className="card-head-sub">Retiradas prontas e entregas para despachar</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav("orders")}>Ver pedidos<Icon name="chevR" size={13} /></button>
      </div>
      <div style={{ padding: "10px 18px 2px", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="check" size={14} style={{ color: "var(--good)" }} />
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>Prontas para retirada</span>
        <Badge tone="good">{readyPickup.length}</Badge>
      </div>
      <div style={{ padding: "2px 18px 8px" }}>
        {readyPickup.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "6px 0" }}>Nenhuma retirada pendente.</div>}
        {readyPickup.slice(0, 4).map((order) => (
          <div key={order.id} className="pdv-cart-line">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{order.id} · {order.customer}</div>
              <div className="cell-muted" style={{ fontSize: 11.5 }}>{order.store || "Loja principal"} · aguardando retirada</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 18px 2px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="truck" size={14} style={{ color: "var(--warning)" }} />
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>Entregas para despachar</span>
        <Badge tone="warning">{toDispatch.length}</Badge>
      </div>
      <div style={{ padding: "2px 18px 14px" }}>
        {toDispatch.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "6px 0" }}>Nenhuma entrega para despachar.</div>}
        {toDispatch.slice(0, 4).map((order) => {
          const meta = orderStatusMeta(order.status);
          return (
            <div key={order.id} className="pdv-cart-line">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{order.id} · {order.customer}</div>
                <div className="cell-muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{order.address || "—"}</div>
              </div>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrescriptionsToValidateCard({ list, onNav, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-head">
        <div><h3>Receitas a validar</h3><div className="card-head-sub">{list.length} receita(s) aguardando farmacêutico</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav("rx")}>Ver todas<Icon name="chevR" size={13} /></button>
      </div>
      <DataTable
        columns={[
          { key: "patient", label: "Cliente", render: (p) => p.patient },
          { key: "type", label: "Tipo", render: (p) => <Badge tone={p.type === "digital" ? "accent" : "neutral"}>{p.type === "digital" ? "Digital" : "Física"}</Badge> },
          { key: "meds", label: "Medicamento", render: (p) => (p.meds.length ? p.meds.map((med) => med.name).join(", ") : "—") },
          { key: "status", label: "Status", render: (p) => <Badge tone={p.status === "pending" ? "warning" : p.status === "approved" ? "good" : "neutral"}>{p.status === "pending" ? "Pendente" : p.status === "approved" ? "Validada" : "Recusada"}</Badge> },
        ]}
        rows={list}
        rowKey="id"
        empty="Nenhuma receita pendente"
      />
    </div>
  );
}

function StockAlertsCard({ items, onNav, title, desc, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-head">
        <div><h3>{title || "Alertas de estoque"}</h3><div className="card-head-sub">{desc || "Abaixo do mínimo ou perto do vencimento"}</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav("inventory")}>Ver estoque<Icon name="chevR" size={13} /></button>
      </div>
      <div style={{ padding: "6px 10px 14px" }}>
        {items.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "10px 8px" }}>Nenhum item abaixo do mínimo.</div>}
        {items.map((item) => {
          const state = stockState(item);
          return (
            <div key={item.id} className="pdv-cart-line">
              <span className="stat-icon" style={{ background: state.bg, color: state.color }}><Icon name="boxes" size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div className="cell-muted" style={{ fontSize: 11.5 }}>{item.loc || "—"} · mínimo {item.min}</div>
              </div>
              <Badge tone={state.key === "critical" ? "critical" : "warning"}>{item.qty} restantes</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- variante: administrador (visão consolidada da rede) ---------- */

function AdminDashboard({ ctx, active, pendingRx, stockAlerts, byHour, week }) {
  const { onNav, inventory } = ctx;
  const readyPickup = active.filter((o) => o.fulfillment === "pickup" && o.status === "ready");
  const toDispatch = active.filter((o) => o.fulfillment === "delivery" && o.status === "ready");
  const todayCount = byHour.reduce((sum, entry) => sum + (Number(entry && entry.v) || 0), 0);

  return (
    <>
      <div className="grid g-12" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 7" }}><OpenOrdersCard byHour={byHour} week={week} openCount={active.length} /></div>
        <div style={{ gridColumn: "span 5" }}><OrganizeNowCard readyPickup={readyPickup} toDispatch={toDispatch} onNav={onNav} /></div>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="chart" label="Pedidos e vendas hoje" value={todayCount} tone="good" />
        <StatCard icon="bag" label="Pedidos em aberto" value={active.length} tone="warning" />
        <StatCard icon="rx" label="Receitas para validar" value={pendingRx.length} tone={pendingRx.length ? "warning" : "accent"} />
      </div>

      <div className="grid g-12" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 7" }}><PrescriptionsToValidateCard list={pendingRx} onNav={onNav} /></div>
        <StockAlertsCard items={stockAlerts.slice(0, 6)} onNav={onNav} style={{ gridColumn: "span 5" }} />
      </div>

      <div className="card">
        <div className="card-head">
          <div><h3>Pedidos e vendas — últimos 7 dias</h3><div className="card-head-sub">Todas as lojas e o marketplace</div></div>
        </div>
        <div className="card-pad">
          <VBars data={week.length ? week.map((entry) => ({ label: entry.d, value: entry.v })) : [{ label: "Hoje", value: 0 }]} label="Pedidos e vendas dos últimos 7 dias" />
        </div>
      </div>
    </>
  );
}

/* ---------- variante: gerente (visão executiva da unidade) ---------- */

function ManagerDashboard({ ctx, active, week }) {
  const { onNav, inventory, user, stores } = ctx;
  const myStoreName = storeNameOf(stores, user && user.store);
  const storeOrders = myStoreName ? active.filter((o) => o.store === myStoreName) : active;
  const readyPickup = storeOrders.filter((o) => o.fulfillment === "pickup" && o.status === "ready");
  const toDispatch = storeOrders.filter((o) => o.fulfillment === "delivery" && o.status === "ready");
  const storeStock = (user && user.store) ? inventory.filter((item) => item.storeId === user.store) : inventory;
  const storeAlerts = storeStock.filter((item) => stockState(item).key !== "normal");

  return (
    <>
      <div className="grid g-12" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 7" }}><OrganizeNowCard readyPickup={readyPickup} toDispatch={toDispatch} onNav={onNav} /></div>
        <StockAlertsCard
          items={storeAlerts.slice(0, 6)} onNav={onNav} style={{ gridColumn: "span 5" }}
          title="Estoque da loja" desc={myStoreName ? `Abaixo do mínimo em ${myStoreName}` : "Abaixo do mínimo"}
        />
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="bag" label="Pedidos hoje na loja" value={storeOrders.length} tone="good" />
        <StatCard icon="truck" label="Entregas a despachar" value={toDispatch.length} tone="warning" />
        <StatCard icon="alert" label="Itens abaixo do mínimo" value={storeAlerts.length} tone={storeAlerts.length ? "critical" : "accent"} />
      </div>

      {/* "Equipe hoje" do protótipo foi omitido aqui: o endpoint de equipe é admin-only no
          backend, então não existe dado real de equipe para o papel de gerente exibir. O
          gráfico ocupa a largura cheia no lugar. */}
      <div className="card">
        <div className="card-head">
          <div><h3>Pedidos e vendas — últimos 7 dias</h3><div className="card-head-sub">Rede completa — o backend ainda não agrega esta série por loja</div></div>
        </div>
        <div className="card-pad">
          <VBars data={week.length ? week.map((entry) => ({ label: entry.d, value: entry.v })) : [{ label: "Hoje", value: 0 }]} label="Pedidos e vendas dos últimos 7 dias" />
        </div>
      </div>
    </>
  );
}

/* ---------- variante: farmacêutico (fila de atendimento) ---------- */

function PharmacistDashboard({ ctx, pendingRx }) {
  const { onNav, threads = [], customers = [], inventory } = ctx;
  const pendingChats = threads.filter((thread) => thread.unread > 0);
  const controlledNames = new Set(inventory.filter((item) => item.controlled).map((item) => item.name));
  const controlledPending = pendingRx.filter((rx) => rx.meds.some((med) => controlledNames.has(med.name)));
  const continuousUseCustomers = customers.filter((c) => Array.isArray(c.subscriptions) && c.subscriptions.length > 0);

  return (
    <>
      <div className="grid g-12" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 7" }}><PrescriptionsToValidateCard list={pendingRx} onNav={onNav} /></div>
        <div className="card" style={{ gridColumn: "span 5" }}>
          <div className="card-head">
            <div><h3>Chat com farmacêutico — pendentes</h3></div>
            <button className="btn btn-ghost btn-sm" onClick={() => onNav("chat")}>Abrir chat<Icon name="chevR" size={13} /></button>
          </div>
          <div style={{ padding: "6px 10px 14px" }}>
            {pendingChats.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "10px 8px" }}>Nenhum chat pendente.</div>}
            {pendingChats.slice(0, 6).map((thread) => (
              <div key={thread.id} className="pdv-cart-line">
                <span className="stat-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="chat" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{thread.customer}</div>
                  <div className="cell-muted" style={{ fontSize: 11.5 }}>{thread.topic}</div>
                </div>
                <Badge tone="critical">{thread.unread}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="rx" label="Receitas para validar" value={pendingRx.length} tone="warning" />
        <StatCard icon="chat" label="Chats pendentes" value={pendingChats.length} tone="accent" />
        <StatCard icon="lock" label="Receitas controladas pendentes" value={controlledPending.length} tone="critical" />
      </div>

      <div className="card">
        <div className="card-head">
          <div><h3>Clientes em uso contínuo</h3><div className="card-head-sub">Oportunidades de recorrência para acompanhar</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav("crm")}>Ver clientes<Icon name="chevR" size={13} /></button>
        </div>
        <div style={{ padding: "6px 18px 14px" }}>
          {continuousUseCustomers.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "10px 0" }}>Nenhum cliente de uso contínuo no momento.</div>}
          {continuousUseCustomers.slice(0, 8).map((customer) => (
            <div key={customer.name} className="pdv-cart-line">
              <Avatar initials={customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{customer.name}</div>
                <div className="cell-muted" style={{ fontSize: 11.5 }}>{customer.subscriptions.join(" · ")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- variante: caixa (frente de caixa) ---------- */

function CashierDashboard({ ctx, active }) {
  const { onNav, pdvQueue = [], promotions = [], coupons = [] } = ctx;
  const readyPickup = active.filter((o) => o.fulfillment === "pickup" && o.status === "ready");
  const toDispatch = active.filter((o) => o.fulfillment === "delivery" && o.status === "ready");
  const activePromotions = promotions.filter((p) => getPromotionStatusKey(p) === "active" || getPromotionStatusKey(p) === "expiring");
  const activeCoupons = coupons.filter((c) => getCouponStatusKey(c) === "active" || getCouponStatusKey(c) === "expiring");

  return (
    <>
      <div className="grid g-12" style={{ marginBottom: 16 }}>
        <div className="card card-pad" style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
          <span className="stat-icon" style={{ width: 44, height: 44, borderRadius: 14, background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="receipt" size={22} /></span>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Iniciar nova venda</div>
          <button className="btn btn-primary" onClick={() => onNav("pdv")}>Abrir PDV<Icon name="chevR" size={14} /></button>
        </div>
        <div style={{ gridColumn: "span 8" }}><OrganizeNowCard readyPickup={readyPickup} toDispatch={toDispatch} onNav={onNav} /></div>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="user" label="Clientes na fila agora" value={pdvQueue.length} tone="accent" />
        <StatCard icon="check" label="Retiradas prontas no balcão" value={readyPickup.length} tone="good" />
        <StatCard icon="tag" label="Promoções ativas hoje" value={activePromotions.length} tone="warning" />
      </div>

      <div className="grid g-12">
        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card-head">
            <div><h3>Promoções para oferecer</h3><div className="card-head-sub">Vigentes agora — mencione no atendimento</div></div>
          </div>
          <div style={{ padding: "6px 18px 14px" }}>
            {activePromotions.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "10px 0" }}>Nenhuma promoção ativa agora.</div>}
            {activePromotions.slice(0, 6).map((promotion) => (
              <div key={promotion.id} className="pdv-cart-line">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{promotion.name}</div>
                  <div className="cell-muted" style={{ fontSize: 11 }}>{(getPromotionAudienceBadges(promotion)[0]) || "Todo o público"}</div>
                </div>
                <Badge tone="good">{formatPromotionDiscount(promotion)} off</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ gridColumn: "span 6" }}>
          <div className="card-head">
            <div><h3>Cupons disponíveis</h3><div className="card-head-sub">Pode informar ao cliente no fechamento</div></div>
          </div>
          <div style={{ padding: "6px 18px 14px" }}>
            {activeCoupons.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: "10px 0" }}>Nenhum cupom disponível agora.</div>}
            {activeCoupons.slice(0, 6).map((coupon) => (
              <div key={coupon.id} className="pdv-cart-line">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }} className="mono">{coupon.code}</div>
                  <div className="cell-muted" style={{ fontSize: 11 }}>{COUPON_AUDIENCE_LABELS[coupon.audience] || coupon.audience} · pedido mín. {money(coupon.minimumOrderValue)}</div>
                </div>
                <Badge tone="accent">{formatCouponDiscount(coupon)}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- ponto de entrada ---------- */

function Dashboard({ ctx }) {
  const { orders, prescriptions, inventory, user = {}, stores = [], chartSeed = {} } = ctx;
  const byHour = Array.isArray(chartSeed.byHour) ? chartSeed.byHour : [];
  const week = Array.isArray(chartSeed.week) ? chartSeed.week : [];
  const active = orders.filter((order) => order.status !== "dispatched" && order.status !== "delivered" && order.status !== "cancelled");
  const pendingRx = prescriptions.filter((prescription) => prescription.status === "pending");
  const stockAlerts = inventory.filter((item) => stockState(item).key !== "normal");

  const role = user.role || "pharmacist";
  const name = firstName(user.name);
  const myStoreName = storeNameOf(stores, user.store);
  const greeting = greetingWord();

  const HEAD_BY_ROLE = {
    admin: { eyebrow: "Visão geral · Rede", title: `${greeting} — visão consolidada da rede`, desc: "Todas as lojas e o marketplace." },
    manager: { eyebrow: "Visão executiva", title: `${greeting}, ${name}${myStoreName ? " — " + myStoreName : ""}`, desc: myStoreName ? `Resumo executivo da unidade ${myStoreName}.` : "Resumo executivo da unidade." },
    pharmacist: { eyebrow: "Atendimento farmacêutico", title: `${greeting}, ${name} — fila de atendimento`, desc: "Receitas, chats e clientes de uso contínuo aguardando você." },
    cashier: { eyebrow: "Frente de caixa", title: `${greeting}, ${name}`, desc: `${myStoreName || "Frente de caixa"} · vendas, retiradas e promoções do turno.` },
  };
  const head = HEAD_BY_ROLE[role] || HEAD_BY_ROLE.pharmacist;

  return (
    <div className="route-fade">
      <PageHead eyebrow={head.eyebrow} title={head.title} desc={head.desc} />
      {role === "admin" && <AdminDashboard ctx={ctx} active={active} pendingRx={pendingRx} stockAlerts={stockAlerts} byHour={byHour} week={week} />}
      {role === "manager" && <ManagerDashboard ctx={ctx} active={active} week={week} />}
      {role === "pharmacist" && <PharmacistDashboard ctx={ctx} pendingRx={pendingRx} />}
      {role === "cashier" && <CashierDashboard ctx={ctx} active={active} />}
    </div>
  );
}

export { Dashboard };
