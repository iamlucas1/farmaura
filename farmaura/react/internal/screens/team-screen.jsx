import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

/* FARMAURA Console — Equipe.
   Cadastra farmacêuticos, caixas, gerentes, entregadores e admins do tenant,
   permite editar cargo/loja e ativar/desativar (nunca excluir, para preservar
   histórico de pedidos, estoque e entregas ligados a cada pessoa). */

const ROLE = window.FA_ACCESS.ROLE;
const ROLE_LABEL = window.FA_ACCESS.INTERNAL_ROLE_LABEL;
const ASSIGNABLE_ROLES = [ROLE.ADMIN, ROLE.MANAGER, ROLE.PHARMACIST, ROLE.CASHIER, ROLE.DRIVER];

function TeamScreen({ ctx }) {
  const { onLogout, user, stores = [], fetchTeamMembers, addTeamMember, updateTeamMember, setTeamMemberActive, notify } = ctx;
  const [members, setMembers] = useState(null);
  const [q, setQ] = useState('');
  const [savingId, setSavingId] = useState('');
  const [editMember, setEditMember] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    const items = fetchTeamMembers ? await fetchTeamMembers() : [];
    setMembers(items || []);
  };

  useEffect(() => { load(); }, []);

  const allMembers = members || [];
  const rows = allMembers.filter((member) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (member.name + member.email + (ROLE_LABEL[member.role] || member.role)).toLowerCase().includes(needle);
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const handleToggleActive = async (member) => {
    if (member.id === (user && user.id)) {
      notify && notify('Você não pode desativar sua própria conta.', 'warn');
      return;
    }
    setSavingId(member.id);
    try {
      const updated = await setTeamMemberActive(member.id, !member.active);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      notify && notify(member.active ? 'Membro desativado.' : 'Membro reativado.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o membro.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  return (
    <>
      <Topbar title="Equipe" sub={rows.length + ' membro(s) exibido(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, e-mail ou cargo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>
      <div className="ph-content ph-content-wide" data-screen-label="Equipe">
        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={load}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Novo membro</button>
            </div>
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Loja</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="fa-avatar fa-avatar-sm" style={{ flex: 'none' }}>{(member.name || '?')[0]}</span>
                      <div className="ph-td-name">{member.name}</div>
                    </div>
                  </td>
                  <td>{member.email}</td>
                  <td>{ROLE_LABEL[member.role] || member.role}</td>
                  <td>{member.storeName || 'Sem loja atribuída'}</td>
                  <td><span className="fa-badge" style={member.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{member.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditMember(member)}><Icon name="edit" size={14} />Editar</button>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === member.id}
                      onClick={() => handleToggleActive(member)}
                      aria-label={member.active ? 'Desativar membro' : 'Reativar membro'}
                      title={member.active ? 'Desativar membro' : 'Reativar membro'}
                    >
                      <Icon name={member.active ? 'trash' : 'repeat'} size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members === null && <div className="ph-cell-sub" style={{ padding: 16 }}>Carregando…</div>}
          {members !== null && !rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="user" size={28} /></span>
              <div>Nenhum membro de equipe encontrado.</div>
              {q && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => setQ('')}>
                  <Icon name="close" size={14} />Limpar busca
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editMember && (
        <TeamMemberModal
          title="Editar membro"
          submitLabel="Salvar alterações"
          initialMember={editMember}
          stores={stores}
          onClose={() => setEditMember(null)}
          onSave={async (payload) => {
            try {
              const updated = await updateTeamMember(editMember.id, payload);
              setMembers((prev) => prev.map((m) => (m.id === editMember.id ? updated : m)));
              setEditMember(null);
              notify && notify('Membro atualizado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o membro.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <TeamMemberModal
          title="Novo membro"
          submitLabel="Cadastrar membro"
          stores={stores}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              const created = await addTeamMember(payload);
              setMembers((prev) => [...(prev || []), created]);
              setNewOpen(false);
              notify && notify('Membro cadastrado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o membro.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function buildTeamMemberForm(member) {
  return {
    name: member && member.name || '',
    email: member && member.email || '',
    role: member && member.role || ROLE.PHARMACIST,
    storeId: member && member.storeId || '',
    password: '',
  };
}

const PASSWORD_HINT = 'Mínimo 8 caracteres, com letra minúscula, maiúscula, número e caractere especial.';
const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function TeamMemberModal({ title, submitLabel, initialMember, stores, onClose, onSave }) {
  const isEdit = !!initialMember;
  const [form, setForm] = useState(() => buildTeamMemberForm(initialMember));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2
    && /.+@.+\..+/.test(form.email.trim())
    && !!form.role
    && (isEdit || STRONG_PASSWORD_PATTERN.test(form.password));

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={560}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="user" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        {isEdit ? 'Atualize os dados de acesso e a loja deste membro da equipe.' : 'Cadastre um novo acesso interno. Informe a senha ao funcionário por fora — não existe envio automático de e-mail.'}
      </p>
      <div className="fa-form2">
        <div className="fa-field fa-span2"><label>Nome completo *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Helena Rocha" /></div>
        <div className="fa-field fa-span2"><label>E-mail *</label><input className="fa-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="nome@drogariafarmaura.com.br" /></div>
        <div className="fa-field">
          <label>Cargo *</label>
          <select className="fa-select" value={form.role} onChange={(e) => set('role', e.target.value)}>
            {ASSIGNABLE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role] || role}</option>)}
          </select>
        </div>
        <div className="fa-field">
          <label>Loja</label>
          <select className="fa-select" value={form.storeId} onChange={(e) => set('storeId', e.target.value)}>
            <option value="">Sem loja atribuída</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div className="fa-field fa-span2">
            <label>Senha inicial *</label>
            <input className="fa-input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Defina a senha de primeiro acesso" />
            <div className="ph-cell-sub" style={{ marginTop: 4 }}>{PASSWORD_HINT}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { TeamScreen };
