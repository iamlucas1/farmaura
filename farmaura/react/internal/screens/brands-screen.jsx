import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, RecoverModal, confirmAction, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Cadastro de marcas, vinculadas aos fornecedores que as distribuem. */

function BrandsScreen({ ctx }) {
  const {
    brands, suppliers, refreshBrands, refreshSuppliers,
    addBrand, updateBrand, setBrandActive, setBrandDiscarded, user,
  } = ctx;
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);

  const [query, setQuery] = useState("");
  const [editBrand, setEditBrand] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [recoverOpen, setRecoverOpen] = useState(false);

  useEffect(() => {
    if (refreshBrands) refreshBrands();
    if (refreshSuppliers) refreshSuppliers();
  }, []);

  const available = (brands || []).filter((b) => !b.discarded);
  const discarded = (brands || []).filter((b) => b.discarded);

  const rows = available
    .filter((b) => {
      if (query && !(b.name + b.description).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  const toggleActive = async (brand) => {
    setSavingId(brand.id);
    try {
      await setBrandActive(brand.id, !brand.active);
      showToast({ message: brand.active ? "Marca desativada." : "Marca ativada." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar a marca." });
    } finally {
      setSavingId("");
    }
  };

  const discard = async (brand) => {
    const ok = await confirmAction({
      title: "Descartar marca?",
      body: "A marca deixa de aparecer na lista. Um administrador pode recuperá-la depois.",
      entity: brand.name, danger: true, confirmLabel: "Descartar",
    });
    if (!ok) return;
    setSavingId(brand.id);
    try {
      await setBrandDiscarded(brand.id, true);
      showToast({ message: "Marca descartada." });
      setEditBrand((prev) => (prev && prev.id === brand.id ? null : prev));
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível descartar a marca." });
    } finally {
      setSavingId("");
    }
  };

  const columns = useMemo(() => [
    {
      key: "name", label: "Marca",
      render: (b) => (
        <>
          <div className="cell-strong">{b.name}</div>
          <div className="cell-muted" style={{ fontSize: 12 }}>{b.description || "Sem descrição"}</div>
        </>
      ),
    },
    {
      key: "suppliers", label: "Fornecedores",
      render: (b) => (b.suppliers.length
        ? <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{b.suppliers.map((s) => <Badge key={s.id} tone="neutral">{s.tradeName || s.legalName}</Badge>)}</span>
        : <span className="cell-muted">Nenhum vinculado</span>),
    },
    {
      key: "active", label: "Status",
      render: (b) => <Badge tone={b.active ? "good" : "neutral"} dot>{b.active ? "Ativa" : "Inativa"}</Badge>,
    },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo"
        title="Marcas"
        desc="Marcas exibidas no marketplace e usadas nos produtos, vinculadas aos fornecedores que as distribuem."
        actions={(
          <>
            {isAdmin && discarded.length > 0 && (
              <button className="btn btn-secondary" onClick={() => setRecoverOpen(true)}>
                <Icon name="repeat" size={14} />Recuperar descartadas ({discarded.length})
              </button>
            )}
            <button className="btn btn-secondary" onClick={refreshBrands}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Nova marca</button>
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
          empty="Nenhuma marca encontrada"
          renderActions={(b) => (
            <>
              <RowIconBtn name="edit" onClick={() => setEditBrand(b)} label="Editar" />
              <span style={{ opacity: savingId === b.id ? 0.5 : 1, pointerEvents: savingId === b.id ? "none" : "auto", display: "inline-flex" }}>
                <SwitchToggle on={b.active} onChange={() => toggleActive(b)} label={b.active ? "Desativar marca" : "Ativar marca"} />
              </span>
              <RowIconBtn name="trash" tone="danger" disabled={savingId === b.id} onClick={() => discard(b)} label="Descartar" />
            </>
          )}
        />
      </div>

      {(editBrand || newOpen) && (
        <BrandModal
          key={editBrand ? editBrand.id : "new"}
          initialBrand={editBrand}
          suppliers={suppliers || []}
          activeBusy={editBrand && savingId === editBrand.id}
          onToggleActive={editBrand ? () => toggleActive(editBrand) : undefined}
          onDiscard={editBrand ? () => discard(editBrand) : undefined}
          onClose={() => { setEditBrand(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editBrand) await updateBrand(editBrand.id, payload);
              else await addBrand(payload);
              showToast({ message: editBrand ? "Marca atualizada." : "Marca cadastrada." });
              setEditBrand(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar a marca." });
            }
          }}
        />
      )}

      {recoverOpen && (
        <RecoverModal
          label="marcas"
          discarded={discarded}
          onClose={() => setRecoverOpen(false)}
          onRecover={async (ids) => {
            try {
              for (const id of ids) await setBrandDiscarded(id, false);
              showToast({ message: `${ids.length} marca(s) recuperada(s).` });
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

function BrandModal({ initialBrand, suppliers, onClose, onSave, onToggleActive, onDiscard, activeBusy }) {
  const editing = !!(initialBrand && initialBrand.id);
  const [form, setForm] = useState(() => ({
    name: (initialBrand && initialBrand.name) || "",
    description: (initialBrand && initialBrand.description) || "",
    supplierIds: initialBrand && initialBrand.supplierIds ? [...initialBrand.supplierIds] : [],
  }));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => p.filter((x) => x !== k)); };
  const activeSuppliers = suppliers.filter((s) => s.active);

  const submit = async () => {
    if (form.name.trim().length < 2) { setErrors(["name"]); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar marca" : "Nova marca"}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar marca"}
          </button>
        </>
      )}
    >
      {editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <SwitchToggle on={initialBrand.active} onChange={onToggleActive} label="Status da marca" />
          <Badge tone={initialBrand.active ? "good" : "neutral"} dot>{initialBrand.active ? "Ativa" : "Inativa"}</Badge>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={13} />Descartar
          </button>
        </div>
      )}
      <FormGrid
        fields={[
          { key: "name", label: "Nome", required: true, full: true, placeholder: "Ex.: EMS, Neo Química" },
          { key: "description", label: "Descrição", full: true },
          { key: "supplierIds", label: "Fornecedores que distribuem esta marca", type: "multiselect", full: true, options: activeSuppliers.map((s) => [s.id, s.tradeName || s.legalName]) },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { BrandsScreen, BrandModal };
