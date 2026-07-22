import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { resolvePaymentBreakdown } from "../../shared/payment-pricing.js";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { FinStepper } from "./finance-screen.jsx";
import { InventoryEmpty, InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Precificador do marketplace.
   Define preço de venda, margem, descontos/promoções e mostra o repasse líquido
   depois das taxas da vitrine (comissão + pagamento + tarifa fixa).
   As taxas e a meta de margem são editáveis e recalculam tudo em tempo real. */

/* formatadores locais */
const _prc = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
const _p1 = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const _round90 = (n) => Math.max(0.9, Math.floor(n) + 0.90); // arredonda para final .90
const MARKETPLACE_CATALOG_OPTIONS = [
  { value: 'Medicamentos', label: 'Medicamentos', desc: 'Remedios, genericos, similares e itens de prescricao.' },
  { value: 'Perfumaria', label: 'Perfumaria', desc: 'Beleza, skincare, dermocosmeticos e rotina pessoal.' },
  { value: 'Bem-estar', label: 'Bem-estar', desc: 'Vitaminas, suplementos e apoio para a rotina de saude.' },
  { value: 'Cuidados', label: 'Cuidados diarios', desc: 'Higiene, mamae e bebe e necessidades do dia a dia.' },
];

/* índice code -> CNAE a partir das configurações do sistema */
function cnaeIndexByCode(cnaeSettings) {
  const index = {};
  ((cnaeSettings && cnaeSettings.items) || []).forEach((entry) => { index[entry.code] = entry; });
  return index;
}
function principalCnae(cnaeSettings) {
  const items = (cnaeSettings && cnaeSettings.items) || [];
  return items.find((entry) => entry.isPrincipal) || items[0] || null;
}

/* ===================== SIMPLES NACIONAL — ANEXO I (LC 123/2006, redação da LC 155/2016, vigente desde 01/2018) =====================
   Tabela oficial de comércio: alíquota nominal + parcela a deduzir por faixa de RBT12 (faturamento
   dos últimos 12 meses), e a repartição de cada faixa entre IRPJ/CSLL/COFINS/PIS/CPP/ICMS.
   Fonte: Receita Federal / LC 123/2006, Anexo I. Consulte a contabilidade da farmácia periodicamente —
   lei tributária muda; esta tabela reflete a redação vigente conhecida no momento em que foi escrita aqui. */
const SIMPLES_ANEXO_I = [
  { faixa: 1, ate: 180000, aliquota: 4.00, deducao: 0, partilha: { irpj: 5.50, csll: 3.50, cofins: 12.74, pis: 2.76, cpp: 41.50, icms: 34.00 } },
  { faixa: 2, ate: 360000, aliquota: 7.30, deducao: 5940, partilha: { irpj: 5.50, csll: 3.50, cofins: 12.74, pis: 2.76, cpp: 41.50, icms: 34.00 } },
  { faixa: 3, ate: 720000, aliquota: 9.50, deducao: 13860, partilha: { irpj: 5.50, csll: 3.50, cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 4, ate: 1800000, aliquota: 10.70, deducao: 22500, partilha: { irpj: 5.50, csll: 3.50, cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 5, ate: 3600000, aliquota: 14.30, deducao: 87300, partilha: { irpj: 5.50, csll: 3.50, cofins: 12.74, pis: 2.76, cpp: 42.00, icms: 33.50 } },
  { faixa: 6, ate: 4800000, aliquota: 19.00, deducao: 378000, partilha: { irpj: 13.50, csll: 10.00, cofins: 28.27, pis: 6.13, cpp: 42.10, icms: 0.00 } },
];

/* alíquota efetiva do Simples Nacional (Anexo I) para um RBT12, já desdobrada por tributo */
function simplesEffectiveRate(rbt12) {
  const revenue = Math.max(0, +rbt12 || 0);
  const bracket = SIMPLES_ANEXO_I.find((b) => revenue <= b.ate) || SIMPLES_ANEXO_I[SIMPLES_ANEXO_I.length - 1];
  const aliquotaEfetiva = revenue > 0
    ? Math.max(0, (revenue * (bracket.aliquota / 100) - bracket.deducao) / revenue * 100)
    : bracket.aliquota;
  const breakdown = {};
  Object.keys(bracket.partilha).forEach((tax) => { breakdown[tax] = aliquotaEfetiva * (bracket.partilha[tax] / 100); });
  return { bracket: bracket.faixa, aliquotaEfetiva, breakdown };
}

/* ---- núcleo de cálculo: desdobra um item sob as taxas do marketplace e o Simples Nacional do seu CNAE ---- */
function priceCalc(it, mkt, cnaeIndex, taxRegime) {
  const cost = +it.cost || 0;
  const price = +it.price || 0;
  const promo = +it.promo || 0;
  const eff = promo > 0 ? price * (1 - promo / 100) : price;        // preço efetivo (já com desconto)
  const commission = eff * (mkt.commissionPct / 100);              // comissão da plataforma
  const payFee = eff * (mkt.paymentFeePct / 100);                 // taxa de pagamento
  const fixed = +mkt.fixedFee || 0;                               // tarifa fixa por pedido
  const fees = commission + payFee + fixed;
  const payout = eff - fees;                                      // repasse líquido à farmácia (o que o marketplace efetivamente transfere)
  const cnae = (cnaeIndex || {})[it.cnae] || null;
  const simples = simplesEffectiveRate(taxRegime && taxRegime.trailing12mRevenue);
  // ICMS-ST: usa a exceção lançada por produto (tela de Custos de Aquisição) quando existir;
  // sem override, cai no padrão do CNAE em Configurações — igual ao comportamento anterior.
  const stExempt = it.isSubjectToIcmsSt != null ? !!it.isSubjectToIcmsSt : !!(cnae && cnae.isSubjectToIcmsSt);
  const taxPct = Math.max(0, simples.aliquotaEfetiva - (stExempt ? simples.breakdown.icms : 0));
  const tax = eff * (taxPct / 100);                              // Simples Nacional devido pela farmácia sobre esta venda
  const profit = payout - cost - tax;                           // lucro por unidade, já líquido de custo e impostos
  const margin = eff > 0 ? profit / eff * 100 : 0;               // margem líquida sobre o preço efetivo
  const markup = cost > 0 ? profit / cost * 100 : 0;            // markup sobre o custo
  const ref = +it.ref || 0;
  const vsRef = ref > 0 ? (price - ref) / ref * 100 : 0;        // + = acima do mercado
  const paymentBreakdown = resolvePaymentBreakdown(price, mkt);
  return { cost, price, promo, eff, commission, payFee, fixed, fees, payout, cnae, simples, stExempt, taxPct, tax, profit, margin, markup, ref, vsRef, paymentBreakdown };
}

/* preço de tabela necessário para atingir uma margem líquida-alvo (sem promoção) */
function priceForMargin(cost, targetMargin, mkt, taxPct) {
  const f = (mkt.commissionPct + mkt.paymentFeePct + (+taxPct || 0)) / 100;
  const denom = (1 - f) - targetMargin / 100;
  if (denom <= 0.001) return null;
  return (cost + (+mkt.fixedFee || 0)) / denom;
}

/* saúde da margem frente à meta */
function marginState(margin, minMargin) {
  if (margin < 0) return { key: 'neg', label: 'Prejuízo', color: 'var(--fa-error)', bg: '#FBEAE9' };
  if (margin < minMargin) return { key: 'low', label: 'Abaixo da meta', color: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)' };
  return { key: 'ok', label: 'Saudável', color: 'var(--fa-success)', bg: 'var(--fa-success-soft)' };
}

/* identidade do produto ignorando lote/local — mesmo EAN, ou mesmo nome+marca, agrupam junto */
function productGroupKey(it) {
  const ean = (it.ean || '').trim();
  if (ean) return 'ean:' + ean;
  return 'name:' + (it.name || '').trim().toLowerCase() + '|' + (it.brand || '').trim().toLowerCase();
}
function productGroupLabel(it) {
  return (it.name || 'Produto') + (it.brand ? ' · ' + it.brand : '');
}

/* chip de competitividade vs. preço médio de mercado */
function VsMarket({ vsRef, refPrice }) {
  if (!refPrice) return <span className="ph-cell-sub">—</span>;
  const near = Math.abs(vsRef) < 2;
  const cheaper = vsRef < 0;
  const tone = near ? { c: 'var(--fa-ink-2)', b: 'var(--fa-mist-2)' }
    : cheaper ? { c: 'var(--fa-success)', b: 'var(--fa-success-soft)' }
    : { c: 'var(--fa-warn)', b: 'var(--fa-warn-soft)' };
  return (
    <span className="prc-vs" style={{ color: tone.c, background: tone.b }} title={'Mercado · ' + _prc(refPrice)}>
      <Icon name={near ? 'activity' : cheaper ? 'chevD' : 'trendup'} size={12} stroke={2.4} />
      {near ? 'na média' : Math.abs(vsRef).toFixed(0) + '% ' + (cheaper ? 'abaixo' : 'acima')}
    </span>
  );
}

/* ===================== TELA PRINCIPAL ===================== */
function PricingScreen({ ctx }) {
  const { inventory, marketplace: mkt, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, setItemPricing, notify, onLogout, pdvDiscountSettings, setPdvDiscountSettings, savePdvDiscountSettings, pdvDiscountSettingsBusy, cnaeSettings } = ctx;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');     // all | promo | low | controlled
  const [brand, setBrand] = useState('all');
  const [groupBy, setGroupBy] = useState('category'); // category | product — mesmo padrão de agrupamento do Estoque
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [edit, setEdit] = useState(null);    // item sendo precificado
  const [bulk, setBulk] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false); // configurações gerais de preço (taxas + desconto PDV, pagamento)
  const [hideConfirmation, setHideConfirmation] = useState(null);

  const cnaeIndex = cnaeIndexByCode(cnaeSettings);
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
  const enriched = inventory.map((it) => ({ it, calc: priceCalc(it, mkt, cnaeIndex, taxRegime) }));
  const counts = {
    all: inventory.length,
    promo: enriched.filter((e) => e.calc.promo > 0).length,
    low: enriched.filter((e) => e.calc.margin < mkt.minMargin).length,
    controlled: inventory.filter((it) => it.controlled).length,
    published: inventory.filter((it) => it.marketplaceVisible).length,
  };
  const brandOptions = [...new Set(inventory.map((it) => (it.brand || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const match = ({ it, calc }) => {
    if (cat === 'promo' && calc.promo <= 0) return false;
    if (cat === 'low' && calc.margin >= mkt.minMargin) return false;
    if (cat === 'controlled' && !it.controlled) return false;
    if (brand !== 'all' && (it.brand || '').trim() !== brand) return false;
    if (q && !(it.name + it.brand + it.ean).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };
  const rows = enriched.filter(match).slice().sort((left, right) => {
    if (groupBy === 'product') {
      const productCompare = productGroupLabel(left.it).localeCompare(productGroupLabel(right.it), 'pt-BR');
      if (productCompare !== 0) return productCompare;
      return (left.it.batch || '').localeCompare(right.it.batch || '', 'pt-BR');
    }
    const categoryCompare = (left.it.cat || 'Medicamentos').localeCompare(right.it.cat || 'Medicamentos', 'pt-BR');
    if (categoryCompare !== 0) return categoryCompare;
    return (left.it.name || '').localeCompare(right.it.name || '', 'pt-BR');
  });
  const groupedRows = rows.reduce((groups, row) => {
    const key = groupBy === 'product' ? productGroupKey(row.it) : (row.it.cat || 'Medicamentos');
    const label = groupBy === 'product' ? productGroupLabel(row.it) : (row.it.cat || 'Medicamentos');
    if (!groups[key]) groups[key] = { label, rows: [] };
    groups[key].rows.push(row);
    return groups;
  }, {});
  const groupedEntries = Object.entries(groupedRows);
  const toggleGroup = (key) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const collapseAllGroups = () => setCollapsedGroups(Object.fromEntries(groupedEntries.map(([key]) => [key, true])));
  const expandAllGroups = () => setCollapsedGroups(Object.fromEntries(groupedEntries.map(([key]) => [key, false])));
  const confirmHideFromMarketplace = () => {
    if (!hideConfirmation) return;
    setItemPricing(hideConfirmation.item.id, hideConfirmation.patch);
    setEdit(null);
    setHideConfirmation(null);
    notify(hideConfirmation.item.name + ' aparecerá como indisponível no marketplace', 'warn');
  };

  // KPIs (sobre todo o catálogo)
  const avgMargin = enriched.reduce((s, e) => s + e.calc.margin, 0) / (enriched.length || 1);
  const avgPayout = enriched.reduce((s, e) => s + e.calc.payout, 0) / (enriched.length || 1);

  const renderPricingRow = ({ it, calc }) => {
    const ms = marginState(calc.margin, mkt.minMargin);
    const bar = Math.max(4, Math.min(100, Math.round(calc.margin / (mkt.minMargin * 2) * 100)));
    return (
      <tr key={it.id}>
        <td>
          <div className="ph-td-name" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{it.name}
            {it.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
          </div>
          <div className="ph-cell-sub">{it.brand}{it.batch && it.batch !== '—' ? ' · lote ' + it.batch : ''}</div>
        </td>
        <td className="fa-mono" style={{ color: 'var(--fa-ink-2)' }}>{_prc(calc.cost)}</td>
        <td>
          {calc.promo > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--fa-primary)' }}>{_prc(calc.eff)}</span>
              <span className="fa-price-old" style={{ fontSize: 12 }}>{_prc(calc.price)}</span>
            </div>
          ) : <span style={{ fontWeight: 800, fontSize: 15 }}>{_prc(calc.price)}</span>}
        </td>
        <td>
          <div className="fa-mono" style={{ fontWeight: 700 }}>{_prc(calc.payout)}</div>
          <div className="ph-cell-sub">− {_prc(calc.fees)} taxas{calc.tax > 0 ? ' · − ' + _prc(calc.tax) + ' impostos' : ''}</div>
        </td>
        <td>
          <span className="fa-badge" style={{ background: ms.bg, color: ms.color }}>
            <Icon name={ms.key === 'ok' ? 'check' : 'alert'} size={11} stroke={2.2} />{_p1(calc.margin)}
          </span>
          <div className="prc-bar"><i style={{ width: bar + '%', background: ms.color }} /></div>
        </td>
        <td><VsMarket vsRef={calc.vsRef} refPrice={calc.ref} /></td>
        <td>
          <div className="prc-pub">
            {it.marketplaceVisible
              ? <span className="fa-badge fa-badge-health"><Icon name="store" size={11} />Publicado</span>
              : <span className="fa-badge fa-badge-mist"><Icon name="minus" size={11} />Oculto</span>}
            {calc.promo > 0 && <span className="fa-badge fa-badge-vital"><Icon name="percent" size={11} stroke={2.2} />-{calc.promo}%</span>}
          </div>
        </td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div className="ph-row-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setEdit(it)}><Icon name="tag" size={14} />Precificar</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <Topbar title="Precificador" sub={'Vitrine ' + mkt.name + ' · preços, margens e promoções'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch"><Icon name="scan" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar produto ou EAN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Topbar>

      <div className="ph-content ph-content-wide inv-screen prc-screen" data-screen-label="Precificador do marketplace">
        {/* KPIs — dobram como filtro de categoria, no mesmo padrão do Estoque */}
        <div className="inv-kpis prc-kpis">
          <InventoryKpi icon="boxes" label="Todos os itens" value={counts.all} active={cat === 'all'} onClick={() => setCat('all')} />
          <InventoryKpi icon="alert" label={'Abaixo da meta (' + _p1(mkt.minMargin) + ')'} value={counts.low} tone={counts.low ? 'warn' : undefined} active={cat === 'low'} onClick={() => setCat('low')} />
          <InventoryKpi icon="percent" label="Em promoção" value={counts.promo} active={cat === 'promo'} onClick={() => setCat('promo')} />
          <InventoryKpi icon="lock" label="Controlados" value={counts.controlled} active={cat === 'controlled'} onClick={() => setCat('controlled')} />
        </div>

        {/* Toolbar: agrupamento/ações + filtros */}
        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="ph-seg">
              <button data-on={groupBy === 'category' ? '1' : '0'} onClick={() => setGroupBy('category')}>Por categoria</button>
              <button data-on={groupBy === 'product' ? '1' : '0'} onClick={() => setGroupBy('product')}>Por produto</button>
            </div>
            <div className="inv-actions">
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setSettingsOpen(true)}><Icon name="cog" size={15} />Configurações gerais</button>
              <span className="inv-actions-sep" />
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={expandAllGroups}><Icon name="expand" size={14} />Expandir tudo</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={collapseAllGroups}><Icon name="minus" size={14} />Recolher tudo</button>
              <span className="inv-actions-sep" />
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setBulk(true)}><Icon name="scale" size={15} />Aplicar margem em massa</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="download" size={15} />Exportar</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Marca</label>
              <select className="fa-select" style={{ minWidth: 180 }} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="all">Todas as marcas</option>
                {brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            {(brand !== 'all' || cat !== 'all') && (
              <button className="fa-btn fa-btn-soft fa-btn-sm inv-filter-clear" onClick={() => { setBrand('all'); setCat('all'); }}>
                <Icon name="close" size={13} />Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Tabela de precificação */}
        <div className="inv-card">
          <div className="inv-card-head">
            <div>
              <div className="inv-card-head-title">Precificação</div>
              <div className="inv-card-head-sub">
                {rows.length} {groupBy === 'product' ? 'lote(s)' : 'item(ns)'} em {groupedEntries.length} {groupBy === 'product' ? 'produto(s)' : 'categoria(s)'} · margem líquida média {_p1(avgMargin)} · repasse médio {_prc(avgPayout)}
              </div>
            </div>
          </div>
          <div className="ph-table-wrap">
            <table className="ph-table prc-table">
              <thead>
                <tr>
                  <th>Produto</th><th>Custo</th><th>Preço marketplace</th>
                  <th>Repasse líquido</th><th>Margem líquida</th><th>vs. mercado</th><th>Publicação</th><th></th>
                </tr>
              </thead>
              <tbody>
                {groupedEntries.flatMap(([key, group]) => {
                  const collapsed = !!collapsedGroups[key];
                  const groupQty = group.rows.reduce((sum, { it }) => sum + (it.qty || 0), 0);
                  return [
                    <tr key={'group-' + key} className="inv-cat-row">
                      <td colSpan="8">
                        <button
                          className="inv-cat-btn"
                          data-open={collapsed ? '0' : '1'}
                          onClick={() => toggleGroup(key)}
                          aria-label={collapsed ? 'Expandir grupo' : 'Minimizar grupo'}
                        >
                          <span className="inv-cat-name">{group.label}</span>
                          <span className="inv-cat-count">
                            {groupBy === 'product'
                              ? group.rows.length + (group.rows.length === 1 ? ' lote' : ' lotes') + ' · ' + groupQty + ' un'
                              : group.rows.length + ' item(ns)'}
                          </span>
                          <span className="inv-cat-chev"><Icon name="chevD" size={14} /></span>
                        </button>
                      </td>
                    </tr>,
                    ...(collapsed ? [] : group.rows.map((row) => renderPricingRow(row))),
                  ];
                })}
              </tbody>
            </table>
            {rows.length === 0 && <InventoryEmpty icon="search" label="Nenhum produto neste filtro." />}
          </div>
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="info" size={13} style={{ flex: 'none' }} />Margem líquida = repasse após comissão {_p1(mkt.commissionPct)}, taxa de pagamento {_p1(mkt.paymentFeePct)} e tarifa fixa {_prc(mkt.fixedFee)} — descontado o custo e os impostos do Simples Nacional (Faixa {simplesEffectiveRate(taxRegime.trailing12mRevenue).bracket}), líquidos do ICMS-ST do CNAE de cada item.
        </div>
      </div>

      {settingsOpen && (
        <PricingSettingsDrawer
          onClose={() => setSettingsOpen(false)}
          mkt={mkt}
          setMarketplace={setMarketplace}
          saveMarketplaceMeta={saveMarketplaceMeta}
          marketplaceMetaBusy={marketplaceMetaBusy}
          pdvDiscountSettings={pdvDiscountSettings}
          setPdvDiscountSettings={setPdvDiscountSettings}
          savePdvDiscountSettings={savePdvDiscountSettings}
          pdvDiscountSettingsBusy={pdvDiscountSettingsBusy}
        />
      )}
      {edit && <PriceDrawer it={edit} mkt={mkt} cnaeSettings={cnaeSettings} onClose={() => setEdit(null)} onSave={(patch) => {
        if (edit.marketplaceVisible && !patch.marketplaceVisible) {
          setHideConfirmation({ item: edit, patch });
          return;
        }
        setItemPricing(edit.id, patch);
        setEdit(null);
      }} />}
      {hideConfirmation && (
        <HideMarketplaceConfirmationModal
          item={hideConfirmation.item}
          onCancel={() => setHideConfirmation(null)}
          onConfirm={confirmHideFromMarketplace}
        />
      )}
      {bulk && <BulkMarginModal rows={rows} mkt={mkt} cnaeIndex={cnaeIndex} taxRegime={taxRegime} onClose={() => setBulk(false)} onApply={(updates, n) => { updates.forEach((u) => setItemPricing(u.id, { ...u.patch, __bulk: true })); setBulk(false); notify(n + ' preços reajustados · margem aplicada', 'success'); }} />}
    </>
  );
}

function HideMarketplaceConfirmationModal({ item, onCancel, onConfirm }) {
  return (
    <ModalShell open={true} onClose={onCancel} maxw={520}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="alert" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Ocultar produto do marketplace?</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>
        <b>{item.name}</b> continuará visível no catálogo do marketplace, mas aparecerá como <b>indisponível</b> e não poderá ser adicionado ao carrinho enquanto estiver oculto.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 1.4 }} onClick={onConfirm}>
          <Icon name="minus" size={16} />Ocultar e marcar indisponível
        </button>
      </div>
    </ModalShell>
  );
}

/* ===================== DRAWER: CONFIGURAÇÕES GERAIS DE PREÇO ===================== */
function PricingSettingsDrawer({ onClose, mkt, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, pdvDiscountSettings, setPdvDiscountSettings, savePdvDiscountSettings, pdvDiscountSettingsBusy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const node = (
    <div className="ph-drawer-overlay" onClick={onClose}>
      <div className="ph-drawer prc-settings-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ph-drawer-head">
          <span className="fa-iconbox" style={{ width: 46, height: 46, flex: 'none' }}><Icon name="cog" size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="fa-h3" style={{ fontSize: 18 }}>Configurações gerais de preço</h2>
            <div className="ph-cell-sub">Taxas da vitrine e regras de desconto que afetam todos os itens do catálogo</div>
          </div>
          <button className="fa-modal-x" style={{ position: 'static' }} onClick={onClose} aria-label="fechar"><Icon name="close" size={18} /></button>
        </div>
        <div className="ph-drawer-body">
          <MarketplaceFees mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
          <PaymentRulesSettings mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
          <PdvDiscountMarginSettings settings={pdvDiscountSettings} setSettings={setPdvDiscountSettings} onSave={savePdvDiscountSettings} saving={pdvDiscountSettingsBusy} />
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}

/* ---------- Card de taxas do marketplace (editável + persistido) ---------- */
function MarketplaceFees({ mkt, setMarketplace, onSave, saving }) {
  return (
    <AnCard icon="store" title="Taxas da vitrine" sub="Quanto a plataforma retém em cada venda — afeta o repasse e a margem de todos os itens"
      right={<span className="fa-badge fa-badge-mist"><Icon name="cog" size={12} />{mkt.name}</span>}>
      <div className="prc-fees">
        <FeeRow icon="percent" label="Comissão" sub="sobre o preço de venda">
          <FinStepper value={mkt.commissionPct} onChange={(v) => setMarketplace({ commissionPct: v })} step={0.5} max={40} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
        <FeeRow icon="card" label="Taxa de pagamento" sub="gateway / antecipação">
          <FinStepper value={mkt.paymentFeePct} onChange={(v) => setMarketplace({ paymentFeePct: v })} step={0.1} max={15} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
        <FeeRow icon="receipt" label="Tarifa fixa" sub="por pedido">
          <span className="fin-prem-pre" style={{ marginRight: 6 }}>R$</span><FinStepper value={mkt.fixedFee} onChange={(v) => setMarketplace({ fixedFee: v })} step={0.1} max={20} pct />
        </FeeRow>
        <FeeRow icon="gauge" label="Meta de margem" sub="alvo de margem líquida">
          <FinStepper value={mkt.minMargin} onChange={(v) => setMarketplace({ minMargin: v })} step={1} max={60} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={onSave} disabled={!!saving}>
          <Icon name="check" size={14} />{saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </AnCard>
  );
}
/* ---------- Card de regras de pagamento (Pix/parcelamento) — centralizado para todas as lojas ---------- */
function PaymentRulesSettings({ mkt, setMarketplace, onSave, saving }) {
  return (
    <AnCard icon="card" title="Pix e parcelamento" sub="Regra única para todas as lojas — padroniza como Pix e parcelas são exibidos no marketplace">
      <div className="prc-fees">
        <FeeRow icon="pix" label="Desconto no Pix" sub="sobre o preço de tabela">
          <FinStepper value={mkt.pixDiscountPercent} onChange={(v) => setMarketplace({ pixDiscountPercent: v })} step={0.5} max={20} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
        <FeeRow icon="card" label="Máximo de parcelas" sub="no cartão de crédito">
          <FinStepper value={mkt.maxInstallments} onChange={(v) => setMarketplace({ maxInstallments: Math.round(v) })} step={1} max={12} />
        </FeeRow>
        <FeeRow icon="check" label="Parcelas sem juros" sub="até esta parcela, sem juros">
          <FinStepper value={mkt.interestFreeInstallments} onChange={(v) => setMarketplace({ interestFreeInstallments: Math.round(v) })} step={1} max={12} />
        </FeeRow>
        <FeeRow icon="percent" label="Juros ao mês" sub="a partir da parcela seguinte">
          <FinStepper value={mkt.installmentInterestPercent} onChange={(v) => setMarketplace({ installmentInterestPercent: v })} step={0.5} max={20} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={onSave} disabled={!!saving}>
          <Icon name="check" size={14} />{saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </AnCard>
  );
}
/* ---------- Card de margem mínima para desconto no PDV (editável + persistido) ---------- */
function PdvDiscountMarginSettings({ settings, setSettings, onSave, saving }) {
  return (
    <AnCard icon="scale" title="Desconto no balcão (PDV)" sub="Margem média mínima que o carrinho deve manter para liberar um desconto — produtos com mais margem podem compensar outros com margem mais apertada">
      <div className="prc-fees">
        <FeeRow icon="gauge" label="Margem mínima considerada" sub="média do carrinho, após o desconto e o cashback do cliente">
          <FinStepper value={settings.minMarginPercent} onChange={(v) => setSettings({ minMarginPercent: v })} step={1} max={95} pct /><span className="fin-prem-pre" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={onSave} disabled={!!saving}>
          <Icon name="check" size={14} />{saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </AnCard>
  );
}
function FeeRow({ icon, label, sub, children }) {
  return (
    <div className="prc-fee">
      <span className="pr-ic"><Icon name={icon} size={17} /></span>
      <div className="pr-lab" style={{ flex: 1 }}>{label}{sub && <small>{sub}</small>}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  );
}

/* ===================== DRAWER: PRECIFICADOR DE UM ITEM ===================== */
function PriceDrawer({ it, mkt, cnaeSettings, onClose, onSave }) {
  const [cost, setCost] = useState(+it.cost || 0);
  const [price, setPrice] = useState(+it.price || 0);
  const [ref, setRef] = useState(+it.ref || 0);
  const [marketplaceCategory, setMarketplaceCategory] = useState(() => {
    const current = String(it.cat || 'Medicamentos').trim();
    const supported = new Set(MARKETPLACE_CATALOG_OPTIONS.map((option) => option.value));
    return supported.has(current) ? current : 'Medicamentos';
  });
  const [publishOnMarketplace, setPublishOnMarketplace] = useState(!!it.marketplaceVisible);
  const [mode, setMode] = useState('price'); // price | margin

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // CNAE é somente-leitura aqui — é uma configuração do produto (tela Produtos), não do preço.
  const cnaeIndex = cnaeIndexByCode(cnaeSettings);
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
  const selectedCnae = cnaeIndex[it.cnae] || null;
  const eff = price;
  const calc = priceCalc({ cost, price, promo: 0, ref, cnae: it.cnae, isSubjectToIcmsSt: it.isSubjectToIcmsSt }, mkt, cnaeIndex, taxRegime);
  const ms = marginState(calc.margin, mkt.minMargin);

  // ao puxar a margem-alvo, recalcula o preço de tabela
  const onMargin = (m) => { const p = priceForMargin(cost, m, mkt, calc.taxPct); if (p) setPrice(Math.round(p * 100) / 100); };
  const currentTargetMargin = (() => { const c = priceCalc({ cost, price, promo: 0, ref, cnae: it.cnae, isSubjectToIcmsSt: it.isSubjectToIcmsSt }, mkt, cnaeIndex, taxRegime); return Math.max(0, Math.round(c.margin)); })();

  const node = (
    <div className="ph-drawer-overlay" onClick={onClose}>
      <div className="ph-drawer prc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ph-drawer-head">
          <span className="fa-iconbox" style={{ width: 46, height: 46, flex: 'none' }}><Icon name="tag" size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <h2 className="fa-h3" style={{ fontSize: 18 }}>{it.name}</h2>
              {it.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
            </div>
            <div className="ph-cell-sub">{it.brand} · {it.cat} · <span className="fa-mono">{it.ean}</span></div>
          </div>
          <button className="fa-modal-x" style={{ position: 'static' }} onClick={onClose} aria-label="fechar"><Icon name="close" size={18} /></button>
        </div>

        <div className="ph-drawer-body">
          {/* Custo */}
          <div>
            <div className="prc-flabel">Custo de aquisição</div>
            <div className="prc-input-row">
              <span className="fin-prem-pre">R$</span>
              <div className="fa-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 700, color: 'var(--fa-ink)' }}>{cost.toFixed(2).replace('.', ',')}</div>
              <span className="ph-cell-sub" style={{ marginLeft: 'auto' }}>CMV unitário bloqueado</span>
            </div>
          </div>

          {/* Definir por preço ou por margem */}
          <div>
            <div className="ph-seg" style={{ marginBottom: 12 }}>
              <button data-on={mode === 'price' ? '1' : '0'} onClick={() => setMode('price')}><Icon name="money" size={14} />Definir por preço</button>
              <button data-on={mode === 'margin' ? '1' : '0'} onClick={() => setMode('margin')}><Icon name="gauge" size={14} />Definir por margem</button>
            </div>
            {mode === 'price' ? (
              <div className="prc-input-row">
                <span className="fin-prem-pre">R$</span>
                <FinStepper value={price} onChange={setPrice} step={0.5} />
                <span className="ph-cell-sub" style={{ marginLeft: 'auto' }}>preço de tabela na vitrine</span>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="ph-cell-sub">Margem líquida-alvo</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--fa-primary)' }}>{currentTargetMargin}%</span>
                </div>
                <input className="prc-range" type="range" min="0" max="60" step="1" value={currentTargetMargin} onChange={(e) => onMargin(+e.target.value)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span className="ph-cell-sub">preço resultante</span>
                  <span style={{ fontWeight: 800 }}>{_prc(price)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Tributação — CNAE do produto (somente leitura; edite em Produtos), define a alíquota do Simples Nacional aplicada na venda */}
          <div className="fa-field">
            <label>CNAE para tributação</label>
            <div className="fa-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontWeight: 700, color: 'var(--fa-ink)' }}>
              {selectedCnae ? selectedCnae.code + (selectedCnae.description ? ' · ' + selectedCnae.description : '') : 'Sem CNAE definido'}
            </div>
            <div className="ph-cell-sub" style={{ marginTop: 6 }}>
              {selectedCnae
                ? 'Simples Nacional · Faixa ' + calc.simples.bracket + ' · alíquota aplicada ' + _p1(calc.taxPct)
                  + (calc.stExempt ? ' · ICMS já recolhido por substituição tributária' : '')
                : 'Sem CNAE, o item ainda é taxado pela alíquota efetiva do Simples Nacional (Faixa ' + calc.simples.bracket + ').'}
              {' '}Editável na tela <strong>Produtos</strong>.
            </div>
          </div>

          {/* Desdobramento do repasse (ao vivo) */}
          <div className="prc-breakdown">
            <div className="prc-bd-title">Composição do repasse</div>
            <BdRow label="Preço de venda" val={_prc(eff)} strong />
            <BdRow label={'Comissão · ' + _p1(mkt.commissionPct)} val={'− ' + _prc(calc.commission)} neg sub />
            <BdRow label={'Taxa de pagamento · ' + _p1(mkt.paymentFeePct)} val={'− ' + _prc(calc.payFee)} neg sub />
            <BdRow label="Tarifa fixa" val={'− ' + _prc(calc.fixed)} neg sub />
            <BdRow label="Repasse líquido" val={_prc(calc.payout)} strong divider />
            <BdRow label="Custo do produto" val={'− ' + _prc(cost)} neg sub />
            {calc.tax > 0 && <BdRow label={'Impostos (Simples Nacional) · ' + _p1(calc.taxPct)} val={'− ' + _prc(calc.tax)} neg sub />}
            {calc.tax > 0 && <TaxBreakdown simples={calc.simples} stExempt={calc.stExempt} />}
            <div className="prc-bd-total">
              <div>
                <div className="ph-cell-sub" style={{ fontWeight: 700 }}>Lucro por unidade</div>
                <div style={{ fontWeight: 800, fontSize: 22, color: ms.color }}>{_prc(calc.profit)}</div>
              </div>
              <span className="fa-badge" style={{ background: ms.bg, color: ms.color, fontSize: 12.5 }}>
                <Icon name={ms.key === 'ok' ? 'check' : 'alert'} size={13} stroke={2.2} />margem {_p1(calc.margin)}
              </span>
            </div>
          </div>

          {/* Preço por forma de pagamento — regras centralizadas em Configurações gerais */}
          <div className="prc-compete">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="card" size={15} style={{ color: 'var(--fa-info)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Preço por forma de pagamento</span>
            </div>
            <div className="prc-bd-row">
              <span className="prc-bd-l">Pix{calc.paymentBreakdown.pixDiscountPercent > 0 ? ' · -' + _p1(calc.paymentBreakdown.pixDiscountPercent) : ''}</span>
              <span className="prc-bd-v is-strong">{_prc(calc.paymentBreakdown.pixPrice)}</span>
            </div>
            {calc.paymentBreakdown.installments.map((entry) => (
              <div className="prc-bd-row" key={entry.n}>
                <span className="prc-bd-l is-sub">{entry.n}x{entry.hasInterest ? ' com juros' : entry.n > 1 ? ' sem juros' : ''}</span>
                <span className="prc-bd-v">{_prc(entry.installmentValue)}{entry.n > 1 ? ' (' + _prc(entry.totalValue) + ')' : ''}</span>
              </div>
            ))}
            <div className="ph-cell-sub" style={{ marginTop: 8 }}>Regras de Pix e parcelamento são únicas para todas as lojas — editáveis em Configurações gerais.</div>
          </div>

          <div className="prc-promo" data-on={publishOnMarketplace ? '1' : '0'}>
            <div className="fa-row" style={{ padding: 0, border: 'none' }}>
              <div className="fa-row-main"><div className="fa-row-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="store" size={15} style={{ color: 'var(--fa-success)' }} />Exibir no marketplace</div><div className="fa-row-desc">publica este item na vitrine com o preço definido neste painel</div></div>
              <Toggle on={publishOnMarketplace} onChange={setPublishOnMarketplace} ariaLabel="publicar item no marketplace" />
            </div>
            <div className="fa-field" style={{ marginTop: 14 }}>
              <label>Catalogo do marketplace</label>
              <select className="fa-select" value={marketplaceCategory} onChange={(event) => setMarketplaceCategory(event.target.value)}>
                {MARKETPLACE_CATALOG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="ph-cell-sub" style={{ marginTop: 6 }}>
                {MARKETPLACE_CATALOG_OPTIONS.find((option) => option.value === marketplaceCategory)?.desc || 'Escolha onde este produto deve aparecer na navegacao da vitrine.'}
              </div>
            </div>
          </div>

          {/* Competitividade — preço médio do mercado (editável) */}
          <div className="prc-compete">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="chart" size={15} style={{ color: 'var(--fa-info)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Posição frente ao mercado</span>
              {ref > 0 && <span style={{ marginLeft: 'auto' }}><VsMarket vsRef={calc.vsRef} refPrice={ref} /></span>}
            </div>
            <div className="prc-input-row" style={{ marginBottom: 4 }}>
              <span className="fin-prem-pre">R$</span>
              <FinStepper value={ref} onChange={setRef} step={0.5} />
              <span className="ph-cell-sub" style={{ marginLeft: 'auto', textAlign: 'right', lineHeight: 1.35 }}>preço médio do mercado<br />(concorrência)</span>
            </div>
            {ref > 0 ? (
              <>
                <div className="prc-compete-track">
                  <span className="prc-ref-mark" style={{ left: '50%' }} title={'Mercado · ' + _prc(ref)}><i /><b>mercado</b></span>
                  <span className="prc-you-mark" style={{ left: Math.max(4, Math.min(96, 50 + calc.vsRef * 1.6)) + '%' }}><i /><b>você</b></span>
                </div>
                <div className="ph-cell-sub" style={{ marginTop: 22 }}>Mercado: <b className="fa-mono">{_prc(ref)}</b> · seu preço: <b className="fa-mono">{_prc(price)}</b></div>
              </>
            ) : (
              <div className="ph-cell-sub" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="info" size={13} style={{ flex: 'none' }} />Informe o preço praticado pela concorrência para comparar.
              </div>
            )}
          </div>
        </div>

        <div className="ph-drawer-foot">
          <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={price <= 0}
            onClick={() => onSave({ cost: Math.round(cost * 100) / 100, price: Math.round(price * 100) / 100, promo: 0, ref: Math.round(ref * 100) / 100, cat: marketplaceCategory, marketplaceVisible: publishOnMarketplace })}>
            <Icon name="check" size={16} stroke={2.2} />Salvar e publicar
          </button>
        </div>
      </div>
    </div>
  );
  return createPortal(node, document.body);
}
function BdRow({ label, val, neg, strong, sub, divider }) {
  return (
    <div className="prc-bd-row" data-divider={divider ? '1' : '0'}>
      <span className={'prc-bd-l' + (sub ? ' is-sub' : '')}>{label}</span>
      <span className={'prc-bd-v' + (strong ? ' is-strong' : '')} style={neg ? { color: 'var(--fa-ink-3)' } : undefined}>{val}</span>
    </div>
  );
}

/* desdobra a alíquota efetiva do Simples Nacional entre IRPJ/CSLL/COFINS/PIS/CPP/ICMS — transparência do "todo o cálculo" */
function TaxBreakdown({ simples, stExempt }) {
  const rows = [
    ['IRPJ', simples.breakdown.irpj],
    ['CSLL', simples.breakdown.csll],
    ['COFINS', simples.breakdown.cofins],
    ['PIS', simples.breakdown.pis],
    ['CPP', simples.breakdown.cpp],
    ['ICMS', simples.breakdown.icms],
  ];
  return (
    <div className="prc-tax-breakdown">
      {rows.map(([label, pct]) => {
        const excluded = stExempt && label === 'ICMS';
        return (
          <div key={label} className="prc-tax-row" data-excluded={excluded ? '1' : '0'} title={excluded ? 'Recolhido pelo fornecedor via substituição tributária' : undefined}>
            <span>{label}{excluded ? ' · ST' : ''}</span>
            <span>{_p1(pct)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ===================== MODAL: APLICAR MARGEM EM MASSA ===================== */
function BulkMarginModal({ rows, mkt, cnaeIndex, taxRegime, onClose, onApply }) {
  const [target, setTarget] = useState(Math.max(mkt.minMargin, 22));
  const taxPctFor = (it) => {
    const cnae = (cnaeIndex || {})[it.cnae] || null;
    const simples = simplesEffectiveRate(taxRegime && taxRegime.trailing12mRevenue);
    const stExempt = !!(cnae && cnae.isSubjectToIcmsSt);
    return Math.max(0, simples.aliquotaEfetiva - (stExempt ? simples.breakdown.icms : 0));
  };
  const updates = rows.map(({ it }) => {
    const p = priceForMargin(+it.cost || 0, target, mkt, taxPctFor(it));
    return p ? { id: it.id, patch: { price: _round90(p) } } : null;
  }).filter(Boolean);
  const sample = rows.slice(0, 3);

  return (
    <ModalShell open={true} onClose={onClose} maxw={500}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="scale" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Aplicar margem em massa</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>Reajusta o preço de tabela dos <b>{rows.length}</b> itens filtrados para atingir uma margem líquida-alvo após as taxas da vitrine.</p>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="ph-cell-sub">Margem líquida-alvo</span>
        <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--fa-primary)' }}>{target}%</span>
      </div>
      <input className="prc-range" type="range" min="5" max="50" step="1" value={target} onChange={(e) => setTarget(+e.target.value)} />

      <div className="prc-preview">
        <div className="prc-bd-title" style={{ marginBottom: 8 }}>Prévia ({Math.min(3, sample.length)} de {rows.length})</div>
        {sample.map(({ it }) => {
          const np = priceForMargin(+it.cost || 0, target, mkt, taxPctFor(it));
          const newPrice = np ? _round90(np) : it.price;
          return (
            <div className="prc-prev-row" key={it.id}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 13 }}>{it.name}</span>
              <span className="fa-price-old fa-mono" style={{ fontSize: 12.5 }}>{_prc(it.price)}</span>
              <Icon name="arrowR" size={13} style={{ color: 'var(--fa-ink-3)' }} />
              <span className="fa-mono" style={{ fontWeight: 800, color: 'var(--fa-primary)' }}>{_prc(newPrice)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!updates.length} onClick={() => onApply(updates, updates.length)}>
          <Icon name="check" size={16} stroke={2.2} />Reajustar {updates.length} {updates.length === 1 ? 'preço' : 'preços'}
        </button>
      </div>
      <p className="ph-cell-sub" style={{ textAlign: 'center', marginTop: 12 }}>Promoções ativas são mantidas e aplicadas sobre o novo preço.</p>
    </ModalShell>
  );
}

export { BdRow, BulkMarginModal, FeeRow, MarketplaceFees, PriceDrawer, PricingScreen, PricingSettingsDrawer, TaxBreakdown, VsMarket, cnaeIndexByCode, marginState, priceCalc, priceForMargin, principalCnae, simplesEffectiveRate };
