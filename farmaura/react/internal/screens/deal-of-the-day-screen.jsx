import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

const MAX_PRODUCTS = 30;

const SUGGESTION_TABS = [
  { id: 'bestsellers', label: 'Mais vendidos', glyph: 'search' },
  { id: 'margins', label: 'Melhores margens', glyph: 'tag' },
  { id: 'promotions', label: 'Promoção ativa', glyph: 'sparkle' },
  { id: 'discounts', label: 'Desconto ativo', glyph: 'percent' },
  { id: 'coupons', label: 'Cupom ativo', glyph: 'gift' },
  { id: 'manual', label: 'Buscar manualmente', glyph: 'filter' },
];

const MODE_OPTIONS = [
  { id: 'off', label: 'Desativado', glyph: 'close' },
  { id: 'manual', label: 'Manual', glyph: 'filter' },
  { id: 'auto', label: 'Automático (ciclos)', glyph: 'repeat' },
];

const AUTO_COUNT_FIELDS = [
  { key: 'countBestsellers', label: 'Mais vendidos' },
  { key: 'countMargins', label: 'Melhores margens' },
  { key: 'countPromotions', label: 'Promoção ativa' },
  { key: 'countDiscounts', label: 'Desconto ativo' },
  { key: 'countCoupons', label: 'Cupom ativo' },
  { key: 'countRandom', label: 'Aleatório (sem fonte específica)' },
];

function itemRef(item) { return 'inv-' + item.id; }

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (error) {
    return '';
  }
}

/* FARMAURA Console — "Ofertas do dia": seção da home do marketplace com 3 modos — desativada,
   curada manualmente (produto a produto, permanece igual até trocar aqui), ou automática (o próprio
   sistema sorteia um conjunto novo todo dia no horário configurado, seguindo os parâmetros salvos:
   categorias/marcas elegíveis + quantos produtos tirar de cada fonte). */
