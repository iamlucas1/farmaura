import React, { useState } from "react";
import { Icon, StatCard, Badge } from "../core/internal-ui.jsx";
import { AnCard, Donut } from "./analytics-screen.jsx";

/* FARMAURA Console — Análises › Impostos, custos e ROI.
   Estimativa gerencial MENSAL a partir do faturamento projetado (≈30 dias).
   Regime Lucro Presumido (comércio varejista de medicamentos).
   Premissas editáveis recalculam toda a seção em tempo real.
   Meses e valores vêm sempre de /portal/internal/financial-settings — nunca de localStorage. */

/* formatadores locais */
const _br = (n, d = 0) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const _kbr = (n) => (n >= 1000 ? "R$ " + (n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: n >= 10000 ? 0 : 1, maximumFractionDigits: n >= 10000 ? 0 : 1 }) + " mil" : _br(n));
const _pct = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

/* paleta harmônica para as muitas fatias de custo (tokens do design system + oklch suaves) */
const FIN_C = {
  primary: "var(--brand)", info: "var(--info)", vital: "var(--critical)",
  warn: "var(--warning)", success: "var(--good)",
  teal: "oklch(0.64 0.085 205)", plum: "oklch(0.56 0.09 332)",
  sand: "oklch(0.71 0.075 72)", slate: "oklch(0.60 0.035 262)",
};

const ZERO_MONTH = { faturamento: 0, aluguel: 0, energia: 0, agua: 0, contab: 0, licencas: 0, manut: 0, folha: 0, cmvPct: 0, icmsPct: 0, reinvPct: 0, roiAa: 0 };

/* rótulos curto/longo de um mês a partir da chave AAAA-MM, sem nada fixado */
const MONTH_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function monthKeyMeta(key) {
  const [y, m] = String(key || "").split("-").map(Number);
  const idx = Math.min(11, Math.max(0, (m || 1) - 1));
  return { k: key, s: MONTH_SHORT[idx], l: MONTH_LONG[idx] + "/" + (y || "") };
}
function currentMonthKey() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

/* stepper numérico compacto */
function FinStepper({ value, onChange, step = 50, min = 0, max = 1e9, pct = false, disabled = false }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 28, height: 28, padding: 0, justifyContent: "center" }} disabled={disabled} onClick={() => onChange(clamp(value - step))} aria-label="diminuir">−</button>
      <input type="number" className="input" style={{ width: pct ? 70 : 110, textAlign: "center" }} disabled={disabled} value={value} onChange={(e) => { const v = parseFloat(e.target.value); onChange(isNaN(v) ? min : clamp(v)); }} />
      <button type="button" className="btn btn-secondary btn-sm" style={{ width: 28, height: 28, padding: 0, justifyContent: "center" }} disabled={disabled} onClick={() => onChange(clamp(value + step))} aria-label="aumentar">+</button>
    </span>
  );
}

/* linha de premissa editável */
function PremRow({ icon, label, sub, pre, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <span className="stat-icon" style={{ width: 32, height: 32, flex: "none" }}><Icon name={icon} size={17} /></span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
        {sub && <div className="cell-muted">{sub}</div>}
      </div>
      {pre && <span className="cell-muted" style={{ fontWeight: 700 }}>{pre}</span>}
      {children}
    </div>
  );
}

/* linha de detalhe (imposto ou custo) */
function FinLine({ color, name, sub, rate, amount, share }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
        {sub && <div className="cell-muted" style={{ fontSize: 11 }}>{sub}</div>}
      </div>
      {rate && <span className="cell-muted" style={{ fontWeight: 700 }}>{rate}</span>}
      <span style={{ fontWeight: 800, fontSize: 13 }}>{_br(amount)}{share != null && <span style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 11.5, marginLeft: 6 }}>{share}%</span>}</span>
    </div>
  );
}

