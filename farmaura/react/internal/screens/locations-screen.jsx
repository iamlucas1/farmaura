import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryEmpty, InventoryKpi, LOCATION_TYPE_LABEL, LOCATION_TYPE_OPTIONS } from "./inventory-screen.jsx";

/* FARMAURA Console — CRUD de localizações físicas, separado por unidade (loja). */

function buildLocationForm(location) {
  return {
    code: location ? location.code : '',
    name: location ? location.name : '',
    zone: location ? location.zone : '',
    description: location ? location.description : '',
    temperatureRange: location ? location.temperatureRange : '',
    locationType: location ? location.locationType : 'estoque',
    controlledOnly: location ? !!location.controlledOnly : false,
  };
}

function LocationFormModal({ title, subtitle, initial, onClose, onSave }) {
  const [f, setF] = useState(buildLocationForm(initial));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.code.trim() && f.name.trim();

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(f);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={520}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="pin" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>{subtitle}</p>
      <div className="fa-form2">
        <div className="fa-field"><label>Código *</label><input className="fa-input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="Ex.: A1-01" disabled={busy} /></div>
        <div className="fa-field"><label>Nome *</label><input className="fa-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Gôndola frontal" disabled={busy} /></div>
        <div className="fa-field">
          <label>Tipo de local</label>
          <select className="fa-select" value={f.locationType} onChange={(e) => set('locationType', e.target.value)} disabled={busy}>
            {LOCATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Zona</label><input className="fa-input" value={f.zone} onChange={(e) => set('zone', e.target.value)} disabled={busy} /></div>
        <div className="fa-field"><label>Temperatura</label><input className="fa-input" value={f.temperatureRange} onChange={(e) => set('temperatureRange', e.target.value)} placeholder="Ambiente, refrigerado..." disabled={busy} /></div>
        <div className="fa-field fa-span2"><label>Descrição</label><input className="fa-input" value={f.description} onChange={(e) => set('description', e.target.value)} disabled={busy} /></div>
      </div>
      <label className="fa-check" data-on={f.controlledOnly ? '1' : '0'} onClick={() => !busy && set('controlledOnly', !f.controlledOnly)} style={{ marginTop: 12 }}>
        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Reservado para itens controlados
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />Salvar</button>
      </div>
    </ModalShell>
  );
}

