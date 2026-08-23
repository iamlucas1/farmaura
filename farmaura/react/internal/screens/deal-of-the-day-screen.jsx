import React, { useEffect, useMemo, useState } from "react";
import { InfoTip, Toggle, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";

const MAX_PRODUCTS = 30;
const MAX_SPECIFIC_DATES = 31;

const SUGGESTION_TABS = [
  { id: 'bestsellers', label: 'Mais vendidos', glyph: 'search' },
  { id: 'margins', label: 'Melhores margens', glyph: 'tag' },
  { id: 'promotions', label: 'Promoção ativa', glyph: 'sparkle' },
  { id: 'discounts', label: 'Desconto ativo', glyph: 'percent' },
  { id: 'coupons', label: 'Cupom ativo', glyph: 'gift' },
  { id: 'manual', label: 'Buscar manualmente', glyph: 'filter' },
];

const MODE_OPTIONS = [
  {
    id: 'off', label: 'Desativado', glyph: 'close', desc: 'Esconde a faixa da home',
    tip: 'A faixa some da home, mas produtos e parâmetros de todos os modos continuam salvos — nada é perdido ao desativar.',
  },
  {
    id: 'manual', label: 'Manual', glyph: 'filter', desc: 'Você escolhe e ordena',
    tip: 'Você escolhe os produtos um a um (sugestões ou busca) e a ordem definida com as setas ▲▼ — a lista fica exatamente assim até você editar de novo.',
  },
  {
    id: 'auto', label: 'Automático', glyph: 'repeat', desc: 'Sorteio por ciclo diário',
    tip: 'Todo dia, no horário do ciclo, o sistema sorteia sozinho um novo conjunto seguindo os parâmetros salvos (categorias, marcas, quantidade por fonte).',
  },
  {
    id: 'scheduled', label: 'Agendado', glyph: 'calendar', desc: 'Calendário de entradas',
    tip: 'Um calendário de entradas — cada uma com sua lista de produtos, título e subtítulo — ativa numa data específica e/ou num dia da semana. Em empate no mesmo dia, a primeira entrada da lista vence.',
  },
];

const AUTO_COUNT_FIELDS = [
  { key: 'countBestsellers', label: 'Mais vendidos' },
  { key: 'countMargins', label: 'Melhores margens' },
  { key: 'countPromotions', label: 'Promoção ativa' },
  { key: 'countDiscounts', label: 'Desconto ativo' },
  { key: 'countCoupons', label: 'Cupom ativo' },
  { key: 'countRandom', label: 'Aleatório (sem fonte específica)' },
];

// 0=Segunda..6=Domingo — mesma convenção de app.services.portal_service._match_deal_schedule_entry
// (Python date.weekday()).
const WEEKDAY_LABELS_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function itemRef(item) { return 'inv-' + item.id; }

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch (error) {
    return '';
  }
}

function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Mesmo critério já usado em inventory-screen.jsx (isExpiringSoon): "MM/AAAA" dentro de 120 dias,
// ainda não vencido — reaproveitado aqui pra não inventar um segundo threshold de vencimento no app.
function isNearExpiry(expiry) {
  if (!expiry || expiry === '—') return false;
  const match = /^(\d{2})\/(\d{4})$/.exec(expiry);
  if (!match) return false;
  const month = Number(match[1]);
  const year = Number(match[2]);
  const expiryDate = new Date(year, month, 0);
  const diff = expiryDate.getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
}

function summarizeSchedule(entry) {
  const parts = [];
  const dates = entry.specificDates || [];
  if (dates.length) {
    parts.push(dates.length === 1 ? formatDateBR(dates[0]) : dates.length + ' datas específicas');
  }
  const weekdays = entry.weekdays || [];
  if (weekdays.length) {
    let label = weekdays.slice().sort((a, b) => a - b).map((w) => WEEKDAY_LABELS_PT[w]).join(', ');
    if (entry.endTime) {
      label += ` até ${entry.endTime}`;
    }
    parts.push(label);
  }
  return parts.length ? parts.join(' + ') : 'Sem data definida';
}

