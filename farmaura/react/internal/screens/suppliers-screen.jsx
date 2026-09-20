import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, money, confirmAction, showToast,
} from "../core/internal-ui.jsx";

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/* FARMAURA Console — Cadastro de fornecedores. */

function buildSupplierForm(supplier) {
  return {
    legalName: (supplier && supplier.legalName) || "",
    tradeName: (supplier && supplier.tradeName) || "",
    cnpj: (supplier && supplier.cnpj) || "",
    email: (supplier && supplier.email) || "",
    phone: (supplier && supplier.phone) || "",
    website: (supplier && supplier.website) || "",
    category: (supplier && supplier.category) || "",
    contactPersonName: (supplier && supplier.contactPersonName) || "",
    uf: (supplier && supplier.uf) || "",
    city: (supplier && supplier.city) || "",
    addressLine: (supplier && supplier.addressLine) || "",
    leadTimeDays: Number((supplier && supplier.leadTimeDays) || 0),
    minimumOrderAmount: Number((supplier && supplier.minimumOrderAmount) || 0),
    freightPolicy: (supplier && supplier.freightPolicy) || "",
    paymentTerms: (supplier && supplier.paymentTerms) || "",
    notes: (supplier && supplier.notes) || "",
  };
}

function SuppliersScreen({ ctx }) {
  const { suppliers, refreshSuppliers, addSupplier, updateSupplier, setSupplierActive } = ctx;

  const [query, setQuery] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");

  useEffect(() => { if (refreshSuppliers) refreshSuppliers(); }, []);

  const all = suppliers || [];

  const rows = all
    .filter((s) => {
      if (query && !((s.legalName || "") + (s.tradeName || "") + (s.cnpj || "") + (s.category || "")).toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => (a.legalName || "").localeCompare(b.legalName || "", "pt-BR"));

  const toggleActive = async (supplier) => {
    setSavingId(supplier.id);
    try {
      await setSupplierActive(supplier.id, !supplier.active);
      showToast({ message: supplier.active ? "Fornecedor desativado." : "Fornecedor reativado." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar o fornecedor." });
    } finally { setSavingId(""); }
  };

  const remove = async (supplier) => {
    const ok = await confirmAction({
      title: "Desativar fornecedor?",
      body: "O fornecedor deixa de aparecer para novas compras. O histórico é preservado.",
      entity: supplier.legalName, confirmLabel: "Desativar",
    });
    if (!ok) return;
    if (supplier.active) await toggleActive(supplier);
  };

  const columns = useMemo(() => [
    { key: "legalName", label: "Fornecedor", render: (s) => (
      <>
        <div className="cell-strong">{s.legalName}</div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{s.tradeName || "Sem nome fantasia"}{s.website ? " · " + s.website : ""}</div>
      </>
    ) },
    { key: "cnpj", label: "CNPJ", mono: true },
    { key: "category", label: "Categoria", render: (s) => s.category || <span className="cell-muted">—</span> },
    { key: "location", label: "UF · Cidade", render: (s) => (s.uf || "—") + (s.city ? " · " + s.city : "") },
    { key: "leadTimeDays", label: "Prazo", render: (s) => `${s.leadTimeDays} dia(s)` },
    { key: "minimumOrderAmount", label: "Pedido mín.", mono: true, render: (s) => money(s.minimumOrderAmount) },
    { key: "freightPolicy", label: "Frete", render: (s) => s.freightPolicy || <span className="cell-muted">—</span> },
    { key: "paymentTerms", label: "Pagamento", render: (s) => s.paymentTerms || <span className="cell-muted">—</span> },
    { key: "active", label: "Status", render: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "Ativo" : "Inativo"}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Parceiros & Lojas"
        title="Fornecedores"
        desc="Dados cadastrais, prazos de entrega e condições de frete dos fornecedores."
        actions={(
          <>
            <button className="btn btn-secondary" onClick={refreshSuppliers}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Novo fornecedor</button>
          </>
        )}
      />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por razão social, fantasia, CNPJ..." />
          <span className="card-head-sub">{rows.length} de {all.length}</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty="Nenhum fornecedor encontrado"
          renderActions={(s) => (
            <>
              <RowIconBtn name="edit" onClick={() => setEditItem(s)} label="Editar" />
              <span style={{ opacity: savingId === s.id ? 0.5 : 1, pointerEvents: savingId === s.id ? "none" : "auto", display: "inline-flex" }}>
                <SwitchToggle on={s.active} onChange={() => toggleActive(s)} label={s.active ? "Desativar fornecedor" : "Reativar fornecedor"} />
              </span>
              <RowIconBtn name="trash" tone="danger" disabled={savingId === s.id || !s.active} onClick={() => remove(s)} label="Desativar" />
            </>
          )}
        />
      </div>

      {(editItem || newOpen) && (
        <SupplierModal
          key={editItem ? editItem.id : "new"}
          initialSupplier={editItem}
          onClose={() => { setEditItem(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editItem) await updateSupplier(editItem.id, payload);
              else await addSupplier(payload);
              showToast({ message: editItem ? "Fornecedor atualizado." : "Fornecedor cadastrado." });
              setEditItem(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar o fornecedor." });
            }
          }}
        />
      )}
    </div>
  );
}

/* Also used by quotes-screen for inline "add supplier" — keeps optional title/submitLabel. */
function SupplierModal({ initialSupplier, title, submitLabel, onClose, onSave }) {
  const editing = !!(initialSupplier && initialSupplier.id);
  const [form, setForm] = useState(() => buildSupplierForm(initialSupplier));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => {
    setForm((p) => ({ ...p, [k]: (k === "leadTimeDays" || k === "minimumOrderAmount") ? Math.max(0, Number(v) || 0) : v }));
    setErrors((p) => p.filter((x) => x !== k));
  };

  const submit = async () => {
    const missing = [];
    if (form.legalName.trim().length < 2) missing.push("legalName");
    if (form.cnpj.trim().length < 11) missing.push("cnpj");
    if (missing.length) { setErrors(missing); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title || (editing ? "Editar fornecedor" : "Novo fornecedor")}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{submitLabel || (editing ? "Salvar alterações" : "Cadastrar fornecedor")}
          </button>
        </>
      )}
    >
      <FormGrid
        fields={[
          { key: "legalName", label: "Razão social", required: true, full: true },
          { key: "tradeName", label: "Nome fantasia" },
          { key: "cnpj", label: "CNPJ", required: true, placeholder: "00.000.000/0000-00" },
          { key: "category", label: "Categoria", placeholder: "Ex.: Medicamentos, Dermocosméticos" },
          { key: "contactPersonName", label: "Contato" },
          { key: "email", label: "E-mail comercial", type: "email" },
          { key: "phone", label: "Telefone" },
          { key: "website", label: "Website" },
          { key: "uf", label: "UF", type: "select", options: UF_OPTIONS },
          { key: "city", label: "Cidade" },
          { key: "addressLine", label: "Endereço", full: true },
          { key: "leadTimeDays", label: "Prazo de entrega (dias)", type: "number" },
          { key: "minimumOrderAmount", label: "Pedido mínimo (R$)", type: "number" },
          { key: "freightPolicy", label: "Política de frete", placeholder: "CIF, FOB, grátis acima de..." },
          { key: "paymentTerms", label: "Condições de pagamento", placeholder: "Ex.: 30/60/90 dias" },
          { key: "notes", label: "Observações", type: "textarea", full: true },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { SuppliersScreen, SupplierModal };
