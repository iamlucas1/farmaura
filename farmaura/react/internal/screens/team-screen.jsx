import React, { useEffect, useMemo, useState } from "react";
import {
  Icon, PageHead, DataTable, Modal, FormGrid, SwitchToggle,
  Badge, RowIconBtn, SearchInput, confirmAction, showToast,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Equipe.
   Cadastra farmacêuticos, caixas, gerentes, entregadores e admins do tenant;
   permite editar cargo/loja e ativar/desativar (nunca excluir, para preservar
   histórico de pedidos, estoque e entregas ligados a cada pessoa). */

const ROLE = window.FA_ACCESS.ROLE;
const ROLE_LABEL = window.FA_ACCESS.INTERNAL_ROLE_LABEL;
const ASSIGNABLE_ROLES = [ROLE.ADMIN, ROLE.MANAGER, ROLE.PHARMACIST, ROLE.CASHIER, ROLE.DRIVER];
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function buildTeamMemberForm(member) {
  return {
    name: (member && member.name) || "",
    email: (member && member.email) || "",
    role: (member && member.role) || ROLE.PHARMACIST,
    storeId: (member && member.storeId) || "",
    password: "",
  };
}

function TeamScreen({ ctx }) {
  const { user, stores = [], fetchTeamMembers, addTeamMember, updateTeamMember, setTeamMemberActive } = ctx;
  const [members, setMembers] = useState(null);
  const [query, setQuery] = useState("");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState("");

  const load = async () => {
    const items = fetchTeamMembers ? await fetchTeamMembers() : [];
    setMembers(items || []);
  };
  useEffect(() => { load(); }, []);

  const all = members || [];
  const storeNameById = useMemo(() => Object.fromEntries((stores || []).map((s) => [s.id, s.name])), [stores]);

  const rows = all
    .filter((m) => {
      if (!query) return true;
      const needle = query.toLowerCase();
      return ((m.name || "") + (m.email || "") + (ROLE_LABEL[m.role] || m.role || "")).toLowerCase().includes(needle);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  const toggleActive = async (member) => {
    if (member.id === (user && user.id)) {
      showToast({ message: "Você não pode desativar sua própria conta." });
      return;
    }
    setSavingId(member.id);
    try {
      const updated = await setTeamMemberActive(member.id, !member.active);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      showToast({ message: member.active ? "Membro desativado." : "Membro reativado." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível atualizar o membro." });
    } finally { setSavingId(""); }
  };

  const remove = async (member) => {
    if (member.id === (user && user.id)) { showToast({ message: "Você não pode desativar sua própria conta." }); return; }
    const ok = await confirmAction({
      title: "Desativar membro?",
      body: "A pessoa perde o acesso ao portal, mas o histórico ligado a ela é preservado.",
      entity: member.name, confirmLabel: "Desativar",
    });
    if (!ok) return;
    if (member.active) await toggleActive(member);
  };

  const columns = useMemo(() => [
    { key: "name", label: "Nome", render: (m) => <span className="cell-strong">{m.name}</span> },
    { key: "email", label: "E-mail", render: (m) => <span className="mono" style={{ fontSize: 12 }}>{m.email}</span> },
    { key: "role", label: "Cargo", render: (m) => <Badge tone="neutral">{ROLE_LABEL[m.role] || m.role}</Badge> },
    { key: "storeId", label: "Loja", render: (m) => storeNameById[m.storeId] || <span className="cell-muted">—</span> },
    { key: "active", label: "Status", render: (m) => <Badge tone={m.active ? "good" : "neutral"} dot>{m.active ? "Ativo" : "Inativo"}</Badge> },
  ], [storeNameById]);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Parceiros & Lojas"
        title="Equipe"
        desc="Cadastro de admins, gerentes, farmacêuticos, caixas e entregadores, com cargo e loja."
        actions={(
          <>
            <button className="btn btn-secondary" onClick={load}><Icon name="refresh" size={14} />Atualizar</button>
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Icon name="plus" size={14} />Novo colaborador</button>
          </>
        )}
      />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome, e-mail ou cargo..." />
          <span className="card-head-sub">{rows.length} de {all.length}</span>
        </div>
        {members === null
          ? <div className="empty"><span className="empty-title">Carregando equipe…</span></div>
          : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey="id"
              empty="Nenhum membro encontrado"
              renderActions={(m) => (
                <>
                  <RowIconBtn name="edit" onClick={() => setEditItem(m)} label="Editar" />
                  <span style={{ opacity: savingId === m.id ? 0.5 : 1, pointerEvents: (savingId === m.id || m.id === (user && user.id)) ? "none" : "auto", display: "inline-flex" }}>
                    <SwitchToggle on={m.active} onChange={() => toggleActive(m)} label={m.active ? "Desativar membro" : "Reativar membro"} />
                  </span>
                  <RowIconBtn name="trash" tone="danger" disabled={savingId === m.id || !m.active || m.id === (user && user.id)} onClick={() => remove(m)} label="Desativar" />
                </>
              )}
            />
          )}
      </div>

      {(editItem || newOpen) && (
        <TeamMemberModal
          key={editItem ? editItem.id : "new"}
          initial={editItem}
          stores={stores}
          onClose={() => { setEditItem(null); setNewOpen(false); }}
          onSave={async (payload) => {
            try {
              if (editItem) {
                const updated = await updateTeamMember(editItem.id, payload);
                setMembers((prev) => prev.map((m) => (m.id === editItem.id ? updated : m)));
              } else {
                const created = await addTeamMember(payload);
                setMembers((prev) => [...(prev || []), created]);
              }
              showToast({ message: editItem ? "Colaborador atualizado." : "Colaborador cadastrado." });
              setEditItem(null); setNewOpen(false);
            } catch (err) {
              showToast({ message: (err && err.message) || "Não foi possível salvar o colaborador." });
            }
          }}
        />
      )}
    </div>
  );
}

function TeamMemberModal({ initial, stores, onClose, onSave }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState(() => buildTeamMemberForm(initial));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const change = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => p.filter((x) => x !== k)); };

  const submit = async () => {
    const missing = [];
    if (form.name.trim().length < 2) missing.push("name");
    if (!/.+@.+\..+/.test(form.email.trim())) missing.push("email");
    if (!form.role) missing.push("role");
    if (!editing && !STRONG_PASSWORD_PATTERN.test(form.password)) missing.push("password");
    if (missing.length) { setErrors(missing); return; }
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={editing ? "Editar colaborador" : "Novo colaborador"}
      wide
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            <Icon name="check" size={14} />{editing ? "Salvar alterações" : "Cadastrar colaborador"}
          </button>
        </>
      )}
    >
      <FormGrid
        fields={[
          { key: "name", label: "Nome completo", required: true, full: true, placeholder: "Ex.: Helena Rocha" },
          { key: "email", label: "E-mail", required: true, full: true, type: "email", placeholder: "nome@drogariafarmaura.com.br" },
          { key: "role", label: "Cargo", required: true, type: "select", options: ASSIGNABLE_ROLES.map((r) => [r, ROLE_LABEL[r] || r]) },
          { key: "storeId", label: "Loja", type: "select", options: [["", "Sem loja atribuída"], ...(stores || []).map((s) => [s.id, s.name])] },
          ...(editing ? [] : [{ key: "password", label: "Senha inicial", required: true, full: true, type: "password", placeholder: "Mín. 8 caracteres com maiúscula, número e símbolo", hint: "O colaborador troca no primeiro acesso." }]),
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
    </Modal>
  );
}

export { TeamScreen };
