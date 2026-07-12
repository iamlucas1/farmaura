import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { StatCard } from "./dashboard-screen.jsx";
import { FinStepper } from "./finance-screen.jsx";

/* FARMAURA Console — Precificador do marketplace.
   Define preço de venda, margem, descontos/promoções e mostra o repasse líquido
   depois das taxas da vitrine (comissão + pagamento + tarifa fixa).
   As taxas e a meta de margem são editáveis e recalculam tudo em tempo real. */

/* formatadores locais */
const _prc = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
const _p1 = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const _round90 = (n) => Math.max(0.9, Math.floor(n) + 0.90); // arredonda para final .90
const _normalizeImageList = (value) => Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || '').trim()).filter(Boolean))).slice(0, 8);
const _fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'));
  reader.readAsDataURL(file);
});
const MARKETPLACE_CATALOG_OPTIONS = [
  { value: 'Medicamentos', label: 'Medicamentos', desc: 'Remedios, genericos, similares e itens de prescricao.' },
  { value: 'Perfumaria', label: 'Perfumaria', desc: 'Beleza, skincare, dermocosmeticos e rotina pessoal.' },
  { value: 'Bem-estar', label: 'Bem-estar', desc: 'Vitaminas, suplementos e apoio para a rotina de saude.' },
  { value: 'Cuidados', label: 'Cuidados diarios', desc: 'Higiene, mamae e bebe e necessidades do dia a dia.' },
];

/* ---- núcleo de cálculo: desdobra um item sob as taxas do marketplace ---- */
function priceCalc(it, mkt) {
  const cost = +it.cost || 0;
  const price = +it.price || 0;
  const promo = +it.promo || 0;
  const eff = promo > 0 ? price * (1 - promo / 100) : price;        // preço efetivo (já com desconto)
  const commission = eff * (mkt.commissionPct / 100);              // comissão da plataforma
  const payFee = eff * (mkt.paymentFeePct / 100);                 // taxa de pagamento
  const fixed = +mkt.fixedFee || 0;                               // tarifa fixa por pedido
  const fees = commission + payFee + fixed;
  const payout = eff - fees;                                      // repasse líquido à farmácia
  const profit = payout - cost;                                  // lucro por unidade
  const margin = eff > 0 ? profit / eff * 100 : 0;               // margem líquida sobre o preço efetivo
  const markup = cost > 0 ? profit / cost * 100 : 0;            // markup sobre o custo
  const ref = +it.ref || 0;
  const vsRef = ref > 0 ? (price - ref) / ref * 100 : 0;        // + = acima do mercado
  return { cost, price, promo, eff, commission, payFee, fixed, fees, payout, profit, margin, markup, ref, vsRef };
}

