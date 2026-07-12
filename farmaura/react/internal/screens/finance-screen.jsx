import React, { useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Donut, StatCard } from "./dashboard-screen.jsx";
import { AnCard } from "./analytics-screen.jsx";

/* FARMAURA Console — Análises › Impostos, custos e ROI.
   Estimativa gerencial MENSAL a partir do faturamento projetado (≈30 dias).
   Regime Lucro Presumido (comércio varejista de medicamentos).
   Premissas editáveis recalculam toda a seção em tempo real.
   Meses e valores vêm sempre de /portal/internal/financial-settings — nunca de localStorage. */

/* formatadores locais */
const _br = (n, d = 0) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const _kbr = (n) => (n >= 1000 ? 'R$ ' + (n / 1000).toLocaleString('pt-BR', { minimumFractionDigits: n >= 10000 ? 0 : 1, maximumFractionDigits: n >= 10000 ? 0 : 1 }) + ' mil' : _br(n));
const _pct = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

/* paleta harmônica para as muitas fatias de custo (system + oklch suaves) */
const FIN_C = {
  primary: 'var(--fa-primary)', info: 'var(--fa-info)', vital: 'var(--fa-vital)',
  warn: 'var(--fa-warn)', success: 'var(--fa-success)',
  teal: 'oklch(0.64 0.085 205)', plum: 'oklch(0.56 0.09 332)',
  sand: 'oklch(0.71 0.075 72)', slate: 'oklch(0.60 0.035 262)',
};

const ZERO_MONTH = { faturamento: 0, aluguel: 0, energia: 0, agua: 0, contab: 0, licencas: 0, manut: 0, folha: 0, cmvPct: 0, icmsPct: 0, reinvPct: 0, roiAa: 0 };

/* rótulos curto/longo de um mês a partir da chave AAAA-MM, sem nada fixado */
const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function monthKeyMeta(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  const idx = Math.min(11, Math.max(0, (m || 1) - 1));
  return { k: key, s: MONTH_SHORT[idx], l: MONTH_LONG[idx] + '/' + (y || '') };
}
function currentMonthKey() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

/* stepper numérico compacto */
function FinStepper({ value, onChange, step = 50, min = 0, max = 1e9, pct = false }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <span className={'fin-stepper' + (pct ? ' is-pct' : '')}>
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label="diminuir">−</button>
      <input type="number" value={value} onChange={(e) => { const v = parseFloat(e.target.value); onChange(isNaN(v) ? min : clamp(v)); }} />
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label="aumentar">+</button>
    </span>
  );
}

/* linha de premissa editável */
function PremRow({ icon, label, sub, pre, children }) {
  return (
    <div className="fin-prem-row">
      <span className="pr-ic"><Icon name={icon} size={17} /></span>
      <div className="pr-lab" style={{ flex: 1 }}>{label}{sub && <small>{sub}</small>}</div>
      {pre && <span className="fin-prem-pre">{pre}</span>}
      {children}
    </div>
  );
}

/* linha de detalhe (imposto ou custo) */
function FinLine({ color, name, sub, rate, amount, share }) {
  return (
    <div className="fin-line">
      <span className="swatch" style={{ background: color }} />
      <div className="nm" style={{ flex: 1, minWidth: 0 }}>{name}{sub && <small>{sub}</small>}</div>
      {rate && <span className="rate">{rate}</span>}
      <span className="amt">{_br(amount)}{share != null && <span style={{ color: 'var(--fa-ink-3)', fontWeight: 700, fontSize: 11.5, marginLeft: 6 }}>{share}%</span>}</span>
    </div>
  );
}