function FinanceSection({ monthlyRevenue, cardShare, financialMonths, financialBusy, financialError, onSaveFinancialMonth, onRetryFinancialSettings }) {
  const storedMonths = financialMonths && typeof financialMonths === "object" ? financialMonths : null;

  if (financialError) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }} data-screen-label="Análises · Financeiro e impostos">
        <Icon name="alert" size={22} style={{ color: "var(--critical)" }} />
        <div style={{ fontWeight: 800, marginTop: 10 }}>Não foi possível carregar as premissas financeiras</div>
        <div className="cell-muted" style={{ marginTop: 4 }}>{financialError}</div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={onRetryFinancialSettings}><Icon name="refresh" size={14} />Tentar novamente</button>
      </div>
    );
  }

  if (!storedMonths) {
    return (
      <div className="card card-pad" style={{ textAlign: "center" }} data-screen-label="Análises · Financeiro e impostos">
        <div className="cell-muted">Carregando premissas financeiras…</div>
      </div>
    );
  }

  const monthKeys = Object.keys(storedMonths).sort();
  const preferredMonth = monthKeys.includes(currentMonthKey()) ? currentMonthKey() : (monthKeys[monthKeys.length - 1] || currentMonthKey());
  const [month, setMonth] = useState(preferredMonth);
  const [draftMonths, setDraftMonths] = useState(storedMonths);
  const [addingMonth, setAddingMonth] = useState(false);
  const [newMonthKey, setNewMonthKey] = useState("");

  const seedFor = (m) => {
    if (draftMonths[m]) return { faturamento: monthlyRevenue, ...draftMonths[m] };
    const prev = monthKeys.filter((k) => k < m).sort().pop();
    return prev && draftMonths[prev] ? { ...ZERO_MONTH, ...draftMonths[prev], faturamento: monthlyRevenue } : { ...ZERO_MONTH, faturamento: monthlyRevenue };
  };
  const [prem, setPrem] = useState(() => seedFor(preferredMonth));
  const setP = (key, v) => setPrem((p) => ({ ...p, [key]: v }));
  const selectMonth = (m) => { if (m === month) return; setMonth(m); setPrem(seedFor(m)); };
  const savedPrem = draftMonths[month];
  const dirty = !savedPrem || JSON.stringify({ ...ZERO_MONTH, ...savedPrem }) !== JSON.stringify({ ...ZERO_MONTH, ...prem });
  const [saving, setSaving] = useState(false);
  const saveMonth = async () => {
    setSaving(true);
    try {
      const nextMonths = { ...draftMonths, [month]: prem };
      const persisted = await onSaveFinancialMonth(nextMonths);
      setDraftMonths(persisted || nextMonths);
    } finally {
      setSaving(false);
    }
  };
  const resetMonth = () => setPrem(savedPrem ? { ...ZERO_MONTH, ...savedPrem } : { ...ZERO_MONTH, faturamento: monthlyRevenue });
  const confirmNewMonth = () => {
    if (!/^\d{4}-\d{2}$/.test(newMonthKey)) return;
    setDraftMonths((prev) => ({ ...prev, [newMonthKey]: prev[newMonthKey] || { ...ZERO_MONTH } }));
    setMonth(newMonthKey);
    setPrem(draftMonths[newMonthKey] || { ...ZERO_MONTH });
    setAddingMonth(false);
    setNewMonthKey("");
  };
  const monthMeta = monthKeyMeta(month);

  const { aluguel, energia, agua, contab, licencas, manut, folha, cmvPct, icmsPct, reinvPct, roiAa } = prem;
  const R = Number(prem.faturamento) || 0;

  /* ---- tributos (Lucro Presumido) ---- */
  const RATE = { pis: 0.65, cofins: 3.0, irpj: 1.2, csll: 1.08 };
  const mdrPct = 2.2; // taxa média da maquininha
  const taxes = [
    { key: "icms", name: "ICMS", sub: "efetivo, líquido de ST", color: FIN_C.vital, rate: icmsPct, val: R * icmsPct / 100 },
    { key: "cofins", name: "COFINS", sub: "cumulativo", color: FIN_C.primary, rate: RATE.cofins, val: R * RATE.cofins / 100 },
    { key: "pis", name: "PIS", sub: "cumulativo", color: FIN_C.info, rate: RATE.pis, val: R * RATE.pis / 100 },
    { key: "irpj", name: "IRPJ", sub: "presunção 8%", color: FIN_C.warn, rate: RATE.irpj, val: R * RATE.irpj / 100 },
    { key: "csll", name: "CSLL", sub: "presunção 12%", color: FIN_C.success, rate: RATE.csll, val: R * RATE.csll / 100 },
  ];
  const taxTotal = taxes.reduce((s, t) => s + t.val, 0);
  const taxLoad = R ? taxTotal / R * 100 : 0;

  /* ---- custos / despesas ---- */
  const cmv = R * cmvPct / 100;
  const mdr = R * (cardShare / 100) * mdrPct / 100;
  const costs = [
    { name: "Medicamentos e produtos (CMV)", sub: "custo das mercadorias vendidas", color: FIN_C.primary, val: cmv },
    { name: "Folha de pagamento", sub: "salários + encargos da equipe", color: FIN_C.info, val: folha },
    { name: "Aluguel do ponto", sub: "loja + condomínio", color: FIN_C.vital, val: aluguel },
    { name: "Energia elétrica", sub: "iluminação, refrigeração, ar", color: FIN_C.warn, val: energia },
    { name: "Água e esgoto", sub: "consumo + tarifa", color: FIN_C.teal, val: agua },
    { name: "Contabilidade", sub: "escritório contábil + folha", color: FIN_C.plum, val: contab },
    { name: "Licenças e alvarás", sub: "Vig. Sanitária, CRF, Bombeiros (rateio)", color: FIN_C.sand, val: licencas },
    { name: "Maquininha (MDR)", sub: "taxa de cartão " + _pct(mdrPct) + " · " + Math.round(cardShare) + "% das vendas", color: FIN_C.slate, val: mdr },
    { name: "Manutenção e segurança", sub: "extintor, gesso, reparos, dedetização", color: FIN_C.success, val: manut },
  ];
  const opex = costs.slice(1).reduce((s, c) => s + c.val, 0); // tudo menos CMV
  const costTotal = cmv + opex;
  const netProfit = R - taxTotal - costTotal;
  const margin = R ? netProfit / R * 100 : 0;
  const positive = netProfit >= 0;

  /* ---- cascata (DRE) ---- */
  const flow = [
    { lab: "Faturamento bruto", icon: "money", color: FIN_C.info, val: R, sign: 1 },
    { lab: "Impostos", icon: "percent", color: FIN_C.vital, val: taxTotal, sign: -1 },
    { lab: "Custo dos produtos", icon: "box", color: FIN_C.warn, val: cmv, sign: -1 },
    { lab: "Despesas operacionais", icon: "store", color: FIN_C.slate, val: opex, sign: -1 },
  ];

  /* ---- ROI do reinvestimento ---- */
  const reinvMensal = positive ? netProfit * reinvPct / 100 : 0;
  const r = (roiAa / 100) / 12;
  const fv = (m) => (r > 0 ? reinvMensal * ((Math.pow(1 + r, m) - 1) / r) : reinvMensal * m);
  const aportes12 = reinvMensal * 12;
  const cap12 = fv(12);
  const retorno12 = cap12 - aportes12;
  const roiPct = aportes12 ? retorno12 / aportes12 * 100 : 0;
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const capMax = cap12 || 1;

  return (
    <div data-screen-label="Análises · Financeiro e impostos">
      {/* Seletor de mês + salvar (valores variam por mês, sempre persistidos no backend) */}
      <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="stat-icon"><Icon name="calendar" size={19} /></span>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Mês de referência · {monthMeta.l}</div>
          <div className="cell-muted">Informe os valores reais de cada mês e salve — ficam guardados na conta da loja.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {monthKeys.map((k) => {
            const meta = monthKeyMeta(k);
            const on = month === k;
            return (
              <button
                key={k} type="button" className="btn btn-sm" onClick={() => selectMonth(k)}
                style={on ? { background: "var(--accent)", color: "var(--accent-contrast)", border: "1px solid var(--accent)" } : { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
              >
                {meta.s}/{k.slice(2, 4)}{draftMonths[k] && <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? "currentColor" : "var(--good)", display: "inline-block", marginLeft: 5 }} title="mês salvo" />}
              </button>
            );
          })}
          {addingMonth ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="month" className="input" style={{ height: 30 }} value={newMonthKey} onChange={(e) => setNewMonthKey(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmNewMonth}><Icon name="check" size={13} /></button>
            </span>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" style={{ width: 30, padding: 0, justifyContent: "center" }} onClick={() => setAddingMonth(true)} title="Adicionar mês"><Icon name="plus" size={14} /></button>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {dirty
            ? <Badge tone="warning">Não salvo</Badge>
            : <Badge tone="good"><Icon name="check" size={13} />Salvo</Badge>}
          <button className="btn btn-primary btn-sm" onClick={saveMonth} disabled={!dirty || saving}><Icon name="check" size={15} />{saving ? "Salvando…" : "Salvar mês"}</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatCard icon="money" value={_br(R)} label={"Faturamento · " + monthMeta.l} />
        <StatCard icon="percent" value={_br(taxTotal)} label={"Impostos no mês · " + _pct(taxLoad) + " do faturamento"} tone="warning" />
        <StatCard icon="store" value={_br(costTotal)} label="Custos e despesas operacionais" tone="accent" />
        <StatCard icon="trendup" value={_br(netProfit)} label={"Lucro líquido · margem " + _pct(margin)} tone={positive ? "good" : "critical"} />
      </div>

      {/* Cascata + Impostos */}
      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
        <AnCard icon="repeat" title="Do faturamento ao lucro" sub="Cascata mensal · quanto sobra a cada etapa">
          <div>
            {flow.map((f) => (
              <div key={f.lab} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: 170, flex: "none" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, flex: "none" }} /><span style={{ fontSize: 13 }}>{f.lab}</span></div>
                <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: Math.max(2, Math.round((f.val / (R || 1)) * 100)) + "%", background: f.color }} /></div>
                <div style={{ width: 100, flex: "none", textAlign: "right", fontWeight: 700, fontSize: 13, color: f.sign < 0 ? "var(--text-secondary)" : "var(--text-primary)" }}>{f.sign < 0 ? "– " : ""}{_br(f.val)}</div>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--border)", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 170, flex: "none" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: positive ? "var(--good)" : "var(--critical)", flex: "none" }} /><span style={{ fontWeight: 700, fontSize: 13 }}>Lucro líquido</span></div>
              <div style={{ flex: 1, height: 8, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: Math.max(2, Math.min(100, Math.round((Math.abs(netProfit) / (R || 1)) * 100))) + "%", background: positive ? "var(--good)" : "var(--critical)" }} /></div>
              <div style={{ width: 100, flex: "none", textAlign: "right", fontWeight: 800, fontSize: 13, color: positive ? "var(--good)" : "var(--critical)" }}>{_br(netProfit)}</div>
            </div>
          </div>
          <div className="cell-muted" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="sparkle" size={13} style={{ color: "var(--good)", flex: "none" }} /><span>De cada R$ 100 faturados, sobram <b>{_br(margin, 2)}</b> de lucro depois de impostos e custos.</span>
          </div>
        </AnCard>

        <AnCard icon="percent" title="Impostos do mês" sub={"Carga tributária " + _pct(taxLoad)} tint={{ bg: "var(--warning-soft)", fg: "var(--warning)" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
            <Donut size={128} centerTop={_kbr(taxTotal)} centerSub="impostos/mês" segments={taxes.map((t) => ({ value: t.val, color: t.color }))} />
            <div style={{ flex: 1, minWidth: 130 }}>
              {taxes.map((t) => (
                <FinLine key={t.key} color={t.color} name={t.name} sub={t.sub} rate={_pct(t.rate)} amount={t.val} />
              ))}
            </div>
          </div>
          <div className="cell-muted" style={{ marginTop: 4 }}>ICMS estimado já líquido de substituição tributária (boa parte dos medicamentos é recolhida na origem).</div>
        </AnCard>
      </div>

      {/* Custos + ROI */}
      <div className="grid g-2" style={{ marginBottom: 4 }}>
        <AnCard icon="store" title="Onde vai o dinheiro" sub="Composição dos custos e despesas do mês" tint={{ bg: "var(--info-soft)", fg: "var(--info)" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Donut size={128} centerTop={_kbr(costTotal)} centerSub="custos/mês" segments={costs.map((c) => ({ value: c.val, color: c.color }))} />
            <div style={{ flex: 1, minWidth: 180 }}>
              {costs.map((c) => (
                <FinLine key={c.name} color={c.color} name={c.name} sub={c.sub} amount={c.val} share={Math.round(c.val / costTotal * 100)} />
              ))}
            </div>
          </div>
        </AnCard>

        <AnCard icon="bank" title="ROI do reinvestimento" sub={"Reinvestindo " + reinvPct + "% do lucro · retorno de " + roiAa + "% a.a."} tint={{ bg: "var(--good-soft)", fg: "var(--good)" }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12 }}>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>{_br(reinvMensal)}</div><div className="cell-muted">Reinvestido por mês</div></div>
            <div><div style={{ fontWeight: 800, fontSize: 18, color: "var(--good)" }}>+{_br(retorno12)}</div><div className="cell-muted">Retorno projetado (12 meses)</div></div>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>{_pct(roiPct)}</div><div className="cell-muted">ROI em 12 meses</div></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
            {months.map((m) => {
              const base = reinvMensal * m, total = fv(m), ret = total - base;
              const barHeight = Math.max(3, total / capMax * 100);
              return (
                <div key={m} title={"Mês " + m + " · capital " + _br(total)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", maxWidth: 20, height: barHeight + "%", borderRadius: "var(--radius-sm) var(--radius-sm) 0 0", background: "var(--info)", display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
                    <div style={{ height: Math.round(ret / (total || 1) * 100) + "%", background: "var(--good)" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{m}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <span className="cell-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--info)" }} />Capital aportado · {_br(aportes12)}</span>
            <span className="cell-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--good)" }} />Rendimento acumulado</span>
            <span className="cell-muted" style={{ marginLeft: "auto", fontWeight: 700 }}>Capital ao fim de 12 m · {_br(cap12)}</span>
          </div>
          {!positive && <div className="cell-muted" style={{ marginTop: 10, color: "var(--critical)" }}>Sem lucro no mês não há reinvestimento — ajuste as premissas abaixo.</div>}
        </AnCard>
      </div>

      {/* Premissas */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 10, marginBottom: 6 }}>
          <span className="stat-icon"><Icon name="scale" size={19} /></span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Premissas de {monthMeta.l}</div>
            <div className="cell-muted">Digite os valores reais do mês — impostos, custos, ROI e lucro recalculam na hora</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {dirty
              ? <Badge tone="warning">Alterações não salvas</Badge>
              : <Badge tone="good"><Icon name="check" size={13} />Tudo salvo</Badge>}
            <button className="btn btn-secondary btn-sm" onClick={resetMonth} disabled={!dirty}><Icon name="refresh" size={14} />Desfazer</button>
            <button className="btn btn-primary btn-sm" onClick={saveMonth} disabled={!dirty || saving}><Icon name="check" size={15} />{saving ? "Salvando…" : "Salvar mês"}</button>
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--text-muted)", marginTop: 14 }}>Faturamento do mês</div>
        <PremRow icon="money" label="Faturamento bruto" sub="receita total de vendas no mês" pre="R$"><FinStepper value={prem.faturamento} onChange={(v) => setP("faturamento", v)} step={1000} /></PremRow>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />
        <div style={{ fontWeight: 800, fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--text-muted)" }}>Custos fixos mensais</div>
        <PremRow icon="store" label="Aluguel do ponto" sub="loja + condomínio" pre="R$"><FinStepper value={aluguel} onChange={(v) => setP("aluguel", v)} step={250} /></PremRow>
        <PremRow icon="bolt" label="Energia elétrica" pre="R$"><FinStepper value={energia} onChange={(v) => setP("energia", v)} step={100} /></PremRow>
        <PremRow icon="drop" label="Água e esgoto" pre="R$"><FinStepper value={agua} onChange={(v) => setP("agua", v)} step={20} /></PremRow>
        <PremRow icon="scale" label="Contabilidade" sub="escritório contábil" pre="R$"><FinStepper value={contab} onChange={(v) => setP("contab", v)} step={50} /></PremRow>
        <PremRow icon="doc" label="Licenças e alvarás" sub="Vig. Sanitária, CRF, Bombeiros" pre="R$"><FinStepper value={licencas} onChange={(v) => setP("licencas", v)} step={20} /></PremRow>
        <PremRow icon="wrench" label="Manutenção e segurança" sub="extintor, gesso, reparos" pre="R$"><FinStepper value={manut} onChange={(v) => setP("manut", v)} step={20} /></PremRow>
        <PremRow icon="user" label="Folha de pagamento" sub="salários + encargos" pre="R$"><FinStepper value={folha} onChange={(v) => setP("folha", v)} step={500} /></PremRow>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />
        <div style={{ fontWeight: 800, fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".03em", color: "var(--text-muted)" }}>Tributação, margem e reinvestimento</div>
        <PremRow icon="box" label="Custo dos produtos (CMV)" sub="% do faturamento"><FinStepper value={cmvPct} onChange={(v) => setP("cmvPct", v)} step={1} max={95} pct /><span className="cell-muted" style={{ marginLeft: 8, fontWeight: 700 }}>%</span></PremRow>
        <PremRow icon="percent" label="ICMS efetivo" sub="líquido de ST · varia por estado"><FinStepper value={icmsPct} onChange={(v) => setP("icmsPct", v)} step={0.5} max={25} pct /><span className="cell-muted" style={{ marginLeft: 8, fontWeight: 700 }}>%</span></PremRow>
        <PremRow icon="bank" label="Reinvestimento do lucro" sub="% do lucro líquido"><FinStepper value={reinvPct} onChange={(v) => setP("reinvPct", v)} step={5} max={100} pct /><span className="cell-muted" style={{ marginLeft: 8, fontWeight: 700 }}>%</span></PremRow>
        <PremRow icon="trendup" label="Retorno esperado" sub="rentabilidade anual do reinvestimento"><FinStepper value={roiAa} onChange={(v) => setP("roiAa", v)} step={1} max={60} pct /><span className="cell-muted" style={{ marginLeft: 8, fontWeight: 700 }}>% a.a.</span></PremRow>

        <div className="cell-muted" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="shield" size={13} style={{ color: "var(--info)", flex: "none" }} /><span>PIS (0,65%) e COFINS (3%) são cumulativos; IRPJ e CSLL seguem a presunção do Lucro Presumido para comércio. Estimativa de apoio à gestão, não substitui a apuração contábil.</span>
        </div>
      </div>
    </div>
  );
}

export { FIN_C, FinLine, FinStepper, FinanceSection, PremRow, monthKeyMeta, currentMonthKey };
