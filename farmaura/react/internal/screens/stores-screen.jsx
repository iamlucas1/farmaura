import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, KpiChip, confirmAction, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Cadastro de lojas (filiais) do tenant. */

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const KPIS = [
  { key: "all", label: "Todas", icon: "store" },
  { key: "active", label: "Ativas", icon: "check", tone: "good" },
  { key: "inactive", label: "Inativas", icon: "pause" },
];

function buildStoreForm(store) {
  return {
    code: (store && store.code) || "",
    name: (store && store.name) || "",
    addressLine: (store && store.addressLine) || "",
    district: (store && store.district) || "",
    city: (store && store.city) || "",
    stateCode: (store && store.stateCode) || "",
    postalCode: (store && store.postalCode) || "",
    phone: (store && store.phone) || "",
    cnpj: (store && store.cnpj) || "",
    isPrimary: store ? !!store.isPrimary : false,
  };
}

function StoresScreen({ ctx }) {
  const { storeDirectory, refreshStoreDirectory, addStoreEntry, updateStoreEntry, setStoreEntryActive } = ctx;

  const [query, setQuery] = useState("");
  const [kpi, setKpi] = useState("all");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");

  useEffect(() => { if (refreshStoreDirectory) refreshStoreDirectory(); }, []);

  const all = storeDirectory || [];
  const kpiValues = {
    all: all.length,
    active: all.filter((s) => s.active).length,
    inactive: all.filter((s) => !s.active).length,
  };

  const rows = all
    .filter((s) => {
      if (kpi === "active" && !s.active) return false;
      if (kpi === "inactive" && s.active) return false;
      if (query && !((s.name || "") + (s.code || "") + (s.city || "") + (s.cnpj || "")).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  const toggleActive = async (store) => {
    setSavingId(store.id);
    try {
      await setStoreEntryActive(store.id, !store.active);
      showToast({ message: store.active ? "Loja desativada." : "Loja reativada." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar a loja." });
    } finally { setSavingId(""); }
  };

  const remove = async (store) => {
    const ok = await confirmAction({
      title: "Desativar loja?",
      body: "A loja deixa de operar no sistema enquanto estiver inativa. O histórico é preservado.",
      entity: store.name, confirmLabel: "Desativar",
    });
    if (!ok) return;
    if (store.active) await toggleActive(store);
  };

  const columns = useMemo(() => [
    { key: "name", label: "Loja", render: (s) => (
      <>
        <div className="cell-strong">{s.name}</div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{s.addressLine || "Endereço não informado"}</div>
      </>
    ) },
    { key: "code", label: "Código", mono: true },
    { key: "location", label: "UF · Cidade", render: (s) => (s.stateCode || "—") + (s.city ? " · " + s.city : "") },
    { key: "cnpj", label: "CNPJ", mono: true, render: (s) => s.cnpj || <span className="cell-muted">—</span> },
    { key: "phone", label: "Telefone", render: (s) => s.phone || <span className="cell-muted">—</span> },
    { key: "isPrimary", label: "Principal", render: (s) => (s.isPrimary ? <Badge tone="good">Principal</Badge> : <span className="cell-muted">—</span>) },
    { key: "active", label: "Status", render: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "Ativa" : "Inativa"}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Parceiros & Lojas"
        title="Lojas"
        desc="Unidades da rede Farmaura — endereço, CNPJ e horário de funcionamento."
        actions={(
          <>
            <button className="btn btn-secondary" onClick={refreshStoreDirectory}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Nova loja</button>
          </>
        )}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        {KPIS.map((k) => (
          <KpiChip key={k.key} icon={k.icon} label={k.label} value={kpiValues[k.key]} tone={k.tone} active={kpi === k.key} onClick={() => setKpi(k.key)} />
        ))}
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome, código, cidade ou CNPJ..." />
          <span className="card-head-sub">{rows.length} de {all.length}</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty="Nenhuma loja encontrada"
          renderActions={(s) => (
            <>
              <RowIconBtn name="edit" onClick={() => setEditItem(s)} label="Editar" />
              <span style={{ opacity: savingId === s.id ? 0.5 : 1, pointerEvents: savingId === s.id ? "none" : "auto", display: "inline-flex" }}>
                <SwitchToggle on={s.active} onChange={() => toggleActive(s)} label={s.active ? "Desativar loja" : "Reativar loja"} />
              </span>
              <RowIconBtn name="trash" tone="danger" disabled={savingId === s.id || !s.active} onClick={() => remove(s)} label="Desativar" />
            </>
          )}
        />
      </div>

      {(editItem || newOpen) && (
        <StoreModal
          key={editItem ? editItem.id : "new"}
          initial={editItem}
          onClose={() => { setEditItem(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editItem) await updateStoreEntry(editItem.id, payload);
              else await addStoreEntry(payload);
              showToast({ message: editItem ? "Loja atualizada." : "Loja cadastrada." });
              setEditItem(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar a loja." });
            }
          }}
        />
      )}
    </div>
  );
}

function StoreModal({ initial, onClose, onSave }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => buildStoreForm(initial));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => p.filter((x) => x !== k)); };

  const submit = async () => {
    const missing = [];
    if (form.code.trim().length < 2) missing.push("code");
    if (form.name.trim().length < 2) missing.push("name");
    if (missing.length) { setErrors(missing); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar loja" : "Nova loja"}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar loja"}
          </button>
        </>
      )}
    >
      <FormGrid
        fields={[
          { key: "code", label: "Código", required: true, placeholder: "Ex.: LOJA-01" },
          { key: "name", label: "Nome", required: true, placeholder: "Ex.: Farmaura Centro" },
          { key: "addressLine", label: "Endereço", full: true },
          { key: "district", label: "Bairro" },
          { key: "city", label: "Cidade" },
          { key: "stateCode", label: "UF", type: "select", options: UF_OPTIONS },
          { key: "postalCode", label: "CEP" },
          { key: "phone", label: "Telefone" },
          { key: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
          { key: "isPrimary", label: "Loja principal", type: "switch" },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { StoresScreen };
