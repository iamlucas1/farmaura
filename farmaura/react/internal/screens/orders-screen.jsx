import React, { useEffect, useState } from "react";
import {
  Icon, PageHead, Drawer, Modal, Badge, StatusBadge, StatCard, PillNav, Tabs, DataTable, RowIconBtn, KV, Field, Avatar, money,
} from "../core/internal-ui.jsx";
import { OC_STATUS, SLA_TARGET, FulfillBadge, isActiveOrderStatus, isFinishedOrderStatus, fmtDur, minsSince, slaState } from "../core/internal-shell.jsx";
import { tierTone } from "./crm-screen.jsx";

/* FARMAURA Console — Pedidos online: filtro por tipo, tabela por etapa e drawer com
   andamento do pedido (design "Farmaura Operações", artifact b75209e1). */

function OrderTypeBadge({ fulfillment, label }) {
  const icon = fulfillment === "pickup" ? "store" : fulfillment === "shipping" ? "nav" : "truck";
  const defaultLabel = fulfillment === "pickup" ? "Retirada na loja" : fulfillment === "shipping" ? "Envio por transportadora" : "Entrega em domicilio";
  return <Badge tone={fulfillment === "pickup" ? "neutral" : "critical"}><Icon name={icon} size={11} />{label || defaultLabel}</Badge>;
}

function ExpressBadge() {
  return <Badge tone="critical"><Icon name="bolt" size={10} />Expressa</Badge>;
}

function OrderStatusBadge({ status }) {
  const meta = OC_STATUS[status] || OC_STATUS.unknown;
  return <Badge tone={meta.tone} dot><Icon name={meta.icon} size={11} />{meta.label}</Badge>;
}

function rxLabel(o) {
  if (!o.rx) return "Não se aplica";
  if (o.rxStatus === "approved") return "Aprovada";
  if (o.rxStatus === "pending") return "Aguardando validação";
  return "—";
}

function itemCount(o) {
  return o.items.reduce((s, it) => s + it.qty, 0);
}

/* ---------- pagamento: método + status, traduzidos ---------- */

const PAYMENT_METHOD_LABELS = {
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  pickup_cash: "Pagamento na retirada",
};
function paymentMethodLabel(o) {
  return PAYMENT_METHOD_LABELS[o.payment] || o.payment || "Pagamento";
}
function paymentStatusInfo(o) {
  switch (o.paymentStatus) {
    case "approved": return { label: "Pago", tone: "good" };
    case "pending_pickup": return { label: o.fulfillment === "pickup" ? "A pagar na retirada" : "A pagar na entrega", tone: "warning" };
    case "overdue": return { label: "Pagamento atrasado", tone: "critical" };
    case "refunded": return { label: "Estornado", tone: "neutral" };
    default: return { label: "Aguardando pagamento", tone: "warning" };
  }
}

/* ---------- prazo: contagem regressiva ao vivo, sem depender de reload ---------- */

function useNowTicker(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}


/* Em produção "placed" só tem granularidade HH:MM (sem data) — ancora no dia de hoje
   e joga pra ontem se isso colocaria o pedido no futuro (recebido perto da meia-noite).
   Dado de seed/demo usa um formato diferente e mais completo ("DD/MM/AAAA HH:MM UTC",
   ver dev-obsidian/farmaura/06_Pendencias/sla-nanh-em-pedidos-formato-de-hora-incompativel.md)
   — aceito os dois formatos aqui em vez de mexer no helper compartilhado `minsSince`. */
function placedToDate(placedLabel, nowMs) {
  if (!placedLabel) return null;
  const full = placedLabel.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (full) {
    const [, day, month, year, h, m] = full;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(h), Number(m)));
  }
  const short = placedLabel.match(/^(\d{1,2}):(\d{2})/);
  if (!short) return null;
  const [, h, m] = short;
  const d = new Date(nowMs);
  d.setHours(Number(h), Number(m), 0, 0);
  if (d.getTime() > nowMs + 5 * 60000) d.setDate(d.getDate() - 1);
  return d;
}

function slaTargetMinutes(o) {
  return o.sla || SLA_TARGET[o.fulfillment] || 90;
}

