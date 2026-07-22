import React, { useEffect, useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar, stockState } from "../core/internal-shell.jsx";

const LOCATION_TYPE_OPTIONS = [
  { value: 'estoque', label: 'Estoque' },
  { value: 'prateleira', label: 'Prateleira' },
  { value: 'gondola', label: 'Gôndola' },
  { value: 'caixa', label: 'Caixa' },
  { value: 'outro', label: 'Outro' },
];
const LOCATION_TYPE_LABEL = Object.fromEntries(LOCATION_TYPE_OPTIONS.map((option) => [option.value, option.label]));

const LOT_STATUS_OPTIONS = [
  { value: 'available', label: 'Disponível', tone: 'success' },
  { value: 'reserved', label: 'Reservado', tone: 'info' },
  { value: 'quarantine', label: 'Quarentena', tone: 'warn' },
  { value: 'expired', label: 'Vencido', tone: 'error' },
  { value: 'written_off', label: 'Baixado', tone: 'mist' },
];
const LOT_STATUS_LABEL = Object.fromEntries(LOT_STATUS_OPTIONS.map((option) => [option.value, option]));

function lotStatusBadge(statusValue) {
  const meta = LOT_STATUS_LABEL[statusValue] || { label: statusValue || '—', tone: 'mist' };
  const palette = meta.tone === 'success' ? { bg: 'var(--fa-success-soft)', fg: 'var(--fa-success)' }
    : meta.tone === 'warn' ? { bg: 'var(--fa-warn-soft)', fg: 'var(--fa-warn)' }
    : meta.tone === 'error' ? { bg: '#FBEAE9', fg: 'var(--fa-error)' }
    : meta.tone === 'info' ? { bg: 'var(--fa-info-soft)', fg: 'var(--fa-info)' }
    : { bg: 'var(--fa-mist-2)', fg: 'var(--fa-ink-3)' };
  return <span className="fa-badge" style={{ background: palette.bg, color: palette.fg }}><span className="inv-status-dot" />{meta.label}</span>;
}

function isExpiringSoonIso(isoDate) {
  if (!isoDate) return false;
  const expiryDate = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(expiryDate.getTime())) return false;
  const diff = expiryDate.getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
}

function formatIsoDate(isoDate) {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('pt-BR');
}

/* identidade do produto ignorando lote/local — mesmo EAN, ou mesmo nome+marca, agrupam junto */
function productGroupKey(item) {
  const ean = (item.ean || '').trim();
  if (ean) return 'ean:' + ean;
  return 'name:' + (item.name || '').trim().toLowerCase() + '|' + (item.brand || '').trim().toLowerCase();
}
function productGroupLabel(item) {
  return (item.name || 'Produto') + (item.brand ? ' · ' + item.brand : '');
}