function FinanceSection({ monthlyRevenue, cardShare, financialMonths, financialBusy, financialError, onSaveFinancialMonth, onRetryFinancialSettings }) {
  const storedMonths = financialMonths && typeof financialMonths === 'object' ? financialMonths : null;

  if (financialError) {
    return (
      <div className="fa-card" style={{ padding: 28, textAlign: 'center' }} data-screen-label="Análises · Financeiro e impostos">
        <Icon name="alert" size={22} style={{ color: 'var(--fa-error)' }} />
        <div style={{ fontWeight: 800, marginTop: 10 }}>Não foi possível carregar as premissas financeiras</div>
        <div className="ph-cell-sub" style={{ marginTop: 4 }}>{financialError}</div>
        <button className="fa-btn fa-btn-primary fa-btn-sm" style={{ marginTop: 14 }} onClick={onRetryFinancialSettings}><Icon name="refresh" size={14} />Tentar novamente</button>
      </div>
    );
  }

  if (!storedMonths) {
    return (
      <div className="fa-card" style={{ padding: 28, textAlign: 'center' }} data-screen-label="Análises · Financeiro e impostos">
        <div className="ph-cell-sub">Carregando premissas financeiras…</div>
      </div>
    );
  }

  const monthKeys = Object.keys(storedMonths).sort();
  const preferredMonth = monthKeys.includes(currentMonthKey()) ? currentMonthKey() : (monthKeys[monthKeys.length - 1] || currentMonthKey());
  const [month, setMonth] = useState(preferredMonth);
  const [draftMonths, setDraftMonths] = useState(storedMonths);
  const [addingMonth, setAddingMonth] = useState(false);
  const [newMonthKey, setNewMonthKey] = useState('');

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
    setNewMonthKey('');
  };
  const monthMeta = monthKeyMeta(month);

  const { aluguel, energia, agua, contab, licencas, manut, folha, cmvPct, icmsPct, reinvPct, roiAa } = prem;
  const R = Number(prem.faturamento) || 0;

  /* ---- tributos (Lucro Presumido) ---- */
  const RATE = { pis: 0.65, cofins: 3.0, irpj: 1.2, csll: 1.08 };
  const mdrPct = 2.2; // taxa média da maquininha
  const taxes = [
    { key: 'icms', name: 'ICMS', sub: 'efetivo, líquido de ST', color: FIN_C.vital, rate: icmsPct, val: R * icmsPct / 100 },
    { key: 'cofins', name: 'COFINS', sub: 'cumulativo', color: FIN_C.primary, rate: RATE.cofins, val: R * RATE.cofins / 100 },
    { key: 'pis', name: 'PIS', sub: 'cumulativo', color: FIN_C.info, rate: RATE.pis, val: R * RATE.pis / 100 },
    { key: 'irpj', name: 'IRPJ', sub: 'presunção 8%', color: FIN_C.warn, rate: RATE.irpj, val: R * RATE.irpj / 100 },
    { key: 'csll', name: 'CSLL', sub: 'presunção 12%', color: FIN_C.success, rate: RATE.csll, val: R * RATE.csll / 100 },
  ];
  const taxTotal = taxes.reduce((s, t) => s + t.val, 0);
  const taxLoad = R ? taxTotal / R * 100 : 0;

  /* ---- custos / despesas ---- */
  const cmv = R * cmvPct / 100;
  const mdr = R * (cardShare / 100) * mdrPct / 100;
  const costs = [
    { name: 'Medicamentos e produtos (CMV)', sub: 'custo das mercadorias vendidas', color: FIN_C.primary, val: cmv },
    { name: 'Folha de pagamento', sub: 'salários + encargos da equipe', color: FIN_C.info, val: folha },
    { name: 'Aluguel do ponto', sub: 'loja + condomínio', color: FIN_C.vital, val: aluguel },
    { name: 'Energia elétrica', sub: 'iluminação, refrigeração, ar', color: FIN_C.warn, val: energia },
    { name: 'Água e esgoto', sub: 'consumo + tarifa', color: FIN_C.teal, val: agua },
    { name: 'Contabilidade', sub: 'escritório contábil + folha', color: FIN_C.plum, val: contab },
    { name: 'Licenças e alvarás', sub: 'Vig. Sanitária, CRF, Bombeiros (rateio)', color: FIN_C.sand, val: licencas },
    { name: 'Maquininha (MDR)', sub: 'taxa de cartão ' + _pct(mdrPct) + ' · ' + Math.round(cardShare) + '% das vendas', color: FIN_C.slate, val: mdr },
    { name: 'Manutenção e segurança', sub: 'extintor, gesso, reparos, dedetização', color: FIN_C.success, val: manut },
  ];
  const opex = costs.slice(1).reduce((s, c) => s + c.val, 0); // tudo menos CMV
  const costTotal = cmv + opex;
  const netProfit = R - taxTotal - costTotal;
  const margin = R ? netProfit / R * 100 : 0;
  const positive = netProfit >= 0;

  /* ---- cascata (DRE) ---- */
  const flow = [
    { lab: 'Faturamento bruto', icon: 'money', color: FIN_C.info, val: R, sign: 1 },
    { lab: 'Impostos', icon: 'percent', color: FIN_C.vital, val: taxTotal, sign: -1 },
    { lab: 'Custo dos produtos', icon: 'box', color: FIN_C.warn, val: cmv, sign: -1 },
    { lab: 'Despesas operacionais', icon: 'store', color: FIN_C.slate, val: opex, sign: -1 },
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
      <div className="fa-card fin-monthbar">
        <span className="mb-ic"><Icon name="calendar" size={19} /></span>
        <div className="mb-title">
          <div className="t">Mês de referência · {monthMeta.l}</div>
          <div className="ph-cell-sub">Informe os valores reais de cada mês e salve — ficam guardados na conta da loja.</div>
        </div>
        <div className="fin-month-chips">
          {monthKeys.map((k) => {
            const meta = monthKeyMeta(k);
            return (
              <button key={k} type="button" data-on={month === k ? '1' : '0'} onClick={() => selectMonth(k)}>
                {meta.s}/{k.slice(2, 4)}{draftMonths[k] && <i className="mc-dot" title="mês salvo" />}
              </button>
            );
          })}
          {addingMonth ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="month" className="fa-input fa-input-sm" value={newMonthKey} onChange={(e) => setNewMonthKey(e.target.value)} />
              <button type="button" className="fa-btn fa-btn-primary fa-btn-sm" onClick={confirmNewMonth}><Icon name="check" size={13} /></button>
            </span>
          ) : (
            <button type="button" onClick={() => setAddingMonth(true)} title="Adicionar mês"><Icon name="plus" size={14} /></button>
          )}
        </div>
        <div className="mb-actions">
          {dirty
            ? <span className="mb-status is-dirty"><i />Não salvo</span>
            : <span className="mb-status is-ok"><Icon name="check" size={13} stroke={2.6} />Salvo</span>}
          <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={saveMonth} disabled={!dirty || saving}><Icon name="check" size={15} stroke={2.4} />{saving ? 'Salvando…' : 'Salvar mês'}</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="ph-stats">
        <StatCard icon="money" value={_br(R)} label={'Faturamento · ' + monthMeta.l} />
        <StatCard icon="percent" value={_br(taxTotal)} label={'Impostos no mês · ' + _pct(taxLoad) + ' do faturamento'} tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }} />
        <StatCard icon="store" value={_br(costTotal)} label="Custos e despesas operacionais" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
        <StatCard icon="trendup" value={_br(netProfit)} label={'Lucro líquido · margem ' + _pct(margin)}
          tint={positive ? { bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' } : { bg: '#FBEAE9', fg: 'var(--fa-error)' }} />
      </div>

      {/* Cascata + Impostos */}
      <div className="an-grid-wide">
        <AnCard icon="repeat" title="Do faturamento ao lucro" sub="Cascata mensal · quanto sobra a cada etapa">
          <div className="fin-flow">
            {flow.map((f) => (
              <div className="fin-flow-row" key={f.lab}>
                <div className="lab"><span className="dot" style={{ background: f.color }} />{f.lab}</div>
                <div className="fin-flow-track"><i style={{ width: Math.max(2, Math.round((f.val / (R || 1)) * 100)) + '%', background: f.color }} /></div>
                <div className="fin-flow-val" style={{ color: f.sign < 0 ? 'var(--fa-ink-2)' : 'var(--fa-ink)' }}>{f.sign < 0 ? '– ' : ''}{_br(f.val)}</div>
              </div>
            ))}
            <div className="fin-flow-row is-total">
              <div className="lab"><span className="dot" style={{ background: positive ? 'var(--fa-success)' : 'var(--fa-error)' }} />Lucro líquido</div>
              <div className="fin-flow-track"><i style={{ width: Math.max(2, Math.min(100, Math.round((Math.abs(netProfit) / (R || 1)) * 100))) + '%', background: positive ? 'var(--fa-success)' : 'var(--fa-error)' }} /></div>
              <div className="fin-flow-val" style={{ color: positive ? 'var(--fa-success)' : 'var(--fa-error)' }}>{_br(netProfit)}</div>
            </div>
          </div>
          <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="sparkle" size={13} style={{ color: 'var(--fa-success)', flex: 'none' }} /><span>De cada R$ 100 faturados, sobram <b>{_br(margin, 2)}</b> de lucro depois de impostos e custos.</span>
          </div>
        </AnCard>

        <AnCard icon="percent" title="Impostos do mês" sub={'Carga tributária ' + _pct(taxLoad)} tint={{ bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }}>
          <div className="an-vs" style={{ marginBottom: 8 }}>
            <Donut size={128} centerTop={_kbr(taxTotal)} centerSub="impostos/mês" segments={taxes.map((t) => ({ value: t.val, color: t.color }))} />
            <div style={{ flex: 1, minWidth: 130 }}>
              {taxes.map((t) => (
                <FinLine key={t.key} color={t.color} name={t.name} sub={t.sub} rate={_pct(t.rate)} amount={t.val} />
              ))}
            </div>
          </div>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>ICMS estimado já líquido de substituição tributária (boa parte dos medicamentos é recolhida na origem).</div>
        </AnCard>
      </div>

      {/* Custos + ROI */}
      <div className="an-grid2">
        <AnCard icon="store" title="Onde vai o dinheiro" sub="Composição dos custos e despesas do mês" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }}>
          <div className="an-vs" style={{ marginBottom: 6, alignItems: 'flex-start' }}>
            <Donut size={128} centerTop={_kbr(costTotal)} centerSub="custos/mês" segments={costs.map((c) => ({ value: c.val, color: c.color }))} />
            <div style={{ flex: 1, minWidth: 180 }}>
              {costs.map((c) => (
                <FinLine key={c.name} color={c.color} name={c.name} sub={c.sub} amount={c.val} share={Math.round(c.val / costTotal * 100)} />
              ))}
            </div>
          </div>
        </AnCard>

        <AnCard icon="bank" title="ROI do reinvestimento" sub={'Reinvestindo ' + reinvPct + '% do lucro · retorno de ' + roiAa + '% a.a.'} tint={{ bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }}>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="fin-metric"><span className="v">{_br(reinvMensal)}</span><span className="l">Reinvestido por mês</span></div>
            <div className="fin-metric"><span className="v" style={{ color: 'var(--fa-success)' }}>+{_br(retorno12)}</span><span className="l">Retorno projetado (12 meses)</span></div>
            <div className="fin-metric"><span className="v">{_pct(roiPct)}</span><span className="l">ROI em 12 meses</span></div>
          </div>
          <div className="fin-roi-chart">
            {months.map((m) => {
              const base = reinvMensal * m, total = fv(m), ret = total - base;
              return (
                <div className="col" key={m} title={'Mês ' + m + ' · capital ' + _br(total)}>
                  <div className="bar" style={{ height: Math.max(3, total / capMax * 100) + '%' }}>
                    <div className="seg-ret" style={{ height: Math.round(ret / (total || 1) * 100) + '%' }} />
                    <div className="seg-base" style={{ flex: 1 }} />
                  </div>
                  <div className="mlab">{m}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="ph-cell-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-info)' }} />Capital aportado · {_br(aportes12)}</span>
            <span className="ph-cell-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--fa-success)' }} />Rendimento acumulado</span>
            <span className="ph-cell-sub" style={{ marginLeft: 'auto', fontWeight: 700 }}>Capital ao fim de 12 m · {_br(cap12)}</span>
          </div>
          {!positive && <div className="ph-cell-sub" style={{ marginTop: 10, color: 'var(--fa-error)' }}>Sem lucro no mês não há reinvestimento — ajuste as premissas abaixo.</div>}
        </AnCard>
      </div>

      {/* Premissas */}
      <div className="fa-card" style={{ padding: 20, marginTop: 18 }}>
        <div className="an-cardhead" style={{ flexWrap: 'wrap', rowGap: 10 }}>
          <span className="ic"><Icon name="scale" size={19} /></span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="t">Premissas de {monthMeta.l}</div>
            <div className="ph-cell-sub">Digite os valores reais do mês — impostos, custos, ROI e lucro recalculam na hora</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dirty
              ? <span className="mb-status is-dirty"><i />Alterações não salvas</span>
              : <span className="mb-status is-ok"><Icon name="check" size={13} stroke={2.6} />Tudo salvo</span>}
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={resetMonth} disabled={!dirty}><Icon name="refresh" size={14} />Desfazer</button>
            <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={saveMonth} disabled={!dirty || saving}><Icon name="check" size={15} stroke={2.4} />{saving ? 'Salvando…' : 'Salvar mês'}</button>
          </div>
        </div>

        <div className="fin-prem-label">Faturamento do mês</div>
        <div className="fin-prem-grid">
          <PremRow icon="money" label="Faturamento bruto" sub="receita total de vendas no mês" pre="R$"><FinStepper value={prem.faturamento} onChange={(v) => setP('faturamento', v)} step={1000} /></PremRow>
        </div>

        <hr className="fa-divider" style={{ margin: '20px 0' }} />
        <div className="fin-prem-label">Custos fixos mensais</div>
        <div className="fin-prem-grid">
          <PremRow icon="store" label="Aluguel do ponto" sub="loja + condomínio" pre="R$"><FinStepper value={aluguel} onChange={(v) => setP('aluguel', v)} step={250} /></PremRow>
          <PremRow icon="bolt" label="Energia elétrica" pre="R$"><FinStepper value={energia} onChange={(v) => setP('energia', v)} step={100} /></PremRow>
          <PremRow icon="drop" label="Água e esgoto" pre="R$"><FinStepper value={agua} onChange={(v) => setP('agua', v)} step={20} /></PremRow>
          <PremRow icon="scale" label="Contabilidade" sub="escritório contábil" pre="R$"><FinStepper value={contab} onChange={(v) => setP('contab', v)} step={50} /></PremRow>
          <PremRow icon="doc" label="Licenças e alvarás" sub="Vig. Sanitária, CRF, Bombeiros" pre="R$"><FinStepper value={licencas} onChange={(v) => setP('licencas', v)} step={20} /></PremRow>
          <PremRow icon="wrench" label="Manutenção e segurança" sub="extintor, gesso, reparos" pre="R$"><FinStepper value={manut} onChange={(v) => setP('manut', v)} step={20} /></PremRow>
          <PremRow icon="user" label="Folha de pagamento" sub="salários + encargos" pre="R$"><FinStepper value={folha} onChange={(v) => setP('folha', v)} step={500} /></PremRow>
        </div>

        <hr className="fa-divider" style={{ margin: '20px 0' }} />
        <div className="fin-prem-label">Tributação, margem e reinvestimento</div>
        <div className="fin-prem-grid">
          <PremRow icon="box" label="Custo dos produtos (CMV)" sub="% do faturamento"><FinStepper value={cmvPct} onChange={(v) => setP('cmvPct', v)} step={1} max={95} pct /><span className="fin-prem-pre" style={{ marginLeft: 8 }}>%</span></PremRow>
          <PremRow icon="percent" label="ICMS efetivo" sub="líquido de ST · varia por estado"><FinStepper value={icmsPct} onChange={(v) => setP('icmsPct', v)} step={0.5} max={25} pct /><span className="fin-prem-pre" style={{ marginLeft: 8 }}>%</span></PremRow>
          <PremRow icon="bank" label="Reinvestimento do lucro" sub="% do lucro líquido"><FinStepper value={reinvPct} onChange={(v) => setP('reinvPct', v)} step={5} max={100} pct /><span className="fin-prem-pre" style={{ marginLeft: 8 }}>%</span></PremRow>
          <PremRow icon="trendup" label="Retorno esperado" sub="rentabilidade anual do reinvestimento"><FinStepper value={roiAa} onChange={(v) => setP('roiAa', v)} step={1} max={60} pct /><span className="fin-prem-pre" style={{ marginLeft: 8 }}>% a.a.</span></PremRow>
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="shield" size={13} style={{ color: 'var(--fa-info)', flex: 'none' }} /><span>PIS (0,65%) e COFINS (3%) são cumulativos; IRPJ e CSLL seguem a presunção do Lucro Presumido para comércio. Estimativa de apoio à gestão, não substitui a apuração contábil.</span>
        </div>
      </div>
    </div>
  );
}

export { FIN_C, FinLine, FinStepper, FinanceSection, PremRow, monthKeyMeta, currentMonthKey };
