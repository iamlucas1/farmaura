import React, { useMemo, useState } from "react";
import { resolvePaymentBreakdown } from "../../shared/payment-pricing.js";
import { buildCouponProductOptions, CouponTargetPicker } from "./coupons-screen.jsx";
import { FinStepper } from "./finance-screen.jsx";
import {
  Icon, PageHead, Modal, Drawer, Field, SwitchToggle, PillNav, KpiChip,
  Badge, EmptyState, confirmAction, showToast, money, numfmt,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Precificador do marketplace.
   Define preço de venda, margem, descontos/promoções e mostra o repasse líquido depois das taxas
   da vitrine (comissão + pagamento + tarifa fixa). Taxas e meta de margem são editáveis e recalculam
   tudo em tempo real. */

const _prc = (n) => money(n);
const _p1 = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const _round90 = (n) => Math.max(0.9, Math.floor(n) + 0.90); // arredonda para final .90
const MARKETPLACE_CATALOG_OPTIONS = [
  { value: "Medicamentos", label: "Medicamentos", desc: "Remedios, genericos, similares e itens de prescricao." },
  { value: "Perfumaria", label: "Perfumaria", desc: "Beleza, skincare, dermocosmeticos e rotina pessoal." },
  { value: "Bem-estar", label: "Bem-estar", desc: "Vitaminas, suplementos e apoio para a rotina de saude." },
  { value: "Cuidados", label: "Cuidados diarios", desc: "Higiene, mamae e bebe e necessidades do dia a dia." },
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

/* ===================== SIMPLES NACIONAL — ANEXO I (LC 123/2006, redação da LC 155/2016, vigente
   desde 01/2018) — tabela oficial de comércio: alíquota nominal + parcela a deduzir por faixa de
   RBT12, e a repartição de cada faixa entre IRPJ/CSLL/COFINS/PIS/CPP/ICMS. Consulte a contabilidade
   da farmácia periodicamente — lei tributária muda. ===================== */
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
  const eff = promo > 0 ? price * (1 - promo / 100) : price;
  const commission = eff * (mkt.commissionPct / 100);
  const payFee = eff * (mkt.paymentFeePct / 100);
  const fixed = +mkt.fixedFee || 0;
  const fees = commission + payFee + fixed;
  const payout = eff - fees;
  const cnae = (cnaeIndex || {})[it.cnae] || null;
  const simples = simplesEffectiveRate(taxRegime && taxRegime.trailing12mRevenue);
  const stExempt = it.isSubjectToIcmsSt != null ? !!it.isSubjectToIcmsSt : !!(cnae && cnae.isSubjectToIcmsSt);
  const taxPct = Math.max(0, simples.aliquotaEfetiva - (stExempt ? simples.breakdown.icms : 0));
  const tax = eff * (taxPct / 100);
  const profit = payout - cost - tax;
  const margin = eff > 0 ? profit / eff * 100 : 0;
  const markup = cost > 0 ? profit / cost * 100 : 0;
  const ref = +it.ref || 0;
  const vsRef = ref > 0 ? (price - ref) / ref * 100 : 0;
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
  if (margin < 0) return { key: "neg", label: "Prejuízo", tone: "critical" };
  if (margin < minMargin) return { key: "low", label: "Abaixo da meta", tone: "warning" };
  return { key: "ok", label: "Saudável", tone: "good" };
}

/* identidade do produto ignorando lote/local — mesmo EAN, ou mesmo nome+marca, agrupam junto */
function productGroupKey(it) {
  const ean = (it.ean || "").trim();
  if (ean) return "ean:" + ean;
  return "name:" + (it.name || "").trim().toLowerCase() + "|" + (it.brand || "").trim().toLowerCase();
}
function productGroupLabel(it) {
  return (it.name || "Produto") + (it.brand ? " · " + it.brand : "");
}

/* chip de competitividade vs. preço médio de mercado */
function VsMarket({ vsRef, refPrice }) {
  if (!refPrice) return <span className="cell-muted">—</span>;
  const near = Math.abs(vsRef) < 2;
  const cheaper = vsRef < 0;
  const tone = near ? "neutral" : cheaper ? "good" : "warning";
  return (
    <Badge tone={tone}>
      <Icon name={near ? "activity" : cheaper ? "chevD" : "trenddown"} size={11} />
      {near ? "na média" : Math.abs(vsRef).toFixed(0) + "% " + (cheaper ? "abaixo" : "acima")}
    </Badge>
  );
}

/* ===================== TELA PRINCIPAL ===================== */
function PricingScreen({ ctx }) {
  const { inventory, marketplace: mkt, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, setItemPricing, pdvDiscountSettings, setPdvDiscountSettings, savePdvDiscountSettings, pdvDiscountSettingsBusy, cnaeSettings, openPromotionCreate, onNav } = ctx;
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");
  const [groupBy, setGroupBy] = useState("category");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [edit, setEdit] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const cnaeIndex = cnaeIndexByCode(cnaeSettings);
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
  const enriched = inventory.map((it) => ({ it, calc: priceCalc(it, mkt, cnaeIndex, taxRegime) }));
  const counts = {
    all: inventory.length,
    low: enriched.filter((e) => e.calc.margin < mkt.minMargin).length,
    controlled: inventory.filter((it) => it.controlled).length,
  };
  const brandOptions = [...new Set(inventory.map((it) => (it.brand || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const match = ({ it, calc }) => {
    if (cat === "low" && calc.margin >= mkt.minMargin) return false;
    if (cat === "controlled" && !it.controlled) return false;
    if (brand !== "all" && (it.brand || "").trim() !== brand) return false;
    if (query && !(it.name + it.brand + it.ean).toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  };
  const rows = enriched.filter(match).slice().sort((left, right) => {
    if (groupBy === "product") {
      const c = productGroupLabel(left.it).localeCompare(productGroupLabel(right.it), "pt-BR");
      return c !== 0 ? c : (left.it.batch || "").localeCompare(right.it.batch || "", "pt-BR");
    }
    const c = (left.it.cat || "Medicamentos").localeCompare(right.it.cat || "Medicamentos", "pt-BR");
    return c !== 0 ? c : (left.it.name || "").localeCompare(right.it.name || "", "pt-BR");
  });
  const groupedRows = rows.reduce((groups, row) => {
    const key = groupBy === "product" ? productGroupKey(row.it) : (row.it.cat || "Medicamentos");
    const label = groupBy === "product" ? productGroupLabel(row.it) : (row.it.cat || "Medicamentos");
    if (!groups[key]) groups[key] = { label, rows: [] };
    groups[key].rows.push(row);
    return groups;
  }, {});
  const groupedEntries = Object.entries(groupedRows);
  const toggleGroup = (key) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const collapseAllGroups = () => setCollapsedGroups(Object.fromEntries(groupedEntries.map(([key]) => [key, true])));
  const expandAllGroups = () => setCollapsedGroups(Object.fromEntries(groupedEntries.map(([key]) => [key, false])));

  const avgMargin = enriched.reduce((s, e) => s + e.calc.margin, 0) / (enriched.length || 1);
  const avgPayout = enriched.reduce((s, e) => s + e.calc.payout, 0) / (enriched.length || 1);

  const createProductDiscount = (it) => {
    openPromotionCreate({ kind: "product_discount", scopeType: "products", targetProducts: [it.name] });
    onNav("promotions");
  };

  const savePriceEdit = async (patch) => {
    if (edit.marketplaceVisible && !patch.marketplaceVisible) {
      const ok = await confirmAction({
        title: "Ocultar produto do marketplace?",
        body: `${edit.name} continuará visível no catálogo, mas aparecerá como indisponível e não poderá ser adicionado ao carrinho enquanto estiver oculto.`,
        confirmLabel: "Ocultar e marcar indisponível",
      });
      if (!ok) return;
    }
    setItemPricing(edit.id, patch);
    setEdit(null);
  };

  const renderPricingRow = ({ it, calc }) => {
    const ms = marginState(calc.margin, mkt.minMargin);
    const bar = Math.max(4, Math.min(100, Math.round(calc.margin / (mkt.minMargin * 2) * 100)));
    return (
      <tr key={it.id}>
        <td>
          <div className="cell-strong" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {it.name}{it.controlled && <Badge tone="warning">Tarja</Badge>}
          </div>
          <div className="cell-muted" style={{ fontSize: 12 }}>{it.brand}{it.batch && it.batch !== "—" ? " · lote " + it.batch : ""}</div>
        </td>
        <td className="mono cell-muted">{_prc(calc.cost)}</td>
        <td><span style={{ fontWeight: 800, fontSize: 14.5 }}>{_prc(calc.price)}</span></td>
        <td>
          <div className="mono cell-strong">{_prc(calc.payout)}</div>
          <div className="cell-muted" style={{ fontSize: 11.5 }}>− {_prc(calc.fees)} taxas{calc.tax > 0 ? " · − " + _prc(calc.tax) + " impostos" : ""}</div>
        </td>
        <td>
          <Badge tone={ms.tone}><Icon name={ms.key === "ok" ? "check" : "alert"} size={11} />{_p1(calc.margin)}</Badge>
          <div style={{ height: 5, borderRadius: 5, background: "var(--surface-2)", marginTop: 5, overflow: "hidden", width: 90 }}>
            <div style={{ height: "100%", width: bar + "%", background: `var(--${ms.tone === "good" ? "good" : ms.tone === "warning" ? "warning" : "critical"})` }} />
          </div>
        </td>
        <td><VsMarket vsRef={calc.vsRef} refPrice={calc.ref} /></td>
        <td>{it.marketplaceVisible ? <Badge tone="good"><Icon name="store" size={11} />Publicado</Badge> : <Badge tone="neutral"><Icon name="minus" size={11} />Oculto</Badge>}</td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => createProductDiscount(it)}><Icon name="tag" size={12} />Criar desconto</button>
            <button className="btn btn-primary btn-sm" onClick={() => setEdit(it)}><Icon name="tag" size={12} />Precificar</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Preço & Promoções"
        title="Precificador"
        desc={`Vitrine ${mkt.name} · preços, margens e promoções.`}
        actions={(
          <button className="btn btn-primary" onClick={() => setSettingsOpen(true)}><Icon name="cog" size={14} />Configurações gerais</button>
        )}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <KpiChip icon="boxes" label="Todos os itens" value={counts.all} active={cat === "all"} onClick={() => setCat("all")} />
        <KpiChip icon="alert" label={`Abaixo da meta (${_p1(mkt.minMargin)})`} value={counts.low} tone={counts.low ? "warning" : undefined} active={cat === "low"} onClick={() => setCat("low")} />
        <KpiChip icon="lock" label="Controlados" value={counts.controlled} active={cat === "controlled"} onClick={() => setCat("controlled")} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <PillNav options={[{ key: "category", label: "Por categoria" }, { key: "product", label: "Por produto" }]} active={groupBy} onChange={setGroupBy} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={expandAllGroups}><Icon name="expand" size={13} />Expandir tudo</button>
            <button className="btn btn-secondary btn-sm" onClick={collapseAllGroups}><Icon name="minus" size={13} />Recolher tudo</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setBulk(true)}><Icon name="scale" size={13} />Margem em massa</button>
          </div>
        </div>
        <div className="card-pad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <input className="input" style={{ width: "auto", flex: "1 1 200px", minWidth: 180 }} placeholder="Buscar produto ou EAN" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="input" style={{ width: "auto", minWidth: 170 }} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="all">Todas as marcas</option>
            {brandOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {(brand !== "all" || cat !== "all") && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setBrand("all"); setCat("all"); }}><Icon name="x" size={13} />Limpar filtros</button>
          )}
        </div>
        <div className="card-head" style={{ border: "none" }}>
          <span className="card-head-sub">
            {rows.length} {groupBy === "product" ? "lote(s)" : "item(ns)"} em {groupedEntries.length} {groupBy === "product" ? "produto(s)" : "categoria(s)"} · margem líquida média {_p1(avgMargin)} · repasse médio {_prc(avgPayout)}
          </span>
        </div>
        {rows.length === 0 ? <div className="card-pad"><EmptyState icon="search" title="Nenhum produto neste filtro" /></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Produto</th><th>Custo</th><th>Preço marketplace</th><th>Repasse líquido</th><th>Margem líquida</th><th>vs. mercado</th><th>Publicação</th><th /></tr>
              </thead>
              <tbody>
                {groupedEntries.flatMap(([key, group]) => {
                  const collapsed = !!collapsedGroups[key];
                  const groupQty = group.rows.reduce((sum, { it }) => sum + (it.qty || 0), 0);
                  return [
                    <tr key={"group-" + key}>
                      <td colSpan="8" style={{ padding: 0 }}>
                        <button
                          onClick={() => toggleGroup(key)}
                          aria-label={collapsed ? "Expandir grupo" : "Minimizar grupo"}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "var(--surface-2)", border: "none", cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
                        >
                          <span style={{ fontWeight: 700 }}>{group.label}</span>
                          <span className="cell-muted" style={{ fontSize: 12 }}>
                            {groupBy === "product" ? `${group.rows.length} ${group.rows.length === 1 ? "lote" : "lotes"} · ${groupQty} un` : `${group.rows.length} item(ns)`}
                          </span>
                          <Icon name="chevD" size={13} style={{ marginLeft: "auto", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }} />
                        </button>
                      </td>
                    </tr>,
                    ...(collapsed ? [] : group.rows.map((row) => renderPricingRow(row))),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="page-desc" style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <Icon name="info" size={13} style={{ flex: "none", marginTop: 2 }} />
        Margem líquida = repasse após comissão {_p1(mkt.commissionPct)}, taxa de pagamento {_p1(mkt.paymentFeePct)} e tarifa fixa {_prc(mkt.fixedFee)} — descontado o custo e os impostos do Simples Nacional (Faixa {simplesEffectiveRate(taxRegime.trailing12mRevenue).bracket}), líquidos do ICMS-ST do CNAE de cada item.
      </p>

      {settingsOpen && (
        <PricingSettingsDrawer
          onClose={() => setSettingsOpen(false)}
          mkt={mkt} setMarketplace={setMarketplace} saveMarketplaceMeta={saveMarketplaceMeta} marketplaceMetaBusy={marketplaceMetaBusy}
          pdvDiscountSettings={pdvDiscountSettings} setPdvDiscountSettings={setPdvDiscountSettings}
          savePdvDiscountSettings={savePdvDiscountSettings} pdvDiscountSettingsBusy={pdvDiscountSettingsBusy}
          inventory={inventory}
        />
      )}
      {edit && <PriceDrawer it={edit} mkt={mkt} cnaeSettings={cnaeSettings} onClose={() => setEdit(null)} onSave={savePriceEdit} />}
      {bulk && (
        <BulkMarginModal
          rows={rows} mkt={mkt} cnaeIndex={cnaeIndex} taxRegime={taxRegime} onClose={() => setBulk(false)}
          onApply={(updates, n) => {
            updates.forEach((u) => setItemPricing(u.id, { ...u.patch, __bulk: true }));
            setBulk(false);
            showToast({ message: `${n} preços reajustados · margem aplicada` });
          }}
        />
      )}
    </div>
  );
}

/* ===================== DRAWER: CONFIGURAÇÕES GERAIS DE PREÇO ===================== */
function PricingSettingsDrawer({ onClose, mkt, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, pdvDiscountSettings, setPdvDiscountSettings, savePdvDiscountSettings, pdvDiscountSettingsBusy, inventory }) {
  return (
    <Drawer open onClose={onClose} title="Configurações gerais de preço" subtitle="Taxas da vitrine e regras de desconto que afetam todos os itens do catálogo">
      <MarketplaceFees mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
      <PaymentRulesSettings mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
      <CashbackSettings mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
      <AnniversaryDiscountSettings mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />
      <InstallmentOverridesSettings mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} inventory={inventory} />
      <PdvDiscountMarginSettings settings={pdvDiscountSettings} setSettings={setPdvDiscountSettings} onSave={savePdvDiscountSettings} saving={pdvDiscountSettingsBusy} />
    </Drawer>
  );
}

function SettingsCard({ icon, title, sub, badge, children, onSave, saving }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div><h3><Icon name={icon} size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{title}</h3>{sub && <div className="card-head-sub">{sub}</div>}</div>
        {badge}
      </div>
      <div className="card-pad">
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={!!saving}>
            <Icon name="check" size={13} />{saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketplaceFees({ mkt, setMarketplace, onSave, saving }) {
  return (
    <SettingsCard icon="store" title="Taxas da vitrine" sub="Quanto a plataforma retém em cada venda — afeta o repasse e a margem de todos os itens" badge={<Badge tone="neutral"><Icon name="cog" size={11} />{mkt.name}</Badge>} onSave={onSave} saving={saving}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FeeRow icon="percent" label="Comissão" sub="sobre o preço de venda"><FinStepper value={mkt.commissionPct} onChange={(v) => setMarketplace({ commissionPct: v })} step={0.5} max={40} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
        <FeeRow icon="card" label="Taxa de pagamento" sub="gateway / antecipação"><FinStepper value={mkt.paymentFeePct} onChange={(v) => setMarketplace({ paymentFeePct: v })} step={0.1} max={15} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
        <FeeRow icon="receipt" label="Tarifa fixa" sub="por pedido"><span className="cell-muted" style={{ marginRight: 6 }}>R$</span><FinStepper value={mkt.fixedFee} onChange={(v) => setMarketplace({ fixedFee: v })} step={0.1} max={20} pct /></FeeRow>
        <FeeRow icon="gauge" label="Meta de margem" sub="alvo de margem líquida"><FinStepper value={mkt.minMargin} onChange={(v) => setMarketplace({ minMargin: v })} step={1} max={60} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
      </div>
    </SettingsCard>
  );
}
function CashbackSettings({ mkt, setMarketplace, onSave, saving }) {
  return (
    <SettingsCard icon="gift" title="Cashback" sub="Taxa padrão de acúmulo e o quanto o cliente pode abater do pagamento com a carteira" onSave={onSave} saving={saving}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FeeRow icon="percent" label="Cashback padrão" sub="produtos sem % própria cadastrada (ver tela Produtos)"><FinStepper value={mkt.cashbackDefaultPercent} onChange={(v) => setMarketplace({ cashbackDefaultPercent: v })} step={0.5} max={30} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
        <FeeRow icon="gauge" label="Teto de resgate por pedido" sub="máximo do total do pedido que pode ser pago com cashback"><FinStepper value={mkt.cashbackRedeemMaxPercent} onChange={(v) => setMarketplace({ cashbackRedeemMaxPercent: v })} step={5} max={100} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
      </div>
    </SettingsCard>
  );
}
function AnniversaryDiscountSettings({ mkt, setMarketplace, onSave, saving }) {
  return (
    <SettingsCard icon="sparkle" title="Cupons de aniversário" sub="Desconto que o cliente resgata durante o mês do aniversário de nascimento ou de cliente" onSave={onSave} saving={saving}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FeeRow icon="calendar" label="Aniversário de nascimento" sub="mês da data de nascimento cadastrada no perfil">
          <SwitchToggle on={!!mkt.birthdayDiscountEnabled} onChange={(v) => setMarketplace({ birthdayDiscountEnabled: v })} label="ativar desconto de aniversário de nascimento" />
          <span style={{ width: 10 }} />
          <FinStepper value={mkt.birthdayDiscountPercent} onChange={(v) => setMarketplace({ birthdayDiscountPercent: v })} step={1} max={50} pct disabled={!mkt.birthdayDiscountEnabled} /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
        <FeeRow icon="sparkle" label="Aniversário de cliente" sub="mês em que a conta foi criada, todo ano">
          <SwitchToggle on={!!mkt.customerAnniversaryDiscountEnabled} onChange={(v) => setMarketplace({ customerAnniversaryDiscountEnabled: v })} label="ativar desconto de aniversário de cliente" />
          <span style={{ width: 10 }} />
          <FinStepper value={mkt.customerAnniversaryDiscountPercent} onChange={(v) => setMarketplace({ customerAnniversaryDiscountPercent: v })} step={1} max={50} pct disabled={!mkt.customerAnniversaryDiscountEnabled} /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span>
        </FeeRow>
      </div>
      <p className="page-desc" style={{ marginTop: 10 }}>O cliente vê o resgate em "Meu perfil" durante o mês do aniversário e precisa clicar para gerar o cupom — não é aplicado automaticamente no checkout.</p>
    </SettingsCard>
  );
}
function InstallmentOverridesSettings({ mkt, setMarketplace, onSave, saving, inventory }) {
  const rules = Array.isArray(mkt.installmentOverrides) ? mkt.installmentOverrides : [];
  const productOptions = useMemo(() => buildCouponProductOptions(inventory), [inventory]);
  const updateRule = (index, patch) => setMarketplace({ installmentOverrides: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  const removeRule = (index) => setMarketplace({ installmentOverrides: rules.filter((_, i) => i !== index) });
  const addRule = () => setMarketplace({ installmentOverrides: [...rules, { scopeType: "product", productRef: "", minValue: 0, maxInstallments: 1, interestFreeInstallments: 1 }] });

  return (
    <SettingsCard icon="card" title="Exceções de parcelamento" sub="Um limite de parcelas diferente do geral, para um produto específico ou a partir de um valor mínimo de compra" onSave={onSave} saving={saving}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rules.map((rule, index) => (
          <div key={index} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <PillNav options={[{ key: "product", label: "Por produto" }, { key: "min_value", label: "Por valor mínimo" }]} active={rule.scopeType} onChange={(scopeType) => updateRule(index, { scopeType })} />
              <button type="button" className="icon-btn" aria-label="Remover regra" onClick={() => removeRule(index)}><Icon name="trash" size={14} /></button>
            </div>
            {rule.scopeType === "min_value" ? (
              <FeeRow icon="receipt" label="Valor mínimo" sub="a partir deste subtotal"><span className="cell-muted" style={{ marginRight: 6 }}>R$</span><FinStepper value={rule.minValue} onChange={(v) => updateRule(index, { minValue: v })} step={5} max={2000} pct /></FeeRow>
            ) : (
              <CouponTargetPicker
                label="Produto" tooltip="Produto do estoque que recebe este limite de parcelas específico." align="start"
                placeholder="Buscar produto" searchPlaceholder="Buscar produtos do estoque"
                options={productOptions} selectedValues={rule.productRef ? [rule.productRef] : []}
                onChange={(values) => updateRule(index, { productRef: values[values.length - 1] || "" })}
                emptyMessage="Nenhum produto encontrado."
              />
            )}
            <FeeRow icon="card" label="Máximo de parcelas" sub="para este caso"><FinStepper value={rule.maxInstallments} onChange={(v) => updateRule(index, { maxInstallments: Math.round(v) })} step={1} max={12} /></FeeRow>
            <FeeRow icon="check" label="Parcelas sem juros" sub="até esta parcela, sem juros"><FinStepper value={rule.interestFreeInstallments} onChange={(v) => updateRule(index, { interestFreeInstallments: Math.round(v) })} step={1} max={12} /></FeeRow>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRule} style={{ alignSelf: "flex-start" }}><Icon name="plus" size={13} />Adicionar regra</button>
      </div>
    </SettingsCard>
  );
}
function PaymentRulesSettings({ mkt, setMarketplace, onSave, saving }) {
  return (
    <SettingsCard icon="card" title="Pix e parcelamento" sub="Regra única para todas as lojas — padroniza como Pix e parcelas são exibidos no marketplace" onSave={onSave} saving={saving}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FeeRow icon="pix" label="Desconto no Pix" sub="sobre o preço de tabela"><FinStepper value={mkt.pixDiscountPercent} onChange={(v) => setMarketplace({ pixDiscountPercent: v })} step={0.5} max={20} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
        <FeeRow icon="card" label="Máximo de parcelas" sub="no cartão de crédito"><FinStepper value={mkt.maxInstallments} onChange={(v) => setMarketplace({ maxInstallments: Math.round(v) })} step={1} max={12} /></FeeRow>
        <FeeRow icon="check" label="Parcelas sem juros" sub="até esta parcela, sem juros"><FinStepper value={mkt.interestFreeInstallments} onChange={(v) => setMarketplace({ interestFreeInstallments: Math.round(v) })} step={1} max={12} /></FeeRow>
        <FeeRow icon="percent" label="Juros ao mês" sub="a partir da parcela seguinte"><FinStepper value={mkt.installmentInterestPercent} onChange={(v) => setMarketplace({ installmentInterestPercent: v })} step={0.5} max={20} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
      </div>
    </SettingsCard>
  );
}
function PdvDiscountMarginSettings({ settings, setSettings, onSave, saving }) {
  return (
    <SettingsCard icon="scale" title="Desconto no balcão (PDV)" sub="Margem média mínima que o carrinho deve manter para liberar um desconto" onSave={onSave} saving={saving}>
      <FeeRow icon="gauge" label="Margem mínima considerada" sub="média do carrinho, após o desconto e o cashback do cliente"><FinStepper value={settings.minMarginPercent} onChange={(v) => setSettings({ minMarginPercent: v })} step={1} max={95} pct /><span className="cell-muted" style={{ marginLeft: 6 }}>%</span></FeeRow>
    </SettingsCard>
  );
}
function FeeRow({ icon, label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="stat-icon" style={{ width: 30, height: 30, background: "var(--surface-2)", color: "var(--text-secondary)" }}><Icon name={icon} size={14} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div>
        {sub && <div className="cell-muted" style={{ fontSize: 11 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}

/* ===================== DRAWER: PRECIFICADOR DE UM ITEM ===================== */
function PriceDrawer({ it, mkt, cnaeSettings, onClose, onSave }) {
  const [cost] = useState(+it.cost || 0);
  const [price, setPrice] = useState(+it.price || 0);
  const [ref, setRef] = useState(+it.ref || 0);
  const [marketplaceCategory, setMarketplaceCategory] = useState(() => {
    const current = String(it.cat || "Medicamentos").trim();
    const supported = new Set(MARKETPLACE_CATALOG_OPTIONS.map((option) => option.value));
    return supported.has(current) ? current : "Medicamentos";
  });
  const [publishOnMarketplace, setPublishOnMarketplace] = useState(!!it.marketplaceVisible);
  const [mode, setMode] = useState("price");

  const cnaeIndex = cnaeIndexByCode(cnaeSettings);
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || {};
  const selectedCnae = cnaeIndex[it.cnae] || null;
  const eff = price;
  const calc = priceCalc({ cost, price, promo: 0, ref, cnae: it.cnae, isSubjectToIcmsSt: it.isSubjectToIcmsSt }, mkt, cnaeIndex, taxRegime);
  const ms = marginState(calc.margin, mkt.minMargin);

  const onMargin = (m) => { const p = priceForMargin(cost, m, mkt, calc.taxPct); if (p) setPrice(Math.round(p * 100) / 100); };
  const currentTargetMargin = Math.max(0, Math.round(calc.margin));

  return (
    <Drawer
      open onClose={onClose}
      title={(<span style={{ display: "flex", alignItems: "center", gap: 7 }}>{it.name}{it.controlled && <Badge tone="warning">Tarja</Badge>}</span>)}
      subtitle={<>{it.brand} · {it.cat} · <span className="mono">{it.ean}</span></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Custo de aquisição</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="cell-muted">R$</span>
            <div className="input" style={{ display: "flex", alignItems: "center", fontWeight: 700 }}>{cost.toFixed(2).replace(".", ",")}</div>
            <span className="page-desc" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>CMV unitário bloqueado</span>
          </div>
        </div>

        <div>
          <PillNav options={[{ key: "price", label: "Definir por preço" }, { key: "margin", label: "Definir por margem" }]} active={mode} onChange={setMode} />
          <div style={{ marginTop: 12 }}>
            {mode === "price" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="cell-muted">R$</span>
                <FinStepper value={price} onChange={setPrice} step={0.5} />
                <span className="page-desc" style={{ marginLeft: "auto" }}>preço de tabela na vitrine</span>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="page-desc" style={{ margin: 0 }}>Margem líquida-alvo</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: "var(--accent)" }}>{currentTargetMargin}%</span>
                </div>
                <input type="range" min="0" max="60" step="1" value={currentTargetMargin} onChange={(e) => onMargin(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span className="page-desc" style={{ margin: 0 }}>preço resultante</span>
                  <span style={{ fontWeight: 800 }}>{_prc(price)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <Field label="CNAE para tributação" hint={(
          <>
            {selectedCnae
              ? `Simples Nacional · Faixa ${calc.simples.bracket} · alíquota aplicada ${_p1(calc.taxPct)}${calc.stExempt ? " · ICMS já recolhido por substituição tributária" : ""}`
              : `Sem CNAE, o item ainda é taxado pela alíquota efetiva do Simples Nacional (Faixa ${calc.simples.bracket}).`}
            {" "}Editável na tela <strong>Produtos</strong>.
          </>
        )}>
          <div className="input" style={{ display: "flex", alignItems: "center", fontWeight: 700 }}>
            {selectedCnae ? selectedCnae.code + (selectedCnae.description ? " · " + selectedCnae.description : "") : "Sem CNAE definido"}
          </div>
        </Field>

        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Composição do repasse</div>
          <BdRow label="Preço de venda" val={_prc(eff)} strong />
          <BdRow label={`Comissão · ${_p1(mkt.commissionPct)}`} val={"− " + _prc(calc.commission)} neg sub />
          <BdRow label={`Taxa de pagamento · ${_p1(mkt.paymentFeePct)}`} val={"− " + _prc(calc.payFee)} neg sub />
          <BdRow label="Tarifa fixa" val={"− " + _prc(calc.fixed)} neg sub />
          <BdRow label="Repasse líquido" val={_prc(calc.payout)} strong divider />
          <BdRow label="Custo do produto" val={"− " + _prc(cost)} neg sub />
          {calc.tax > 0 && <BdRow label={`Impostos (Simples Nacional) · ${_p1(calc.taxPct)}`} val={"− " + _prc(calc.tax)} neg sub />}
          {calc.tax > 0 && <TaxBreakdown simples={calc.simples} stExempt={calc.stExempt} />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div>
              <div className="page-desc" style={{ margin: 0, fontWeight: 700 }}>Lucro por unidade</div>
              <div style={{ fontWeight: 800, fontSize: 21 }}>{_prc(calc.profit)}</div>
            </div>
            <Badge tone={ms.tone}><Icon name={ms.key === "ok" ? "check" : "alert"} size={12} />margem {_p1(calc.margin)}</Badge>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="card" size={14} style={{ color: "var(--info)" }} /><span style={{ fontWeight: 700, fontSize: 13 }}>Preço por forma de pagamento</span>
          </div>
          <BdRow label={`Pix${calc.paymentBreakdown.pixDiscountPercent > 0 ? " · -" + _p1(calc.paymentBreakdown.pixDiscountPercent) : ""}`} val={_prc(calc.paymentBreakdown.pixPrice)} strong />
          {calc.paymentBreakdown.installments.map((entry) => (
            <BdRow key={entry.n} sub label={`${entry.n}x${entry.hasInterest ? " com juros" : entry.n > 1 ? " sem juros" : ""}`} val={`${_prc(entry.installmentValue)}${entry.n > 1 ? " (" + _prc(entry.totalValue) + ")" : ""}`} />
          ))}
          <p className="page-desc" style={{ marginTop: 8 }}>Regras de Pix e parcelamento são únicas para todas as lojas — editáveis em Configurações gerais.</p>
        </div>

        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon name="store" size={14} style={{ color: "var(--good)" }} /><span style={{ fontWeight: 700, fontSize: 13 }}>Exibir no marketplace</span></div>
            <SwitchToggle on={publishOnMarketplace} onChange={setPublishOnMarketplace} label="publicar item no marketplace" />
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Catálogo do marketplace" hint={MARKETPLACE_CATALOG_OPTIONS.find((o) => o.value === marketplaceCategory)?.desc}>
              <select className="input" value={marketplaceCategory} onChange={(e) => setMarketplaceCategory(e.target.value)}>
                {MARKETPLACE_CATALOG_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Icon name="chart" size={14} style={{ color: "var(--info)" }} /><span style={{ fontWeight: 700, fontSize: 13 }}>Posição frente ao mercado</span>
            {ref > 0 && <span style={{ marginLeft: "auto" }}><VsMarket vsRef={calc.vsRef} refPrice={ref} /></span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className="cell-muted">R$</span>
            <FinStepper value={ref} onChange={setRef} step={0.5} />
            <span className="page-desc" style={{ marginLeft: "auto", textAlign: "right" }}>preço médio do mercado (concorrência)</span>
          </div>
          {ref > 0
            ? <p className="page-desc" style={{ margin: 0 }}>Mercado: <b className="mono">{_prc(ref)}</b> · seu preço: <b className="mono">{_prc(price)}</b></p>
            : <p className="page-desc" style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: 6 }}><Icon name="info" size={12} style={{ flex: "none", marginTop: 2 }} />Informe o preço praticado pela concorrência para comparar.</p>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button
          className="btn btn-primary" style={{ flex: 2, justifyContent: "center" }} disabled={price <= 0}
          onClick={() => onSave({ cost: Math.round(cost * 100) / 100, price: Math.round(price * 100) / 100, ref: Math.round(ref * 100) / 100, cat: marketplaceCategory, marketplaceVisible: publishOnMarketplace })}
        >
          <Icon name="check" size={15} />Salvar e publicar
        </button>
      </div>
    </Drawer>
  );
}

function BdRow({ label, val, neg, strong, sub, divider }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: divider ? "1px solid var(--border)" : "none", marginTop: divider ? 6 : 0, paddingTop: divider ? 10 : 5 }}>
      <span className={sub ? "cell-muted" : ""} style={{ fontSize: sub ? 12 : 13, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span className="mono" style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? 14 : 13, color: neg ? "var(--text-muted)" : "inherit" }}>{val}</span>
    </div>
  );
}

/* desdobra a alíquota efetiva do Simples Nacional entre IRPJ/CSLL/COFINS/PIS/CPP/ICMS */
function TaxBreakdown({ simples, stExempt }) {
  const rows = [
    ["IRPJ", simples.breakdown.irpj], ["CSLL", simples.breakdown.csll], ["COFINS", simples.breakdown.cofins],
    ["PIS", simples.breakdown.pis], ["CPP", simples.breakdown.cpp], ["ICMS", simples.breakdown.icms],
  ];
  return (
    <div className="grid g-3" style={{ margin: "8px 0", gap: 6 }}>
      {rows.map(([label, pct]) => {
        const excluded = stExempt && label === "ICMS";
        return (
          <div key={label} title={excluded ? "Recolhido pelo fornecedor via substituição tributária" : undefined} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "var(--surface-2)", opacity: excluded ? 0.55 : 1 }}>
            <span>{label}{excluded ? " · ST" : ""}</span>
            <span className="mono">{_p1(pct)}</span>
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
    <Modal
      open onClose={onClose} title="Aplicar margem em massa"
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!updates.length} onClick={() => onApply(updates, updates.length)}>
            <Icon name="check" size={14} />Reajustar {updates.length} {updates.length === 1 ? "preço" : "preços"}
          </button>
        </>
      )}
    >
      <p className="page-desc" style={{ marginTop: 0 }}>Reajusta o preço de tabela dos <b>{rows.length}</b> itens filtrados para atingir uma margem líquida-alvo após as taxas da vitrine.</p>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="page-desc" style={{ margin: 0 }}>Margem líquida-alvo</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: "var(--accent)" }}>{target}%</span>
      </div>
      <input type="range" min="5" max="50" step="1" value={target} onChange={(e) => setTarget(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }} />

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>Prévia ({Math.min(3, sample.length)} de {rows.length})</div>
        {sample.map(({ it }) => {
          const np = priceForMargin(+it.cost || 0, target, mkt, taxPctFor(it));
          const newPrice = np ? _round90(np) : it.price;
          return (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, fontSize: 12.5 }}>{it.name}</span>
              <span className="mono cell-muted" style={{ fontSize: 12, textDecoration: "line-through" }}>{_prc(it.price)}</span>
              <Icon name="arrowR" size={12} style={{ color: "var(--text-muted)" }} />
              <span className="mono" style={{ fontWeight: 800, color: "var(--accent)" }}>{_prc(newPrice)}</span>
            </div>
          );
        })}
      </div>
      <p className="page-desc" style={{ textAlign: "center", marginTop: 12 }}>Promoções ativas são mantidas e aplicadas sobre o novo preço.</p>
    </Modal>
  );
}

export { BdRow, BulkMarginModal, FeeRow, MarketplaceFees, PriceDrawer, PricingScreen, PricingSettingsDrawer, TaxBreakdown, VsMarket, cnaeIndexByCode, marginState, priceCalc, priceForMargin, principalCnae, simplesEffectiveRate };