function remainingSeconds(o, nowMs) {
  const placedDate = placedToDate(o.placed, nowMs);
  if (!placedDate) return null;
  return slaTargetMinutes(o) * 60 - (nowMs - placedDate.getTime()) / 1000;
}

function formatCountdown(sec) {
  if (sec == null) return "—";
  const overdue = sec < 0;
  const abs = Math.round(Math.abs(sec));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const sign = overdue ? "+" : "";
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${String(mins).padStart(2, "0")}min`;
  return `${sign}${mins}:${String(secs).padStart(2, "0")}`;
}

/* Mais urgente primeiro (contador de prazo descendo); pedidos finalizados sempre
   por último, ordenados pelo mais recente. Reordena sozinho a cada tick do relógio
   (useNowTicker), sem precisar de reload nem de nova consulta ao servidor. */
function sortOrders(list, nowMs) {
  return [...list].sort((a, b) => {
    const aActive = isActiveOrderStatus(a.status);
    const bActive = isActiveOrderStatus(b.status);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (!aActive) return b.placed.localeCompare(a.placed);
    const ra = remainingSeconds(a, nowMs);
    const rb = remainingSeconds(b, nowMs);
    if (ra !== rb) return (ra ?? Infinity) - (rb ?? Infinity);
    if (a.priority !== b.priority) return a.priority === "express" ? -1 : 1;
    return 0;
  });
}

/* ---------- validar retirada: modal à parte, acionável da tabela ou do drawer ---------- */

function PickupCodeModal({ order, onClose, onConfirmed }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!code.trim() || !order) return;
    setBusy(true);
    try { await onConfirmed(order.id, code.trim()); setCode(""); onClose(); } finally { setBusy(false); }
  };

  return (
    <Modal
      open={!!order}
      onClose={() => { setCode(""); onClose(); }}
      title="Validar retirada"
      subtitle={order ? `${order.id} · ${order.customer}` : ""}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={() => { setCode(""); onClose(); }}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !code.trim()} onClick={handleConfirm}>
            <Icon name="check" size={14} />{busy ? "Validando..." : "Validar"}
          </button>
        </>
      )}
    >
      <div className="page-desc" style={{ marginBottom: 14 }}>Peça o código ao cliente e digite abaixo para o sistema conferir — o código nunca é exibido para o funcionário.</div>
      <Field label="Código de retirada">
        <input
          className="input mono" autoFocus value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
          placeholder="Digite o código informado pelo cliente"
        />
      </Field>
    </Modal>
  );
}

function OrdersScreen({ ctx }) {
  const { orders, openOrder, confirmPickupCode } = ctx;
  const [typeFilter, setTypeFilter] = useState("todos");
  const [tab, setTab] = useState("todos");
  const [pickupModalOrder, setPickupModalOrder] = useState(null);
  const now = useNowTicker(1000);

  const byType = typeFilter === "todos" ? orders : orders.filter((o) => o.fulfillment === typeFilter);
  const buckets = {
    todos: byType,
    pendente: byType.filter((o) => o.status === "new" || o.status === "separating"),
    pronto: byType.filter((o) => o.status === "ready"),
    finalizado: byType.filter((o) => isFinishedOrderStatus(o.status) || o.status === "cancelled"),
  };
  const visible = sortOrders(buckets[tab] || buckets.todos, now);
  const aguardandoReceita = orders.filter((o) => o.rx && o.rxStatus === "pending").length;

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento"
        title="Pedidos online"
        desc="Marketplace, site e app — entrega, retirada em loja e envio por transportadora."
        actions={(
          <PillNav
            options={[
              { key: "todos", label: "Todos" },
              { key: "delivery", label: "Entrega" },
              { key: "pickup", label: "Retirada" },
              { key: "shipping", label: "Envio" },
            ]}
            active={typeFilter}
            onChange={setTypeFilter}
          />
        )}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="clock" label="Pendentes" value={buckets.pendente.length} tone="warning" />
        <StatCard icon="check" label="Prontos / a caminho" value={buckets.pronto.length} tone="accent" />
        <StatCard icon="rx" label="Aguardando receita" value={aguardandoReceita} tone="serious" />
      </div>

      <Tabs
        tabs={[
          { key: "todos", label: "Todos", count: buckets.todos.length },
          { key: "pendente", label: "Pendentes", count: buckets.pendente.length },
          { key: "pronto", label: "Prontos / a caminho", count: buckets.pronto.length },
          { key: "finalizado", label: "Finalizados", count: buckets.finalizado.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="card">
        <DataTable
          columns={[
            { key: "id", label: "Pedido", mono: true },
            { key: "customer", label: "Cliente" },
            {
              key: "tipo",
              label: "Tipo",
              render: (o) => (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
                  {o.priority === "express" && <ExpressBadge />}
                </div>
              ),
            },
            { key: "itens", label: "Itens", render: (o) => `${itemCount(o)} ${itemCount(o) === 1 ? "item" : "itens"}` },
            { key: "total", label: "Total", render: (o) => money(o.total) },
            {
              key: "payment",
              label: "Pagamento",
              render: (o) => {
                const info = paymentStatusInfo(o);
                return (
                  <div>
                    <Badge tone={info.tone} dot>{info.label}</Badge>
                    <div className="cell-muted" style={{ fontSize: 10.5, marginTop: 3 }}>{paymentMethodLabel(o)}</div>
                  </div>
                );
              },
            },
            { key: "receita", label: "Receita", render: (o) => <StatusBadge status={rxLabel(o)} /> },
            { key: "status", label: "Status", render: (o) => <OrderStatusBadge status={o.status} /> },
            {
              key: "prazo",
              label: "Prazo",
              render: (o) => {
                if (!isActiveOrderStatus(o.status)) return <span className="cell-muted">—</span>;
                const placedDate = placedToDate(o.placed, now);
                const elapsedMin = placedDate ? (now - placedDate.getTime()) / 60000 : 0;
                const sla = slaState(elapsedMin, slaTargetMinutes(o));
                return <span className="mono tnum" style={{ fontWeight: 700, color: sla.color }}>{formatCountdown(remainingSeconds(o, now))}</span>;
              },
            },
          ]}
          rows={visible}
          rowKey="id"
          empty="Nenhum pedido nesse filtro"
          renderActions={(o) => (
            <>
              {o.status === "ready" && o.fulfillment === "pickup" && (
                <RowIconBtn name="lock" label="Validar retirada" onClick={() => setPickupModalOrder(o)} />
              )}
              <RowIconBtn name="eye" label="Ver detalhes" onClick={() => openOrder(o.id)} />
            </>
          )}
        />
      </div>

      <PickupCodeModal order={pickupModalOrder} onClose={() => setPickupModalOrder(null)} onConfirmed={confirmPickupCode} />
    </div>
  );
}

/* ---------- drawer: andamento do pedido ---------- */

function orderSteps(o) {
  const steps = [{ key: "new", label: "Novo" }];
  if (o.rx) steps.push({ key: "rx", label: "Aguardando validação de receita" });
  steps.push({ key: "separating", label: "Em separação" });
  steps.push({ key: "ready", label: o.fulfillment === "pickup" ? "Pronto para retirada" : "Pronto para despacho" });
  steps.push({
    key: "dispatched",
    label: o.fulfillment === "pickup" ? "Retirado pelo cliente" : o.fulfillment === "shipping" ? "Despachado para transportadora" : "Despachado para entrega",
  });
  return steps;
}

function currentStepKey(o) {
  const blockRx = o.rx && o.rxStatus === "pending";
  if (blockRx && (o.status === "new" || o.status === "separating")) return "rx";
  return o.status;
}

function OrderStepper({ o, blockRx, onNav }) {
  const steps = orderSteps(o);
  const currentKey = currentStepKey(o);
  const currentIdx = o.status === "delivered" ? steps.length : steps.findIndex((s) => s.key === currentKey);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Andamento do pedido</div>
      <div className="order-stepper">
        {steps.map((step, i) => {
          const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "upcoming";
          return (
            <div key={step.key} className="order-step">
              <div className="order-step-rail">
                <div className={"order-step-dot " + state}>
                  {state === "done" ? <Icon name="check" size={12} /> : <span className="mono" style={{ fontSize: 10 }}>{i + 1}</span>}
                </div>
                {i < steps.length - 1 && <div className={"order-step-line" + (i < currentIdx ? " done" : "")} />}
              </div>
              <div className="order-step-content">
                <div className={"order-step-label" + (state === "upcoming" ? " upcoming" : "")}>{step.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {blockRx && (
        <div className="order-action blocked">
          <div style={{ fontWeight: 700, fontSize: 12 }}>Aguardando validação da receita</div>
          <div className="cell-muted" style={{ fontSize: 11.5, marginTop: 2, marginBottom: 8 }}>O farmacêutico precisa aprovar a receita antes de continuar a separação.</div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNav("rx")}><Icon name="rx" size={13} />Abrir tela de receitas</button>
        </div>
      )}
    </div>
  );
}

/* ---------- ver CRM: modal com o essencial do 360 do cliente, sem sair do pedido ---------- */

function CustomerInfoModal({ customer, orders, onClose, onChat, onOpenFullProfile }) {
  if (!customer) return null;
  const recencyLabel = customer.lastDays === 0 ? "Comprou hoje" : customer.lastDays === 1 ? "Ontem" : `Há ${customer.lastDays} dias`;
  const customerOrders = orders.filter((order) => order.customer === customer.name);

  return (
    <Modal
      open onClose={onClose} wide
      title={(
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar initials={customer.avatar} size={36} />
          {customer.name}
        </span>
      )}
      subtitle={`${customer.email} · ${customer.phone}`}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={onOpenFullProfile}><Icon name="user" size={14} />Ver perfil completo no CRM</button>
        </>
      )}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Badge tone={tierTone(customer.tier)}><Icon name="sparkle" size={11} />Cliente {customer.tier}</Badge>
        {customer.recurring ? <Badge tone="good"><Icon name="repeat" size={11} />Recorrente</Badge> : <Badge tone="neutral"><Icon name="sparkle" size={11} />Novo cliente</Badge>}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={onChat}><Icon name="chat" size={13} />Conversar</button>
      </div>

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="money" value={money(customer.totalSpent)} label="Total gasto" tone="good" />
        <StatCard icon="bag" value={customer.orders} label="Pedidos" />
        <StatCard icon="card" value={money(customer.avgTicket)} label="Ticket médio" />
        <StatCard icon="gift" value={money(customer.cashback)} label="Cashback" tone="accent" />
        <StatCard icon="clock" value={recencyLabel} label="Última compra" />
      </div>

      <div className="grid g-2" style={{ gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {customer.topProducts && customer.topProducts.length > 0 && (
            <div className="card card-pad">
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Produtos mais comprados</div>
              {customer.topProducts.slice(0, 5).map((product, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span>{product.n}</span><span style={{ fontWeight: 700 }}>{product.q} un</span>
                </div>
              ))}
            </div>
          )}
          {customerOrders.length > 0 && (
            <div className="card card-pad">
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Pedidos deste cliente</div>
              {customerOrders.map((order, i) => (
                <div key={order.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none", flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>{order.id}</span>
                  <FulfillBadge f={order.fulfillment} />
                  <OrderStatusBadge status={order.status} />
                  <span className="cell-muted" style={{ marginLeft: "auto", fontSize: 12 }}>{money(order.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>Recorrências ativas</span>
              <Icon name="repeat" size={15} style={{ color: "var(--good)" }} />
            </div>
            {!customer.subscriptions || customer.subscriptions.length === 0
              ? <div className="cell-muted" style={{ fontSize: 12.5 }}>Sem assinaturas ativas.</div>
              : customer.subscriptions.map((s, i) => <div key={s} style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>{s}</div>)}
          </div>
          {customer.favorites && customer.favorites.length > 0 && (
            <div className="card card-pad">
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>Favoritos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {customer.favorites.map((f) => <Badge key={f} tone="neutral"><Icon name="heart" size={12} style={{ color: "var(--critical)" }} />{f}</Badge>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- separação: local(is) de retirada, só o que tem estoque real do item ---------- */

function itemDraftRows(it) {
  if (it.pickLocations && it.pickLocations.length) {
    return it.pickLocations.map((p) => ({ locationCode: p.locationCode, quantity: p.quantity }));
  }
  return [{ locationCode: it.loc && !it.loc.includes(" + ") ? it.loc : "", quantity: it.qty }];
}

function ItemLocationPicker({ item, available, rows, saving, onChange, onSave }) {
  const usedCodes = new Set(rows.map((r) => r.locationCode).filter(Boolean));
  const remainingOptions = available.filter((loc) => !usedCodes.has(loc.locationCode));
  const allocated = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const balanced = allocated === item.qty;
  const split = rows.length > 1;

  const updateRow = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    if (!remainingOptions.length) return;
    const rest = Math.max(0, item.qty - allocated);
    onChange([...rows, { locationCode: "", quantity: rest || 1 }]);
  };
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row, i) => {
        const selectableOptions = row.locationCode
          ? [available.find((loc) => loc.locationCode === row.locationCode), ...remainingOptions].filter(Boolean)
          : remainingOptions;
        return (
          <label key={i} className="pdv-cart-line-location">
            <Icon name="pin" size={12} />
            <select className="input" value={row.locationCode} onChange={(e) => updateRow(i, { locationCode: e.target.value })}>
              <option value="">{available.length ? "Selecionar local com estoque" : "Sem estoque em nenhum local"}</option>
              {selectableOptions.map((loc) => (
                <option key={loc.locationCode} value={loc.locationCode}>{loc.locationCode} · {loc.locationName} ({loc.qty} un)</option>
              ))}
            </select>
            {split && (
              <input
                className="input mono" type="number" min={1} value={row.quantity} style={{ width: 56, flex: "none" }}
                onChange={(e) => updateRow(i, { quantity: Math.max(0, Number(e.target.value) || 0) })}
              />
            )}
            {split && (
              <button type="button" className="icon-btn" style={{ width: 26, height: 26, flex: "none" }} aria-label="remover local" onClick={() => removeRow(i)}>
                <Icon name="x" size={12} />
              </button>
            )}
          </label>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {available.length > 1 && remainingOptions.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}><Icon name="plus" size={12} />Retirado de outro local também</button>
        )}
        {split && (
          <>
            <span className="cell-muted" style={{ fontSize: 11, fontWeight: 700, color: balanced ? "var(--good)" : "var(--warning)" }}>{allocated}/{item.qty} un alocadas</span>
            <button
              type="button" className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}
              disabled={!balanced || saving || rows.some((r) => !r.locationCode)}
              onClick={onSave}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function OrderDrawer({ ctx }) {
  const { orders, drawerOrder, closeDrawer, advanceOrder, confirmPickupCode, updateOrderItemLocation, toggleOrderItemPicked, dispatchShippingOrder, fetchPdvItemLocations, openChatFor, openChatForName, openCustomer, customers = [], onNav, nowLabel } = ctx;
  const o = orders.find((x) => x.id === drawerOrder);
  const [togglingItemId, setTogglingItemId] = useState("");
  const [dispatchingShipping, setDispatchingShipping] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [itemStockLocations, setItemStockLocations] = useState({}); // por inventoryItemId: [{locationCode, locationName, qty}]
  const [locationDrafts, setLocationDrafts] = useState({}); // por item.id: [{locationCode, quantity}]
  const [savingLocationItemId, setSavingLocationItemId] = useState("");

  useEffect(() => {
    if (!o || !fetchPdvItemLocations) return undefined;
    const missingIds = o.items.map((it) => it.inventoryItemId).filter((id, i, arr) => id && !(id in itemStockLocations) && arr.indexOf(id) === i);
    if (!missingIds.length) return undefined;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(missingIds.map(async (id) => [id, await fetchPdvItemLocations(id)]));
      if (!cancelled) setItemStockLocations((prev) => { const next = { ...prev }; for (const [id, locs] of entries) next[id] = locs; return next; });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o && o.id, o && o.items.map((it) => it.inventoryItemId).join(",")]);

  if (!o) return null;

  const st = OC_STATUS[o.status];
  const blockRx = o.rx && o.rxStatus === "pending";
  const allPicked = o.items.every((it) => it.picked);
  const nextLabel = { new: "Iniciar separação", separating: "Marcar como pronto" }[o.status];

  const handleTogglePicked = async (itemId, nextPicked) => {
    if (!o.recordId) return;
    setTogglingItemId(itemId);
    try { await toggleOrderItemPicked(o.recordId, itemId, nextPicked); } finally { setTogglingItemId(""); }
  };
  const draftRowsFor = (it) => locationDrafts[it.id] || itemDraftRows(it);
  const saveItemLocations = async (it, rows) => {
    if (!o.recordId) return;
    setSavingLocationItemId(it.id);
    try {
      await updateOrderItemLocation(o.recordId, it.id, rows);
      setLocationDrafts((prev) => { const next = { ...prev }; delete next[it.id]; return next; });
    } finally {
      setSavingLocationItemId("");
    }
  };
  const handleDraftsChange = (it, rows) => {
    setLocationDrafts((prev) => ({ ...prev, [it.id]: rows }));
    if (rows.length === 1 && rows[0].locationCode) saveItemLocations(it, [{ ...rows[0], quantity: it.qty }]);
  };
  const handleAdvance = async () => {
    setAdvancing(true);
    try { await advanceOrder(o.id); } finally { setAdvancing(false); }
  };

  const min = minsSince(o.placed, nowLabel);
  const target = slaTargetMinutes(o);
  const sla = slaState(min, target);
  const done = isFinishedOrderStatus(o.status);
  const doneLabel = o.fulfillment === "pickup" ? "Retirado pelo cliente" : "Despachado para entrega";
  const cancelled = o.status === "cancelled";
  const paymentInfo = paymentStatusInfo(o);

  return (
    <Drawer
      open onClose={closeDrawer}
      title={(
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontWeight: 800, fontSize: 16 }}>{o.id}</span>
          <OrderTypeBadge fulfillment={o.fulfillment} label={o.fulfillmentLabel} />
          {o.priority === "express" && <ExpressBadge />}
          <OrderStatusBadge status={o.status} />
          <Badge tone={paymentInfo.tone} dot>{paymentInfo.label}</Badge>
        </span>
      )}
      subtitle={`Recebido às ${o.placed} · ${paymentMethodLabel(o)}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {!cancelled && (
          <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface-2)" }}>
            <span className="stat-icon" style={{ background: done ? "var(--good-soft)" : sla.bg, color: done ? "var(--good)" : sla.color }}><Icon name={done ? "check" : "clock"} size={18} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{done ? doneLabel : `${fmtDur(min)} em aberto`}</div>
              <div className="cell-muted" style={{ fontSize: 12 }}>{o.fulfillmentLabel} · meta operacional de {fmtDur(target)}</div>
            </div>
            {!done && <span className="badge" style={{ background: sla.bg, color: sla.color }}>{sla.label}</span>}
          </div>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 13.5 }}>{o.fulfillment === "pickup" ? "Cliente / retirada" : "Paciente / entrega"}</span>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setCustomerModalOpen(true)}><Icon name="user" size={12} />Ver CRM</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
            <KV label="Nome" value={o.customer} />
            <KV label="Telefone" value={o.phone} />
            <KV label="CPF" value={o.doc} />
            {o.fulfillment === "pickup"
              ? <KV label="Retirada" value={o.store || "Loja principal"} />
              : <KV label="Entrega" value={`${o.address} · ${o.district} · ${o.cep}`} />}
            {o.fulfillment === "shipping" && o.carrierName && <KV label="Transportadora" value={o.carrierName} />}
            {o.fulfillment === "shipping" && o.trackingCode && <KV label="Rastreio" value={o.trackingCode} />}
            {o.note && <KV label="Observação" value={o.note} />}
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
          <div className="card" style={{ padding: "0 14px" }}>
            {o.items.map((it) => (
              <div key={it.id} className="pdv-cart-line">
                <div className="pdv-cart-line-main">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => handleTogglePicked(it.id, !it.picked)} disabled={togglingItemId === it.id} aria-label="conferir item"
                      style={{ width: 22, height: 22, borderRadius: 6, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", cursor: "pointer", background: it.picked ? "var(--good)" : "var(--surface)", color: "#fff", borderColor: it.picked ? "var(--good)" : "var(--border-strong)" }}
                    >
                      {it.picked && <Icon name="check" size={13} />}
                    </button>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, textDecoration: it.picked ? "line-through" : "none", color: it.picked ? "var(--text-muted)" : "inherit" }}>{it.name}</span>
                  </div>
                  <div className="cell-muted" style={{ fontSize: 11.5, paddingLeft: 32 }}>Qtd {it.qty}{it.rx ? " · item com receita" : ""}</div>
                </div>
                <ItemLocationPicker
                  item={it}
                  available={itemStockLocations[it.inventoryItemId] || []}
                  rows={draftRowsFor(it)}
                  saving={savingLocationItemId === it.id}
                  onChange={(rows) => handleDraftsChange(it, rows)}
                  onSave={() => saveItemLocations(it, draftRowsFor(it))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontWeight: 800, fontSize: 14 }}>
            <span>Total</span><span className="mono">{money(o.total)}</span>
          </div>
        </div>

        {cancelled ? (
          <div className="card" style={{ padding: 12, background: "var(--critical-soft)", border: "none" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--critical)" }}>Pedido cancelado</div>
            <div className="cell-muted" style={{ fontSize: 11.5, marginTop: 4 }}>Pagamento: {paymentInfo.label} · {paymentMethodLabel(o)}</div>
          </div>
        ) : (
          <OrderStepper o={o} blockRx={blockRx} onNav={onNav} />
        )}

        {!cancelled && !blockRx && o.status === "ready" && o.fulfillment === "pickup" && (
          <div className="order-action">
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setPickupModalOpen(true)}>
              <Icon name="lock" size={14} />Validar retirada
            </button>
          </div>
        )}

        {!cancelled && !blockRx && o.status === "ready" && o.fulfillment === "shipping" && (
          <div className="order-action">
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={dispatchingShipping} onClick={() => { setDispatchingShipping(true); dispatchShippingOrder(o.recordId).finally(() => setDispatchingShipping(false)); }}>
              <Icon name="nav" size={15} />{dispatchingShipping ? "Gerando etiqueta..." : "Gerar etiqueta e despachar"}
            </button>
          </div>
        )}

        {!cancelled && !blockRx && o.status === "ready" && o.fulfillment === "delivery" && (
          <div className="order-action">
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleAdvance} disabled={advancing}>
              <Icon name="truck" size={15} />{advancing ? "Despachando..." : "Despachar para entrega"}
            </button>
          </div>
        )}

        {!cancelled && !blockRx && (o.status === "new" || o.status === "separating") && (
          <div className="order-action">
            <button
              className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
              disabled={advancing || (o.status === "separating" && !allPicked)}
              onClick={handleAdvance}
            >
              <Icon name="arrowR" size={15} />{advancing ? "Avançando..." : nextLabel}
            </button>
          </div>
        )}

        {done && (
          <div className="order-action" style={{ background: "var(--good-soft)" }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "var(--good)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="check" size={15} />Pedido finalizado</div>
          </div>
        )}
      </div>

      <PickupCodeModal
        order={pickupModalOpen ? o : null}
        onClose={() => setPickupModalOpen(false)}
        onConfirmed={async (id, code) => { await confirmPickupCode(id, code); closeDrawer(); }}
      />

      <CustomerInfoModal
        customer={customerModalOpen ? customers.find((c) => c.name === o.customer) : null}
        orders={orders}
        onClose={() => setCustomerModalOpen(false)}
        onChat={() => { setCustomerModalOpen(false); openChatForName(o.customer); }}
        onOpenFullProfile={() => { setCustomerModalOpen(false); openCustomer(o.customer); }}
      />
    </Drawer>
  );
}

export { OrderTypeBadge, OrderStatusBadge, OrderDrawer, OrdersScreen };