/* FARMAURA Console — Estoque operacional conectado ao backend. */
function InventoryScreen({ ctx }) {
  const {
    inventory,
    products,
    inventoryLocations,
    inventoryMovements,
    inventorySummary,
    inventoryBusy,
    inventoryError,
    refreshInventory,
    adjustStock,
    addInventory,
    updateInventory,
    addInventoryLocation,
    transferInventory,
    exportInventory,
    previewInventoryInvoice,
    confirmInventoryInvoice,
    stockLots,
    receiveLot,
    transferLot,
    adjustLot,
    suppliers,
    stores,
    notify,
    onLogout,
  } = ctx;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('items');
  const [locationCode, setLocationCode] = useState('all');
  const [locationTypeFilter, setLocationTypeFilter] = useState('all');
  const [lotStatusFilter, setLotStatusFilter] = useState('all');
  const [medicationClass, setMedicationClass] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [movementItem, setMovementItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [transferItem, setTransferItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [lotReceiptOpen, setLotReceiptOpen] = useState(false);
  const [lotTransferTarget, setLotTransferTarget] = useState(null);
  const [lotAdjustTarget, setLotAdjustTarget] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  // "Por produto" agora é o padrão: como o mesmo produto passou a ser compartilhado entre
  // lojas (só a quantidade/local/lote continuam por loja), listar "por categoria" fazia o
  // mesmo produto aparecer em duas linhas soltas e parecer duplicado.
  const [groupBy, setGroupBy] = useState('product'); // category | product — agrupa por classe ou pelo produto (ignorando o lote)
  const storeNameById = Object.fromEntries((stores || []).map((store) => [store.id, store.name]));
  const hasMultipleStores = new Set((inventory || []).map((item) => item.storeId).filter(Boolean)).size > 1;
  const summary = inventorySummary || {
    total_items: 0,
    normal_stock_items: 0,
    attention_stock_items: 0,
    low_stock_items: 0,
    out_of_stock_items: 0,
    controlled_items: 0,
  };
  const medicationClasses = [...new Set(inventory.map((item) => item.medClass || 'Geral'))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const categoryOptions = [...new Set(inventory.map((item) => item.cat || 'Medicamentos'))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const brandOptions = [...new Set(inventory.map((item) => (item.brand || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const locationsByCode = Object.fromEntries(inventoryLocations.map((location) => [location.code, location]));
  const suppliersById = Object.fromEntries((suppliers || []).map((supplier) => [supplier.id, supplier]));
  const lotsByItemId = stockLots.reduce((groups, lot) => {
    if (!groups[lot.itemId]) groups[lot.itemId] = [];
    groups[lot.itemId].push(lot);
    return groups;
  }, {});

  const applyExtraLocations = async (itemId, extraLocations) => {
    for (const row of extraLocations || []) {
      const location = locationsByCode[row.locationCode];
      if (!location) continue;
      await receiveLot({
        inventoryItemId: itemId,
        locationId: location.id,
        batchCode: row.batchCode,
        expiryDate: row.expiryDate || null,
        quantity: Number(row.quantity || 0),
      });
    }
  };

  const matchItem = (item) => {
    const state = stockState(item).key;
    if (filter === 'normal' && state !== 'normal') return false;
    if (filter === 'attention' && state !== 'attention') return false;
    if (filter === 'low' && state !== 'low') return false;
    if (filter === 'out' && state !== 'out') return false;
    if (filter === 'controlled' && !item.controlled) return false;
    const itemLots = lotsByItemId[item.id] || [];
    const itemLocationCodes = itemLots.length ? itemLots.map((lot) => lot.locationCode) : [item.loc];
    const itemLocationTypes = itemLots.length ? itemLots.map((lot) => lot.locationType) : [(locationsByCode[item.loc] || {}).locationType];
    if (locationCode !== 'all' && !itemLocationCodes.includes(locationCode)) return false;
    if (locationTypeFilter !== 'all' && !itemLocationTypes.includes(locationTypeFilter)) return false;
    if (medicationClass !== 'all' && (item.medClass || 'Geral') !== medicationClass) return false;
    if (brandFilter !== 'all' && (item.brand || '').trim() !== brandFilter) return false;
    if (q) {
      const haystack = (item.name + item.brand + item.ean + item.sku + item.loc + itemLocationCodes.join(' ') + item.cat + item.medClass).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  };

  const matchLot = (lot) => {
    const item = inventory.find((entry) => entry.id === lot.itemId);
    if (locationTypeFilter !== 'all' && lot.locationType !== locationTypeFilter) return false;
    if (lotStatusFilter !== 'all' && lot.status !== lotStatusFilter) return false;
    if (locationCode !== 'all' && lot.locationCode !== locationCode) return false;
    if (brandFilter !== 'all' && (item ? (item.brand || '').trim() : '') !== brandFilter) return false;
    if (q) {
      const haystack = ((item ? item.name : '') + lot.batch + lot.locationCode + lot.locationName + lot.supplierName).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  };
  const lotRows = stockLots.filter(matchLot).slice().sort((left, right) => {
    const leftExpiry = left.expiry || '9999-99-99';
    const rightExpiry = right.expiry || '9999-99-99';
    return leftExpiry.localeCompare(rightExpiry);
  });

  const rows = inventory.filter(matchItem).slice().sort((left, right) => {
    if (groupBy === 'product') {
      const productCompare = productGroupLabel(left).localeCompare(productGroupLabel(right), 'pt-BR');
      if (productCompare !== 0) return productCompare;
      return (left.batch || '').localeCompare(right.batch || '', 'pt-BR');
    }
    const categoryCompare = (left.cat || 'Medicamentos').localeCompare(right.cat || 'Medicamentos', 'pt-BR');
    if (categoryCompare !== 0) return categoryCompare;
    const classCompare = (left.medClass || 'Geral').localeCompare(right.medClass || 'Geral', 'pt-BR');
    if (classCompare !== 0) return classCompare;
    return (left.name || '').localeCompare(right.name || '', 'pt-BR');
  });
  const groupedRows = rows.reduce((groups, item) => {
    const key = groupBy === 'product' ? productGroupKey(item) : (item.cat || 'Medicamentos');
    const label = groupBy === 'product' ? productGroupLabel(item) : (item.cat || 'Medicamentos');
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {});
  const groupedEntries = Object.entries(groupedRows);

  const isExpiringSoon = (expiry) => {
    if (!expiry || expiry === '—') return false;
    const match = /^(\d{2})\/(\d{4})$/.exec(expiry);
    if (!match) return false;
    const month = Number(match[1]);
    const year = Number(match[2]);
    const expiryDate = new Date(year, month, 0);
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
  };

  const toggleCategory = (category) => {
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const collapseAllCategories = () => {
    setCollapsedCategories(Object.fromEntries(groupedEntries.map(([category]) => [category, true])));
  };

  const expandAllCategories = () => {
    setCollapsedCategories(Object.fromEntries(groupedEntries.map(([category]) => [category, false])));
  };

  const movementRows = inventoryMovements.filter((movement) => {
    if (q && !(movement.itemName + movement.reason + movement.reference + movement.from + movement.to).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const locationRows = inventoryLocations.filter((location) => {
    if (q && !(location.code + location.name + location.zone + location.description).toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'controlled' && !location.controlledOnly) return false;
    return true;
  });

  const handleExport = async () => {
    try {
      await exportInventory({
        query: q,
        stockStatus: filter === 'controlled' ? 'all' : filter,
        controlledOnly: filter === 'controlled',
        locationCode: locationCode === 'all' ? '' : locationCode,
        medicationClassName: medicationClass === 'all' ? '' : medicationClass,
      });
    } catch (error) {
      notify(error && error.message ? error.message : 'Não foi possível exportar o estoque.', 'warn');
    }
  };

  const renderItemRow = (item) => {
    const state = stockState(item);
    const progressTarget = Math.max(1, item.normalThreshold || item.attentionThreshold || item.lowThreshold || item.min || 1);
    const pct = Math.max(6, Math.min(100, Math.round((item.qty / progressTarget) * 100)));
    const itemLots = (lotsByItemId[item.id] || []).filter((lot) => lot.qty > 0).slice().sort((left, right) => (left.expiry || '9999-99-99').localeCompare(right.expiry || '9999-99-99'));
    const hasThresholds = !!(item.lowThreshold || item.attentionThreshold || item.normalThreshold);
    const lowPct = hasThresholds && item.lowThreshold ? Math.round((item.lowThreshold / progressTarget) * 100) : null;
    const attentionPct = hasThresholds && item.attentionThreshold ? Math.round((item.attentionThreshold / progressTarget) * 100) : null;
    return (
      <tr key={item.id}>
        <td>
          <div className="inv-prod">
            <span className="inv-prod-ic"><Icon name={item.controlled ? 'lock' : 'pill'} size={16} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="inv-prod-name">
                {item.name}
                {item.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
              </div>
              <div className="ph-cell-sub">
                {item.brand} · <span className="fa-mono">{item.ean || item.sku}</span>
                {hasMultipleStores && storeNameById[item.storeId] && <> · {storeNameById[item.storeId]}</>}
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style={{ fontWeight: 700 }}>{item.medClass || 'Geral'}</div>
        </td>
        <td>
          <div className="inv-lotstack">
            {itemLots.length > 0
              ? itemLots.map((lot) => <span key={lot.id} className="ph-pick-loc inv-lotstack-loc" title={lot.locationCode}>{lot.locationCode}</span>)
              : <span className="ph-pick-loc inv-lotstack-loc" title={item.loc}>{item.loc}</span>}
          </div>
        </td>
        <td>
          <div className="inv-lotstack">
            {itemLots.length > 0
              ? itemLots.map((lot) => <span key={lot.id} className="fa-mono inv-lotstack-batch" title={lot.batch || '—'}>{lot.batch || '—'}</span>)
              : <span className="fa-mono inv-lotstack-batch" title={item.batch || '—'}>{item.batch || '—'}</span>}
          </div>
        </td>
        <td>
          <div className="inv-lotstack">
            {itemLots.length > 0
              ? itemLots.map((lot) => <span key={lot.id} className="inv-lotstack-date" style={isExpiringSoonIso(lot.expiry) ? { color: 'var(--fa-warn)', fontWeight: 700 } : undefined}>{formatIsoDate(lot.expiry)}</span>)
              : <span className="inv-lotstack-date" style={isExpiringSoon(item.expiry) ? { color: 'var(--fa-warn)', fontWeight: 700 } : undefined}>{item.expiry || '—'}</span>}
          </div>
        </td>
        <td>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{item.qty} <span className="fa-faint" style={{ fontWeight: 600, fontSize: 12 }}>un</span></div>
          <div className="inv-stockbar">
            <i style={{ width: pct + '%', background: state.color }} />
            {lowPct != null && lowPct > 0 && lowPct < 100 && <span className="tick" style={{ left: lowPct + '%' }} />}
            {attentionPct != null && attentionPct > 0 && attentionPct < 100 && <span className="tick" style={{ left: attentionPct + '%' }} />}
          </div>
          {hasThresholds && <div className="ph-cell-sub">baixo ate {item.lowThreshold || 0} · atencao ate {item.attentionThreshold || 0} · normal ate {item.normalThreshold || 0}</div>}
        </td>
        <td><span className="fa-badge" style={{ background: state.bg, color: state.color }}><span className="inv-status-dot" />{state.label}</span></td>
        <td className="inv-actions-td" style={{ textAlign: 'right' }}>
          <div className="ph-row-actions">
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditItem(item)}><Icon name="edit" size={14} />Editar</button>
            <button className="fa-iconbtn" style={{ width: 34, height: 34 }} onClick={() => setMovementItem(item)} aria-label="Movimentar item" title="Movimentar item">
              <Icon name="boxes" size={16} />
            </button>
            <button className="fa-iconbtn" style={{ width: 34, height: 34 }} onClick={() => setTransferItem(item)} aria-label="Transferir item" title="Transferir item">
              <Icon name="route" size={16} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <Topbar
        title="Estoque"
        sub={summary.total_items + ' SKUs · ' + summary.attention_stock_items + ' em atencao · ' + summary.low_stock_items + ' baixos · ' + summary.out_of_stock_items + ' esgotados'}
        onLogout={onLogout} ctx={ctx}
      >
        <div className="ph-topsearch">
          <Icon name="scan" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, EAN, SKU, classe, categoria ou local" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide inv-screen">
        <div className="inv-kpis">
          <InventoryKpi icon="boxes" label="Itens ativos" value={summary.total_items} active={filter === 'all'} onClick={() => setFilter('all')} />
          <InventoryKpi icon="check" label="Estoque normal" value={summary.normal_stock_items} tone="success" active={filter === 'normal'} onClick={() => setFilter('normal')} />
          <InventoryKpi icon="alert" label="Em atencao" value={summary.attention_stock_items} tone="info" active={filter === 'attention'} onClick={() => setFilter('attention')} />
          <InventoryKpi icon="alert" label="Estoque baixo" value={summary.low_stock_items} tone="warn" active={filter === 'low'} onClick={() => setFilter('low')} />
          <InventoryKpi icon="minus" label="Esgotados" value={summary.out_of_stock_items} tone="error" active={filter === 'out'} onClick={() => setFilter('out')} />
          <InventoryKpi icon="lock" label="Controlados" value={summary.controlled_items} active={filter === 'controlled'} onClick={() => setFilter('controlled')} />
        </div>

        {inventoryError && (
          <div className="fa-card" style={{ padding: '14px 16px', marginBottom: 16, background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 700 }}>
            {inventoryError}
          </div>
        )}

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="ph-seg">
              <button data-on={view === 'items' ? '1' : '0'} onClick={() => setView('items')}>Itens</button>
              <button data-on={view === 'lots' ? '1' : '0'} onClick={() => setView('lots')}>Lotes por local</button>
              <button data-on={view === 'movements' ? '1' : '0'} onClick={() => setView('movements')}>Movimentacoes</button>
              <button data-on={view === 'locations' ? '1' : '0'} onClick={() => setView('locations')}>Armazenamentos</button>
            </div>
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshInventory} disabled={inventoryBusy}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={handleExport} disabled={inventoryBusy}><Icon name="download" size={15} />Exportar CSV</button>
              <span className="inv-actions-sep" />
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setInvoiceOpen(true)} disabled={!inventoryLocations.length}><Icon name="scan" size={15} />Ler nota com IA</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setLocationOpen(true)}><Icon name="box" size={15} />Novo local</button>
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setLotReceiptOpen(true)} disabled={!inventoryLocations.length || !inventory.length}><Icon name="boxes" size={15} />Receber mercadoria</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)} disabled={!inventoryLocations.length}><Icon name="plus" size={15} stroke={2.2} />Novo item</button>
            </div>
          </div>

          {(view === 'items' || view === 'lots') && (
            <div className="inv-toolbar-row is-filters">
              <div className="inv-filter-field">
                <label>Tipo de local</label>
                <select className="fa-select" style={{ minWidth: 170 }} value={locationTypeFilter} onChange={(e) => setLocationTypeFilter(e.target.value)}>
                  <option value="all">Todos os tipos</option>
                  {LOCATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              {view === 'lots' && (
                <div className="inv-filter-field">
                  <label>Status do lote</label>
                  <select className="fa-select" style={{ minWidth: 170 }} value={lotStatusFilter} onChange={(e) => setLotStatusFilter(e.target.value)}>
                    <option value="all">Todos os status</option>
                    {LOT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              )}
              <div className="inv-filter-field">
                <label>Local</label>
                <select className="fa-select" style={{ minWidth: 200 }} value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
                  <option value="all">Todos os locais</option>
                  {inventoryLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}
                </select>
              </div>
              {view === 'items' && (
                <div className="inv-filter-field">
                  <label>Classe terapeutica</label>
                  <select className="fa-select" style={{ minWidth: 200 }} value={medicationClass} onChange={(e) => setMedicationClass(e.target.value)}>
                    <option value="all">Todas as classes</option>
                    {medicationClasses.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
                  </select>
                </div>
              )}
              <div className="inv-filter-field">
                <label>Marca</label>
                <select className="fa-select" style={{ minWidth: 180 }} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
                  <option value="all">Todas as marcas</option>
                  {brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </div>
              {(locationTypeFilter !== 'all' || lotStatusFilter !== 'all' || locationCode !== 'all' || medicationClass !== 'all' || brandFilter !== 'all') && (
                <button
                  className="fa-btn fa-btn-soft fa-btn-sm inv-filter-clear"
                  onClick={() => { setLocationTypeFilter('all'); setLotStatusFilter('all'); setLocationCode('all'); setMedicationClass('all'); setBrandFilter('all'); }}
                >
                  <Icon name="close" size={13} />Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {view === 'lots' && (
          <div className="inv-card">
            <div className="inv-card-head">
              <div>
                <div className="inv-card-head-title">Lotes por local</div>
                <div className="inv-card-head-sub">{lotRows.length} lote(s) neste filtro</div>
              </div>
            </div>
            <div className="ph-table-wrap">
              <table className="ph-table">
                <thead>
                  <tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th>Quantidade</th><th>Status</th><th>Fornecedor</th><th></th></tr>
                </thead>
                <tbody>
                  {lotRows.map((lot) => {
                    const item = inventory.find((entry) => entry.id === lot.itemId);
                    return (
                      <tr key={lot.id}>
                        <td>
                          <div className="inv-prod">
                            <span className="inv-prod-ic"><Icon name={item && item.controlled ? 'lock' : 'pill'} size={15} /></span>
                            <div style={{ minWidth: 0 }}>
                              <div className="inv-prod-name">
                                {item ? item.name : 'Item removido'}
                                {item && item.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
                              </div>
                              <div className="ph-cell-sub">{item ? item.brand : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="fa-mono">{lot.batch || '—'}</td>
                        <td style={isExpiringSoonIso(lot.expiry) ? { color: 'var(--fa-warn)', fontWeight: 700 } : undefined}>{formatIsoDate(lot.expiry)}</td>
                        <td>
                          <span className="ph-pick-loc">{lot.locationCode}</span>
                          <div className="ph-cell-sub">{lot.locationName} · {LOCATION_TYPE_LABEL[lot.locationType] || lot.locationType}</div>
                        </td>
                        <td style={{ fontWeight: 800 }}>{lot.qty} <span className="fa-faint" style={{ fontWeight: 600, fontSize: 12 }}>un</span></td>
                        <td>{lotStatusBadge(lot.status)}</td>
                        <td>{lot.supplierName || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="ph-row-actions">
                            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setLotTransferTarget(lot)}><Icon name="route" size={14} />Transferir</button>
                            <button className="fa-iconbtn" style={{ width: 34, height: 34 }} onClick={() => setLotAdjustTarget(lot)} aria-label="Ajustar lote" title="Ajustar lote"><Icon name="edit" size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!lotRows.length && <InventoryEmpty icon="boxes" label="Nenhum lote encontrado neste filtro." />}
            </div>
          </div>
        )}

        {view === 'items' && (
          <div className="inv-card">
            <div className="inv-card-head">
              <div>
                <div className="inv-card-head-title">Itens de estoque</div>
                <div className="inv-card-head-sub">
                  {rows.length} item(ns) em {groupedEntries.length} {groupBy === 'product' ? 'produto(s)' : 'categoria(s)'}
                </div>
              </div>
              <div className="inv-card-head-actions">
                <div className="ph-seg">
                  <button data-on={groupBy === 'category' ? '1' : '0'} onClick={() => setGroupBy('category')}>Por categoria</button>
                  <button data-on={groupBy === 'product' ? '1' : '0'} onClick={() => setGroupBy('product')}>Por produto</button>
                </div>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={expandAllCategories}><Icon name="expand" size={14} />Expandir tudo</button>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={collapseAllCategories}><Icon name="minus" size={14} />Recolher tudo</button>
              </div>
            </div>
            <div className="ph-table-wrap">
              <table className="ph-table inv-items-table">
                <colgroup>
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr><th>Medicamento</th><th>Classe</th><th>Local</th><th>Lote</th><th>Validade</th><th>Estoque</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {groupedEntries.flatMap(([key, group]) => {
                    const collapsed = !!collapsedCategories[key];
                    const groupQty = group.items.reduce((sum, item) => sum + (item.qty || 0), 0);
                    return [
                      <tr key={'category-' + key} className="inv-cat-row">
                        <td colSpan="8">
                          <button
                            className="inv-cat-btn"
                            data-open={collapsed ? '0' : '1'}
                            onClick={() => toggleCategory(key)}
                            aria-label={collapsed ? "Expandir grupo" : "Minimizar grupo"}
                          >
                            <span className="inv-cat-name">{group.label}</span>
                            <span className="inv-cat-count">
                              {groupBy === 'product'
                                ? group.items.length + (group.items.length === 1 ? ' lote' : ' lotes') + ' · ' + groupQty + ' un'
                                : group.items.length + ' item(ns)'}
                            </span>
                            <span className="inv-cat-chev"><Icon name="chevD" size={14} /></span>
                          </button>
                        </td>
                      </tr>,
                      ...(collapsed ? [] : group.items.map(renderItemRow)),
                    ];
                  })}
                </tbody>
              </table>
              {!rows.length && <InventoryEmpty icon="search" label="Nenhum item encontrado neste filtro." />}
            </div>
          </div>
        )}

        {view === 'movements' && (
          <div className="inv-grid">
            {movementRows.map((movement) => {
              const isTransfer = movement.type === 'transfer';
              const isPositive = movement.delta >= 0;
              const tone = isTransfer
                ? { fg: 'var(--fa-info)', bg: 'var(--fa-info-soft)' }
                : isPositive ? { fg: 'var(--fa-success)', bg: 'var(--fa-success-soft)' } : { fg: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)' };
              return (
                <div key={movement.id} className="inv-event-card" style={{ '--evt-color': tone.fg }}>
                  <div className="inv-event-head">
                    <span className="fa-iconbox" style={{ width: 40, height: 40, background: tone.bg, color: tone.fg }}>
                      <Icon name={isTransfer ? 'route' : isPositive ? 'plus' : 'minus'} size={17} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="inv-event-title">{movement.itemName}</div>
                      <div className="inv-event-sub">{inventoryMovementLabel(movement.type)} · {movement.reason}</div>
                    </div>
                    <span className="fa-badge" style={{ background: tone.bg, color: tone.fg }}>
                      {movement.delta > 0 ? '+' : ''}{movement.delta}
                    </span>
                  </div>
                  <dl className="inv-kv2">
                    <dt>Antes</dt><dd className="fa-mono">{movement.before}</dd>
                    <dt>Depois</dt><dd className="fa-mono">{movement.after}</dd>
                    <dt>Origem</dt><dd className="fa-mono">{movement.from || '—'}</dd>
                    <dt>Destino</dt><dd className="fa-mono">{movement.to || '—'}</dd>
                    <dt>Referencia</dt><dd className="fa-mono">{movement.reference || '—'}</dd>
                    <dt>Quando</dt><dd>{inventoryMovementDate(movement.createdAt)}</dd>
                  </dl>
                  {movement.note && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--fa-mist)', fontSize: 13.5 }}>{movement.note}</div>}
                </div>
              );
            })}
            {!movementRows.length && <InventoryEmpty icon="activity" label="Nenhuma movimentacao encontrada." />}
          </div>
        )}

        {view === 'locations' && (
          <div className="inv-grid">
            {locationRows.map((location) => (
              <div key={location.id} className="inv-event-card" style={{ '--evt-color': location.controlledOnly ? 'var(--fa-primary)' : 'var(--fa-mist)' }}>
                <div className="inv-event-head">
                  <span className="fa-iconbox" style={{ width: 40, height: 40 }}><Icon name={location.controlledOnly ? 'lock' : 'box'} size={17} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="inv-event-title">{location.code} · {location.name}</div>
                    <div className="inv-event-sub">{location.zone || 'Sem zona'} · {location.controlledOnly ? 'Somente controlados' : 'Uso geral'}</div>
                  </div>
                  <span className="fa-badge fa-badge-mist">{LOCATION_TYPE_LABEL[location.locationType] || location.locationType}</span>
                </div>
                <dl className="inv-kv2">
                  <dt>Itens alocados</dt><dd>{location.allocatedItems}</dd>
                  <dt>Temperatura</dt><dd>{location.temperatureRange || 'Ambiente'}</dd>
                </dl>
                <div className="ph-cell-sub" style={{ marginTop: 10 }}>{location.description || 'Sem descricao operacional.'}</div>
              </div>
            ))}
            {!locationRows.length && <InventoryEmpty icon="box" label="Nenhum local de armazenamento encontrado." />}
          </div>
        )}
      </div>

      {movementItem && (
        <StockMovementModal
          key={movementItem.id + ":" + (lotsByItemId[movementItem.id] || []).filter((lot) => lot.qty > 0).map((lot) => lot.id + "-" + lot.qty).join("|")}
          item={movementItem}
          locations={inventoryLocations}
          lots={(lotsByItemId[movementItem.id] || []).filter((lot) => lot.qty > 0)}
          notify={notify}
          onClose={() => setMovementItem(null)}
          onSave={async (payload) => {
            await adjustStock(movementItem.id, payload, movementItem.storeId);
            setMovementItem(null);
          }}
          onTransferLot={(lot) => { setMovementItem(null); setLotTransferTarget(lot); }}
          onAdjustLot={(lot) => { setMovementItem(null); setLotAdjustTarget(lot); }}
          onQuickEntry={async (payload) => {
            await receiveLot({ inventoryItemId: movementItem.id, storeId: movementItem.storeId, ...payload });
            setMovementItem(null);
          }}
          onQuickAdjust={async (lotId, payload, storeId) => {
            await adjustLot(lotId, payload, storeId);
            setMovementItem(null);
          }}
        />
      )}
      {editItem && (
        <InventoryItemModal
          mode="edit"
          title="Editar medicamento"
          submitLabel="Salvar alteracoes"
          products={products}
          locations={inventoryLocations}
          initialItem={editItem}
          stockLots={stockLots}
          onClose={() => setEditItem(null)}
          onSave={async (payload) => {
            try {
              await updateInventory(editItem.id, payload);
              await applyExtraLocations(editItem.id, payload.extraLocations);
              setEditItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel atualizar o medicamento.', 'warn');
            }
          }}
        />
      )}
      {transferItem && (
        <TransferInventoryModal
          item={transferItem}
          locations={inventoryLocations}
          lots={(lotsByItemId[transferItem.id] || []).filter((lot) => lot.qty > 0)}
          onClose={() => setTransferItem(null)}
          onSave={async (payload) => {
            try {
              await transferInventory(transferItem.id, payload);
              setTransferItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel transferir o item.', 'warn');
            }
          }}
          onTransferLot={async (lotId, payload) => {
            try {
              await transferLot(lotId, payload);
              setTransferItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel transferir o lote.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <InventoryItemModal
          mode="create"
          title="Novo item de estoque"
          submitLabel="Cadastrar item"
          products={products}
          locations={inventoryLocations}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              const created = await addInventory(payload);
              if (created && created.id) {
                await applyExtraLocations(created.id, payload.extraLocations);
              }
              setNewOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel cadastrar o item.', 'warn');
            }
          }}
        />
      )}
      {locationOpen && (
        <LocationModal
          onClose={() => setLocationOpen(false)}
          onSave={async (payload) => {
            try {
              await addInventoryLocation(payload);
              setLocationOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel cadastrar o local.', 'warn');
            }
          }}
        />
      )}
      {invoiceOpen && (
        <InvoiceImportModal
          inventory={inventory}
          locations={inventoryLocations}
          categoryOptions={categoryOptions}
          onClose={() => setInvoiceOpen(false)}
          onPreview={previewInventoryInvoice}
          onConfirm={confirmInventoryInvoice}
          notify={notify}
        />
      )}
      {lotReceiptOpen && (
        <LotReceiptModal
          inventory={inventory}
          locations={inventoryLocations}
          suppliers={suppliers || []}
          onClose={() => setLotReceiptOpen(false)}
          onSave={async (payload) => {
            try {
              await receiveLot(payload);
              setLotReceiptOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel registrar o recebimento.', 'warn');
            }
          }}
        />
      )}
      {lotTransferTarget && (
        <LotTransferModal
          lot={lotTransferTarget}
          locations={inventoryLocations}
          onClose={() => setLotTransferTarget(null)}
          onSave={async (payload) => {
            try {
              await transferLot(lotTransferTarget.id, { ...payload, storeId: lotTransferTarget.storeId });
              setLotTransferTarget(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel transferir o lote.', 'warn');
            }
          }}
        />
      )}
      {lotAdjustTarget && (
        <LotAdjustmentModal
          lot={lotAdjustTarget}
          onClose={() => setLotAdjustTarget(null)}
          onSave={async (payload) => {
            try {
              await adjustLot(lotAdjustTarget.id, payload, lotAdjustTarget.storeId);
              setLotAdjustTarget(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel ajustar o lote.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function InventoryKpi({ icon, label, value, tone, active, onClick }) {
  const palette = tone === 'warn'
    ? { fg: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)' }
    : tone === 'error'
      ? { fg: 'var(--fa-error)', bg: '#FBEAE9' }
      : tone === 'info'
        ? { fg: 'var(--fa-info)', bg: 'var(--fa-info-soft)' }
        : tone === 'success'
          ? { fg: 'var(--fa-success)', bg: 'var(--fa-success-soft)' }
          : { fg: 'var(--fa-primary)', bg: 'var(--fa-rose-soft)' };
  return (
    <button
      type="button"
      className="inv-kpi"
      data-active={active ? '1' : '0'}
      onClick={onClick}
      style={{ '--kpi-fg': palette.fg, '--kpi-bg': palette.bg }}
    >
      <span className="inv-kpi-ic"><Icon name={icon} size={17} /></span>
      <div className="inv-kpi-body">
        <div className="inv-kpi-val">{value}</div>
        <div className="inv-kpi-label">{label}</div>
      </div>
    </button>
  );
}

function InventoryEmpty({ icon, label }) {
  return (
    <div className="ph-empty">
      <span className="fa-iconbox"><Icon name={icon} size={28} /></span>
      <div>{label}</div>
    </div>
  );
}

/* Divide modais extensos em blocos com nome (usado só nesta tela). */
function FormSection({ icon, title, actions, children }) {
  return (
    <div className="inv-section">
      <div className="inv-section-head">
        <span className="inv-section-ic"><Icon name={icon} size={13} /></span>
        <span className="inv-section-title" style={{ flex: 1 }}>{title}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}

function InventoryItemModal({ mode, title, submitLabel, products, locations, initialItem, stockLots, onClose, onSave }) {
  const productOptions = (products || []).filter((product) => product.active).slice().sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));
  const [productId, setProductId] = useState('');
  const selectedProduct = mode === 'create' ? productOptions.find((product) => product.id === productId) : null;
  const [form, setForm] = useState(() => buildInventoryItemForm({ item: initialItem, locations }));
  const [locationRows, setLocationRows] = useState(() => (
    mode === 'create'
      ? [{ key: Date.now() + '-' + Math.random(), locationCode: locations[0] ? locations[0].code : '', quantity: 1, batchCode: '', expiryDate: '' }]
      : []
  ));
  const addLocationRow = () => {
    setLocationRows((prev) => [...prev, {
      key: Date.now() + '-' + Math.random(),
      locationCode: locations[0] ? locations[0].code : '',
      quantity: 1,
      batchCode: '',
      expiryDate: '',
    }]);
  };
  const updateLocationRow = (index, key, value) => {
    setLocationRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };
  const removeLocationRow = (index) => {
    setLocationRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildInventoryItemForm({ item: initialItem, locations }));
      return;
    }
    if (!selectedProduct) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      loc: prev.loc || (locations[0] ? locations[0].code : ''),
      qty: 0,
    }));
  }, [mode, productId, initialItem, locations]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const thresholdsValid = Number(form.lowThreshold || 0) <= Number(form.attentionThreshold || 0) && Number(form.attentionThreshold || 0) <= Number(form.normalThreshold || 0);
  const validLocationRows = locationRows.filter((row) => row.locationCode && Number(row.quantity) > 0 && row.batchCode.trim());
  const primaryRow = validLocationRows[0];
  const rowsValid = mode === 'create' ? !!primaryRow : true;
  const priceValid = mode === 'create' ? Number(form.price || 0) > 0 : true;
  const productValid = mode === 'create' ? !!productId : true;
  const valid = productValid && thresholdsValid && rowsValid && priceValid;
  const itemLots = mode === 'edit' && initialItem
    ? (stockLots || []).filter((lot) => lot.itemId === initialItem.id && lot.qty > 0).slice().sort((left, right) => right.qty - left.qty)
    : [];

  return (
    <ModalShell open={true} onClose={onClose} maxw={760} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name={mode === 'edit' ? 'edit' : 'box'} size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        {mode === 'edit' ? 'Ajuste localização, lote, validade, faixas de estoque e preço deste item nesta loja.' : 'Selecione um produto já cadastrado e informe onde e quanto desse produto entra no estoque desta loja.'}
      </p>
      {mode === 'edit' && (
        <FormSection icon="map" title="Localizações atuais deste medicamento">
          {itemLots.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {itemLots.map((lot) => (
                <div key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="ph-pick-loc">{lot.locationCode}</span>
                  <span className="ph-cell-sub">{lot.locationName} · lote {lot.batch || '—'} · {lot.qty} un</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ph-cell-sub">Nenhum lote individual registrado ainda — este item usa apenas o local unico do cadastro abaixo. Use "Receber mercadoria" para comecar a rastrear por lote e local.</div>
          )}
        </FormSection>
      )}
      {mode === 'create' && (
        <FormSection icon="capsule" title="Produto *">
          <div className="fa-field">
            <label>Selecione o produto cadastrado</label>
            <select className="fa-select" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione um produto</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.sku} · {product.brandName || 'Sem marca'}
                </option>
              ))}
            </select>
          </div>
          {!productOptions.length && (
            <div className="ph-cell-sub" style={{ marginTop: 8 }}>Nenhum produto cadastrado ainda. Cadastre o produto na tela <strong>Produtos</strong> antes de lançar o estoque.</div>
          )}
        </FormSection>
      )}
      {(selectedProduct || (mode === 'edit' && initialItem)) && (
        <FormSection icon="tag" title="Identificação do produto">
          <div className="ph-cell-sub">
            <strong>{(selectedProduct || initialItem).name}</strong> · SKU {(selectedProduct || initialItem).sku} · {(selectedProduct ? selectedProduct.brandName : initialItem.brand) || 'Sem marca'}<br />
            {(selectedProduct ? selectedProduct.categoryName : initialItem.cat) || 'Sem categoria'} · {(selectedProduct ? selectedProduct.medicationClassName : initialItem.medClass) || 'Sem classe'} · EAN {(selectedProduct ? selectedProduct.eanCode : initialItem.ean) || '—'}
            {(selectedProduct ? selectedProduct.isControlled : initialItem.controlled) ? ' · Controlado' : ''}
            {(selectedProduct ? selectedProduct.isGeneric : initialItem.isGeneric) ? ' · Genérico' : ''}
          </div>
          {mode === 'edit' && <div className="ph-cell-sub" style={{ marginTop: 6 }}>Para alterar nome, marca, categoria, classe terapêutica ou imagens deste produto, use a tela <strong>Produtos</strong>.</div>}
        </FormSection>
      )}
      <FormSection icon="gauge" title="Faixas de estoque">
        <div className="fa-form2">
          <div className="fa-field"><label>Estoque base</label><input className="fa-input" type="number" value={form.min} onChange={(e) => set('min', Number(e.target.value || 0))} /></div>
          <div className="fa-field"><label>Faixa baixa</label><input className="fa-input" type="number" value={form.lowThreshold} onChange={(e) => set('lowThreshold', Number(e.target.value || 0))} /></div>
          <div className="fa-field"><label>Faixa atencao</label><input className="fa-input" type="number" value={form.attentionThreshold} onChange={(e) => set('attentionThreshold', Number(e.target.value || 0))} /></div>
          <div className="fa-field"><label>Faixa normal</label><input className="fa-input" type="number" value={form.normalThreshold} onChange={(e) => set('normalThreshold', Number(e.target.value || 0))} /></div>
          <div className="fa-field fa-span2"><label>Observacao operacional</label><input className="fa-input" value={form.note} onChange={(e) => set('note', e.target.value)} /></div>
        </div>
        {!thresholdsValid && <div className="fa-card" style={{ marginTop: 12, padding: '12px 14px', background: '#FBEAE9', color: 'var(--fa-error)', fontWeight: 700 }}>A faixa baixa deve ser menor ou igual a faixa de atencao, que deve ser menor ou igual a faixa normal.</div>}
        {mode === 'edit' && <p className="ph-cell-sub" style={{ marginTop: 12 }}>Preço, custo, preço de referência e promoção são definidos na tela <strong>Precificador</strong>.</p>}
      </FormSection>
      {mode === 'create' && (
        <FormSection icon="tag" title="Preço de venda">
          <div className="fa-form2">
            <div className="fa-field">
              <label>Preço (R$) *</label>
              <input className="fa-input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => set('price', Number(e.target.value || 0))} />
            </div>
          </div>
          <p className="ph-cell-sub" style={{ marginTop: 12 }}>Custo, preço de referência e promoção sao definidos depois na tela <strong>Precificador</strong>.</p>
        </FormSection>
      )}
      <FormSection
        icon="map"
        title={'Localizações e quantidades' + (mode === 'create' ? ' *' : '')}
        actions={<button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={addLocationRow}><Icon name="plus" size={13} />Adicionar localizacao</button>}
      >
        <div className="ph-cell-sub" style={{ marginBottom: 10 }}>{mode === 'create' ? 'Defina em quais locais o estoque inicial deste medicamento fica, e a quantidade em cada um.' : 'Adicione estoque deste medicamento em um ou mais locais (recebimento por lote).'}</div>
        {locationRows.map((row, index) => (
          <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <div className="fa-field"><label>Local</label><select className="fa-select" value={row.locationCode} onChange={(e) => updateLocationRow(index, 'locationCode', e.target.value)}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
            <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" value={row.quantity} onChange={(e) => updateLocationRow(index, 'quantity', Number(e.target.value || 0))} /></div>
            <div className="fa-field"><label>Lote *</label><input className="fa-input" value={row.batchCode} onChange={(e) => updateLocationRow(index, 'batchCode', e.target.value)} placeholder="Ex.: LOT-2026-001" /></div>
            <div className="fa-field"><label>Validade</label><input className="fa-input" type="date" value={row.expiryDate} onChange={(e) => updateLocationRow(index, 'expiryDate', e.target.value)} /></div>
            <button type="button" className="fa-iconbtn" style={{ width: 34, height: 34 }} onClick={() => removeLocationRow(index)} aria-label="Remover localizacao" title="Remover localizacao"><Icon name="minus" size={14} /></button>
          </div>
        ))}
        {!locationRows.length && <div className="ph-cell-sub">Nenhuma localizacao adicionada ainda.</div>}
      </FormSection>
      {mode === 'edit' && (
        <FormSection icon="shield" title="Status">
          <label className="fa-check" data-on={form.active ? '1' : '0'} onClick={() => set('active', !form.active)}>
            <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Item ativo nesta loja
          </label>
        </FormSection>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={() => onSave({
          ...form,
          productId,
          loc: mode === 'create' && primaryRow ? primaryRow.locationCode : form.loc,
          qty: mode === 'create' ? 0 : form.qty,
          extraLocations: validLocationRows,
        })}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

function buildInventoryItemForm({ item, locations }) {
  return {
    loc: item && item.loc || (locations[0] ? locations[0].code : ''),
    batch: item && item.batch && item.batch !== '—' ? item.batch : '',
    expiry: item && item.expiry && item.expiry !== '—' ? item.expiry : '',
    qty: 0,
    min: Number(item && (item.min || item.lowThreshold) || 0),
    lowThreshold: Number(item && (item.lowThreshold || item.min) || 0),
    attentionThreshold: Number(item && (item.attentionThreshold || item.lowThreshold || item.min) || 0),
    normalThreshold: Number(item && (item.normalThreshold || item.attentionThreshold || item.lowThreshold || item.min) || 0),
    price: Number(item && item.price || 0),
    cost: Number(item && item.cost || 0),
    ref: Number(item && item.ref || 0),
    promo: Number(item && item.promo || 0),
    active: item && item.active == null ? true : !!(item && item.active),
    marketplaceVisible: item && item.marketplaceVisible == null ? true : !!(item && item.marketplaceVisible),
    note: item && item.note || '',
  };
}

function InvoiceImportModal({ inventory, locations, categoryOptions, onClose, onPreview, onConfirm, notify }) {
  const [stage, setStage] = useState('upload');
  const [provider, setProvider] = useState('gemini');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [draftItems, setDraftItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const classOptions = [...new Set(inventory.map((item) => item.medClass || 'Geral'))].sort((left, right) => left.localeCompare(right, 'pt-BR'));

  useEffect(() => {
    if (!preview) {
      setDraftItems([]);
      return;
    }
    setReferenceCode(buildInvoiceReference(preview.header));
    setNote(preview.header.notes || '');
    setDraftItems((preview.items || []).map((item) => buildInvoiceDraftLine(item, locations, categoryOptions)));
  }, [preview, locations, categoryOptions]);

  const setDraftItem = (lineId, patch) => {
    setDraftItems((prev) => prev.map((item) => item.lineId === lineId ? { ...item, ...patch } : item));
  };

  const handleAnalyze = async () => {
    if (!file) {
      notify('Selecione uma nota fiscal em PDF ou imagem.', 'warn');
      return;
    }
    setBusy(true);
    setStage('processing');
    try {
      const payload = await onPreview({ file, provider, model: '' });
      setPreview(payload);
      setStage('review');
    } catch (error) {
      setStage('upload');
      notify(error && error.message ? error.message : 'Nao foi possivel ler a nota fiscal.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const activeLines = draftItems.filter((item) => item.action !== 'skip');
    if (!activeLines.length) {
      notify('Selecione ao menos uma linha para importar.', 'warn');
      return;
    }
    const invalidNew = activeLines.find((item) => item.action === 'new' && (!item.name.trim() || !item.storageLocationCode.trim() || !item.medicationClassName.trim() || !item.categoryName.trim()));
    if (invalidNew) {
      notify('Preencha nome, categoria, classe e localizacao para todos os novos itens antes de confirmar.', 'warn');
      return;
    }
    const invalidExisting = activeLines.find((item) => item.action === 'existing' && !item.matchedItemId);
    if (invalidExisting) {
      notify('Selecione o item correspondente para cada linha vinculada a um SKU existente.', 'warn');
      return;
    }
    const invalidThresholds = activeLines.find((item) => Number(item.lowStockThreshold || 0) > Number(item.attentionStockThreshold || 0) || Number(item.attentionStockThreshold || 0) > Number(item.normalStockThreshold || 0));
    if (invalidThresholds) {
      notify('Revise as faixas de estoque. A ordem deve ser baixa <= atencao <= normal.', 'warn');
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        supplierName: preview.header.supplierName,
        invoiceNumber: preview.header.invoiceNumber,
        invoiceSeries: preview.header.invoiceSeries,
        referenceCode,
        note,
        items: draftItems,
      });
      onClose();
    } catch (error) {
      notify(error && error.message ? error.message : 'Nao foi possivel confirmar a importacao da nota fiscal.', 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={1080} className="inv-modal">
      {stage === 'upload' && (
        <div>
          <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14 }}><Icon name="scan" size={28} /></span>
          <h2 className="fa-h3" style={{ fontSize: 22 }}>Importar nota fiscal com IA</h2>
          <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
            Envie o PDF ou a imagem da nota fiscal. A IA extrai os itens e voce confere tudo antes da gravacao no estoque.
          </p>
          <div className="fa-form2" style={{ marginTop: 18 }}>
            <div className="fa-field fa-span2">
              <label>Arquivo da nota fiscal</label>
              <input className="fa-input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
            </div>
            <div className="fa-field">
              <label>Provider de leitura</label>
              <select className="fa-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
              </select>
            </div>
            <div className="fa-field">
              <label>Observacao</label>
              <div className="fa-card" style={{ padding: '12px 14px', minHeight: 46, display: 'flex', alignItems: 'center', color: 'var(--fa-ink-3)', fontSize: 13.5 }}>
                Para PDF, prefira Gemini. OpenAI nesta etapa esta voltado para imagens.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!file} onClick={handleAnalyze}><Icon name="scan" size={16} />Analisar nota</button>
          </div>
        </div>
      )}

      {stage === 'processing' && (
        <div style={{ textAlign: 'center', padding: '24px 8px 12px' }}>
          <span className="fa-iconbox" style={{ width: 68, height: 68, margin: '0 auto 16px' }}><Icon name="repeat" size={30} /></span>
          <h2 className="fa-h3" style={{ fontSize: 22 }}>Processando nota fiscal</h2>
          <p className="fa-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: '10px auto 0' }}>
            Estamos lendo o documento, extraindo os itens e sugerindo o melhor encaixe com o estoque atual para a sua conferencia.
          </p>
          <div className="fa-card" style={{ marginTop: 18, padding: '16px 18px', background: 'var(--fa-info-soft)', color: 'var(--fa-primary)', fontWeight: 700 }}>
            Arquivo em analise: {file ? file.name : 'nota-fiscal'}
          </div>
        </div>
      )}

      {stage === 'review' && preview && (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <span className="fa-iconbox" style={{ width: 56, height: 56, marginBottom: 14 }}><Icon name="check" size={28} /></span>
              <h2 className="fa-h3" style={{ fontSize: 22 }}>Conferencia antes da entrada</h2>
              <p className="fa-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                Revise o cabecalho, ajuste os itens linha a linha e confirme a gravacao no estoque apenas quando tudo estiver consistente.
              </p>
            </div>
            <div className="fa-card" style={{ padding: 16, minWidth: 300, flex: '0 0 340px' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{preview.header.supplierName || 'Fornecedor nao identificado'}</div>
              <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                <div>NF: <span className="fa-mono">{preview.header.invoiceSeries || '—'} {preview.header.invoiceNumber || '—'}</span></div>
                <div>Emissao: <span className="fa-mono">{preview.header.issueDate || '—'}</span></div>
                <div>Total: <span className="fa-mono">{brl(Number(preview.header.totalAmount || 0))}</span></div>
                <div>Arquivo: <span className="fa-mono">{preview.sourceFileName}</span></div>
              </div>
            </div>
          </div>

          <div className="fa-form2" style={{ marginBottom: 16 }}>
            <div className="fa-field"><label>Referencia da movimentacao</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></div>
            <div className="fa-field"><label>Provider usado</label><input className="fa-input" value={preview.provider + ' · ' + preview.model} disabled /></div>
            <div className="fa-field fa-span2"><label>Observacao geral</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notas operacionais da importacao" /></div>
          </div>

          <div style={{ maxHeight: '54vh', overflowY: 'auto', paddingRight: 6, display: 'grid', gap: 12 }}>
            {draftItems.map((item, index) => {
              const matched = inventory.find((entry) => entry.id === item.matchedItemId) || null;
              const accent = item.action === 'new' ? 'var(--fa-success)' : item.action === 'skip' ? 'var(--fa-mist)' : 'var(--fa-info)';
              return (
                <div key={item.lineId} className="fa-card" style={{ padding: 16, borderLeft: '4px solid ' + accent }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span className="fa-badge fa-badge-mist">Linha {index + 1}</span>
                    <div style={{ fontWeight: 800, flex: 1, minWidth: 220 }}>{item.description || item.name || 'Item sem descricao'}</div>
                    <span className="fa-badge" style={{ background: 'var(--fa-info-soft)', color: 'var(--fa-primary)' }}>{item.quantity} un</span>
                    <span className="fa-badge" style={{ background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>{brl(Number(item.acquisitionCost || 0))} custo</span>
                  </div>
                  <div className="ph-seg" style={{ width: '100%', marginBottom: 14 }}>
                    <button style={{ flex: 1 }} data-on={item.action === 'existing' ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { action: 'existing', matchedItemId: item.matchedItemId || (item.matchCandidates[0] ? item.matchCandidates[0].id : '') })}>Vincular existente</button>
                    <button style={{ flex: 1 }} data-on={item.action === 'new' ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { action: 'new' })}>Criar novo</button>
                    <button style={{ flex: 1 }} data-on={item.action === 'skip' ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { action: 'skip' })}>Ignorar linha</button>
                  </div>

                  {item.action === 'existing' && (
                    <div className="fa-form2" style={{ marginBottom: 12 }}>
                      <div className="fa-field fa-span2">
                        <label>Item correspondente</label>
                        <select className="fa-select" value={item.matchedItemId} onChange={(e) => {
                          const selected = item.matchCandidates.find((candidate) => candidate.id === e.target.value);
                          setDraftItem(item.lineId, {
                            matchedItemId: e.target.value,
                            storageLocationCode: selected ? selected.storageLocationCode : item.storageLocationCode,
                            isControlled: selected ? selected.isControlled : item.isControlled,
                            minimumQuantity: selected ? selected.minimumQuantity : item.minimumQuantity,
                            categoryName: selected ? selected.categoryName || item.categoryName : item.categoryName,
                            medicationClassName: selected ? selected.medicationClassName : item.medicationClassName,
                            lowStockThreshold: selected ? selected.lowStockThreshold : item.lowStockThreshold,
                            attentionStockThreshold: selected ? selected.attentionStockThreshold : item.attentionStockThreshold,
                            normalStockThreshold: selected ? selected.normalStockThreshold : item.normalStockThreshold,
                          });
                        }}>
                          <option value="">Selecione um item ja cadastrado</option>
                          {item.matchCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name} · {candidate.brandName || 'Sem marca'} · {candidate.eanCode || candidate.sku}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="fa-field"><label>Localizacao de entrada</label><select className="fa-select" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
                      <div className="fa-field"><label>Estoque atual</label><input className="fa-input" value={matched ? matched.qty : 0} disabled /></div>
                    </div>
                  )}

                  {item.action === 'new' && (
                    <div className="fa-form2" style={{ marginBottom: 12 }}>
                      <div className="fa-field"><label>SKU</label><input className="fa-input" value={item.sku} onChange={(e) => setDraftItem(item.lineId, { sku: e.target.value })} /></div>
                      <div className="fa-field fa-span2"><label>Nome *</label><input className="fa-input" value={item.name} onChange={(e) => setDraftItem(item.lineId, { name: e.target.value })} /></div>
                      <div className="fa-field"><label>Marca</label><input className="fa-input" value={item.brandName} onChange={(e) => setDraftItem(item.lineId, { brandName: e.target.value })} /></div>
                      <div className="fa-field"><label>Categoria</label><select className="fa-select" value={item.categoryName} onChange={(e) => setDraftItem(item.lineId, { categoryName: e.target.value })}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
                      <div className="fa-field">
                        <label>Classe terapeutica</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <select className="fa-select" value={item.useNewMedicationClass ? '__new__' : item.medicationClassName} onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setDraftItem(item.lineId, { useNewMedicationClass: true });
                              return;
                            }
                            setDraftItem(item.lineId, { useNewMedicationClass: false, medicationClassName: e.target.value });
                          }}>
                            {classOptions.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
                            <option value="__new__">Adicionar nova classe terapeutica</option>
                          </select>
                          {!item.useNewMedicationClass && <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setDraftItem(item.lineId, { useNewMedicationClass: true })}><Icon name="plus" size={14} />Nova</button>}
                        </div>
                        {item.useNewMedicationClass && <input className="fa-input" style={{ marginTop: 8 }} value={item.newMedicationClassName || ''} onChange={(e) => setDraftItem(item.lineId, { newMedicationClassName: e.target.value, medicationClassName: e.target.value })} placeholder="Ex.: Antibiotico, Gripal" />}
                      </div>
                      <div className="fa-field"><label>EAN</label><input className="fa-input" value={item.eanCode} onChange={(e) => setDraftItem(item.lineId, { eanCode: e.target.value })} /></div>
                      <div className="fa-field"><label>Localizacao *</label><select className="fa-select" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
                    </div>
                  )}

                  {item.action !== 'skip' && (
                    <FormSection icon="gauge" title="Lote e precificação">
                      <div className="fa-form2">
                        <div className="fa-field"><label>Lote</label><input className="fa-input" value={item.batchCode} onChange={(e) => setDraftItem(item.lineId, { batchCode: e.target.value })} /></div>
                        <div className="fa-field"><label>Validade</label><input className="fa-input" value={item.expiryLabel} onChange={(e) => setDraftItem(item.lineId, { expiryLabel: e.target.value })} placeholder="MM/AAAA" /></div>
                        <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="0" value={item.quantity} onChange={(e) => setDraftItem(item.lineId, { quantity: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Estoque base</label><input className="fa-input" type="number" min="0" value={item.minimumQuantity} onChange={(e) => setDraftItem(item.lineId, { minimumQuantity: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Faixa baixa</label><input className="fa-input" type="number" min="0" value={item.lowStockThreshold} onChange={(e) => setDraftItem(item.lineId, { lowStockThreshold: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Faixa atencao</label><input className="fa-input" type="number" min="0" value={item.attentionStockThreshold} onChange={(e) => setDraftItem(item.lineId, { attentionStockThreshold: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Faixa normal</label><input className="fa-input" type="number" min="0" value={item.normalStockThreshold} onChange={(e) => setDraftItem(item.lineId, { normalStockThreshold: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Custo de aquisicao (R&#36;)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.acquisitionCost} disabled /><div className="ph-cell-sub">Calculado automaticamente pela nota: valor total de compra dividido pela quantidade.</div></div>
                        <div className="fa-field"><label>Valor total de compra (R&#36;)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.purchaseTotalCost || 0} disabled /></div>
                        <div className="fa-field"><label>Preco venda (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.salePrice} onChange={(e) => setDraftItem(item.lineId, { salePrice: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Preco referencia (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.marketReferencePrice} onChange={(e) => setDraftItem(item.lineId, { marketReferencePrice: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Promocao (%)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.promotionalDiscountPercent} onChange={(e) => setDraftItem(item.lineId, { promotionalDiscountPercent: Number(e.target.value || 0) })} /></div>
                        <div className="fa-field"><label>Custo de imposto (R&#36;)</label><input className="fa-input" type="number" step="0.01" min="0" value={item.taxCostAmount} onChange={(e) => setDraftItem(item.lineId, { taxCostAmount: e.target.value })} placeholder="Opcional" /></div>
                        <div className="fa-field fa-span2"><label>Observacao da linha</label><input className="fa-input" value={item.note} onChange={(e) => setDraftItem(item.lineId, { note: e.target.value })} placeholder="Ex.: divergencia de lote, conferido manualmente" /></div>
                      </div>
                      <label className="fa-check" data-on={item.isControlled ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { isControlled: !item.isControlled })} style={{ marginTop: 12 }}>
                        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Tipo regulatório sujeito a controle
                      </label>
                      <label className="fa-check" data-on={item.isSubjectToIcmsSt ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { isSubjectToIcmsSt: !item.isSubjectToIcmsSt })} style={{ marginTop: 8 }}>
                        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Sujeito a ICMS-ST nesta compra
                      </label>
                    </FormSection>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={() => { setStage('upload'); setPreview(null); setDraftItems([]); }}>Analisar outro arquivo</button>
            <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={busy} onClick={handleConfirm}><Icon name="check" size={16} />Confirmar entrada no estoque</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function buildInvoiceReference(header) {
  if (!header) return 'NF-IMPORT';
  if (header.invoiceSeries && header.invoiceNumber) return 'NF-' + header.invoiceSeries + '-' + header.invoiceNumber;
  if (header.invoiceNumber) return 'NF-' + header.invoiceNumber;
  return 'NF-IMPORT';
}

function resolveInvoiceAcquisitionCost(item) {
  const quantity = Number(item && item.quantity || 0);
  const totalCost = Number(item && item.totalCost || 0);
  const suggestedAcquisitionCost = Number(item && item.suggestedAcquisitionCost || 0);
  const unitCost = Number(item && item.unitCost || 0);
  if (suggestedAcquisitionCost > 0) return suggestedAcquisitionCost;
  if (quantity > 0 && totalCost > 0) return Math.round(totalCost / quantity * 100) / 100;
  return unitCost;
}

function buildInvoiceDraftLine(item, locations, categoryOptions) {
  const firstCandidate = item.matchCandidates && item.matchCandidates[0] ? item.matchCandidates[0] : null;
  const fallbackLocation = item.suggestedStorageLocationCode || (firstCandidate ? firstCandidate.storageLocationCode : '') || (locations[0] ? locations[0].code : '');
  const acquisitionCost = resolveInvoiceAcquisitionCost(item);
  return {
    lineId: item.lineId,
    action: firstCandidate ? 'existing' : 'new',
    matchedItemId: firstCandidate ? firstCandidate.id : '',
    description: item.description || '',
    sku: item.suggestedSku || '',
    name: item.suggestedName || item.description || '',
    brandName: item.suggestedBrandName || item.brandName || '',
    categoryName: item.suggestedCategoryName || categoryOptions[0] || 'Medicamentos',
    medicationClassName: item.suggestedMedicationClassName || (firstCandidate ? firstCandidate.medicationClassName : '') || 'Geral',
    useNewMedicationClass: false,
    newMedicationClassName: '',
    eanCode: item.eanCode || '',
    storageLocationCode: fallbackLocation,
    batchCode: item.batchCode || '',
    expiryLabel: item.expiryLabel || '',
    quantity: Number(item.quantity || 0),
    minimumQuantity: Number(item.suggestedMinimumQuantity || (firstCandidate ? firstCandidate.minimumQuantity : 0) || 0),
    lowStockThreshold: Number(item.suggestedLowStockThreshold || (firstCandidate ? firstCandidate.lowStockThreshold : 0) || 0),
    attentionStockThreshold: Number(item.suggestedAttentionStockThreshold || (firstCandidate ? firstCandidate.attentionStockThreshold : 0) || 0),
    normalStockThreshold: Number(item.suggestedNormalStockThreshold || (firstCandidate ? firstCandidate.normalStockThreshold : 0) || 0),
    salePrice: Number(item.suggestedSalePrice || acquisitionCost || 0),
    acquisitionCost: acquisitionCost,
    purchaseTotalCost: Number(item.totalCost || 0),
    marketReferencePrice: Number(item.suggestedMarketReferencePrice || acquisitionCost || 0),
    promotionalDiscountPercent: Number(item.suggestedPromotionalDiscountPercent || 0),
    isControlled: firstCandidate ? !!firstCandidate.isControlled : !!item.suggestedIsControlled,
    taxCostAmount: item.suggestedTaxCostAmount == null ? '' : item.suggestedTaxCostAmount,
    isSubjectToIcmsSt: item.suggestedIsSubjectToIcmsSt == null ? null : item.suggestedIsSubjectToIcmsSt,
    note: '',
    matchCandidates: item.matchCandidates || [],
  };
}

function StockMovementModal({ item, locations, lots, notify, onClose, onSave, onTransferLot, onAdjustLot, onQuickEntry, onQuickAdjust }) {
  const hasLots = (lots || []).length > 0;
  const [movementType, setMovementType] = useState('entry');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Manual stock entry');
  const [referenceCode, setReferenceCode] = useState('');
  const [note, setNote] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const locationOptions = locations;
  const [locationCode, setLocationCode] = useState(
    hasLots ? (lots[0] ? lots[0].locationCode : '') : (item.loc || (locations[0] ? locations[0].code : ''))
  );
  const [selectedLotId, setSelectedLotId] = useState('');

  useEffect(() => {
    if (!locationOptions.some((location) => location.code === locationCode)) {
      setLocationCode(locationOptions[0] ? locationOptions[0].code : '');
    }
  }, [movementType]);

  const lotsWithStock = hasLots
    ? lots.filter((lot) => lot.qty > 0).slice().sort((left, right) => (left.expiry || '9999-99-99').localeCompare(right.expiry || '9999-99-99'))
    : [];

  useEffect(() => {
    if (!lotsWithStock.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lotsWithStock[0] ? lotsWithStock[0].id : '');
    }
  }, [movementType, lots]);

  const selectedLot = lotsWithStock.find((lot) => lot.id === selectedLotId) || null;
  const availableQuantity = hasLots ? Number(selectedLot ? selectedLot.qty : 0) : Number(item.qty || 0);
  const exceedsAvailableQuantity = movementType === 'exit' && Number(quantity) > availableQuantity;

  const valid = quantity > 0 && reason.trim() && !!locationCode && (
    !hasLots ? true : (movementType === 'entry' ? batchCode.trim() !== '' : !!selectedLot)
  ) && !exceedsAvailableQuantity;

  const save = async () => {
    if (!valid || isSaving) return;
    setErrorMessage('');
    setIsSaving(true);
    const signedDelta = movementType === 'exit' ? -Math.abs(quantity) : Math.abs(quantity);
    try {
      if (!hasLots) {
        await onSave({ movementType, quantityDelta: signedDelta, reason, referenceCode, storageLocationCode: locationCode, note });
        return;
      }
      if (movementType === 'entry') {
        const location = locations.find((candidate) => candidate.code === locationCode);
        await onQuickEntry({
          locationId: location ? location.id : '',
          batchCode,
          expiryDate: expiryDate || null,
          quantity: Math.abs(quantity),
          referenceCode,
          note,
        });
        return;
      }
      await onQuickAdjust(selectedLot.id, { quantityDelta: signedDelta, reason, note }, selectedLot.storeId);
    } catch (error) {
      const message = error && error.message ? error.message : 'Não foi possível registrar a movimentação de estoque.';
      setErrorMessage(message);
      notify(message, 'warn');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={560} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="boxes" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Movimentar estoque</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>{item.name} · saldo total {item.qty} un</p>
      {errorMessage && (
        <div role="alert" className="fa-card" style={{ marginBottom: 18, padding: '12px 14px', background: '#FBEAE9', color: 'var(--fa-error)', fontWeight: 700 }}>
          {errorMessage}
        </div>
      )}

      <FormSection icon="boxes" title="Saldo por local">
        {hasLots ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lots.map((lot) => (
              <div key={lot.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="ph-pick-loc">{lot.locationCode}</span>
                <span className="ph-cell-sub" style={{ flex: 1, minWidth: 0 }}>{lot.locationName} · lote {lot.batch || '—'} · {lot.qty} un</span>
                <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => onTransferLot(lot)}><Icon name="route" size={13} />Transferir</button>
                <button className="fa-iconbtn" style={{ width: 30, height: 30 }} onClick={() => onAdjustLot(lot)} aria-label="Ajustar lote" title="Ajustar lote"><Icon name="edit" size={14} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="ph-cell-sub">Nenhum lote individual registrado ainda para este item.</div>
        )}
      </FormSection>

      <FormSection icon="repeat" title="Movimentação">
        <div className="ph-seg" style={{ width: '100%', marginBottom: 16 }}>
          <button style={{ flex: 1 }} data-on={movementType === 'entry' ? '1' : '0'} onClick={() => { setMovementType('entry'); setReason('Manual stock entry'); }}>Entrada</button>
          <button style={{ flex: 1 }} data-on={movementType === 'exit' ? '1' : '0'} onClick={() => { setMovementType('exit'); setReason('Manual stock exit'); }}>Saida</button>
          <button style={{ flex: 1 }} data-on={movementType === 'adjustment' ? '1' : '0'} onClick={() => { setMovementType('adjustment'); setReason('Inventory adjustment'); }}>Ajuste</button>
        </div>
        <div className="fa-form2">
          {(!hasLots || movementType === 'entry') && (
            <div className="fa-field">
              <label>Localizacao *</label>
              <select className="fa-select" value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
                {locationOptions.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}
              </select>
            </div>
          )}
          {hasLots && movementType !== 'entry' && (
            <div className="fa-field fa-span2">
              <label>Lote *</label>
              <select className="fa-select" value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} disabled={lotsWithStock.length === 0}>
                {lotsWithStock.length === 0 && <option value="">Nenhum lote com saldo</option>}
                {lotsWithStock.map((lot) => (
                  <option key={lot.id} value={lot.id}>{lot.locationCode} · {lot.batch || 'Sem lote'} · vence {lot.expiry || '—'} · {lot.qty} un</option>
                ))}
              </select>
            </div>
          )}
          <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></div>
          {hasLots && movementType === 'entry' && (
            <>
              <div className="fa-field"><label>Lote *</label><input className="fa-input" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="Ex.: LOT-2026-001" /></div>
              <div className="fa-field"><label>Validade</label><input className="fa-input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
            </>
          )}
          <div className={hasLots && movementType !== 'entry' ? 'fa-field' : 'fa-field fa-span2'}><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          {(!hasLots || movementType === 'entry') && (
            <div className="fa-field"><label>Referencia</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="NF, ajuste, inventario..." /></div>
          )}
          <div className={hasLots && movementType !== 'entry' ? 'fa-field fa-span2' : 'fa-field'}><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        {hasLots && movementType !== 'entry' && !selectedLot && (
          <div className="fa-card" style={{ marginTop: 12, padding: '12px 14px', background: '#FBEAE9', color: 'var(--fa-error)', fontWeight: 700 }}>
            Nenhum lote com saldo disponivel para registrar saida ou ajuste.
          </div>
        )}
        {exceedsAvailableQuantity && (
          <div role="alert" className="fa-card" style={{ marginTop: 12, padding: '12px 14px', background: '#FBEAE9', color: 'var(--fa-error)', fontWeight: 700 }}>
            A saída não pode ser maior que o saldo disponível de {availableQuantity} un.
          </div>
        )}
      </FormSection>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} disabled={isSaving} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || isSaving} onClick={save}><Icon name="check" size={16} />{isSaving ? 'Registrando...' : 'Registrar movimentacao'}</button>
      </div>
    </ModalShell>
  );
}

function TransferInventoryModal({ item, locations, lots, onClose, onSave, onTransferLot }) {
  const hasLots = (lots || []).length > 0;
  const lotsWithStock = hasLots
    ? lots.filter((lot) => lot.qty > 0).slice().sort((left, right) => (left.expiry || '9999-99-99').localeCompare(right.expiry || '9999-99-99'))
    : [];
  const [selectedLotId, setSelectedLotId] = useState(lotsWithStock[0] ? lotsWithStock[0].id : '');

  useEffect(() => {
    if (!lotsWithStock.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lotsWithStock[0] ? lotsWithStock[0].id : '');
    }
  }, [lots]);

  const sourceLot = lotsWithStock.find((lot) => lot.id === selectedLotId) || null;
  const fromLocationCode = hasLots ? (sourceLot ? sourceLot.locationCode : '') : (item.loc || '');
  const availableLocations = locations.filter((location) => location.code !== fromLocationCode);
  const [toLocationCode, setToLocationCode] = useState(availableLocations[0] ? availableLocations[0].code : '');
  const [quantity, setQuantity] = useState(hasLots && sourceLot ? sourceLot.qty : 1);
  const [reason, setReason] = useState('Internal transfer');
  const [referenceCode, setReferenceCode] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!availableLocations.some((location) => location.code === toLocationCode)) {
      setToLocationCode(availableLocations[0] ? availableLocations[0].code : '');
    }
  }, [fromLocationCode]);

  useEffect(() => {
    if (hasLots && sourceLot) {
      setQuantity(sourceLot.qty);
    }
  }, [selectedLotId]);

  const valid = hasLots
    ? !!sourceLot && !!toLocationCode && Number(quantity) > 0 && Number(quantity) <= sourceLot.qty
    : !!toLocationCode;

  const save = async () => {
    if (hasLots) {
      const toLocation = locations.find((location) => location.code === toLocationCode);
      await onTransferLot(sourceLot.id, { toLocationId: toLocation ? toLocation.id : '', quantity: Number(quantity), reason, referenceCode, note });
      return;
    }
    await onSave({ toLocationCode, reason, referenceCode, note });
  };

  return (
    <ModalShell open={true} onClose={onClose} maxw={500} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="route" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Transferir item</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>{item.name}</p>
      <div className="fa-form2">
        {hasLots ? (
          <div className="fa-field fa-span2">
            <label>Lote *</label>
            <select className="fa-select" value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} disabled={lotsWithStock.length === 0}>
              {lotsWithStock.length === 0 && <option value="">Nenhum lote com saldo</option>}
              {lotsWithStock.map((lot) => (
                <option key={lot.id} value={lot.id}>{lot.locationCode} · {lot.batch || 'Sem lote'} · vence {lot.expiry || '—'} · {lot.qty} un</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="fa-field"><label>Origem</label><input className="fa-input" value={fromLocationCode} disabled /></div>
        )}
        <div className="fa-field"><label>Destino *</label><select className="fa-select" value={toLocationCode} onChange={(e) => setToLocationCode(e.target.value)}>{availableLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
        {hasLots && <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" max={sourceLot ? sourceLot.qty : undefined} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></div>}
        <div className="fa-field fa-span2"><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {!hasLots && <div className="fa-field"><label>Referencia</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></div>}
        <div className={hasLots ? 'fa-field fa-span2' : 'fa-field'}><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={save}><Icon name="check" size={16} />Confirmar transferencia</button>
      </div>
    </ModalShell>
  );
}

function LocationModal({ onClose, onSave }) {
  const [f, setF] = useState({ code: '', name: '', zone: '', description: '', temperatureRange: '', locationType: 'estoque', controlledOnly: false });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.code.trim() && f.name.trim();
  return (
    <ModalShell open={true} onClose={onClose} maxw={520} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="box" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Novo local de armazenamento</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>Cadastre prateleiras, gondolas, caixas e demais areas operacionais.</p>
      <div className="fa-form2">
        <div className="fa-field"><label>Codigo *</label><input className="fa-input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="Ex.: A1-01" /></div>
        <div className="fa-field"><label>Nome *</label><input className="fa-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Gondola frontal" /></div>
        <div className="fa-field">
          <label>Tipo de local</label>
          <select className="fa-select" value={f.locationType} onChange={(e) => set('locationType', e.target.value)}>
            {LOCATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Zona</label><input className="fa-input" value={f.zone} onChange={(e) => set('zone', e.target.value)} /></div>
        <div className="fa-field"><label>Temperatura</label><input className="fa-input" value={f.temperatureRange} onChange={(e) => set('temperatureRange', e.target.value)} placeholder="Ambiente, refrigerado..." /></div>
        <div className="fa-field fa-span2"><label>Descricao</label><input className="fa-input" value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
      </div>
      <label className="fa-check" data-on={f.controlledOnly ? '1' : '0'} onClick={() => set('controlledOnly', !f.controlledOnly)} style={{ marginTop: 12 }}>
        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Reservado para itens controlados
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={() => onSave(f)}><Icon name="check" size={16} />Cadastrar local</button>
      </div>
    </ModalShell>
  );
}

function LotReceiptModal({ inventory, locations, suppliers, onClose, onSave }) {
  const sortedItems = inventory.slice().sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    inventoryItemId: sortedItems[0] ? sortedItems[0].id : '',
    locationId: locations[0] ? locations[0].id : '',
    supplierId: '',
    batchCode: '',
    expiryDate: '',
    quantity: 1,
    referenceCode: '',
    note: '',
  });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.inventoryItemId && f.locationId && f.batchCode.trim() && Number(f.quantity) > 0;
  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(f);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={640} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="boxes" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Receber mercadoria</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Registre a entrada de um lote em um local especifico. O saldo agregado do produto e atualizado automaticamente.
      </p>
      <div className="fa-form2">
        <div className="fa-field fa-span2">
          <label>Produto *</label>
          <select className="fa-select" value={f.inventoryItemId} onChange={(e) => set('inventoryItemId', e.target.value)}>
            {sortedItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.brand || 'Sem marca'}</option>)}
          </select>
        </div>
        <div className="fa-field">
          <label>Local de destino *</label>
          <select className="fa-select" value={f.locationId} onChange={(e) => set('locationId', e.target.value)}>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name} ({LOCATION_TYPE_LABEL[location.locationType] || location.locationType})</option>)}
          </select>
        </div>
        <div className="fa-field">
          <label>Fornecedor</label>
          <select className="fa-select" value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">Nao informado</option>
            {suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.legalName}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Lote *</label><input className="fa-input" value={f.batchCode} onChange={(e) => set('batchCode', e.target.value)} placeholder="Ex.: LOT-2026-001" /></div>
        <div className="fa-field"><label>Validade</label><input className="fa-input" type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></div>
        <div className="fa-field"><label>Quantidade *</label><input className="fa-input" type="number" min="1" value={f.quantity} onChange={(e) => set('quantity', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Referencia</label><input className="fa-input" value={f.referenceCode} onChange={(e) => set('referenceCode', e.target.value)} placeholder="NF, pedido de compra..." /></div>
        <div className="fa-field fa-span2"><label>Observacao</label><input className="fa-input" value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />Registrar recebimento</button>
      </div>
    </ModalShell>
  );
}

function LotTransferModal({ lot, locations, onClose, onSave }) {
  const availableLocations = locations.filter((location) => location.id !== lot.locationId);
  const [toLocationId, setToLocationId] = useState(availableLocations[0] ? availableLocations[0].id : '');
  const [quantity, setQuantity] = useState(lot.qty);
  const [reason, setReason] = useState('Transferência interna');
  const [referenceCode, setReferenceCode] = useState('');
  const [note, setNote] = useState('');
  const valid = toLocationId && Number(quantity) > 0 && Number(quantity) <= lot.qty;
  return (
    <ModalShell open={true} onClose={onClose} maxw={520} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="route" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Transferir lote</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Lote <span className="fa-mono">{lot.batch || '—'}</span> · {lot.qty} un disponiveis em <span className="fa-mono">{lot.locationCode}</span>
      </p>
      <div className="fa-form2">
        <div className="fa-field fa-span2">
          <label>Destino</label>
          <select className="fa-select" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
            {availableLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name} ({LOCATION_TYPE_LABEL[location.locationType] || location.locationType})</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" max={lot.qty} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Referencia</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={() => onSave({ toLocationId, quantity, reason, referenceCode, note })}><Icon name="check" size={16} />Confirmar transferencia</button>
      </div>
    </ModalShell>
  );
}

function LotAdjustmentModal({ lot, onClose, onSave }) {
  const [direction, setDirection] = useState('loss');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Quebra ou perda');
  const [note, setNote] = useState('');
  const valid = Number(quantity) > 0 && reason.trim() && (direction === 'gain' || Number(quantity) <= lot.qty);
  const save = () => {
    const signedDelta = direction === 'loss' ? -Math.abs(Number(quantity)) : Math.abs(Number(quantity));
    onSave({ quantityDelta: signedDelta, reason, note });
  };
  return (
    <ModalShell open={true} onClose={onClose} maxw={480} className="inv-modal">
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="edit" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Ajustar lote</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Lote <span className="fa-mono">{lot.batch || '—'}</span> · {lot.qty} un em <span className="fa-mono">{lot.locationCode}</span>
      </p>
      <div className="ph-seg" style={{ width: '100%', marginBottom: 16 }}>
        <button style={{ flex: 1 }} data-on={direction === 'loss' ? '1' : '0'} onClick={() => { setDirection('loss'); setReason('Quebra ou perda'); }}>Perda / quebra</button>
        <button style={{ flex: 1 }} data-on={direction === 'gain' ? '1' : '0'} onClick={() => { setDirection('gain'); setReason('Correcao de contagem'); }}>Correcao (a mais)</button>
      </div>
      <div className="fa-form2">
        <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></div>
        <div className="fa-field fa-span2"><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={save}><Icon name="check" size={16} />Registrar ajuste</button>
      </div>
    </ModalShell>
  );
}

function inventoryMovementLabel(type) {
  if (type === 'initial') return 'Carga inicial';
  if (type === 'entry') return 'Entrada';
  if (type === 'exit') return 'Saida';
  if (type === 'transfer') return 'Transferencia';
  return 'Ajuste';
}

function inventoryMovementDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('pt-BR') : 'Data indisponivel';
}

export { InventoryEmpty, InventoryItemModal, InventoryKpi, InventoryScreen, InvoiceImportModal, LOCATION_TYPE_LABEL, LOCATION_TYPE_OPTIONS, LOT_STATUS_OPTIONS, LocationModal, StockMovementModal, TransferInventoryModal, buildInventoryItemForm, buildInvoiceDraftLine, buildInvoiceReference, formatIsoDate, inventoryMovementDate, inventoryMovementLabel, isExpiringSoonIso, lotStatusBadge, resolveInvoiceAcquisitionCost };
