import React, { useEffect, useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar, stockState } from "../core/internal-shell.jsx";

/* FARMAURA Console — Estoque operacional conectado ao backend. */
function InventoryScreen({ ctx }) {
  const {
    inventory,
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
    notify,
    onLogout,
  } = ctx;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('items');
  const [locationCode, setLocationCode] = useState('all');
  const [medicationClass, setMedicationClass] = useState('all');
  const [movementItem, setMovementItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [transferItem, setTransferItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
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

  const matchItem = (item) => {
    const state = stockState(item).key;
    if (filter === 'normal' && state !== 'normal') return false;
    if (filter === 'attention' && state !== 'attention') return false;
    if (filter === 'low' && state !== 'low') return false;
    if (filter === 'out' && state !== 'out') return false;
    if (filter === 'controlled' && !item.controlled) return false;
    if (locationCode !== 'all' && item.loc !== locationCode) return false;
    if (medicationClass !== 'all' && (item.medClass || 'Geral') !== medicationClass) return false;
    if (q && !(item.name + item.brand + item.ean + item.sku + item.loc + item.cat + item.medClass).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };

  const rows = inventory.filter(matchItem).slice().sort((left, right) => {
    const categoryCompare = (left.cat || 'Medicamentos').localeCompare(right.cat || 'Medicamentos', 'pt-BR');
    if (categoryCompare !== 0) return categoryCompare;
    const classCompare = (left.medClass || 'Geral').localeCompare(right.medClass || 'Geral', 'pt-BR');
    if (classCompare !== 0) return classCompare;
    return (left.name || '').localeCompare(right.name || '', 'pt-BR');
  });
  const groupedRows = rows.reduce((groups, item) => {
    const key = item.cat || 'Medicamentos';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
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
    return (
      <tr key={item.id}>
        <td>
          <div className="ph-td-name" style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {item.name}
            {item.controlled && <span className="fa-badge fa-badge-rx" style={{ fontSize: 10 }}><Icon name="lock" size={10} />Tarja</span>}
          </div>
          <div className="ph-cell-sub">{item.brand} · {item.cat} · <span className="fa-mono">{item.ean || item.sku}</span></div>
        </td>
        <td>
          <div style={{ fontWeight: 700 }}>{item.medClass || 'Geral'}</div>
          <div className="ph-cell-sub">categoria {item.cat || 'Medicamentos'}</div>
        </td>
        <td><span className="ph-pick-loc">{item.loc}</span></td>
        <td>
          <div style={{ fontWeight: 600 }} className="fa-mono">{item.batch || '—'}</div>
          <div className="ph-cell-sub" style={isExpiringSoon(item.expiry) ? { color: 'var(--fa-warn)', fontWeight: 700 } : undefined}>{item.expiry || '—'}</div>
        </td>
        <td>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{item.qty} <span className="fa-faint" style={{ fontWeight: 600, fontSize: 12 }}>un</span></div>
          <div className="ph-stockbar"><i style={{ width: pct + '%', background: state.color }} /></div>
          <div className="ph-cell-sub">baixo ate {item.lowThreshold || 0} · atencao ate {item.attentionThreshold || 0} · normal ate {item.normalThreshold || 0}</div>
        </td>
        <td><span className="fa-badge" style={{ background: state.bg, color: state.color }}><Icon name={state.key === 'normal' ? 'check' : 'alert'} size={11} />{state.label}</span></td>
        <td className="fa-mono" style={{ fontWeight: 700 }}>{brl(item.price)}</td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditItem(item)}><Icon name="edit" size={14} />Editar</button>
          <button
            className="fa-iconbtn"
            style={{ marginLeft: 8, width: 34, height: 34 }}
            onClick={() => setMovementItem(item)}
            aria-label="Movimentar item"
            title="Movimentar item"
          >
            <Icon name="boxes" size={16} />
          </button>
          <button
            className="fa-iconbtn"
            style={{ marginLeft: 8, width: 34, height: 34 }}
            onClick={() => setTransferItem(item)}
            aria-label="Transferir item"
            title="Transferir item"
          >
            <Icon name="route" size={16} />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <>
      <Topbar
        title="Estoque"
        sub={summary.total_items + ' SKUs · ' + summary.attention_stock_items + ' em atencao · ' + summary.low_stock_items + ' baixos · ' + summary.out_of_stock_items + ' esgotados'}
        onLogout={onLogout}
      >
        <div className="ph-topsearch">
          <Icon name="scan" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, EAN, SKU, classe, categoria ou local" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <InventoryKpi icon="boxes" label="Itens ativos" value={summary.total_items} />
          <InventoryKpi icon="check" label="Estoque normal" value={summary.normal_stock_items} tone="success" />
          <InventoryKpi icon="alert" label="Em atencao" value={summary.attention_stock_items} tone="info" />
          <InventoryKpi icon="alert" label="Estoque baixo" value={summary.low_stock_items} tone="warn" />
          <InventoryKpi icon="minus" label="Esgotados" value={summary.out_of_stock_items} tone="error" />
        </div>

        {inventoryError && (
          <div className="fa-card" style={{ padding: '14px 16px', marginBottom: 16, background: 'var(--fa-warn-soft)', color: 'var(--fa-primary)', fontWeight: 700 }}>
            {inventoryError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="ph-seg">
            <button data-on={view === 'items' ? '1' : '0'} onClick={() => setView('items')}>Itens</button>
            <button data-on={view === 'movements' ? '1' : '0'} onClick={() => setView('movements')}>Movimentacoes</button>
            <button data-on={view === 'locations' ? '1' : '0'} onClick={() => setView('locations')}>Armazenamentos</button>
          </div>
          <div className="ph-seg">
            <button data-on={filter === 'all' ? '1' : '0'} onClick={() => setFilter('all')}>Todos <span className="ph-seg-n">{summary.total_items}</span></button>
            <button data-on={filter === 'normal' ? '1' : '0'} onClick={() => setFilter('normal')}>Normal <span className="ph-seg-n">{summary.normal_stock_items}</span></button>
            <button data-on={filter === 'attention' ? '1' : '0'} onClick={() => setFilter('attention')}>Atencao <span className="ph-seg-n">{summary.attention_stock_items}</span></button>
            <button data-on={filter === 'low' ? '1' : '0'} onClick={() => setFilter('low')}>Baixo <span className="ph-seg-n">{summary.low_stock_items}</span></button>
            <button data-on={filter === 'out' ? '1' : '0'} onClick={() => setFilter('out')}>Esgotado <span className="ph-seg-n">{summary.out_of_stock_items}</span></button>
            <button data-on={filter === 'controlled' ? '1' : '0'} onClick={() => setFilter('controlled')}>Controlados <span className="ph-seg-n">{summary.controlled_items}</span></button>
          </div>
          <select className="fa-select" style={{ minWidth: 220 }} value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
            <option value="all">Todos os locais</option>
            {inventoryLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}
          </select>
          <select className="fa-select" style={{ minWidth: 220 }} value={medicationClass} onChange={(e) => setMedicationClass(e.target.value)}>
            <option value="all">Todas as classes</option>
            {medicationClasses.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
          </select>
          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={expandAllCategories}><Icon name="plus" size={15} />Expandir categorias</button>
          <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={collapseAllCategories}><Icon name="minus" size={15} />Minimizar categorias</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshInventory} disabled={inventoryBusy}><Icon name="repeat" size={15} />Atualizar</button>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={handleExport} disabled={inventoryBusy}><Icon name="download" size={15} />Exportar CSV</button>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setInvoiceOpen(true)} disabled={!inventoryLocations.length}><Icon name="scan" size={15} />Ler nota com IA</button>
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setLocationOpen(true)}><Icon name="box" size={15} />Novo local</button>
            <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)} disabled={!inventoryLocations.length}><Icon name="plus" size={15} stroke={2.2} />Novo item</button>
          </div>
        </div>

        {view === 'items' && (
          <div className="ph-table-wrap">
            <table className="ph-table">
              <thead>
                <tr><th>Medicamento</th><th>Classe</th><th>Local</th><th>Lote · validade</th><th>Estoque</th><th>Status</th><th>Preco</th><th></th></tr>
              </thead>
              <tbody>
                {groupedEntries.flatMap(([category, items]) => {
                  const collapsed = !!collapsedCategories[category];
                  return [
                    <tr key={'category-' + category}>
                      <td colSpan="8" style={{ background: 'var(--fa-mist-2)', color: 'var(--fa-ink)', fontWeight: 800 }}>
                        <button onClick={() => toggleCategory(category)} style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'space-between' }}>
                          <span>{category} · {items.length} item(ns)</span>
                          <span
                            className="fa-iconbtn"
                            aria-label={collapsed ? "Expandir categoria" : "Minimizar categoria"}
                            title={collapsed ? "Expandir categoria" : "Minimizar categoria"}
                            style={{ width: 30, height: 30 }}
                          >
                            <Icon name={collapsed ? "plus" : "minus"} size={14} />
                          </span>
                        </button>
                      </td>
                    </tr>,
                    ...(collapsed ? [] : items.map(renderItemRow)),
                  ];
                })}
              </tbody>
            </table>
            {!rows.length && <InventoryEmpty icon="search" label="Nenhum item encontrado neste filtro." />}
          </div>
        )}

        {view === 'movements' && (
          <div className="fa-grid2" style={{ gap: 12 }}>
            {movementRows.map((movement) => (
              <div key={movement.id} className="fa-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span className="fa-iconbox" style={{ width: 42, height: 42 }}><Icon name={movement.type === 'transfer' ? 'route' : movement.delta >= 0 ? 'plus' : 'minus'} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{movement.itemName}</div>
                    <div className="ph-cell-sub">{inventoryMovementLabel(movement.type)} · {movement.reason}</div>
                  </div>
                  <span className="fa-badge" style={{ background: movement.delta >= 0 ? 'var(--fa-success-soft)' : 'var(--fa-warn-soft)', color: movement.delta >= 0 ? 'var(--fa-success)' : 'var(--fa-warn)' }}>
                    {movement.delta > 0 ? '+' : ''}{movement.delta}
                  </span>
                </div>
                <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                  <div>Antes: <span className="fa-mono">{movement.before}</span> · Depois: <span className="fa-mono">{movement.after}</span></div>
                  <div>Origem: <span className="fa-mono">{movement.from || '—'}</span> · Destino: <span className="fa-mono">{movement.to || '—'}</span></div>
                  <div>Referencia: <span className="fa-mono">{movement.reference || '—'}</span></div>
                  <div>{inventoryMovementDate(movement.createdAt)}</div>
                </div>
                {movement.note && <div style={{ marginTop: 10, fontSize: 13.5 }}>{movement.note}</div>}
              </div>
            ))}
            {!movementRows.length && <InventoryEmpty icon="activity" label="Nenhuma movimentacao encontrada." />}
          </div>
        )}

        {view === 'locations' && (
          <div className="fa-grid2" style={{ gap: 12 }}>
            {locationRows.map((location) => (
              <div key={location.id} className="fa-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span className="fa-iconbox" style={{ width: 42, height: 42 }}><Icon name={location.controlledOnly ? 'lock' : 'box'} size={18} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{location.code} · {location.name}</div>
                    <div className="ph-cell-sub">{location.zone || 'Sem zona'} · {location.controlledOnly ? 'Somente controlados' : 'Uso geral'}</div>
                  </div>
                  <span className="fa-badge fa-badge-mist">{location.allocatedItems} itens</span>
                </div>
                <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                  <div>Temperatura: {location.temperatureRange || 'Ambiente'}</div>
                  <div>Descricao: {location.description || 'Sem descricao operacional.'}</div>
                </div>
              </div>
            ))}
            {!locationRows.length && <InventoryEmpty icon="box" label="Nenhum local de armazenamento encontrado." />}
          </div>
        )}
      </div>

      {movementItem && (
        <StockMovementModal
          item={movementItem}
          locations={inventoryLocations}
          onClose={() => setMovementItem(null)}
          onSave={async (payload) => {
            try {
              await adjustStock(movementItem.id, payload);
              setMovementItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel registrar a movimentacao.', 'warn');
            }
          }}
        />
      )}
      {editItem && (
        <InventoryItemModal
          mode="edit"
          title="Editar medicamento"
          submitLabel="Salvar alteracoes"
          inventory={inventory}
          locations={inventoryLocations}
          categoryOptions={categoryOptions}
          initialItem={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (payload) => {
            try {
              await updateInventory(editItem.id, payload);
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
          onClose={() => setTransferItem(null)}
          onSave={async (payload) => {
            try {
              await transferInventory(transferItem.id, payload);
              setTransferItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : 'Nao foi possivel transferir o item.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <InventoryItemModal
          mode="create"
          title="Novo item de estoque"
          submitLabel="Cadastrar item"
          inventory={inventory}
          locations={inventoryLocations}
          categoryOptions={categoryOptions}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addInventory(payload);
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
    </>
  );
}

function InventoryKpi({ icon, label, value, tone }) {
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
    <div className="fa-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="fa-iconbox" style={{ width: 42, height: 42, background: palette.bg, color: palette.fg }}><Icon name={icon} size={18} /></span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22 }}>{value}</div>
          <div className="ph-cell-sub">{label}</div>
        </div>
      </div>
    </div>
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

function InventoryItemModal({ mode, title, submitLabel, inventory, locations, categoryOptions, initialItem, onClose, onSave }) {
  const sourceOptions = inventory.slice().sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));
  const medicationClassOptions = [...new Set(inventory.map((item) => item.medClass || 'Geral'))].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  const [sourceItemId, setSourceItemId] = useState(mode === 'create' && sourceOptions[0] ? sourceOptions[0].id : '');
  const [useNewCategory, setUseNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [useNewMedicationClass, setUseNewMedicationClass] = useState(false);
  const [newMedicationClassName, setNewMedicationClassName] = useState('');
  const [form, setForm] = useState(() => buildInventoryItemForm({ item: initialItem, locations, categoryOptions, medicationClassOptions }));

  useEffect(() => {
    if (mode === 'edit') {
      setForm(buildInventoryItemForm({ item: initialItem, locations, categoryOptions, medicationClassOptions }));
      return;
    }
    if (!sourceItemId) {
      return;
    }
    const sourceItem = sourceOptions.find((item) => item.id === sourceItemId);
    if (!sourceItem) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      sku: '',
      name: sourceItem.name || '',
      brand: sourceItem.brand || '',
      cat: sourceItem.cat || categoryOptions[0] || 'Medicamentos',
      medClass: sourceItem.medClass || 'Geral',
      ean: sourceItem.ean || '',
      loc: prev.loc || sourceItem.loc || (locations[0] ? locations[0].code : ''),
      batch: sourceItem.batch && sourceItem.batch !== '—' ? sourceItem.batch : '',
      expiry: sourceItem.expiry && sourceItem.expiry !== '—' ? sourceItem.expiry : '',
      qty: 0,
      min: Number(sourceItem.min || sourceItem.lowThreshold || 0),
      lowThreshold: Number(sourceItem.lowThreshold || sourceItem.min || 0),
      attentionThreshold: Number(sourceItem.attentionThreshold || sourceItem.lowThreshold || sourceItem.min || 0),
      normalThreshold: Number(sourceItem.normalThreshold || sourceItem.attentionThreshold || sourceItem.lowThreshold || sourceItem.min || 0),
      price: Number(sourceItem.price || 0),
      cost: Number(sourceItem.cost || 0),
      ref: Number(sourceItem.ref || 0),
      promo: Number(sourceItem.promo || 0),
      controlled: !!sourceItem.controlled,
      active: sourceItem.active == null ? true : !!sourceItem.active,
      note: sourceItem.note || '',
    }));
  }, [mode, sourceItemId, initialItem, locations]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const thresholdsValid = Number(form.lowThreshold || 0) <= Number(form.attentionThreshold || 0) && Number(form.attentionThreshold || 0) <= Number(form.normalThreshold || 0);
  const resolvedCategory = useNewCategory ? newCategoryName.trim() : form.cat;
  const resolvedMedicationClass = useNewMedicationClass ? newMedicationClassName.trim() : form.medClass;
  const valid = form.name.trim() && form.loc.trim() && resolvedMedicationClass.trim() && resolvedCategory.trim() && thresholdsValid;

  return (
    <ModalShell open={true} onClose={onClose} maxw={760}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name={mode === 'edit' ? 'edit' : 'box'} size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        {mode === 'edit' ? 'Ajuste os dados do medicamento para corrigir cadastro, categoria, classe, localizacao e faixas de estoque.' : 'Selecione um item ja existente como base ou preencha manualmente como um cadastro totalmente novo.'}
      </p>
      {mode === 'create' && (
        <>
          <div className="ph-seg" style={{ width: '100%', marginBottom: 16 }}>
            <button style={{ flex: 1 }} data-on={sourceItemId ? '1' : '0'} onClick={() => setSourceItemId(sourceOptions[0] ? sourceOptions[0].id : '')}>Usar item existente</button>
            <button style={{ flex: 1 }} data-on={!sourceItemId ? '1' : '0'} onClick={() => setSourceItemId('')}>Preencher manualmente</button>
          </div>
          {sourceItemId && (
            <div className="fa-field" style={{ marginBottom: 16 }}>
              <label>Item base</label>
              <select className="fa-select" value={sourceItemId} onChange={(e) => setSourceItemId(e.target.value)}>
                {sourceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.brand || 'Sem marca'} · {item.ean || item.sku}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <div className="fa-form2">
        <div className="fa-field"><label>SKU</label><input className="fa-input" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Gerado automaticamente se vazio" /></div>
        <div className="fa-field fa-span2"><label>Nome do produto *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Paracetamol 750mg — 20 comp." /></div>
        <div className="fa-field"><label>Marca</label><input className="fa-input" value={form.brand} onChange={(e) => set('brand', e.target.value)} /></div>
        <div className="fa-field">
          <label>Categoria *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fa-select" value={useNewCategory ? '__new__' : form.cat} onChange={(e) => {
              if (e.target.value === '__new__') {
                setUseNewCategory(true);
                return;
              }
              setUseNewCategory(false);
              set('cat', e.target.value);
            }}>
              {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              <option value="__new__">Adicionar nova categoria</option>
            </select>
            {!useNewCategory && <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setUseNewCategory(true)}><Icon name="plus" size={14} />Nova</button>}
          </div>
          {useNewCategory && <input className="fa-input" style={{ marginTop: 8 }} value={newCategoryName} onChange={(e) => { setNewCategoryName(e.target.value); set('cat', e.target.value); }} placeholder="Ex.: Vitaminas" />}
        </div>
        <div className="fa-field">
          <label>Classe terapeutica *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fa-select" value={useNewMedicationClass ? '__new__' : form.medClass} onChange={(e) => {
              if (e.target.value === '__new__') {
                setUseNewMedicationClass(true);
                return;
              }
              setUseNewMedicationClass(false);
              set('medClass', e.target.value);
            }}>
              {medicationClassOptions.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
              <option value="__new__">Adicionar nova classe terapeutica</option>
            </select>
            {!useNewMedicationClass && <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setUseNewMedicationClass(true)}><Icon name="plus" size={14} />Nova</button>}
          </div>
          {useNewMedicationClass && <input className="fa-input" style={{ marginTop: 8 }} value={newMedicationClassName} onChange={(e) => { setNewMedicationClassName(e.target.value); set('medClass', e.target.value); }} placeholder="Ex.: Antibiotico, Gripal" />}
        </div>
        <div className="fa-field"><label>Codigo EAN</label><input className="fa-input" value={form.ean} onChange={(e) => set('ean', e.target.value)} /></div>
        <div className="fa-field"><label>Localizacao *</label><select className="fa-select" value={form.loc} onChange={(e) => set('loc', e.target.value)}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
        <div className="fa-field"><label>Lote</label><input className="fa-input" value={form.batch} onChange={(e) => set('batch', e.target.value)} /></div>
        <div className="fa-field"><label>Validade</label><input className="fa-input" value={form.expiry} onChange={(e) => set('expiry', e.target.value)} placeholder="MM/AAAA" /></div>
        {mode === 'create' && <div className="fa-field"><label>Quantidade inicial</label><input className="fa-input" type="number" value={form.qty} onChange={(e) => set('qty', Number(e.target.value || 0))} /></div>}
        <div className="fa-field"><label>Estoque base</label><input className="fa-input" type="number" value={form.min} onChange={(e) => set('min', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Faixa baixa</label><input className="fa-input" type="number" value={form.lowThreshold} onChange={(e) => set('lowThreshold', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Faixa atencao</label><input className="fa-input" type="number" value={form.attentionThreshold} onChange={(e) => set('attentionThreshold', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Faixa normal</label><input className="fa-input" type="number" value={form.normalThreshold} onChange={(e) => set('normalThreshold', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Preco (R$)</label><input className="fa-input" type="number" step="0.01" value={form.price} onChange={(e) => set('price', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Custo (R$)</label><input className="fa-input" type="number" step="0.01" value={form.cost} onChange={(e) => set('cost', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Preco de referencia (R$)</label><input className="fa-input" type="number" step="0.01" value={form.ref} onChange={(e) => set('ref', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Promocao (%)</label><input className="fa-input" type="number" step="0.01" value={form.promo} onChange={(e) => set('promo', Number(e.target.value || 0))} /></div>
        <div className="fa-field fa-span2"><label>Observacao operacional</label><input className="fa-input" value={form.note} onChange={(e) => set('note', e.target.value)} /></div>
      </div>
      {!thresholdsValid && <div className="fa-card" style={{ marginTop: 12, padding: '12px 14px', background: '#FBEAE9', color: 'var(--fa-error)', fontWeight: 700 }}>A faixa baixa deve ser menor ou igual a faixa de atencao, que deve ser menor ou igual a faixa normal.</div>}
      <label className="fa-check" data-on={form.controlled ? '1' : '0'} onClick={() => set('controlled', !form.controlled)} style={{ marginTop: 12 }}>
        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Medicamento controlado
      </label>
      {mode === 'edit' && (
        <label className="fa-check" data-on={form.active ? '1' : '0'} onClick={() => set('active', !form.active)} style={{ marginTop: 12 }}>
          <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Medicamento ativo
        </label>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={() => onSave({ ...form, cat: resolvedCategory, medClass: resolvedMedicationClass })}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

function buildInventoryItemForm({ item, locations, categoryOptions, medicationClassOptions }) {
  return {
    sku: item && item.sku || '',
    name: item && item.name || '',
    brand: item && item.brand || '',
    cat: item && item.cat || categoryOptions[0] || 'Medicamentos',
    medClass: item && item.medClass || medicationClassOptions[0] || 'Geral',
    ean: item && item.ean || '',
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
    controlled: !!(item && item.controlled),
    active: item && item.active == null ? true : !!(item && item.active),
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
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={1080}>
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
              return (
                <div key={item.lineId} className="fa-card" style={{ padding: 16 }}>
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
                    <>
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
                        <div className="fa-field fa-span2"><label>Observacao da linha</label><input className="fa-input" value={item.note} onChange={(e) => setDraftItem(item.lineId, { note: e.target.value })} placeholder="Ex.: divergencia de lote, conferido manualmente" /></div>
                      </div>
                      <label className="fa-check" data-on={item.isControlled ? '1' : '0'} onClick={() => setDraftItem(item.lineId, { isControlled: !item.isControlled })} style={{ marginTop: 12 }}>
                        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Medicamento controlado
                      </label>
                    </>
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
    note: '',
    matchCandidates: item.matchCandidates || [],
  };
}

function StockMovementModal({ item, locations, onClose, onSave }) {
  const [movementType, setMovementType] = useState('entry');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Manual stock entry');
  const [referenceCode, setReferenceCode] = useState('');
  const [storageLocationCode, setStorageLocationCode] = useState(item.loc || (locations[0] ? locations[0].code : ''));
  const [note, setNote] = useState('');
  const valid = quantity > 0 && reason.trim();
  const save = async () => {
    const signedDelta = movementType === 'exit' ? -Math.abs(quantity) : Math.abs(quantity);
    await onSave({ movementType, quantityDelta: signedDelta, reason, referenceCode, storageLocationCode, note });
  };
  return (
    <ModalShell open={true} onClose={onClose} maxw={520}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="boxes" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Movimentar estoque</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>{item.name}</p>
      <div className="ph-seg" style={{ width: '100%', marginBottom: 16 }}>
        <button style={{ flex: 1 }} data-on={movementType === 'entry' ? '1' : '0'} onClick={() => { setMovementType('entry'); setReason('Manual stock entry'); }}>Entrada</button>
        <button style={{ flex: 1 }} data-on={movementType === 'exit' ? '1' : '0'} onClick={() => { setMovementType('exit'); setReason('Manual stock exit'); }}>Saida</button>
        <button style={{ flex: 1 }} data-on={movementType === 'adjustment' ? '1' : '0'} onClick={() => { setMovementType('adjustment'); setReason('Inventory adjustment'); }}>Ajuste</button>
      </div>
      <div className="fa-form2">
        <div className="fa-field"><label>Quantidade</label><input className="fa-input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Localizacao</label><select className="fa-select" value={storageLocationCode} onChange={(e) => setStorageLocationCode(e.target.value)}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
        <div className="fa-field fa-span2"><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="fa-field"><label>Referencia</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="NF, ajuste, inventario..." /></div>
        <div className="fa-field"><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid} onClick={save}><Icon name="check" size={16} />Registrar movimentacao</button>
      </div>
    </ModalShell>
  );
}

function TransferInventoryModal({ item, locations, onClose, onSave }) {
  const availableLocations = locations.filter((location) => location.code !== item.loc);
  const [toLocationCode, setToLocationCode] = useState(availableLocations[0] ? availableLocations[0].code : '');
  const [reason, setReason] = useState('Internal transfer');
  const [referenceCode, setReferenceCode] = useState('');
  const [note, setNote] = useState('');
  return (
    <ModalShell open={true} onClose={onClose} maxw={500}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="route" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Transferir item</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>{item.name} · atual em <span className="fa-mono">{item.loc}</span></p>
      <div className="fa-form2">
        <div className="fa-field fa-span2"><label>Destino</label><select className="fa-select" value={toLocationCode} onChange={(e) => setToLocationCode(e.target.value)}>{availableLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></div>
        <div className="fa-field fa-span2"><label>Motivo</label><input className="fa-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="fa-field"><label>Referencia</label><input className="fa-input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></div>
        <div className="fa-field"><label>Observacao</label><input className="fa-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!toLocationCode} onClick={() => onSave({ toLocationCode, reason, referenceCode, note })}><Icon name="check" size={16} />Confirmar transferencia</button>
      </div>
    </ModalShell>
  );
}

function LocationModal({ onClose, onSave }) {
  const [f, setF] = useState({ code: '', name: '', zone: '', description: '', temperatureRange: '', controlledOnly: false });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.code.trim() && f.name.trim();
  return (
    <ModalShell open={true} onClose={onClose} maxw={520}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="box" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>Novo local de armazenamento</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>Cadastre prateleiras, cofres, geladeiras e demais areas operacionais.</p>
      <div className="fa-form2">
        <div className="fa-field"><label>Codigo *</label><input className="fa-input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="Ex.: A1-01" /></div>
        <div className="fa-field"><label>Nome *</label><input className="fa-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Gondola frontal" /></div>
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

export { InventoryEmpty, InventoryItemModal, InventoryKpi, InventoryScreen, InvoiceImportModal, LocationModal, StockMovementModal, TransferInventoryModal, buildInventoryItemForm, buildInvoiceDraftLine, buildInvoiceReference, inventoryMovementDate, inventoryMovementLabel, resolveInvoiceAcquisitionCost };