/* preço de tabela necessário para atingir uma margem líquida-alvo (sem promoção) */
function priceForMargin(cost, targetMargin, mkt) {
  const f = (mkt.commissionPct + mkt.paymentFeePct) / 100;
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
  const { inventory, marketplace: mkt, setMarketplace, saveMarketplaceMeta, marketplaceMetaBusy, setItemPricing, notify, onLogout, deliveryPricing, setDeliveryPricing, saveDeliveryPricing, deliveryPricingBusy } = ctx;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');     // all | promo | low | controlled
  const [edit, setEdit] = useState(null);    // item sendo precificado
  const [bulk, setBulk] = useState(false);

  const enriched = inventory.map((it) => ({ it, calc: priceCalc(it, mkt) }));
  const counts = {
    all: inventory.length,
    promo: enriched.filter((e) => e.calc.promo > 0).length,
    low: enriched.filter((e) => e.calc.margin < mkt.minMargin).length,
    controlled: inventory.filter((it) => it.controlled).length,
    published: inventory.filter((it) => it.marketplaceVisible).length,
  };
  const match = ({ it, calc }) => {
    if (cat === 'promo' && calc.promo <= 0) return false;
    if (cat === 'low' && calc.margin >= mkt.minMargin) return false;
    if (cat === 'controlled' && !it.controlled) return false;
    if (q && !(it.name + it.brand + it.ean).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };
  const rows = enriched.filter(match);

  // KPIs (sobre todo o catálogo)
  const avgMargin = enriched.reduce((s, e) => s + e.calc.margin, 0) / (enriched.length || 1);
  const avgPayout = enriched.reduce((s, e) => s + e.calc.payout, 0) / (enriched.length || 1);

  return (
    <>
      <Topbar title="Precificador" sub={'Vitrine ' + mkt.name + ' · preços, margens e promoções'} onLogout={onLogout}>
        <div className="ph-topsearch"><Icon name="scan" size={17} style={{ color: 'var(--fa-ink-3)' }} /><input placeholder="Buscar produto ou EAN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Topbar>

      <div className="ph-content ph-content-wide" data-screen-label="Precificador do marketplace">
        {/* KPIs */}
        <div className="ph-stats" style={{ marginBottom: 18 }}>
          <StatCard icon="gauge" value={_p1(avgMargin)} label="Margem líquida média"
            tint={avgMargin >= mkt.minMargin ? { bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' } : { bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }} />
          <StatCard icon="alert" value={counts.low} label={'Itens abaixo da meta (' + _p1(mkt.minMargin) + ')'}
            tint={counts.low ? { bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' } : null} />
          <StatCard icon="percent" value={counts.promo} label="Produtos em promoção"
            tint={{ bg: 'var(--fa-rose-soft)', fg: 'var(--fa-primary)' }} />
          <StatCard icon="bank" value={_prc(avgPayout)} label="Repasse líquido médio" tint={{ bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }} />
        </div>

        {/* Taxas do marketplace (editáveis) */}
        <MarketplaceFees mkt={mkt} setMarketplace={setMarketplace} onSave={saveMarketplaceMeta} saving={marketplaceMetaBusy} />

        {/* Frete por distância da loja (editável) */}
        <DeliveryPricing value={deliveryPricing} setValue={setDeliveryPricing} onSave={saveDeliveryPricing} saving={deliveryPricingBusy} />

        {/* Filtros + ações em massa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0 16px', flexWrap: 'wrap' }}>
          <div className="ph-seg">
            <button data-on={cat === 'all' ? '1' : '0'} onClick={() => setCat('all')}>Todos <span className="ph-seg-n">{counts.all}</span></button>
            <button data-on={cat === 'promo' ? '1' : '0'} onClick={() => setCat('promo')}>Promoção <span className="ph-seg-n">{counts.promo}</span></button>
            <button data-on={cat === 'low' ? '1' : '0'} onClick={() => setCat('low')}>Abaixo da meta <span className="ph-seg-n">{counts.low}</span></button>
            <button data-on={cat === 'controlled' ? '1' : '0'} onClick={() => setCat('controlled')}>Controlados <span className="ph-seg-n">{counts.controlled}</span></button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setBulk(true)}><Icon name="scale" size={15} />Aplicar margem em massa</button>
            <button className="fa-btn fa-btn-soft fa-btn-sm"><Icon name="download" size={15} />Exportar</button>
          </div>
        </div>

        {/* Tabela de precificação */}
        <div className="ph-table-wrap">
          <table className="ph-table prc-table">
            <thead>
              <tr>
                <th>Produto</th><th>Custo</th><th>Preço marketplace</th>
                <th>Repasse líquido</th><th>Margem líquida</th><th>vs. mercado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ it, calc }) => {
                const ms = marginState(calc.margin, mkt.minMargin);
                const bar = Math.max(4, Math.min(100, Math.round(calc.margin / (mkt.minMargin * 2) * 100)));
                return (
                  <tr key={it.id}>
                    <td>
                      <div className="ph-td-name" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{it.name}
                        {it.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
                        {it.marketplaceVisible && <span className="fa-badge fa-badge-health" style={{ fontSize: 10 }}><Icon name="store" size={10} />Publicado</span>}
                        {!it.marketplaceVisible && <span className="fa-badge fa-badge-mist" style={{ fontSize: 10 }}><Icon name="minus" size={10} />Oculto</span>}
                        {calc.promo > 0 && <span className="fa-badge fa-badge-vital" style={{ fontSize: 10 }}><Icon name="percent" size={10} stroke={2.2} />-{calc.promo}%</span>}
                      </div>
                      <div className="ph-cell-sub">{it.brand} · {it.cat}</div>
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
                      <div className="ph-cell-sub">− {_prc(calc.fees)} taxas</div>
                    </td>
                    <td>
                      <span className="fa-badge" style={{ background: ms.bg, color: ms.color }}>
                        <Icon name={ms.key === 'ok' ? 'check' : 'alert'} size={11} stroke={2.2} />{_p1(calc.margin)}
                      </span>
                      <div className="prc-bar"><i style={{ width: bar + '%', background: ms.color }} /></div>
                    </td>
                    <td><VsMarket vsRef={calc.vsRef} refPrice={calc.ref} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setEdit(it)}><Icon name="tag" size={14} />Precificar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="ph-empty"><span className="fa-iconbox"><Icon name="search" size={28} /></span><div>Nenhum produto neste filtro.</div></div>}
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="info" size={13} style={{ flex: 'none' }} />Margem líquida = repasse após comissão {_p1(mkt.commissionPct)}, taxa de pagamento {_p1(mkt.paymentFeePct)} e tarifa fixa {_prc(mkt.fixedFee)} — descontado o custo.
        </div>
      </div>

      {edit && <PriceDrawer it={edit} mkt={mkt} onClose={() => setEdit(null)} onSave={(patch) => { setItemPricing(edit.id, patch); setEdit(null); }} />}
      {bulk && <BulkMarginModal rows={rows} mkt={mkt} onClose={() => setBulk(false)} onApply={(updates, n) => { updates.forEach((u) => setItemPricing(u.id, { ...u.patch, __bulk: true })); setBulk(false); notify(n + ' preços reajustados · margem aplicada', 'success'); }} />}
    </>
  );
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
function DeliveryPricing({ value, setValue, onSave, saving }) {
  /** Render the distance-based delivery fee configuration. */

  const tiers = Array.isArray(value.tiers) ? value.tiers : [];
  const setTiers = (nextTiers) => setValue({ ...value, tiers: nextTiers });
  const updateTier = (index, patch) => setTiers(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  const addTier = () => setTiers([...tiers, { upToKm: tiers.length ? (tiers[tiers.length - 1].upToKm || 0) + 2 : 3, fee: 0 }]);
  const removeTier = (index) => setTiers(tiers.filter((_, i) => i !== index));

  return (
    <AnCard icon="truck" title="Frete por distância da loja" sub="Defina faixas de km a partir da loja: quanto mais longe, maior a taxa — ou deixe grátis em uma faixa"
      right={<span className="fa-badge fa-badge-mist"><Icon name="pin" size={12} />{tiers.length ? tiers.length + ' faixas' : 'Regra padrão'}</span>}>
      {tiers.length === 0 && (
        <div className="fa-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Sem faixas configuradas: hoje vale a regra padrão (grátis a partir de {'R$ ' + Number(value.freeAboveSubtotal || 0).toFixed(2)} em pedidos, senão taxa fixa de {'R$ ' + Number(value.feeBeyondLastTier || 0).toFixed(2)}).
        </div>
      )}
      <div className="prc-fees">
        {tiers.map((tier, index) => (
          <FeeRow key={index} icon="pin" label={'Até ' + (tier.upToKm || 0) + ' km'}>
            <span className="fin-prem-pre" style={{ marginRight: 6 }}>R$</span>
            <input className="fa-input" type="number" min="0" step="0.5" style={{ width: 90 }} value={tier.fee}
              onChange={(e) => updateTier(index, { fee: Number(e.target.value) })} />
            <span className="fin-prem-pre" style={{ margin: '0 6px' }}>até</span>
            <input className="fa-input" type="number" min="0.5" step="0.5" style={{ width: 80 }} value={tier.upToKm}
              onChange={(e) => updateTier(index, { upToKm: Number(e.target.value) })} />
            <span className="fin-prem-pre" style={{ marginLeft: 4 }}>km</span>
            <button className="fa-btn fa-btn-ghost fa-btn-sm" style={{ marginLeft: 8 }} onClick={() => removeTier(index)}><Icon name="trash" size={14} /></button>
          </FeeRow>
        ))}
        <FeeRow icon="receipt" label="Taxa acima da última faixa" sub="ou taxa padrão se nenhuma faixa configurada">
          <span className="fin-prem-pre" style={{ marginRight: 6 }}>R$</span>
          <input className="fa-input" type="number" min="0" step="0.5" style={{ width: 90 }} value={value.feeBeyondLastTier}
            onChange={(e) => setValue({ ...value, feeBeyondLastTier: Number(e.target.value) })} />
        </FeeRow>
        <FeeRow icon="gauge" label="Frete grátis acima de" sub="usado apenas quando não há faixas configuradas">
          <span className="fin-prem-pre" style={{ marginRight: 6 }}>R$</span>
          <input className="fa-input" type="number" min="0" step="5" style={{ width: 90 }} value={value.freeAboveSubtotal}
            onChange={(e) => setValue({ ...value, freeAboveSubtotal: Number(e.target.value) })} />
        </FeeRow>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={addTier}><Icon name="plus" size={14} />Adicionar faixa</button>
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
function PriceDrawer({ it, mkt, onClose, onSave }) {
  const [cost, setCost] = useState(+it.cost || 0);
  const [price, setPrice] = useState(+it.price || 0);
  const [promoOn, setPromoOn] = useState((+it.promo || 0) > 0);
  const [promo, setPromo] = useState(+it.promo || 0);
  const [ref, setRef] = useState(+it.ref || 0);
  const [marketplaceCategory, setMarketplaceCategory] = useState(() => {
    const current = String(it.cat || 'Medicamentos').trim();
    const supported = new Set(MARKETPLACE_CATALOG_OPTIONS.map((option) => option.value));
    return supported.has(current) ? current : 'Medicamentos';
  });
  const [publishOnMarketplace, setPublishOnMarketplace] = useState(!!it.marketplaceVisible);
  const [marketplaceImages, setMarketplaceImages] = useState(_normalizeImageList(it.marketplaceImages));
  const [mode, setMode] = useState('price'); // price | margin

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const eff = promoOn && promo > 0 ? price * (1 - promo / 100) : price;
  const calc = priceCalc({ cost, price, promo: promoOn ? promo : 0, ref }, mkt);
  const ms = marginState(calc.margin, mkt.minMargin);
  const imageInputId = 'pricing-images-' + String(it.id || 'item');

  const onPickMarketplaceImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => /^image\//i.test(file.type));
    if (!files.length) {
      return;
    }
    try {
      const encoded = await Promise.all(files.map(_fileToDataUrl));
      setMarketplaceImages((prev) => _normalizeImageList([...prev, ...encoded]));
    } catch (error) {
      window.alert(error && error.message ? error.message : 'Nao foi possivel adicionar as imagens.');
    } finally {
      event.target.value = '';
    }
  };

  const removeMarketplaceImage = (imageUrl) => {
    setMarketplaceImages((prev) => prev.filter((entry) => entry !== imageUrl));
  };

  // ao puxar a margem-alvo, recalcula o preço de tabela
  const onMargin = (m) => { const p = priceForMargin(cost, m, mkt); if (p) setPrice(Math.round(p * 100) / 100); };
  const currentTargetMargin = (() => { const c = priceCalc({ cost, price, promo: 0, ref }, mkt); return Math.max(0, Math.round(c.margin)); })();

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

          {/* Promoção */}
          <div className="prc-promo" data-on={promoOn ? '1' : '0'}>
            <div className="fa-row" style={{ padding: 0, border: 'none' }}>
              <div className="fa-row-main"><div className="fa-row-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="percent" size={15} style={{ color: 'var(--fa-vital)' }} />Desconto promocional</div><div className="fa-row-desc">selo de oferta na vitrine</div></div>
              <Toggle on={promoOn} onChange={setPromoOn} ariaLabel="ativar promoção" />
            </div>
            {promoOn && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="ph-cell-sub">Percentual de desconto</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--fa-vital)' }}>-{promo}%</span>
                </div>
                <input className="prc-range" data-tone="vital" type="range" min="0" max="60" step="1" value={promo} onChange={(e) => setPromo(+e.target.value)} />
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {[5, 10, 15, 20, 30].map((n) => <button key={n} className="fa-chip" data-active={promo === n ? '1' : '0'} onClick={() => setPromo(n)}>-{n}%</button>)}
                </div>
              </div>
            )}
          </div>

          {/* Desdobramento do repasse (ao vivo) */}
          <div className="prc-breakdown">
            <div className="prc-bd-title">Composição do repasse</div>
            <BdRow label="Preço de venda" val={_prc(price)} />
            {promoOn && promo > 0 && <BdRow label={'Desconto · -' + promo + '%'} val={'− ' + _prc(price - eff)} neg sub />}
            <BdRow label="Preço efetivo" val={_prc(eff)} strong />
            <BdRow label={'Comissão · ' + _p1(mkt.commissionPct)} val={'− ' + _prc(calc.commission)} neg sub />
            <BdRow label={'Taxa de pagamento · ' + _p1(mkt.paymentFeePct)} val={'− ' + _prc(calc.payFee)} neg sub />
            <BdRow label="Tarifa fixa" val={'− ' + _prc(calc.fixed)} neg sub />
            <BdRow label="Repasse líquido" val={_prc(calc.payout)} strong divider />
            <BdRow label="Custo do produto" val={'− ' + _prc(cost)} neg sub />
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

          <div className="prc-promo" data-on={publishOnMarketplace ? '1' : '0'}>
            <div className="fa-row" style={{ padding: 0, border: 'none' }}>
              <div className="fa-row-main"><div className="fa-row-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="store" size={15} style={{ color: 'var(--fa-success)' }} />Exibir no marketplace</div><div className="fa-row-desc">publica este item na vitrine com o preço, desconto e galeria definidos neste painel</div></div>
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

          <div className="prc-compete">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Icon name="image" size={15} style={{ color: 'var(--fa-info)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Galeria do marketplace</span>
              <span className="ph-cell-sub" style={{ marginLeft: 'auto' }}>{marketplaceImages.length}/8 imagens</span>
            </div>
            <div className="ph-cell-sub" style={{ marginBottom: 12 }}>
              Adicione uma ou mais imagens para este produto aparecer com galeria própria no marketplace. Se nenhuma imagem for enviada, a vitrine continua usando o placeholder padrão.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="fa-btn fa-btn-soft" htmlFor={imageInputId}>
                <Icon name="image" size={15} />Adicionar imagens
              </label>
              <input id={imageInputId} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickMarketplaceImages} />
              {!!marketplaceImages.length && <button className="fa-btn fa-btn-soft" type="button" onClick={() => setMarketplaceImages([])}><Icon name="close" size={14} />Limpar galeria</button>}
            </div>
            {!!marketplaceImages.length && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 10, marginTop: 14 }}>
                {marketplaceImages.map((imageUrl, index) => (
                  <div key={imageUrl.slice(0, 48) + index} style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 8, background: '#fff' }}>
                    <div style={{ aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: 'var(--fa-mist-2)' }}>
                      <img src={imageUrl} alt={it.name + ' ' + (index + 1)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                      <span className="ph-cell-sub">Imagem {index + 1}</span>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeMarketplaceImage(imageUrl)}>
                        <Icon name="trash" size={13} />Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            onClick={() => onSave({ cost: Math.round(cost * 100) / 100, price: Math.round(price * 100) / 100, promo: promoOn ? promo : 0, ref: Math.round(ref * 100) / 100, cat: marketplaceCategory, marketplaceVisible: publishOnMarketplace, marketplaceImages: _normalizeImageList(marketplaceImages) })}>
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

/* ===================== MODAL: APLICAR MARGEM EM MASSA ===================== */
function BulkMarginModal({ rows, mkt, onClose, onApply }) {
  const [target, setTarget] = useState(Math.max(mkt.minMargin, 22));
  const updates = rows.map(({ it }) => {
    const p = priceForMargin(+it.cost || 0, target, mkt);
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
          const np = priceForMargin(+it.cost || 0, target, mkt);
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

export { BdRow, BulkMarginModal, DeliveryPricing, FeeRow, MarketplaceFees, PriceDrawer, PricingScreen, VsMarket, marginState, priceCalc, priceForMargin };