function DealOfTheDayScreen({ ctx }) {
  const {
    dealOfTheDay, setDealOfTheDay, saveDealOfTheDay, dealOfTheDayBusy, fetchDealSuggestions,
    generateDealOfTheDayNow, inventory, categories, brands, notify,
  } = ctx;
  const mode = (dealOfTheDay && dealOfTheDay.mode) || 'off';
  const productRefs = (dealOfTheDay && dealOfTheDay.productRefs) || [];
  const resetTime = (dealOfTheDay && dealOfTheDay.resetTime) || '00:00';
  const autoParams = (dealOfTheDay && dealOfTheDay.autoParams) || {};
  const lastGeneratedAt = dealOfTheDay && dealOfTheDay.lastGeneratedAt;

  const [activeTab, setActiveTab] = useState(SUGGESTION_TABS[0].id);
  const [suggestionsByTab, setSuggestionsByTab] = useState({});
  const [loadingTab, setLoadingTab] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [curatedMeta, setCuratedMeta] = useState({});

  // Resolve display info (name/brand/price/stock) for refs the panel doesn't have cached yet —
  // covers a fresh page load, where only the bare ref list survives from the bootstrap (both for
  // the manually curated list and for whatever the auto-generator last picked). Matched against the
  // same inventory list the manual-search tab already uses.
  useEffect(() => {
    setCuratedMeta((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ref of productRefs) {
        if (next[ref]) continue;
        const match = (inventory || []).find((item) => itemRef(item) === ref);
        if (match) {
          next[ref] = { name: match.name, brand: match.brand, price: match.price, stock: match.qty };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [productRefs, inventory]);

  useEffect(() => {
    if (mode !== 'manual' || activeTab === 'manual' || suggestionsByTab[activeTab] || loadingTab === activeTab) {
      return;
    }
    let cancelled = false;
    setLoadingTab(activeTab);
    const params = activeTab === 'bestsellers' ? { months: 3, limit: 20 } : { limit: 20 };
    fetchDealSuggestions(activeTab, params)
      .then((items) => { if (!cancelled) setSuggestionsByTab((prev) => ({ ...prev, [activeTab]: items })); })
      .catch((error) => { if (!cancelled) notify && notify(error && error.message ? error.message : 'Não foi possível carregar as sugestões.', 'warn'); })
      .finally(() => { if (!cancelled) setLoadingTab(''); });
    return () => { cancelled = true; };
  }, [activeTab, mode]);

  const switchMode = async (nextMode) => { await saveDealOfTheDay({ mode: nextMode }); };

  const addProduct = (item) => {
    if (productRefs.includes(item.ref)) {
      notify && notify('Esse produto já está na lista.', 'warn');
      return;
    }
    if (productRefs.length >= MAX_PRODUCTS) {
      notify && notify('Limite de ' + MAX_PRODUCTS + ' produtos atingido — remova algum antes de adicionar outro.', 'warn');
      return;
    }
    setCuratedMeta((prev) => ({ ...prev, [item.ref]: { name: item.name, brand: item.brand, price: item.price, stock: item.stock } }));
    setDealOfTheDay({ productRefs: [...productRefs, item.ref] });
  };

  const removeProduct = (ref) => setDealOfTheDay({ productRefs: productRefs.filter((r) => r !== ref) });

  const moveProduct = (ref, dir) => {
    const index = productRefs.indexOf(ref);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= productRefs.length) return;
    const next = productRefs.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    setDealOfTheDay({ productRefs: next });
  };

  const patchAutoParams = (patch) => setDealOfTheDay({ autoParams: { ...autoParams, ...patch } });
  const toggleAutoListValue = (key, value) => {
    const list = autoParams[key] || [];
    patchAutoParams({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };

  const autoTotalCount = AUTO_COUNT_FIELDS.reduce((sum, field) => sum + Number(autoParams[field.key] || 0), 0);

  const handleSave = async () => { await saveDealOfTheDay(); };

  const handleGenerateNow = async () => {
    // Persiste os parâmetros já editados na tela antes de sortear — senão "Gerar agora" rodaria com
    // o que já estava salvo no servidor, ignorando mudanças recém-digitadas e ainda não salvas.
    await saveDealOfTheDay();
    await generateDealOfTheDayNow();
  };

  const manualResults = manualQuery.trim()
    ? (inventory || [])
      .filter((item) => (item.name + ' ' + item.brand).toLowerCase().includes(manualQuery.trim().toLowerCase()))
      .slice(0, 30)
    : [];

  const suggestionRows = (items) => (items || []).map((item) => {
    const already = productRefs.includes(item.ref);
    return (
      <div key={item.ref} className="ph-cell" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--fa-mist)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div className="ph-cell-sub">{item.brand} · {brl(Number(item.price || 0))} · {item.metric_label}</div>
        </div>
        <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={already} onClick={() => addProduct(item)}>
          {already ? <><Icon name="check" size={13} />Adicionado</> : <><Icon name="plus" size={13} />Adicionar</>}
        </button>
      </div>
    );
  });

  const activeCategories = (categories || []).filter((c) => c.active && !c.discarded);
  const activeBrands = (brands || []).filter((b) => b.active && !b.discarded);

  return (
    <>
      <Topbar title="Ofertas do dia" sub="Seção em destaque na home do marketplace — manual ou por ciclos automáticos" onLogout={ctx.onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              className="fa-btn fa-btn-soft"
              type="button"
              onClick={() => switchMode(option.id)}
              disabled={dealOfTheDayBusy}
              style={mode === option.id ? { border: '2px solid var(--fa-primary)', color: 'var(--fa-primary)' } : undefined}
            >
              <Icon name={option.glyph} size={15} />{option.label}
            </button>
          ))}
          <span className="ph-cell-sub">{productRefs.length}/{MAX_PRODUCTS} produtos ativos</span>
        </div>
        <div className="ph-cell-sub" style={{ marginBottom: 14 }}>
          {mode === 'auto'
            ? 'Modo automático: todo dia, no horário configurado abaixo, o sistema sorteia sozinho um novo conjunto de produtos seguindo os parâmetros salvos — sem precisar entrar aqui. Use "Gerar agora" para testar/adiantar o sorteio a qualquer momento.'
            : 'Modo manual: escolha os produtos a partir das sugestões (mais vendidos, melhor margem, promoção/desconto/cupom ativo) ou busque manualmente. A lista aparece na ordem definida pelas setas ▲▼ e permanece exatamente assim até você trocar aqui.'}
          {' '}"Desativado" só esconde a faixa da home; os produtos e parâmetros continuam guardados até você reativar.
        </div>

        {mode === 'off' && productRefs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: 14, background: 'var(--fa-rose-soft)', borderRadius: 14, flexWrap: 'wrap' }}>
            <Icon name="info" size={20} style={{ color: 'var(--fa-primary)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>Ofertas do dia desativadas</div>
              <div className="ph-cell-sub">O(s) {productRefs.length} produto(s) da última configuração continuam salvos — só não aparecem na home até você reativar.</div>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {SUGGESTION_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className="fa-btn fa-btn-sm"
                    onClick={() => setActiveTab(tab.id)}
                    style={activeTab === tab.id
                      ? { background: 'var(--fa-primary)', color: '#fff', border: '1px solid var(--fa-primary)' }
                      : { background: '#fff', color: 'var(--fa-ink-2)', border: '1px solid var(--fa-mist)' }}
                  >
                    <Icon name={tab.glyph} size={13} />{tab.label}
                  </button>
                ))}
              </div>

              <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 16, background: '#fff', minHeight: 200 }}>
                {activeTab === 'manual' ? (
                  <>
                    <input
                      className="fa-input"
                      style={{ width: '100%', marginBottom: 10 }}
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      placeholder="Buscar por nome ou marca…"
                    />
                    {manualQuery.trim() && !manualResults.length && <div className="ph-cell-sub">Nenhum produto encontrado.</div>}
                    {suggestionRows(manualResults.map((item) => ({
                      ref: itemRef(item), name: item.name, brand: item.brand, price: item.price, stock: item.qty, metric_label: 'Estoque ' + item.qty,
                    })))}
                  </>
                ) : loadingTab === activeTab ? (
                  <div className="ph-cell-sub">Carregando sugestões…</div>
                ) : (suggestionsByTab[activeTab] || []).length ? (
                  suggestionRows(suggestionsByTab[activeTab])
                ) : (
                  <div className="ph-cell-sub">Nenhuma sugestão encontrada nesta fonte agora.</div>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 16, background: '#fff' }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Produtos selecionados ({productRefs.length})</div>
              {!productRefs.length && <div className="ph-cell-sub">Nenhum produto ainda — adicione pelas sugestões ao lado.</div>}
              {productRefs.map((ref, index) => {
                const meta = curatedMeta[ref] || {};
                return (
                  <div key={ref} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--fa-mist)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name || 'Produto'}</div>
                      <div className="ph-cell-sub">{meta.brand}{meta.price != null ? ' · ' + brl(Number(meta.price || 0)) : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === 0} onClick={() => moveProduct(ref, -1)} aria-label="Mover para cima">▲</button>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === productRefs.length - 1} onClick={() => moveProduct(ref, 1)} aria-label="Mover para baixo">▼</button>
                      <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeProduct(ref)}><Icon name="trash" size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'auto' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
            <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="fa-field">
                <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>Horário do ciclo (reset diário)</label>
                <input
                  type="time"
                  className="fa-input"
                  style={{ width: 140 }}
                  value={resetTime}
                  onChange={(e) => setDealOfTheDay({ resetTime: e.target.value })}
                />
                <div className="ph-cell-sub" style={{ marginTop: 4 }}>Todo dia nesse horário, um novo sorteio substitui o anterior automaticamente.</div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Categorias elegíveis (vazio = todas)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {activeCategories.map((cat) => {
                    const on = (autoParams.categories || []).includes(cat.name);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className="fa-btn fa-btn-sm"
                        onClick={() => toggleAutoListValue('categories', cat.name)}
                        style={on
                          ? { background: 'var(--fa-primary)', color: '#fff', border: '1px solid var(--fa-primary)' }
                          : { background: '#fff', color: 'var(--fa-ink-2)', border: '1px solid var(--fa-mist)' }}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Marcas elegíveis (vazio = todas)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {activeBrands.map((brand) => {
                    const on = (autoParams.brands || []).includes(brand.name);
                    return (
                      <button
                        key={brand.id}
                        type="button"
                        className="fa-btn fa-btn-sm"
                        onClick={() => toggleAutoListValue('brands', brand.name)}
                        style={on
                          ? { background: 'var(--fa-primary)', color: '#fff', border: '1px solid var(--fa-primary)' }
                          : { background: '#fff', color: 'var(--fa-ink-2)', border: '1px solid var(--fa-mist)' }}
                      >
                        {brand.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  Quantos produtos sortear de cada fonte — total: {autoTotalCount}/{MAX_PRODUCTS}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {AUTO_COUNT_FIELDS.map((field) => (
                    <div key={field.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5 }}>{field.label}</span>
                      <input
                        type="number"
                        min="0"
                        max={MAX_PRODUCTS}
                        className="fa-input"
                        style={{ width: 64, textAlign: 'center' }}
                        value={autoParams[field.key] || 0}
                        onChange={(e) => patchAutoParams({ [field.key]: Math.max(0, Math.min(MAX_PRODUCTS, Number(e.target.value) || 0)) })}
                      />
                    </div>
                  ))}
                </div>
                {autoTotalCount > MAX_PRODUCTS && (
                  <div className="ph-cell-sub" style={{ color: 'var(--fa-warn)', marginTop: 6 }}>A soma passa do limite de {MAX_PRODUCTS} — o sorteio corta no limite.</div>
                )}
              </div>

              <button className="fa-btn fa-btn-primary" type="button" onClick={handleGenerateNow} disabled={dealOfTheDayBusy}>
                <Icon name="sparkle" size={15} />{dealOfTheDayBusy ? 'Gerando…' : 'Gerar agora'}
              </button>
            </div>

            <div style={{ border: '1px solid var(--fa-mist)', borderRadius: 16, padding: 16, background: '#fff' }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Sorteio atual ({productRefs.length})</div>
              <div className="ph-cell-sub" style={{ marginBottom: 10 }}>
                {lastGeneratedAt ? 'Última geração: ' + formatDateTime(lastGeneratedAt) : 'Ainda não gerado — clique em "Gerar agora".'}
              </div>
              {!productRefs.length && <div className="ph-cell-sub">Nenhum produto sorteado ainda.</div>}
              {productRefs.map((ref) => {
                const meta = curatedMeta[ref] || {};
                return (
                  <div key={ref} style={{ padding: '8px 0', borderBottom: '1px solid var(--fa-mist)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.name || 'Produto'}</div>
                    <div className="ph-cell-sub">{meta.brand}{meta.price != null ? ' · ' + brl(Number(meta.price || 0)) : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="fa-btn fa-btn-primary" disabled={dealOfTheDayBusy} onClick={handleSave}>
            <Icon name="check" size={16} />{dealOfTheDayBusy ? 'Salvando…' : 'Salvar ofertas do dia'}
          </button>
        </div>
      </div>
    </>
  );
}

export { DealOfTheDayScreen };