// Tile de estatística compacto (mesmo idioma visual de .ph-stat usado no Dashboard), só para esta
// tela — substitui o texto solto "N/30 produtos ativos" de antes por algo visualmente forte.
function StatTile({ icon, value, label }) {
  return (
    <div className="ph-stat" style={{ flex: '1 1 200px' }}>
      <div className="ph-stat-top">
        <span className="ph-stat-ic"><Icon name={icon} size={18} /></span>
      </div>
      <div className="ph-stat-val">{value}</div>
      <div className="ph-stat-label">{label}</div>
    </div>
  );
}

/* Painel de curadoria de produtos (sugestões por fonte + busca manual + lista selecionada com
   ▲▼/remover) — extraído para ser reaproveitado tanto pelo modo manual (lista única, nível
   superior) quanto por cada entrada do modo agendado (uma lista por entrada). O estado de "qual aba
   de sugestão está aberta"/"cache de nome-marca-preço por ref" fica no componente pai (screen-level,
   não por entrada) — nada disso depende de qual lista está sendo editada no momento, só a lista alvo
   (`productRefs`/`onChangeRefs`) muda entre os dois usos. */
function StatusBadges({ productRef, inventoryByRef, promotedRefs }) {
  const inv = inventoryByRef.get(productRef);
  const hasPromotion = promotedRefs.has(productRef);
  const nearExpiry = inv ? isNearExpiry(inv.expiry) : false;
  if (!hasPromotion && !nearExpiry) {
    return <span className="ph-cell-sub">—</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      {hasPromotion && <span className="fa-badge fa-badge-vital">Promoção</span>}
      {nearExpiry && <span className="fa-badge fa-badge-warn">Vence em breve</span>}
    </div>
  );
}

