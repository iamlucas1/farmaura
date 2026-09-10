import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid,
  Badge, RowIconBtn, PillNav, KpiChip, showToast,
} from "../core/internal-ui.jsx";
import { LOCATION_TYPE_LABEL, LOCATION_TYPE_OPTIONS } from "./inventory-screen.jsx";

/* FARMAURA Console — CRUD de localizações físicas, separado por unidade (loja). */

function buildLocationForm(location) {
  return {
    code: location ? location.code : "",
    name: location ? location.name : "",
    zone: location ? location.zone : "",
    description: location ? location.description : "",
    temperatureRange: location ? location.temperatureRange : "",
    locationType: location ? location.locationType : "estoque",
    controlledOnly: location ? !!location.controlledOnly : false,
  };
}

const STATUS_KPIS = [
  { key: "all", label: "Todos", icon: "grid" },
  { key: "active", label: "Ativos", icon: "check", tone: "good" },
  { key: "inactive", label: "Inativos", icon: "pause" },
  { key: "controlled", label: "Só controlados", icon: "lock", tone: "warning" },
];

function LocationsScreen({ ctx }) {
  const { stores: allStores, fetchStoreLocations, createStoreLocation, updateStoreLocation, setStoreLocationActive } = ctx;
  const stores = Array.isArray(allStores) && allStores.length ? allStores : [{ id: "", name: "Loja" }];

  const [manualStoreId, setManualStoreId] = useState(null);
  const storeId = manualStoreId != null && stores.some((s) => s.id === manualStoreId) ? manualStoreId : stores[0].id;
  const activeStore = stores.find((s) => s.id === storeId) || stores[0];

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const load = async (targetStoreId, targetTypeFilter) => {
    const sid = targetStoreId != null ? targetStoreId : storeId;
    if (!sid) return;
    const tf = targetTypeFilter != null ? targetTypeFilter : typeFilter;
    setLoading(true);
    try {
      const result = await fetchStoreLocations(sid, { locationType: tf === "all" ? "" : tf });
      setLocations(result || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(storeId, typeFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId, typeFilter]);

  const kpiValues = {
    all: locations.length,
    active: locations.filter((l) => l.active).length,
    inactive: locations.filter((l) => !l.active).length,
    controlled: locations.filter((l) => l.controlledOnly).length,
  };

  const rows = locations.filter((l) => {
    if (statusFilter === "active" && !l.active) return false;
    if (statusFilter === "inactive" && l.active) return false;
    if (statusFilter === "controlled" && !l.controlledOnly) return false;
    return true;
  });

  const toggleActive = async (location) => {
    try {
      await setStoreLocationActive(location.id, !location.active);
      showToast({ message: location.active ? "Local desativado." : "Local reativado." });
      await load();
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar o local." });
    }
  };

  const columns = useMemo(() => [
    { key: "code", label: "Local", render: (l) => (
      <>
        <div className="cell-strong">{l.code} · {l.name}</div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{l.zone || "Sem zona"} · {l.controlledOnly ? "Somente controlados" : "Uso geral"}</div>
      </>
    ) },
    { key: "locationType", label: "Tipo", render: (l) => <Badge tone="neutral">{LOCATION_TYPE_LABEL[l.locationType] || l.locationType}</Badge> },
    { key: "temperatureRange", label: "Temperatura", render: (l) => l.temperatureRange || <span className="cell-muted">Ambiente</span> },
    { key: "allocatedItems", label: "Itens", mono: true, render: (l) => (l.allocatedItems ?? 0) },
    { key: "active", label: "Status", render: (l) => <Badge tone={l.active ? "good" : "neutral"} dot>{l.active ? "Ativo" : "Inativo"}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo & Estoque"
        title="Localizações"
        desc="Locais físicos de cada unidade — estoque, prateleiras, gôndolas e armários de controlados."
        actions={(
          <>
            {stores.length > 1 && (
              <select className="input" style={{ width: "auto", minWidth: 200 }} value={storeId} onChange={(e) => setManualStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button className="btn btn-secondary" onClick={() => load()} disabled={loading}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)} disabled={!storeId}><Icon name="plus" size={14} />Novo local</button>
          </>
        )}
      />

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        {STATUS_KPIS.map((k) => (
          <KpiChip key={k.key} icon={k.icon} label={k.label} value={kpiValues[k.key]} tone={k.tone} active={statusFilter === k.key} onClick={() => setStatusFilter(k.key)} />
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <PillNav
            options={[{ key: "all", label: `Todos (${locations.length})` }, ...LOCATION_TYPE_OPTIONS.map((o) => ({ key: o.value, label: o.label }))]}
            active={typeFilter}
            onChange={setTypeFilter}
          />
          <span className="card-head-sub">{rows.length} em {activeStore ? activeStore.name : "esta unidade"}</span>
        </div>
        {loading
          ? <div className="empty"><span className="empty-title">Carregando locais…</span></div>
          : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey="id"
              empty={`Nenhum local cadastrado para ${activeStore ? activeStore.name : "esta unidade"}`}
              renderActions={(l) => (
                <>
                  <RowIconBtn name="edit" onClick={() => setEditTarget(l)} label="Editar" />
                  <RowIconBtn name={l.active ? "trash" : "check"} tone={l.active ? "danger" : undefined} onClick={() => toggleActive(l)} label={l.active ? "Desativar" : "Reativar"} />
                </>
              )}
            />
          )}
      </div>

      {(createOpen || editTarget) && (
        <LocationFormModal
          key={editTarget ? editTarget.id : "new"}
          initial={editTarget}
          storeName={activeStore ? activeStore.name : "esta unidade"}
          onClose={() => { setCreateOpen(false); setEditTarget(null); }}
          onSave={async (form) => {
            try {
              if (editTarget) await updateStoreLocation(editTarget.id, form);
              else await createStoreLocation({ ...form, storeId });
              showToast({ message: editTarget ? "Local atualizado." : "Local cadastrado." });
              setCreateOpen(false); setEditTarget(null);
              await load();
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar o local." });
            }
          }}
        />
      )}
    </div>
  );
}

function LocationFormModal({ initial, storeName, onClose, onSave }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => buildLocationForm(initial));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => {
    setForm((p) => ({ ...p, [k]: k === "code" ? String(v).toUpperCase() : v }));
    setErrors((p) => p.filter((x) => x !== k));
  };

  const submit = async () => {
    const missing = [];
    if (!form.code.trim()) missing.push("code");
    if (!form.name.trim()) missing.push("name");
    if (missing.length) { setErrors(missing); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar local" : "Novo local de armazenamento"}
      subtitle={editing ? "Atualize os dados operacionais deste local." : `Cadastre um local físico para ${storeName}.`}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar local"}
          </button>
        </>
      )}
    >
      <FormGrid
        fields={[
          { key: "code", label: "Código", required: true, placeholder: "Ex.: A1-01" },
          { key: "name", label: "Nome", required: true, placeholder: "Ex.: Gôndola frontal" },
          { key: "locationType", label: "Tipo de local", type: "select", options: LOCATION_TYPE_OPTIONS.map((o) => [o.value, o.label]) },
          { key: "zone", label: "Zona" },
          { key: "temperatureRange", label: "Temperatura", placeholder: "Ambiente, refrigerado..." },
          { key: "description", label: "Descrição", full: true, type: "textarea" },
          { key: "controlledOnly", label: "Reservado para itens controlados", type: "switch", full: true },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { LocationsScreen };
