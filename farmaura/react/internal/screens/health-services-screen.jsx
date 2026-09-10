import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, KpiChip, money, confirmAction, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Cadastro de serviços de saúde (procedimentos e valores) oferecidos pela farmácia. */

const KPIS = [
  { key: "all", label: "Todos", icon: "activity" },
  { key: "active", label: "Ativos", icon: "check", tone: "good" },
  { key: "inactive", label: "Inativos", icon: "pause" },
];

function HealthServicesScreen({ ctx }) {
  const { healthServicesAdmin, refreshHealthServicesAdmin, addHealthService, updateHealthService, setHealthServiceActive } = ctx;

  const [query, setQuery] = useState("");
  const [kpi, setKpi] = useState("all");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");

  useEffect(() => { if (refreshHealthServicesAdmin) refreshHealthServicesAdmin(); }, []);

  const services = healthServicesAdmin || [];
  const kpiValues = {
    all: services.length,
    active: services.filter((s) => s.active).length,
    inactive: services.filter((s) => !s.active).length,
  };

  const rows = services
    .filter((s) => {
      if (kpi === "active" && !s.active) return false;
      if (kpi === "inactive" && s.active) return false;
      if (query && !((s.name || "") + (s.group || "") + (s.description || "")).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  const toggleActive = async (item) => {
    setSavingId(item.id);
    try {
      await setHealthServiceActive(item.id, !item.active);
      showToast({ message: item.active ? "Serviço desativado." : "Serviço ativado." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar o serviço." });
    } finally { setSavingId(""); }
  };

  const remove = async (item) => {
    const ok = await confirmAction({
      title: "Desativar serviço?",
      body: "O serviço deixa de ser oferecido ao cliente enquanto estiver inativo.",
      entity: item.name, confirmLabel: "Desativar",
    });
    if (!ok) return;
    if (item.active) await toggleActive(item);
  };

  const columns = useMemo(() => [
    { key: "name", label: "Serviço", render: (s) => (
      <>
        <div className="cell-strong">{s.name}</div>
        {s.description && <div className="cell-muted" style={{ fontSize: 12 }}>{s.description}</div>}
      </>
    ) },
    { key: "group", label: "Grupo", render: (s) => s.group || <span className="cell-muted">—</span> },
    { key: "durationLabel", label: "Duração", render: (s) => s.durationLabel || <span className="cell-muted">—</span> },
    { key: "price", label: "Valor", mono: true, render: (s) => money(s.price) },
    { key: "active", label: "Status", render: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "Ativo" : "Inativo"}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo"
        title="Serviços de saúde"
        desc="Procedimentos, testes e consultas oferecidos nas lojas, com preço e agenda."
        actions={(
          <>
            <button className="btn btn-secondary" onClick={refreshHealthServicesAdmin}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Novo serviço</button>
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
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome ou grupo..." />
          <span className="card-head-sub">{rows.length} de {services.length}</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty="Nenhum serviço encontrado"
          renderActions={(s) => (
            <>
              <RowIconBtn name="edit" onClick={() => setEditItem(s)} label="Editar" />
              <span style={{ opacity: savingId === s.id ? 0.5 : 1, pointerEvents: savingId === s.id ? "none" : "auto", display: "inline-flex" }}>
                <SwitchToggle on={s.active} onChange={() => toggleActive(s)} label={s.active ? "Desativar serviço" : "Ativar serviço"} />
              </span>
              <RowIconBtn name="trash" tone="danger" disabled={savingId === s.id || !s.active} onClick={() => remove(s)} label="Desativar" />
            </>
          )}
        />
      </div>

      {(editItem || newOpen) && (
        <ServiceModal
          key={editItem ? editItem.id : "new"}
          initial={editItem}
          activeBusy={editItem && savingId === editItem.id}
          onToggleActive={editItem ? () => toggleActive(editItem) : undefined}
          onClose={() => { setEditItem(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editItem) await updateHealthService(editItem.id, { ...payload, active: editItem.active });
              else await addHealthService(payload);
              showToast({ message: editItem ? "Serviço atualizado." : "Serviço cadastrado." });
              setEditItem(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar o serviço." });
            }
          }}
        />
      )}
    </div>
  );
}

function ServiceModal({ initial, onClose, onSave, onToggleActive, activeBusy }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => ({
    name: (initial && initial.name) || "",
    group: (initial && initial.group) || "",
    icon: (initial && initial.icon) || "",
    durationLabel: (initial && initial.durationLabel) || "",
    durationMinutes: initial ? (initial.durationMinutes || 0) : 0,
    price: initial ? (initial.price || 0) : 0,
    description: (initial && initial.description) || "",
  }));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => {
    setForm((p) => ({ ...p, [k]: (k === "price" || k === "durationMinutes") ? Math.max(0, Number(v) || 0) : v }));
    setErrors((p) => p.filter((x) => x !== k));
  };

  const submit = async () => {
    const missing = [];
    if (form.name.trim().length < 2) missing.push("name");
    if (!(form.price >= 0)) missing.push("price");
    if (missing.length) { setErrors(missing); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar serviço" : "Novo serviço"}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar serviço"}
          </button>
        </>
      )}
    >
      {editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <SwitchToggle on={initial.active} onChange={onToggleActive} label="Status do serviço" />
          <Badge tone={initial.active ? "good" : "neutral"} dot>{initial.active ? "Ativo" : "Inativo"}</Badge>
          {activeBusy && <span className="cell-muted" style={{ fontSize: 12 }}>salvando…</span>}
        </div>
      )}
      <FormGrid
        fields={[
          { key: "name", label: "Nome do procedimento", required: true, full: true, placeholder: "Ex.: Aplicação de vacina influenza" },
          { key: "group", label: "Grupo", placeholder: "Ex.: Imunização" },
          { key: "icon", label: "Ícone", type: "icon" },
          { key: "durationLabel", label: "Duração (rótulo)", placeholder: "Ex.: 20 min" },
          { key: "durationMinutes", label: "Duração (minutos)", type: "number" },
          { key: "price", label: "Valor (R$)", required: true, type: "number", full: true },
          { key: "description", label: "Descrição", type: "textarea", full: true, placeholder: "O que o cliente deve esperar do procedimento" },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { HealthServicesScreen };