function ProductCurationPanel({
  productRefs, onChangeRefs,
  curatedMeta, onCacheMeta,
  inventoryByRef, promotedRefs,
  activeTab, setActiveTab, suggestionsByTab, loadingTab,
  manualQuery, setManualQuery, manualResults,
  notify, maxProducts = MAX_PRODUCTS,
}) {
  // "Sugestões e busca" e "Produtos selecionados" alternam em vez de dividir a largura em duas
  // colunas — cada tabela usa a largura cheia do painel, sem precisar de rolagem lateral.
  const [subview, setSubview] = useState('suggestions');

  const addProduct = (item) => {
    if (productRefs.includes(item.ref)) {
      notify && notify('Esse produto já está na lista.', 'warn');
      return;
    }
    if (productRefs.length >= maxProducts) {
      notify && notify('Limite de ' + maxProducts + ' produtos atingido — remova algum antes de adicionar outro.', 'warn');
      return;
    }
    onCacheMeta(item.ref, { name: item.name, brand: item.brand, price: item.price, stock: item.stock });
    onChangeRefs([...productRefs, item.ref]);
  };

  const removeProduct = (ref) => onChangeRefs(productRefs.filter((r) => r !== ref));

  const moveProduct = (ref, dir) => {
    const index = productRefs.indexOf(ref);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= productRefs.length) return;
    const next = productRefs.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    onChangeRefs(next);
  };

  // Produto some daqui assim que entra em "Produtos selecionados" — nada de linha "Adicionado"
  // desabilitada, a lista de sugestão/busca só mostra o que ainda pode ser adicionado.
  const sourceItems = activeTab === 'manual'
    ? manualResults.map((item) => ({ ref: itemRef(item), name: item.name, brand: item.brand, price: item.price, stock: item.qty, metric_label: '' }))
    : (suggestionsByTab[activeTab] || []);
  const visibleItems = sourceItems.filter((item) => !productRefs.includes(item.ref));

  const suggestionTable = (items) => (
    <div className="ph-table-wrap">
      <table className="ph-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Preço</th>
            <th>Estoque</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.ref}>
              <td className="ph-td-name">
                {item.name}
                <div className="ph-cell-sub">{item.brand}{item.metric_label ? ' · ' + item.metric_label : ''}</div>
              </td>
              <td>{brl(Number(item.price || 0))}</td>
              <td>{item.stock}</td>
              <td><StatusBadges productRef={item.ref} inventoryByRef={inventoryByRef} promotedRefs={promotedRefs} /></td>
              <td style={{ textAlign: 'right' }}>
                <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => addProduct(item)}>
                  <Icon name="plus" size={13} />Adicionar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSourceBody = () => {
    if (activeTab === 'manual') {
      if (!manualQuery.trim()) return <div className="ph-cell-sub">Digite para buscar por nome ou marca.</div>;
      if (!manualResults.length) return <div className="ph-cell-sub">Nenhum produto encontrado.</div>;
    } else {
      if (loadingTab === activeTab) return <div className="ph-cell-sub">Carregando sugestões…</div>;
      if (!sourceItems.length) return <div className="ph-cell-sub">Nenhuma sugestão encontrada nesta fonte agora.</div>;
    }
    if (!visibleItems.length) return <div className="ph-cell-sub">Todos os produtos desta fonte já foram adicionados.</div>;
    return suggestionTable(visibleItems);
  };

  return (
    <div>
      <div className="ph-seg" style={{ marginBottom: 16 }}>
        <button type="button" data-on={subview === 'suggestions' ? '1' : '0'} onClick={() => setSubview('suggestions')}>
          <Icon name="filter" size={14} />Sugestões e busca
        </button>
        <button type="button" data-on={subview === 'selected' ? '1' : '0'} onClick={() => setSubview('selected')}>
          <Icon name="layout" size={14} />Produtos selecionados<span className="ph-seg-n">{productRefs.length}</span>
        </button>
      </div>

      {subview === 'suggestions' ? (
        <AnCard
          icon="filter"
          title="Sugestões e busca"
          sub="Escolha por fonte automática ou busque manualmente"
          right={<InfoTip text="Mais vendidos, melhores margens, promoção/desconto/cupom ativo — cada aba busca candidatos reais do seu catálogo. Produtos já adicionados somem da lista automaticamente." />}
        >
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

          {activeTab === 'manual' && (
            <input
              className="fa-input"
              style={{ width: '100%', marginBottom: 10 }}
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Buscar por nome ou marca…"
            />
          )}

          <div style={{ minHeight: 160 }}>{renderSourceBody()}</div>
        </AnCard>
      ) : (
        <AnCard
          icon="layout"
          title={`Produtos selecionados (${productRefs.length})`}
          right={<InfoTip text="A ordem aqui é a ordem exibida na home e em /offers — use as setas para reordenar." />}
        >
          {!productRefs.length ? (
            <div className="ph-cell-sub">Nenhum produto ainda — adicione em "Sugestões e busca".</div>
          ) : (
            <div className="ph-table-wrap">
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {productRefs.map((ref, index) => {
                    const meta = curatedMeta[ref] || {};
                    return (
                      <tr key={ref}>
                        <td className="ph-td-name">
                          {meta.name || 'Produto'}
                          <div className="ph-cell-sub">{meta.brand}</div>
                        </td>
                        <td>{meta.price != null ? brl(Number(meta.price || 0)) : '—'}</td>
                        <td>{meta.stock != null ? meta.stock : '—'}</td>
                        <td><StatusBadges productRef={ref} inventoryByRef={inventoryByRef} promotedRefs={promotedRefs} /></td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === 0} onClick={() => moveProduct(ref, -1)} aria-label="Mover para cima">▲</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === productRefs.length - 1} onClick={() => moveProduct(ref, 1)} aria-label="Mover para baixo">▼</button>
                          <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeProduct(ref)}><Icon name="trash" size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AnCard>
      )}
    </div>
  );
}

/* FARMAURA Console — "Ofertas do dia": seção da home do marketplace com 4 modos — desativada,
   curada manualmente (produto a produto, permanece igual até trocar aqui), automática (o próprio
   sistema sorteia um conjunto novo todo dia no horário configurado) ou agendada (um calendário de
   entradas, cada uma com título/subtítulo e lista de produtos próprios, ativa numa data específica
   e/ou numa repetição semanal). */
function DealOfTheDayScreen({ ctx }) {
  const {
    dealOfTheDay, setDealOfTheDay, saveDealOfTheDay, dealOfTheDayBusy, fetchDealSuggestions,
    fetchActivePromotionRefs, generateDealOfTheDayNow, inventory, categories, brands, notify,
  } = ctx;
  const mode = (dealOfTheDay && dealOfTheDay.mode) || 'off';
  const productRefs = (dealOfTheDay && dealOfTheDay.productRefs) || [];
  const resetTime = (dealOfTheDay && dealOfTheDay.resetTime) || '00:00';
  const autoParams = (dealOfTheDay && dealOfTheDay.autoParams) || {};
  const lastGeneratedAt = dealOfTheDay && dealOfTheDay.lastGeneratedAt;
  const scheduleEntries = (dealOfTheDay && dealOfTheDay.scheduleEntries) || [];
  const showCountdown = !dealOfTheDay || dealOfTheDay.showCountdown !== false;

  const [activeTab, setActiveTab] = useState(SUGGESTION_TABS[0].id);
  const [suggestionsByTab, setSuggestionsByTab] = useState({});
  const [loadingTab, setLoadingTab] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [curatedMeta, setCuratedMeta] = useState({});
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [newDate, setNewDate] = useState('');
  const [promotedRefs, setPromotedRefs] = useState(() => new Set());

  const selectedEntry = scheduleEntries.find((e) => e.id === selectedEntryId) || scheduleEntries[0] || null;

  // Refs de todo item do inventário, pra resolver vencimento (item.expiry) de qualquer produto
  // exibido no painel de curadoria — sugestão, busca manual ou já curado — sem depender de o backend
  // devolver esse dado em cada fonte separadamente.
  const inventoryByRef = useMemo(() => {
    const map = new Map();
    for (const item of inventory || []) {
      map.set(itemRef(item), item);
    }
    return map;
  }, [inventory]);

  // Refs com promoção ativa (campanha ou desconto direto) — buscado uma vez ao abrir a tela,
  // screen-level, mesmo espírito de curatedMeta/inventoryByRef (não depende de qual lista está
  // sendo editada no momento).
  useEffect(() => {
    let cancelled = false;
    fetchActivePromotionRefs()
      .then((refs) => { if (!cancelled) setPromotedRefs(new Set(refs)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Resolve display info (name/brand/price/stock) for every ref currently referenced — the
  // top-level curated list AND every schedule entry's own list — covers a fresh page load, where
  // only the bare ref lists survive from the bootstrap. Matched against the same inventory list the
  // manual-search tab already uses.
  useEffect(() => {
    const allRefs = [...productRefs, ...scheduleEntries.flatMap((e) => e.productRefs || [])];
    setCuratedMeta((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ref of allRefs) {
        if (next[ref]) continue;
        const match = (inventory || []).find((item) => itemRef(item) === ref);
        if (match) {
          next[ref] = { name: match.name, brand: match.brand, price: match.price, stock: match.qty };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [productRefs, scheduleEntries, inventory]);

  useEffect(() => {
    if ((mode !== 'manual' && mode !== 'scheduled') || activeTab === 'manual' || suggestionsByTab[activeTab] || loadingTab === activeTab) {
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

  useEffect(() => { setNewDate(''); }, [selectedEntryId]);

  const switchMode = async (nextMode) => { await saveDealOfTheDay({ mode: nextMode }); };

  const cacheMeta = (ref, meta) => setCuratedMeta((prev) => ({ ...prev, [ref]: meta }));

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

  // Entradas do calendário (modo agendado) — mesmo padrão de índice/reorder já usado por
  // ProductCurationPanel.moveProduct, aplicado a scheduleEntries em vez de productRefs.
  const newEntryId = () => 'sched-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const addEntry = () => {
    const entry = { id: newEntryId(), title: '', subtitle: '', productRefs: [], specificDates: [], weekdays: [], startDate: null, endDate: null };
    setDealOfTheDay({ scheduleEntries: [...scheduleEntries, entry] });
    setSelectedEntryId(entry.id);
  };

  const removeEntry = (id) => {
    setDealOfTheDay({ scheduleEntries: scheduleEntries.filter((e) => e.id !== id) });
    if (selectedEntryId === id) setSelectedEntryId('');
  };

  const moveEntry = (id, dir) => {
    const index = scheduleEntries.findIndex((e) => e.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= scheduleEntries.length) return;
    const next = scheduleEntries.slice();
    const [entry] = next.splice(index, 1);
    next.splice(target, 0, entry);
    setDealOfTheDay({ scheduleEntries: next });
  };

  const patchEntry = (id, patch) => {
    setDealOfTheDay({ scheduleEntries: scheduleEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  };

  const addSpecificDate = () => {
    if (!newDate || !selectedEntry) return;
    if ((selectedEntry.specificDates || []).includes(newDate)) {
      notify && notify('Essa data já está na lista.', 'warn');
      return;
    }
    if ((selectedEntry.specificDates || []).length >= MAX_SPECIFIC_DATES) {
      notify && notify('Limite de ' + MAX_SPECIFIC_DATES + ' datas específicas atingido.', 'warn');
      return;
    }
    patchEntry(selectedEntry.id, { specificDates: [...(selectedEntry.specificDates || []), newDate].sort() });
    setNewDate('');
  };

  const toggleWeekday = (idx) => {
    if (!selectedEntry) return;
    const list = selectedEntry.weekdays || [];
    patchEntry(selectedEntry.id, {
      weekdays: list.includes(idx) ? list.filter((w) => w !== idx) : [...list, idx].sort((a, b) => a - b),
    });
  };

  const manualResults = manualQuery.trim()
    ? (inventory || [])
      .filter((item) => (item.name + ' ' + item.brand).toLowerCase().includes(manualQuery.trim().toLowerCase()))
      .slice(0, 30)
    : [];

  const activeCategories = (categories || []).filter((c) => c.active && !c.discarded);
  const activeBrands = (brands || []).filter((b) => b.active && !b.discarded);

  const curationPanelProps = {
    curatedMeta, onCacheMeta: cacheMeta,
    inventoryByRef, promotedRefs,
    activeTab, setActiveTab, suggestionsByTab, loadingTab,
    manualQuery, setManualQuery, manualResults,
    notify,
  };

  const chipRow = (items, key, nameOf) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => {
        const on = (autoParams[key] || []).includes(nameOf(item));
        return (
          <button
            key={item.id}
            type="button"
            className="fa-btn fa-btn-sm"
            onClick={() => toggleAutoListValue(key, nameOf(item))}
            style={on
              ? { background: 'var(--fa-primary)', color: '#fff', border: '1px solid var(--fa-primary)' }
              : { background: '#fff', color: 'var(--fa-ink-2)', border: '1px solid var(--fa-mist)' }}
          >
            {nameOf(item)}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <Topbar title="Ofertas do dia" sub="Seção em destaque na home do marketplace — manual, por ciclos automáticos ou agendada" onLogout={ctx.onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide">
        <div className="dod-mode-grid" style={{ marginBottom: 18 }}>
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="dod-mode-card"
              data-active={mode === option.id ? '1' : '0'}
              disabled={dealOfTheDayBusy}
              onClick={() => switchMode(option.id)}
            >
              <InfoTip text={option.tip} />
              <span className="dod-mode-ic"><Icon name={option.glyph} size={17} /></span>
              <span className="dod-mode-t">{option.label}</span>
              <span className="dod-mode-d">{option.desc}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
          {mode === 'scheduled' ? (
            <>
              <StatTile icon="calendar" value={scheduleEntries.length} label="Entradas no calendário" />
              <StatTile icon="layout" value={(selectedEntry && selectedEntry.productRefs || []).length + '/' + MAX_PRODUCTS} label="Produtos na entrada selecionada" />
            </>
          ) : (
            <StatTile icon="layout" value={`${productRefs.length}/${MAX_PRODUCTS}`} label={mode === 'auto' ? 'Produtos no sorteio atual' : 'Produtos ativos'} />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <Toggle on={showCountdown} onChange={(v) => setDealOfTheDay({ showCountdown: v })} ariaLabel="Mostrar contador regressivo" />
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>Mostrar contador regressivo na faixa</span>
          <InfoTip text="Quando desligado, a faixa de Ofertas do dia mostra os produtos normalmente, sem o relógio regressivo — vale para qualquer modo (manual, automático ou agendado)." />
        </div>

        {mode === 'off' && (productRefs.length > 0 || scheduleEntries.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, padding: 14, background: 'var(--fa-warn-soft)', borderRadius: 14, flexWrap: 'wrap' }}>
            <Icon name="info" size={20} style={{ color: 'var(--fa-warn)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700 }}>Ofertas do dia desativadas</div>
              <div className="ph-cell-sub">
                {scheduleEntries.length > 0
                  ? `${scheduleEntries.length} entrada(s) de calendário continuam salvas — só não aparecem na home até você reativar.`
                  : `O(s) ${productRefs.length} produto(s) da última configuração continuam salvos — só não aparecem na home até você reativar.`}
              </div>
            </div>
          </div>
        )}

        {mode === 'off' && productRefs.length === 0 && scheduleEntries.length === 0 && (
          <div className="ph-empty">
            <span className="fa-iconbox" style={{ margin: '0 auto 12px', width: 56, height: 56 }}><Icon name="sparkle" size={26} /></span>
            <div className="fa-h3">Nenhuma oferta configurada ainda</div>
            <p className="fa-muted" style={{ marginTop: 6 }}>Escolha um modo acima para começar a montar a seção "Ofertas do dia".</p>
          </div>
        )}

        {mode === 'manual' && (
          <ProductCurationPanel
            productRefs={productRefs}
            onChangeRefs={(refs) => setDealOfTheDay({ productRefs: refs })}
            {...curationPanelProps}
          />
        )}

        {mode === 'auto' && (
          <div className="ph-form-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <AnCard
                icon="clock"
                title="Horário do ciclo"
                right={<InfoTip text="Também é o horário-limite: no modo agendado, um dia começa e termina neste horário, não à meia-noite." />}
              >
                <input
                  type="time"
                  className="fa-input"
                  style={{ width: 140 }}
                  value={resetTime}
                  onChange={(e) => setDealOfTheDay({ resetTime: e.target.value })}
                />
                <div className="ph-cell-sub" style={{ marginTop: 8 }}>Todo dia nesse horário, um novo sorteio substitui o anterior automaticamente.</div>
              </AnCard>

              <AnCard
                icon="grid"
                title="Categorias e marcas elegíveis"
                right={<InfoTip text="Vazio = sem restrição, o sorteio pode escolher de qualquer categoria/marca." />}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, color: 'var(--fa-ink-2)' }}>Categorias</div>
                {chipRow(activeCategories, 'categories', (c) => c.name)}
                <div style={{ fontWeight: 700, fontSize: 12.5, margin: '16px 0 8px', color: 'var(--fa-ink-2)' }}>Marcas</div>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>{chipRow(activeBrands, 'brands', (b) => b.name)}</div>
              </AnCard>

              <AnCard
                icon="sparkle"
                title={`Quantos sortear de cada fonte — total ${autoTotalCount}/${MAX_PRODUCTS}`}
                right={<InfoTip text="Cada fonte sorteia sua própria cota ao acaso (não sempre os mesmos top produtos) e o resultado final é embaralhado de novo." />}
              >
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
                  <div className="ph-cell-sub" style={{ color: 'var(--fa-warn)', marginTop: 8 }}>A soma passa do limite de {MAX_PRODUCTS} — o sorteio corta no limite.</div>
                )}
                <button className="fa-btn fa-btn-primary" type="button" onClick={handleGenerateNow} disabled={dealOfTheDayBusy} style={{ marginTop: 16 }}>
                  <Icon name="sparkle" size={15} />{dealOfTheDayBusy ? 'Gerando…' : 'Gerar agora'}
                </button>
              </AnCard>
            </div>

            <AnCard icon="trophy" title={`Sorteio atual (${productRefs.length})`}>
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
            </AnCard>
          </div>
        )}

        {mode === 'scheduled' && (
          <div className="ph-form-grid" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>
            <AnCard
              icon="calendar"
              title={`Entradas do calendário (${scheduleEntries.length})`}
              right={<InfoTip text="Em conflito no mesmo dia (duas entradas válidas hoje), a primeira da lista tem prioridade — reordene com as setas." />}
            >
              <button className="fa-btn fa-btn-soft fa-btn-sm fa-btn-block" type="button" onClick={addEntry} style={{ marginBottom: 12 }}>
                <Icon name="plus" size={13} />Nova entrada
              </button>
              {!scheduleEntries.length && <div className="ph-cell-sub">Nenhuma entrada ainda — clique acima para criar a primeira.</div>}
              {scheduleEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="dod-entry-card"
                  data-active={selectedEntry && selectedEntry.id === entry.id ? '1' : '0'}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title || 'Sem título'}</div>
                    <div className="ph-cell-sub">{summarizeSchedule(entry)} · {(entry.productRefs || []).length} produto(s)</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flex: 'none' }} onClick={(e) => e.stopPropagation()}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === 0} onClick={() => moveEntry(entry.id, -1)} aria-label="Mover para cima">▲</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" disabled={index === scheduleEntries.length - 1} onClick={() => moveEntry(entry.id, 1)} aria-label="Mover para baixo">▼</button>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={() => removeEntry(entry.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              ))}
            </AnCard>

            {selectedEntry ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <AnCard icon="edit" title="Detalhes da entrada">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="fa-field">
                      <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>Título</label>
                      <input className="fa-input" style={{ width: '100%' }} value={selectedEntry.title} placeholder="Ex: Black Week" onChange={(e) => patchEntry(selectedEntry.id, { title: e.target.value })} />
                    </div>
                    <div className="fa-field">
                      <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 6 }}>Subtítulo</label>
                      <input className="fa-input" style={{ width: '100%' }} value={selectedEntry.subtitle} placeholder="Ex: Até 50% off em itens selecionados" onChange={(e) => patchEntry(selectedEntry.id, { subtitle: e.target.value })} />
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center' }}>
                        Datas específicas ({(selectedEntry.specificDates || []).length}/{MAX_SPECIFIC_DATES})
                        <InfoTip text="Data específica sempre vence a repetição semanal, se as duas baterem no mesmo dia." />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <input type="date" className="fa-input" style={{ width: 180 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                        <button className="fa-btn fa-btn-soft fa-btn-sm" type="button" onClick={addSpecificDate}><Icon name="plus" size={13} />Adicionar</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(selectedEntry.specificDates || []).map((d) => (
                          <button
                            key={d}
                            type="button"
                            className="fa-chip"
                            data-active="1"
                            style={{ background: 'var(--fa-primary)', color: '#fff', borderColor: 'var(--fa-primary)' }}
                            onClick={() => patchEntry(selectedEntry.id, { specificDates: selectedEntry.specificDates.filter((v) => v !== d) })}
                          >
                            {formatDateBR(d)}<Icon name="close" size={12} stroke={2.4} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                        Repetição semanal
                        <InfoTip text="'De'/'Até' são opcionais — limitam em quais datas a repetição roda. O horário de término é independente disso: se definido, a oferta some nesse horário TODOS os dias em que a regra vale (ex: toda segunda até 20h), voltando a aparecer no próximo dia válido — não precisa de 'De'/'Até' preenchidos." />
                      </div>
                      <div className="dod-weekday-seg" style={{ marginBottom: 12 }}>
                        {WEEKDAY_LABELS_PT.map((label, idx) => {
                          const on = (selectedEntry.weekdays || []).includes(idx);
                          return (
                            <button key={idx} type="button" data-on={on ? '1' : '0'} onClick={() => toggleWeekday(idx)}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'var(--fa-ink-2)' }}>De (opcional)</label>
                          <input type="date" className="fa-input" style={{ width: 160 }} value={selectedEntry.startDate || ''} onChange={(e) => patchEntry(selectedEntry.id, { startDate: e.target.value || null })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'var(--fa-ink-2)' }}>Até (opcional)</label>
                          <input
                            type="date"
                            className="fa-input"
                            style={{ width: 160 }}
                            value={selectedEntry.endDate || ''}
                            onChange={(e) => patchEntry(selectedEntry.id, { endDate: e.target.value || null })}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'var(--fa-ink-2)' }}>Horário de término diário (opcional)</label>
                          <input
                            type="time"
                            className="fa-input"
                            style={{ width: 140 }}
                            value={selectedEntry.endTime || ''}
                            onChange={(e) => patchEntry(selectedEntry.id, { endTime: e.target.value || null })}
                          />
                        </div>
                      </div>
                      <div className="ph-cell-sub" style={{ marginTop: 6 }}>Ex: marcando só Domingo + horário de término 20:00, a oferta vale todo domingo até as 20h, sem precisar preencher "De"/"Até".</div>
                    </div>
                  </div>
                </AnCard>

                <ProductCurationPanel
                  productRefs={selectedEntry.productRefs || []}
                  onChangeRefs={(refs) => patchEntry(selectedEntry.id, { productRefs: refs })}
                  {...curationPanelProps}
                />
              </div>
            ) : (
              <div className="ph-empty">
                <span className="fa-iconbox" style={{ margin: '0 auto 12px', width: 56, height: 56 }}><Icon name="calendar" size={26} /></span>
                <div className="fa-h3">Nenhuma entrada ainda</div>
                <p className="fa-muted" style={{ marginTop: 6 }}>Crie uma entrada de calendário ao lado para começar.</p>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="fa-btn fa-btn-primary" disabled={dealOfTheDayBusy} onClick={handleSave}>
            <Icon name="check" size={16} />{dealOfTheDayBusy ? 'Salvando…' : 'Salvar ofertas do dia'}
          </button>
        </div>
      </div>
    </>
  );
}

export { DealOfTheDayScreen };
