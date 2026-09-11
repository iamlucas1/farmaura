import React, { useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { FinanceSection } from "./finance-screen.jsx";
import { Icon, PageHead, Badge, StatCard, PillNav } from "../core/internal-ui.jsx";

/* FARMAURA Console — Análises: visão gerencial do faturamento, vendas, produtos,
   clientes, regiões, validade, cashback e comparação online × presencial.
   Tudo calculado a partir das vendas PAGAS (online com pagamento confirmado + balcão concluído). */

/* meses até o vencimento a partir de uma string MM/AAAA, sempre relativo à data real de hoje */
function monthsToExpiry(exp, today) {
  if (!exp || exp === "—") return null;
  const [m, y] = exp.split("/").map(Number);
  if (!m || !y) return null;
  const ref = today instanceof Date ? today : new Date();
  return (y - ref.getFullYear()) * 12 + (m - (ref.getMonth() + 1));
}

/* Cartão de seção com cabeçalho padronizado — usado por Análises e Financeiro (finance-screen.jsx) */
function AnCard({ icon, title, sub, right, tint, children, style }) {
  return (
    <div className="card card-pad" style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span className="stat-icon" style={tint ? { background: tint.bg, color: tint.fg } : undefined}><Icon name={icon} size={19} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          {sub && <div className="cell-muted">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* Lista de barras ranqueadas (produtos, clientes, regiões, pagamento) */
function RankList({ items, accent = "var(--accent)", numbered }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {numbered && <span className="cell-muted" style={{ fontWeight: 700 }}>{i + 1}º</span>}
            <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            <span style={{ fontWeight: 800, fontSize: 13.5 }}>{it.valLabel}</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", marginTop: 8, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 99, width: Math.max(3, Math.round((it.value / max) * 100)) + "%", background: it.color || accent }} />
          </div>
          {it.sub && <div className="cell-muted" style={{ marginTop: 6 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* Gráfico de barras verticais simples (pedidos por hora / por dia) */
function BarChart({ data, height = 130, accent = "var(--accent)", valueKey = "v", labelKey = "h" }) {
  const max = Math.max(...data.map((entry) => entry[valueKey]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height }}>
      {data.map((entry, index) => {
        const barHeight = Math.max(4, Math.round((entry[valueKey] / max) * (height - 26)));
        return (
          <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)" }}>{entry[valueKey]}</div>
            <div title={entry[valueKey]} style={{ width: "100%", maxWidth: 30, height: barHeight, borderRadius: 6, background: index === data.length - 1 ? accent : `color-mix(in srgb, ${accent} 55%, var(--surface-2))`, transition: "height .3s" }} />
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600 }}>{entry[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

/* Anel/donut simples via SVG (participação por categoria) */
function Donut({ segments, size = 132, centerTop, centerSub = "pedidos" }) {
  const total = segments.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        {segments.map((segment, index) => {
          const length = (segment.value / total) * circumference;
          const element = <circle key={index} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth="14" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += length;
          return element;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div><div style={{ fontWeight: 800, fontSize: centerTop ? 17 : 24, lineHeight: 1 }}>{centerTop != null ? centerTop : total}</div><div className="cell-muted" style={{ fontSize: 11 }}>{centerSub}</div></div>
      </div>
    </div>
  );
}

function AnalyticsScreen({ ctx }) {
  const {
    orders, inventory, pdvSales, customers, onNav,
    todayIso, todayLabel, chartSeed,
    financialMonths, financialSettingsBusy, financialSettingsError, saveFinancialMonth, retryFinancialSettings,
  } = ctx;
  const today = todayIso ? new Date(todayIso + "T00:00:00") : new Date();
  const chartSource = chartSeed || {};
  const byHour = Array.isArray(chartSource.byHour)
    ? chartSource.byHour
    : Array.isArray(chartSource.hours)
      ? chartSource.hours
      : [];
  const week = Array.isArray(chartSource.week)
    ? chartSource.week
    : Array.isArray(chartSource.sales)
      ? chartSource.sales
      : [];
  const [period, setPeriod] = useState("week"); // hour | week
  const [view, setView] = useState("comercial"); // comercial | financeiro

  // -------- Universo de vendas PAGAS --------
  const paidOrders = orders.filter((o) => /pago/i.test(o.payment)); // online com pagamento confirmado
  const onlineCount = paidOrders.length;
  const onlineRev = paidOrders.reduce((s, o) => s + o.total, 0);
  const pdvCount = pdvSales.length;
  const pdvRev = pdvSales.reduce((s, o) => s + o.total, 0);

  const salesCount = onlineCount + pdvCount;
  const revenue = onlineRev + pdvRev;
  const avgTicket = salesCount ? revenue / salesCount : 0;
  const onlineTicket = onlineCount ? onlineRev / onlineCount : 0;
  const pdvTicket = pdvCount ? pdvRev / pdvCount : 0;

  // cashback distribuído (acumulado dos clientes) + creditado hoje
  const cashbackTotal = customers.reduce((s, c) => s + (c.cashback || 0), 0);

  // -------- Produtos que mais saem --------
  const prodMap = {};
  const addItems = (items) => items.forEach((it) => {
    const inv = inventory.find((x) => x.id === it.id);
    if (!prodMap[it.id]) prodMap[it.id] = { name: (inv && inv.name) || it.name, price: inv ? inv.price : (it.price || 0), units: 0 };
    prodMap[it.id].units += it.qty;
  });
  paidOrders.forEach((o) => addItems(o.items));
  pdvSales.forEach((s) => addItems(s.items));
  const topProducts = Object.values(prodMap)
    .map((p) => ({ ...p, revenue: p.units * p.price }))
    .sort((a, b) => b.units - a.units).slice(0, 6);

  // -------- Quem mais compra --------
  const topCustomers = [...customers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 6);

  // -------- Regiões com mais pedidos (online, por bairro) --------
  const regMap = {};
  paidOrders.forEach((o) => {
    const d = o.district || "Retirada na loja";
    if (!regMap[d]) regMap[d] = { orders: 0, rev: 0 };
    regMap[d].orders += 1; regMap[d].rev += o.total;
  });
  const regions = Object.entries(regMap).map(([label, v]) => ({ label, value: v.orders, rev: v.rev }))
    .sort((a, b) => b.value - a.value);

  // -------- Formas de pagamento (por faturamento) --------
  const payNorm = (s) => { const k = (s || "").toLowerCase(); if (k.includes("pix")) return "Pix"; if (k.includes("créd") || k.includes("cred")) return "Crédito"; if (k.includes("déb") || k.includes("deb")) return "Débito"; return "Dinheiro"; };
  const payMethodMap = { pix: "Pix", credit: "Crédito", debit: "Débito", cash: "Dinheiro" };
  const payMap = {};
  const addPay = (label, val) => { payMap[label] = (payMap[label] || 0) + val; };
  paidOrders.forEach((o) => addPay(payNorm(o.payment), o.total));
  pdvSales.forEach((s) => addPay(payMethodMap[s.pay] || "Dinheiro", s.total));
  const payColors = { Pix: "var(--good)", Crédito: "var(--brand)", Débito: "var(--info)", Dinheiro: "var(--warning)" };
  const payments = Object.entries(payMap).map(([label, value]) => ({ label, value, color: payColors[label] })).sort((a, b) => b.value - a.value);

  // -------- Produtos próximos ao vencimento --------
  const nearExpiry = inventory
    .map((it) => ({ ...it, mte: monthsToExpiry(it.expiry, today) }))
    .filter((it) => it.mte !== null && it.mte <= 6)
    .sort((a, b) => a.mte - b.mte);
  const riskValue = nearExpiry.reduce((s, it) => s + it.qty * it.price, 0);

  const recurringShare = customers.length ? Math.round(customers.filter((c) => c.recurring).length / customers.length * 100) : 0;

  // -------- Base para a estimativa de impostos/custos/ROI (projeção mensal) --------
  const weeklyOrders = week.reduce((s, d) => s + (Number(d && d.v) || 0), 0);
  const monthlyRevenue = Math.round(weeklyOrders * (avgTicket || 0) * 4.345);
  const cardRev = payments.filter((p) => p.label === "Crédito" || p.label === "Débito").reduce((s, p) => s + p.value, 0);
  const cardShare = revenue ? Math.round(cardRev / revenue * 100) : 58;

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Clientes & vendas"
        title="Análises"
        desc={view === "comercial" ? ("Hoje · " + (todayLabel || "")) : "Projeção mensal"}
        actions={(
          <>
            <PillNav
              options={[{ key: "comercial", label: "Vendas" }, { key: "financeiro", label: "Financeiro" }]}
              active={view} onChange={setView}
            />
            <button className="btn btn-secondary btn-sm"><Icon name="download" size={15} />Exportar relatório</button>
          </>
        )}
      />

      {view === "comercial" ? (
        <>
          {/* KPIs principais */}
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <StatCard icon="money" value={brl(revenue)} label="Valor faturado (pago)" delta="+12%" deltaTone="up" />
            <StatCard icon="bag" value={salesCount} label="Vendas concluídas" tone="good" />
            <StatCard icon="receipt" value={brl(avgTicket)} label="Ticket médio" />
            <StatCard icon="gift" value={brl(cashbackTotal)} label="Cashback distribuído" tone="accent" />
          </div>

          {/* Faturamento por período + Online × Presencial */}
          <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
            <AnCard
              icon="trendup" title="Volume de vendas" sub={period === "hour" ? "Hoje · por faixa de horário" : "Últimos 7 dias"}
              right={<PillNav options={[{ key: "hour", label: "Por hora" }, { key: "week", label: "7 dias" }]} active={period} onChange={setPeriod} />}
            >
              {period === "hour"
                ? <BarChart data={byHour.length ? byHour : [{ h: "0h", v: 0 }]} height={150} />
                : <BarChart data={week.length ? week : [{ d: "Hoje", v: 0 }]} valueKey="v" labelKey="d" height={150} accent="var(--info)" />}
              <div style={{ display: "flex", gap: 24, borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 14 }}>
                <div><div className="cell-muted">Pico</div><div style={{ fontWeight: 800, fontSize: 18 }}>{period === "hour" ? "11h" : "Sáb"}</div></div>
                <div><div className="cell-muted">Total no período</div><div style={{ fontWeight: 800, fontSize: 18 }}>{(period === "hour" ? byHour : week).reduce((s, d) => s + (Number(d && d.v) || 0), 0)} pedidos</div></div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}><div className="cell-muted">vs. período anterior</div><div style={{ fontSize: 15, fontWeight: 800, color: "var(--good)", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><Icon name="arrowupright" size={14} />+12%</div></div>
              </div>
            </AnCard>

            <AnCard icon="repeat" title="Online × Presencial" sub="Participação no faturamento pago">
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <Donut size={132} centerTop={brl(revenue)} centerSub="faturado" segments={[{ value: onlineRev, color: "var(--brand)" }, { value: pdvRev, color: "var(--info)" }]} />
                <div style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--brand)", flex: "none" }} />
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>Online</div><div className="cell-muted">{onlineCount} vendas · ticket {brl(onlineTicket)}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(onlineRev)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--info)", flex: "none" }} />
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>Presencial (balcão)</div><div className="cell-muted">{pdvCount} vendas · ticket {brl(pdvTicket)}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(pdvRev)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                    <Icon name="sparkle" size={15} style={{ color: "var(--good)" }} />
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{Math.round(onlineRev / (revenue || 1) * 100)}% do faturamento vem do online</div>
                  </div>
                </div>
              </div>
            </AnCard>
          </div>

          {/* Produtos que mais saem + Quem mais compra */}
          <div className="grid g-2" style={{ marginBottom: 16 }}>
            <AnCard icon="box" title="Produtos que mais saem" sub="Unidades vendidas no período">
              <RankList numbered items={topProducts.map((p) => ({
                label: p.name, value: p.units,
                valLabel: p.units + " un", sub: brl(p.revenue) + " em vendas",
              }))} />
            </AnCard>

            <AnCard icon="trophy" title="Quem mais compra" sub="Clientes por valor total gasto" tint={{ bg: "var(--warning-soft)", fg: "var(--warning)" }}
              right={<button className="btn btn-secondary btn-sm" onClick={() => onNav("crm")}>Ver CRM<Icon name="arrowR" size={14} /></button>}>
              <RankList numbered accent="var(--warning)" items={topCustomers.map((c) => ({
                label: c.name, value: c.totalSpent,
                valLabel: brl(c.totalSpent), sub: c.orders + " pedidos · " + c.tier + " · ticket " + brl(c.avgTicket),
              }))} />
            </AnCard>
          </div>

          {/* Regiões + Pagamento */}
          <div className="grid g-2" style={{ marginBottom: 16 }}>
            <AnCard icon="pin" title="Regiões com mais pedidos" sub="Pedidos online por bairro" tint={{ bg: "var(--info-soft)", fg: "var(--info)" }}>
              <RankList accent="var(--info)" items={regions.map((r) => ({
                label: r.label, value: r.value,
                valLabel: r.value + (r.value === 1 ? " pedido" : " pedidos"), sub: brl(r.rev) + " faturados",
              }))} />
            </AnCard>

            <AnCard icon="cash" title="Formas de pagamento" sub="Faturamento por meio de pagamento">
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <Donut size={132} centerTop={brl(revenue)} centerSub="total" segments={payments.map((p) => ({ value: p.value, color: p.color }))} />
                <div style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 2 }}>
                  {payments.map((p) => (
                    <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flex: "none" }} />
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{p.label}</div>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{brl(p.value)}</div>
                      <div className="cell-muted" style={{ width: 42, textAlign: "right" }}>{Math.round(p.value / (revenue || 1) * 100)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </AnCard>
          </div>

          {/* Produtos próximos ao vencimento */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Produtos próximos ao vencimento</div>
              <div className="cell-muted">{nearExpiry.length} itens vencem em até 6 meses · {brl(riskValue)} em risco</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNav("inventory")}>Ver estoque<Icon name="arrowR" size={15} /></button>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Produto</th><th>Validade</th><th>Prazo</th><th style={{ textAlign: "right" }}>Qtd</th><th style={{ textAlign: "right" }}>Em risco</th></tr></thead>
                <tbody>
                  {nearExpiry.map((it) => {
                    const vencido = it.mte < 0;
                    const critico = it.mte <= 1;
                    const tone = vencido ? "critical" : critico ? "warning" : "neutral";
                    const label = vencido ? "Vencido" : critico ? (it.mte === 0 ? "Vence este mês" : "Vence em 1 mês") : "Em " + it.mte + " meses";
                    return (
                      <tr key={it.id}>
                        <td className="cell-strong">{it.name}<div className="cell-muted">{it.cat} · lote {it.batch}</div></td>
                        <td style={{ fontWeight: 700 }}>{it.expiry}</td>
                        <td><Badge tone={tone}><Icon name={vencido ? "alert" : "clock"} size={11} />{label}</Badge></td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{it.qty} un</td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>{brl(it.qty * it.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cell-muted" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="repeat" size={13} style={{ color: "var(--good)" }} />{recurringShare}% da base é de clientes recorrentes · métricas calculadas sobre vendas com pagamento confirmado.
          </div>
        </>
      ) : (
        <FinanceSection
          monthlyRevenue={monthlyRevenue}
          cardShare={cardShare}
          financialMonths={financialMonths}
          financialBusy={financialSettingsBusy}
          financialError={financialSettingsError}
          onSaveFinancialMonth={saveFinancialMonth}
          onRetryFinancialSettings={retryFinancialSettings}
        />
      )}
    </div>
  );
}

export { AnCard, AnalyticsScreen, BarChart, Donut, RankList, monthsToExpiry };