function LocationsScreen({ ctx }) {
  const {
    stores: allStores,
    fetchStoreLocations,
    createStoreLocation,
    updateStoreLocation,
    setStoreLocationActive,
    onLogout,
  } = ctx;
  const stores = Array.isArray(allStores) && allStores.length ? allStores : [{ id: '', name: 'Loja' }];
  const [manualStoreId, setManualStoreId] = useState(null);
  const storeId = manualStoreId != null && stores.some((entry) => entry.id === manualStoreId) ? manualStoreId : stores[0].id;
  const activeStore = stores.find((entry) => entry.id === storeId) || stores[0];

  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const load = async (targetStoreId, targetTypeFilter) => {
    const resolvedStoreId = targetStoreId != null ? targetStoreId : storeId;
    if (!resolvedStoreId) return;
    const resolvedTypeFilter = targetTypeFilter != null ? targetTypeFilter : typeFilter;
    setLoading(true);
    try {
      const result = await fetchStoreLocations(resolvedStoreId, { locationType: resolvedTypeFilter === 'all' ? '' : resolvedTypeFilter });
      setLocations(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(storeId, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, typeFilter]);

  const activeCount = locations.filter((location) => location.active).length;
  const inactiveCount = locations.length - activeCount;
  const controlledCount = locations.filter((location) => location.controlledOnly).length;
  const visibleLocations = locations.filter((location) => {
    if (statusFilter === 'active' && !location.active) return false;
    if (statusFilter === 'inactive' && location.active) return false;
    if (statusFilter === 'controlled' && !location.controlledOnly) return false;
    return true;
  });

  const handleCreate = async (form) => {
    await createStoreLocation({ ...form, storeId });
    setCreateOpen(false);
    await load();
  };

  const handleUpdate = async (form) => {
    await updateStoreLocation(editTarget.id, form);
    setEditTarget(null);
    await load();
  };

  const handleToggleActive = async (location) => {
    await setStoreLocationActive(location.id, !location.active);
    await load();
  };

  return (
    <>
      <Topbar title="Localizações" sub="Cadastre e organize os locais físicos de cada unidade — estoque, prateleiras, gôndolas e caixas" onLogout={onLogout} ctx={ctx}>
        {stores.length > 1 && (
          <select className="fa-input" style={{ width: 220 }} value={storeId} onChange={(e) => setManualStoreId(e.target.value)}>
            {stores.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        )}
        <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setCreateOpen(true)} disabled={!storeId}>
          <Icon name="plus" size={15} stroke={2.2} />Novo local
        </button>
      </Topbar>

      <div className="ph-content ph-content-wide" data-screen-label="Localizações por unidade">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todos" value={locations.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <InventoryKpi icon="check" label="Ativos" value={activeCount} tone="success" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
          <InventoryKpi icon="pause" label="Inativos" value={inactiveCount} active={statusFilter === 'inactive'} onClick={() => setStatusFilter('inactive')} />
          <InventoryKpi icon="lock" label="Só controlados" value={controlledCount} active={statusFilter === 'controlled'} onClick={() => setStatusFilter('controlled')} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="ph-seg">
            <button data-on={typeFilter === 'all' ? '1' : '0'} onClick={() => setTypeFilter('all')}>Todos <span className="ph-seg-n">{locations.length}</span></button>
            {LOCATION_TYPE_OPTIONS.map((option) => (
              <button key={option.value} data-on={typeFilter === option.value ? '1' : '0'} onClick={() => setTypeFilter(option.value)}>{option.label}</button>
            ))}
          </div>
          <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => load()} disabled={loading}><Icon name="repeat" size={15} />Atualizar</button>
        </div>

        <div className="fa-grid2" style={{ gap: 12 }}>
          {visibleLocations.map((location) => (
            <div key={location.id} className="fa-card" style={{ padding: 18, opacity: location.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="fa-iconbox" style={{ width: 42, height: 42 }}><Icon name={location.controlledOnly ? 'lock' : 'pin'} size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{location.code} · {location.name}</div>
                  <div className="ph-cell-sub">{location.zone || 'Sem zona'} · {location.controlledOnly ? 'Somente controlados' : 'Uso geral'}</div>
                </div>
                <span className="fa-badge fa-badge-mist">{LOCATION_TYPE_LABEL[location.locationType] || location.locationType}</span>
                {!location.active && <span className="fa-badge" style={{ background: 'var(--fa-warn-soft)', color: 'var(--fa-warn)' }}>Inativo</span>}
              </div>
              <div className="ph-cell-sub" style={{ lineHeight: 1.7 }}>
                <div>Temperatura: {location.temperatureRange || 'Ambiente'}</div>
                <div>Descrição: {location.description || 'Sem descrição operacional.'}</div>
                <div>{location.allocatedItems} item(ns) alocado(s) neste local</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }} onClick={() => setEditTarget(location)}><Icon name="edit" size={14} />Editar</button>
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }} onClick={() => handleToggleActive(location)}>
                  <Icon name={location.active ? 'trash' : 'check'} size={14} />{location.active ? 'Desativar' : 'Reativar'}
                </button>
              </div>
            </div>
          ))}
          {!locations.length && !loading && (
            <InventoryEmpty icon="pin" label={'Nenhum local cadastrado para ' + (activeStore ? activeStore.name : 'esta unidade') + ' ainda.'} />
          )}
          {!!locations.length && !visibleLocations.length && !loading && (
            <InventoryEmpty icon="pin" label="Nenhum local corresponde ao filtro selecionado." />
          )}
        </div>
      </div>

      {createOpen && (
        <LocationFormModal
          title="Novo local de armazenamento"
          subtitle={'Cadastre um local físico para ' + (activeStore ? activeStore.name : 'esta unidade') + '.'}
          initial={null}
          onClose={() => setCreateOpen(false)}
          onSave={handleCreate}
        />
      )}
      {editTarget && (
        <LocationFormModal
          title="Editar local"
          subtitle="Atualize os dados operacionais deste local."
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleUpdate}
        />
      )}
    </>
  );
}

export { LocationsScreen };
