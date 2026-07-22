import React, { useEffect, useState } from "react";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";

/* FARMAURA Console — Equipe.
   Lista farmacêuticos, caixas e admins do tenant e permite atribuir a loja
   física em que cada um atua — o balcão (PDV) usa essa loja para saber de
   onde vender, e para saber quando um produto só existe em outra unidade. */

const ROLE_LABEL = { admin: 'Administrador', pharmacist: 'Farmacêutico', cashier: 'Caixa', driver: 'Entregador' };

function TeamScreen({ ctx }) {
  const { onLogout, stores = [], fetchTeamMembers, updateTeamMemberStore, notify } = ctx;
  const [members, setMembers] = useState(null);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const items = fetchTeamMembers ? await fetchTeamMembers() : [];
      if (alive) setMembers(items || []);
    })();
    return () => { alive = false; };
  }, []);

  const handleStoreChange = async (member, storeId) => {
    setSavingId(member.id);
    const updated = await updateTeamMemberStore(member.id, storeId || null);
    setSavingId('');
    if (!updated) { notify && notify('Não foi possível atualizar a loja.', 'error'); return; }
    setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    notify && notify('Loja atualizada para ' + member.name + '.', 'success');
  };

  return (
    <>
      <Topbar title="Equipe" sub="Atribua a loja física em que cada farmacêutico ou caixa atua" onLogout={onLogout} ctx={ctx} />
      <div className="ph-content" data-screen-label="Equipe">
        <AnCard icon="user" title="Farmacêuticos, caixas e admins" sub="A loja atribuída define o estoque padrão no balcão (PDV) de cada pessoa">
          {members === null && <div className="ph-cell-sub" style={{ padding: 16 }}>Carregando…</div>}
          {members !== null && members.length === 0 && <div className="ph-cell-sub" style={{ padding: 16 }}>Nenhum membro de equipe encontrado.</div>}
          {members !== null && members.map((member) => (
            <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--fa-mist)' }}>
              <span className="fa-avatar fa-avatar-sm" style={{ flex: 'none' }}>{(member.name || '?')[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
                <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email} · {ROLE_LABEL[member.role] || member.role}</div>
              </div>
              <select
                className="fa-select"
                value={member.storeId || ''}
                disabled={savingId === member.id}
                onChange={(e) => handleStoreChange(member, e.target.value)}
                style={{ width: 220, flex: 'none' }}
              >
                <option value="">Sem loja atribuída</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
          ))}
        </AnCard>
      </div>
    </>
  );
}

export { TeamScreen };
