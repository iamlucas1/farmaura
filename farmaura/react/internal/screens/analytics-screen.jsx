import React, { useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { BarChart, Donut, StatCard } from "./dashboard-screen.jsx";
import { FinanceSection } from "./finance-screen.jsx";

/* FARMAURA Console — Análises: visão gerencial do faturamento, vendas, produtos,
   clientes, regiões, validade, cashback e comparação online × presencial.
   Tudo calculado a partir das vendas PAGAS (online com pagamento confirmado + balcão concluído). */

/* meses até o vencimento a partir de uma string MM/AAAA, sempre relativo à data real de hoje */
function monthsToExpiry(exp, today) {
  if (!exp || exp === '—') return null;
  const [m, y] = exp.split('/').map(Number);
  if (!m || !y) return null;
  const ref = today instanceof Date ? today : new Date();
  return (y - ref.getFullYear()) * 12 + (m - (ref.getMonth() + 1));
}

/* Cartão de seção com cabeçalho padronizado */
function AnCard({ icon, title, sub, right, tint, children, style }) {
  return (
    <div className="fa-card" style={{ padding: 20, ...style }}>
      <div className="an-cardhead">
        <span className="ic" style={tint ? { background: tint.bg, color: tint.fg } : undefined}><Icon name={icon} size={19} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{title}</div>
          {sub && <div className="ph-cell-sub">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/* Lista de barras ranqueadas (produtos, clientes, regiões, pagamento) */
function RankList({ items, accent = 'var(--fa-primary)', numbered }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((it, i) => (
        <div className="an-rank" key={i}>
          <div className="an-rank-top">
            {numbered && <span className="an-rank-rankn">{i + 1}º</span>}
            <span className="an-rank-label">{it.label}</span>
            <span className="an-rank-val">{it.valLabel}</span>
          </div>
          <div className="an-rank-bar"><i style={{ width: Math.max(3, Math.round((it.value / max) * 100)) + '%', background: it.color || accent }} /></div>
          {it.sub && <div className="ph-cell-sub" style={{ marginTop: 6 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function AnalyticsScreen({ ctx }) {
  const {
    orders, inventory, pdvSales, customers, onLogout, onNav,
    todayIso, todayLabel, chartSeed,
    financialMonths, financialSettingsBusy, financialSettingsError, saveFinancialMonth, retryFinancialSettings,
  } = ctx;
  const today = todayIso ? new Date(todayIso + 'T00:00:00') : new Date();
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
  const [period, setPeriod] = useState('week'); // hour | week
  const [view, setView] = useState('comercial'); // comercial | financeiro

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
  const cashbackToday = pdvSales.reduce((s, o) => s + (o.cashback || 0), 0)
    + paidOrders.reduce((s, o) => s + Math.round(o.total * 0.05 * 100) / 100, 0);

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
    const d = o.district || 'Retirada na loja';
    if (!regMap[d]) regMap[d] = { orders: 0, rev: 0 };
    regMap[d].orders += 1; regMap[d].rev += o.total;
  });
  const regions = Object.entries(regMap).map(([label, v]) => ({ label, value: v.orders, rev: v.rev }))
    .sort((a, b) => b.value - a.value);

  // -------- Formas de pagamento (por faturamento) --------
  const payNorm = (s) => { const k = (s || '').toLowerCase(); if (k.includes('pix')) return 'Pix'; if (k.includes('créd') || k.includes('cred')) return 'Crédito'; if (k.includes('déb') || k.includes('deb')) return 'Débito'; return 'Dinheiro'; };
  const payMethodMap = { pix: 'Pix', credit: 'Crédito', debit: 'Débito', cash: 'Dinheiro' };
  const payMap = {};
  const addPay = (label, val) => { payMap[label] = (payMap[label] || 0) + val; };
  paidOrders.forEach((o) => addPay(payNorm(o.payment), o.total));
  pdvSales.forEach((s) => addPay(payMethodMap[s.pay] || 'Dinheiro', s.total));
  const payColors = { 'Pix': 'var(--fa-success)', 'Crédito': 'var(--fa-primary)', 'Débito': 'var(--fa-info)', 'Dinheiro': 'var(--fa-warn)' };
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
  const cardRev = payments.filter((p) => p.label === 'Crédito' || p.label === 'Débito').reduce((s, p) => s + p.value, 0);
  const cardShare = revenue ? Math.round(cardRev / revenue * 100) : 58;

  return (
    <>
      <Topbar title="Análises" sub={view === 'comercial' ? ('Hoje · ' + (todayLabel || '')) : 'Projeção mensal'} onLogout={onLogout}>
        <div className="ph-seg" style={{ marginRight: 4 }}>
          <button data-on={view === 'comercial' ? '1' : '0'} onClick={() => setView('comercial')}><Icon name="trendup" size={14} />Vendas</button>
          <button data-on={view === 'financeiro' ? '1' : '0'} onClick={() => setView('financeiro')}><Icon name="percent" size={14} />Financeiro</button>
        </div>
        <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="download" size={15} />Exportar relatório</button>
      </Topbar>

      <div className="ph-content ph-content-wide">
        {/* Aviso da visão atual — mesmo padrão do Balcão (farmacêutico × caixa) */}
        <div className="pdv-rolebar" data-role={view === 'comercial' ? 'pharm' : 'caixa'}>
          <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none', background: 'rgba(255,255,255,.18)', color: '#fff' }}><Icon name={view === 'comercial' ? 'trendup' : 'percent'} size={19} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5 }}>{view === 'comercial' ? 'Visão comercial' : 'Visão financeira'}</div>
            <div style={{ fontSize: 12.5, opacity: .9 }}>{view === 'comercial'
              ? 'Faturamento, produtos, clientes, regiões e validade — desempenho das vendas com pagamento confirmado.'
              : 'Estimativa mensal de impostos (PIS, COFINS, ICMS), custos fixos, CMV e retorno do reinvestimento · selecione o mês, informe os valores e salve · Lucro Presumido.'}</div>
          </div>
          <span className="fa-badge" style={{ background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 11, flex: 'none' }}>{view === 'comercial' ? 'tempo real' : 'estimativa'}</span>
        </div>

        {view === 'comercial' ? (
        <>
        {/* KPIs principais */}
        <div className="ph-stats">
          <StatCard icon="money" value={brl(revenue)} label="Valor faturado (pago)" trend="+12%" trendDir="up" />
          <StatCard icon="bag" value={salesCount} label="Vendas concluídas" tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }} />
          <StatCard icon="receipt" value={brl(avgTicket)} label="Ticket médio" />
          <StatCard icon="gift" value={brl(cashbackTotal)} label="Cashback distribuído" tint={{ bg: 'var(--fa-rose-soft)', fg: 'var(--fa-primary)' }} />
        </div>

        {/* Faturamento por período + Online × Presencial */}
        <div className="an-grid-wide">
          <AnCard icon="trendup" title="Volume de vendas" sub={period === 'hour' ? 'Hoje · por faixa de horário' : 'Últimos 7 dias'}
            right={<div className="ph-seg"><button data-on={period === 'hour' ? '1' : '0'} onClick={() => setPeriod('hour')}>Por hora</button><button data-on={period === 'week' ? '1' : '0'} onClick={() => setPeriod('week')}>7 dias</button></div>}>
            {period === 'hour'
              ? <BarChart data={byHour.length ? byHour : [{ h: '0h', v: 0 }]} height={150} />
              : <BarChart data={week.length ? week : [{ d: 'Hoje', v: 0 }]} valueKey="v" labelKey="d" height={150} accent="var(--fa-info)" />}
            <div style={{ display: 'flex', gap: 24, borderTop: '1px solid var(--fa-mist)', marginTop: 16, paddingTop: 14 }}>
              <div><div className="ph-cell-sub">Pico</div><div style={{ fontWeight: 800, fontSize: 18 }}>{period === 'hour' ? '11h' : 'Sáb'}</div></div>
              <div><div className="ph-cell-sub">Total no período</div><div style={{ fontWeight: 800, fontSize: 18 }}>{(period === 'hour' ? byHour : week).reduce((s, d) => s + (Number(d && d.v) || 0), 0)} pedidos</div></div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div className="ph-cell-sub">vs. período anterior</div><div className="ph-stat-trend ph-trend-up" style={{ fontSize: 15, justifyContent: 'flex-end' }}><Icon name="chevD" size={14} style={{ transform: 'rotate(180deg)' }} />+12%</div></div>
            </div>
          </AnCard>

          <AnCard icon="repeat" title="Online × Presencial" sub="Participação no faturamento pago">
            <div className="an-vs">
              <Donut size={132} centerTop={brl(revenue)} centerSub="faturado" segments={[{ value: onlineRev, color: 'var(--fa-primary)' }, { value: pdvRev, color: 'var(--fa-info)' }]} />
              <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="an-vs-row">
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-primary)', flex: 'none' }} />
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>Online</div><div className="ph-cell-sub">{onlineCount} vendas · ticket {brl(onlineTicket)}</div></div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(onlineRev)}</div>
                </div>
                <div className="an-vs-row">
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-info)', flex: 'none' }} />
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>Presencial (balcão)</div><div className="ph-cell-sub">{pdvCount} vendas · ticket {brl(pdvTicket)}</div></div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{brl(pdvRev)}</div>
                </div>
                <div className="an-vs-row" style={{ borderBottom: 'none' }}>
                  <Icon name="sparkle" size={15} style={{ color: 'var(--fa-success)' }} />
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{Math.round(onlineRev / (revenue || 1) * 100)}% do faturamento vem do online</div>
                </div>
              </div>
            </div>
          </AnCard>
        </div>

        {/* Produtos que mais saem + Quem mais compra */}
        <div className="an-grid2">
          <AnCard icon="box" title="Produtos que mais saem" sub="Unidades vendidas no período">
            <RankList numbered items={topProducts.map((p) => ({
              label: p.name, value: p.units,
              valLabel: p.units + ' un', sub: brl(p.revenue) + ' em vendas',
            }))} />
          </AnCard>

          <AnCard icon="trophy" title="Quem mais compra" sub="Clientes por valor total gasto" tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }}
            right={<button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('crm')}>Ver CRM<Icon name="arrowR" size={14} /></button>}>
            <RankList numbered accent="var(--fa-warn)" items={topCustomers.map((c) => ({
              label: c.name, value: c.totalSpent,
              valLabel: brl(c.totalSpent), sub: c.orders + ' pedidos · ' + c.tier + ' · ticket ' + brl(c.avgTicket),
            }))} />
          </AnCard>
        </div>

        {/* Regiões + Pagamento */}
        <div className="an-grid2">
          <AnCard icon="pin" title="Regiões com mais pedidos" sub="Pedidos online por bairro" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }}>
            <RankList accent="var(--fa-info)" items={regions.map((r) => ({
              label: r.label, value: r.value,
              valLabel: r.value + (r.value === 1 ? ' pedido' : ' pedidos'), sub: brl(r.rev) + ' faturados',
            }))} />
          </AnCard>

          <AnCard icon="cash" title="Formas de pagamento" sub="Faturamento por meio de pagamento">
            <div className="an-vs" style={{ marginBottom: 6 }}>
              <Donut size={132} centerTop={brl(revenue)} centerSub="total" segments={payments.map((p) => ({ value: p.value, color: p.color }))} />
              <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {payments.map((p) => (
                  <div className="an-vs-row" key={p.label}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flex: 'none' }} />
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5 }}>{p.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{brl(p.value)}</div>
                    <div className="ph-cell-sub" style={{ width: 42, textAlign: 'right' }}>{Math.round(p.value / (revenue || 1) * 100)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </AnCard>
        </div>

        {/* Produtos próximos ao vencimento */}
        <div className="ph-sec-head">
          <div style={{ flex: 1 }}>
            <div className="ph-sec-title">Produtos próximos ao vencimento</div>
            <div className="ph-sec-sub">{nearExpiry.length} itens vencem em até 6 meses · {brl(riskValue)} em risco</div>
          </div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onNav('inventory')}>Ver estoque<Icon name="arrowR" size={15} /></button>
        </div>
        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead><tr><th>Produto</th><th>Validade</th><th>Prazo</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Em risco</th></tr></thead>
            <tbody>
              {nearExpiry.map((it) => {
                const vencido = it.mte < 0;
                const critico = it.mte <= 1;
                const badge = vencido
                  ? { label: 'Vencido', cls: 'fa-badge', st: { background: '#FBEAE9', color: 'var(--fa-error)' } }
                  : critico
                    ? { label: it.mte === 0 ? 'Vence este mês' : 'Vence em 1 mês', cls: 'fa-badge', st: { background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' } }
                    : { label: 'Em ' + it.mte + ' meses', cls: 'fa-badge', st: { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-2)' } };
                return (
                  <tr key={it.id}>
                    <td className="ph-td-name">{it.name}<div className="ph-cell-sub">{it.cat} · lote {it.batch}</div></td>
                    <td style={{ fontWeight: 700 }}>{it.expiry}</td>
                    <td><span className={badge.cls} style={badge.st}><Icon name={vencido ? 'alert' : 'clock'} size={11} />{badge.label}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{it.qty} un</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{brl(it.qty * it.price)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="repeat" size={13} style={{ color: 'var(--fa-success)' }} />{recurringShare}% da base é de clientes recorrentes · métricas calculadas sobre vendas com pagamento confirmado.
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
    </>
  );
}

export { AnCard, AnalyticsScreen, RankList, monthsToExpiry };
