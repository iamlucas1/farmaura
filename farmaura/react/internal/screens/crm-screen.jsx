import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon, PageHead, Badge, SearchInput, DataTable, Drawer, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — CRM do cliente (tabela + drawer de relacionamento 360). */

function tierTone(tier) {
  return { Ouro: "warning", Prata: "neutral", Bronze: "warning", Novo: "accent" }[tier] || "accent";
}

function TierBadge({ tier }) {
  return <span className={"badge tier-" + String(tier || "").toLowerCase()}>{tier}</span>;
}

function MiniStat({ label, value, tone }) {
  const critical = tone === "critical";
  return (
    <div className="card" style={{ padding: 12, border: "none", background: critical ? "var(--critical-soft)" : "var(--surface-2)" }}>
      <div className="cell-muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 13.5, color: critical ? "var(--critical)" : "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function recencyLabel(lastDays) {
  return lastDays === 0 ? "Comprou hoje" : lastDays === 1 ? "Ontem" : `Há ${lastDays} dias`;
}

function tenureLabel(months) {
  if (!months || months < 12) return `${months || 0} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsLabel = `${years} ${years === 1 ? "ano" : "anos"}`;
  return rest ? `${yearsLabel} e ${rest} ${rest === 1 ? "mês" : "meses"}` : yearsLabel;
}

function CrmScreen({ ctx }) {
  const { crmFocus, orders, openChatForName, customers = [], fetchCustomerAddresses, fetchCustomerPaymentMethods } = ctx;
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(crmFocus);
  useEffect(() => { if (crmFocus) setSelectedName(crmFocus); }, [crmFocus]);
  const customer = customers.find((entry) => entry.name === selectedName) || null;
  const list = customers.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()));

  const [addresses, setAddresses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  useEffect(() => {
    let active = true;
    if (!customer) { setAddresses([]); setPaymentMethods([]); return; }
    setAddresses([]); setPaymentMethods([]);
    Promise.all([fetchCustomerAddresses(customer.id), fetchCustomerPaymentMethods(customer.id)]).then(([addr, cards]) => {
      if (active) { setAddresses(addr); setPaymentMethods(cards); }
    });
    return () => { active = false; };
  }, [customer && customer.id]);

  const closeDetail = () => setSelectedName("");

  const columns = [
    { key: "name", label: "Cliente" },
    { key: "tier", label: "Nível", render: (c) => <TierBadge tier={c.tier} /> },
    { key: "phone", label: "Telefone" },
    { key: "totalSpent", label: "Gasto total", render: (c) => brl(c.totalSpent) },
    { key: "orders", label: "Pedidos" },
    { key: "cashback", label: "Cashback", render: (c) => brl(c.cashback) },
    { key: "lastDays", label: "Última compra", render: (c) => c.lastDays == null ? <span className="cell-muted">—</span> : recencyLabel(c.lastDays) },
  ];

  const detail = customer && (() => {
    const atrasado = customer.freqDays != null && customer.lastDays != null && customer.lastDays > customer.freqDays;
    const continuous = customer.topProducts.filter((p) => p.continuous);
    const regular = customer.topProducts.filter((p) => !p.continuous);
    const customerOrders = orders.filter((order) => order.customer === customer.name);
    const findSubscription = (productName) => customer.subscriptions.find((s) => s.toLowerCase().includes(productName.toLowerCase().split(" ")[0]));

    return (
      <>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <TierBadge tier={customer.tier} />
          <Badge tone="accent"><Icon name="gift" size={11} />{brl(customer.cashback)} em cashback</Badge>
          {atrasado && <Badge tone="warning"><Icon name="clock" size={11} />Atrasado para recompra</Badge>}
        </div>

        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Padrão de consumo</div>
        <div className="grid g-2" style={{ marginBottom: 8 }}>
          <MiniStat label="Gasto total" value={brl(customer.totalSpent)} />
          <MiniStat label="Pedidos" value={customer.orders} />
        </div>
        <div className="grid g-2" style={{ marginBottom: 8 }}>
          <MiniStat label="Ticket médio" value={brl(customer.avgTicket)} />
          <MiniStat label="Frequência de compra" value={customer.freqDays ? `a cada ${customer.freqDays}d` : "—"} />
        </div>
        <div className="grid g-2" style={{ marginBottom: 16 }}>
          <MiniStat label="Cliente desde" value={tenureLabel(customer.tenureMonths)} />
          <MiniStat label="Última compra" value={customer.lastDays == null ? "—" : recencyLabel(customer.lastDays)} tone={atrasado ? "critical" : undefined} />
        </div>

        {atrasado && (
          <div className="order-action blocked" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>
              <Icon name="alerttriangle" size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              Cliente já passou do ciclo médio de recompra — boa oportunidade de contato.
            </div>
          </div>
        )}

        <div className="kv"><span className="kv-label">Telefone</span><span className="kv-value">{customer.phone || "—"}</span></div>
        <div className="kv"><span className="kv-label">E-mail</span><span className="kv-value">{customer.email || "—"}</span></div>
        <div className="kv"><span className="kv-label">Aniversário</span><span className="kv-value">{customer.birthDate || "—"}</span></div>
        <div className="kv"><span className="kv-label">Filhos</span><span className="kv-value">{customer.children.length ? customer.children.map((k) => k.age != null ? `${k.name} (${k.age})` : k.name).join(", ") : "—"}</span></div>
        <div className="kv">
          <span className="kv-label">Cartão cadastrado</span>
          <span className="kv-value">{paymentMethods.length ? `${paymentMethods[0].brandName} •••• ${paymentMethods[0].lastFourDigits}` : "Nenhum cartão salvo"}</span>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Endereços cadastrados</div>
          {addresses.length ? addresses.map((address) => (
            <div key={address.id} className="kv">
              <span className="kv-label">{address.label}</span>
              <span className="kv-value" style={{ textAlign: "right", maxWidth: "70%" }}>{[address.addressLine, address.district].filter(Boolean).join(" - ")}</span>
            </div>
          )) : <div className="cell-muted" style={{ fontSize: 12 }}>Nenhum endereço salvo</div>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => openChatForName(customer.name)}><Icon name="chat" size={14} />Conversar</button>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }}><Icon name="phone" size={14} />Ligar</button>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Lista de desejos</div>
          {customer.favorites.length ? customer.favorites.map((item, index) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: index ? "1px solid var(--border)" : "none" }}>
              <Icon name="star" size={13} style={{ color: "var(--warning)", flex: "none" }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{item}</span>
            </div>
          )) : <div className="cell-muted" style={{ fontSize: 12 }}>Nenhum item salvo</div>}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Produtos que costuma comprar</div>
          {regular.length ? regular.map((product, index) => (
            <div key={product.n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: index ? "1px solid var(--border)" : "none" }}>
              <Icon name="package" size={13} style={{ color: "var(--text-muted)", flex: "none" }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{product.n}</span>
            </div>
          )) : <div className="cell-muted" style={{ fontSize: 12 }}>Sem histórico de compras registrado</div>}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Uso contínuo</div>
          {continuous.length ? continuous.map((product, index) => {
            const subscription = findSubscription(product.n);
            return (
              <div key={product.n} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderTop: index ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12 }}>{product.n}</div>
                  <div style={{ marginTop: 4 }}>
                    {subscription ? <Badge tone="good"><Icon name="calendar" size={10} />Recorrência cadastrada</Badge> : <Badge tone="neutral">Sem recorrência cadastrada</Badge>}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>Oferecer recorrência</button>
              </div>
            );
          }) : <span className="cell-muted" style={{ fontSize: 12 }}>Nenhum medicamento contínuo identificado</span>}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Histórico de vendas registradas</div>
          {customerOrders.length ? customerOrders.map((order) => (
            <div key={order.id} className="kv"><span className="kv-label">{order.id} · {order.channel}</span><span className="kv-value">{brl(order.total)}</span></div>
          )) : <span className="cell-muted" style={{ fontSize: 12 }}>Sem compras recentes registradas</span>}
        </div>

        {customer.interests.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Interesses <span className="cell-muted" style={{ fontWeight: 500 }}>(inferidos da navegação)</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {customer.interests.map((interest) => <Badge key={interest} tone="accent">{interest}</Badge>)}
            </div>
          </div>
        )}
      </>
    );
  })();

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Clientes & vendas" title="Clientes" desc="CRM completo — nível, cashback, desejos, uso contínuo e histórico de compras."
        actions={<SearchInput value={query} onChange={setQuery} placeholder="Buscar cliente por nome" />}
      />
      <div className="card">
        <DataTable
          columns={columns}
          rows={list}
          rowKey="name"
          onRowClick={(entry) => setSelectedName(entry.name)}
          empty="Nenhum cliente carregado ainda"
        />
      </div>

      <Drawer open={!!customer} onClose={closeDetail} title={customer ? customer.name : ""} subtitle={customer ? `${customer.district} · cliente há ${customer.tenureMonths} meses` : ""}>
        {detail || <EmptyState icon="user" title="Nenhum cliente selecionado" />}
      </Drawer>
    </div>
  );
}

export { CrmScreen, tierTone };
