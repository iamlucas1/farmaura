import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, RecoverModal, confirmAction, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Cadastro de categorias de produto. */

function CategoriesScreen({ ctx }) {
  const { categories, refreshCategories, addCategory, updateCategory, setCategoryActive, setCategoryDiscarded, user } = ctx;
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);

  const [query, setQuery] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [recoverOpen, setRecoverOpen] = useState(false);

  useEffect(() => { if (refreshCategories) refreshCategories(); }, []);

  const available = (categories || []).filter((c) => !c.discarded);
  const discarded = (categories || []).filter((c) => c.discarded);

  const rows = available
    .filter((c) => {
      if (query && !(c.name + c.description).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  const toggleActive = async (item) => {
    setSavingId(item.id);
    try {
      await setCategoryActive(item.id, !item.active);
      showToast({ message: item.active ? "Categoria desativada." : "Categoria ativada." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar a categoria." });
    } finally { setSavingId(""); }
  };

  const discard = async (item) => {
    const ok = await confirmAction({
      title: "Descartar categoria?",
      body: "Deixa de aparecer na lista. Um administrador pode recuperá-la depois.",
      entity: item.name, danger: true, confirmLabel: "Descartar",
    });
    if (!ok) return;
    setSavingId(item.id);
    try {
      await setCategoryDiscarded(item.id, true);
      showToast({ message: "Categoria descartada." });
      setEditItem((p) => (p && p.id === item.id ? null : p));
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível descartar." });
    } finally { setSavingId(""); }
  };

  const columns = useMemo(() => [
    { key: "name", label: "Categoria", render: (c) => <span className="cell-strong">{c.name}</span> },
    { key: "description", label: "Descrição", render: (c) => c.description || <span className="cell-muted">—</span> },
    { key: "active", label: "Status", render: (c) => <Badge tone={c.active ? "good" : "neutral"} dot>{c.active ? "Ativa" : "Inativa"}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo"
        title="Categorias"
        desc="Categorias de produto exibidas no marketplace e usadas na organização do catálogo."
        actions={(
          <>
            {isAdmin && discarded.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setRecoverOpen(true)}>
                <Icon name="repeat" size={14} />Recuperar descartadas ({discarded.length})
              </button>
            )}
            <button className="btn btn-secondary" onClick={refreshCategories}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Nova categoria</button>
          </>
        )}
      />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome ou descrição..." />
          <span className="card-head-sub">{rows.length} de {available.length}</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty="Nenhuma categoria encontrada"
          renderActions={(c) => (
            <>
              <RowIconBtn name="edit" onClick={() => setEditItem(c)} label="Editar" />
              <span style={{ opacity: savingId === c.id ? 0.5 : 1, pointerEvents: savingId === c.id ? "none" : "auto", display: "inline-flex" }}>
                <SwitchToggle on={c.active} onChange={() => toggleActive(c)} label={c.active ? "Desativar categoria" : "Ativar categoria"} />
              </span>
              <RowIconBtn name="trash" tone="danger" disabled={savingId === c.id} onClick={() => discard(c)} label="Descartar" />
            </>
          )}
        />
      </div>

      {(editItem || newOpen) && (
        <CategoryModal
          key={editItem ? editItem.id : "new"}
          initial={editItem}
          activeBusy={editItem && savingId === editItem.id}
          onToggleActive={editItem ? () => toggleActive(editItem) : undefined}
          onDiscard={editItem ? () => discard(editItem) : undefined}
          onClose={() => { setEditItem(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editItem) await updateCategory(editItem.id, payload);
              else await addCategory(payload);
              showToast({ message: editItem ? "Categoria atualizada." : "Categoria cadastrada." });
              setEditItem(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar a categoria." });
            }
          }}
        />
      )}

      {recoverOpen && (
        <RecoverModal
          label="categorias"
          discarded={discarded}
          onClose={() => setRecoverOpen(false)}
          onRecover={async (ids) => {
            try {
              for (const id of ids) await setCategoryDiscarded(id, false);
              showToast({ message: `${ids.length} categoria(s) recuperada(s).` });
              setRecoverOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível recuperar." });
            }
          }}
        />
      )}
    </div>
  );
}

function CategoryModal({ initial, onClose, onSave, onToggleActive, onDiscard, activeBusy }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => ({
    name: (initial && initial.name) || "",
    description: (initial && initial.description) || "",
  }));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => p.filter((x) => x !== k)); };

  const submit = async () => {
    if (form.name.trim().length < 2) { setErrors(["name"]); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar categoria" : "Nova categoria"}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar categoria"}
          </button>
        </>
      )}
    >
      {editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <SwitchToggle on={initial.active} onChange={onToggleActive} label="Status da categoria" />
          <Badge tone={initial.active ? "good" : "neutral"} dot>{initial.active ? "Ativa" : "Inativa"}</Badge>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={13} />Descartar
          </button>
        </div>
      )}
      <FormGrid
        fields={[
          { key: "name", label: "Nome", required: true, full: true, placeholder: "Ex.: Perfumaria" },
          { key: "description", label: "Descrição", full: true },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { CategoriesScreen, CategoryModal };
