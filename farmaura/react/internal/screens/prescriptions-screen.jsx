import React, { useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

/* FARMAURA Console — Validação de receita digital (master-detail). */

function RxScreen({ ctx }) {
  const { prescriptions, validateRx, openChatForName, onLogout } = ctx;
  const pendingFirst = [...prescriptions].sort((left, right) => (left.status === 'pending' ? -1 : 1) - (right.status === 'pending' ? -1 : 1));
  const [selectedId, setSelectedId] = useState(pendingFirst[0] ? pendingFirst[0].id : null);
  const prescription = prescriptions.find((entry) => entry.id === selectedId) || pendingFirst[0];
  const checkDefs = [
    { key: 'legible', label: 'Receita legível e sem rasuras' },
    { key: 'validDate', label: 'Dentro do prazo de validade' },
    { key: 'doseOk', label: 'Posologia compatível com o pedido' },
    { key: 'crmOk', label: 'CRM e assinatura do prescritor' },
  ];

  return (
    <>
      <Topbar title="Receitas digitais" sub={prescriptions.filter((entry) => entry.status === 'pending').length + ' aguardando validação farmacêutica'} onLogout={onLogout} />
      <div className="ph-content ph-content-wide">
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' }} className="ph-rx-grid">
          <div className="fa-card" style={{ padding: 8, alignSelf: 'stretch' }}>
            {pendingFirst.map((entry) => {
              const statusMap = { pending: ['fa-badge-warn', 'Pendente'], approved: ['fa-badge-health', 'Validada'], rejected: ['fa-badge-mist', 'Recusada'] };
              const [className, label] = statusMap[entry.status];
              return (
                <button key={entry.id} onClick={() => setSelectedId(entry.id)} style={{ width: '100%', textAlign: 'left', border: 'none', background: prescription && prescription.id === entry.id ? 'var(--fa-rose-soft)' : 'transparent', borderRadius: 12, padding: 12, display: 'flex', gap: 11, cursor: 'pointer', marginBottom: 2 }}>
                  <span className="fa-iconbox" style={{ width: 40, height: 40, flex: 'none', background: entry.status === 'pending' ? 'var(--fa-warn-soft)' : 'var(--fa-success-soft)', color: entry.status === 'pending' ? 'var(--fa-warn)' : 'var(--fa-success)' }}><Icon name="rx" size={19} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.patient}</div>
                    <div className="ph-cell-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.meds[0].name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                      <span className={'fa-badge ' + className} style={{ fontSize: 10 }}>{label}</span>
                      <span className="ph-cell-sub">{entry.sentAt}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {prescription && (
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18, alignItems: 'start' }} className="ph-rx-detail">
              <div>
                <div className="ph-rx-doc"><span className="doc-label">imagem da receita</span></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }}><Icon name="expand" size={15} />Ampliar</button>
                  <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ flex: 1 }}><Icon name="download" size={15} />Baixar</button>
                </div>
              </div>
              <div className="fa-card" style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="fa-mono" style={{ fontWeight: 800, fontSize: 16 }}>{prescription.id}</span>
                      <span className="fa-badge fa-badge-outline">Pedido {prescription.order}</span>
                    </div>
                    <h2 style={{ fontWeight: 800, fontSize: 20, margin: '8px 0 2px' }}>{prescription.patient} <span className="fa-faint" style={{ fontWeight: 600, fontSize: 14 }}>· {prescription.age} anos</span></h2>
                  </div>
                  {prescription.status !== 'pending' && <span className={'fa-badge ' + (prescription.status === 'approved' ? 'fa-badge-health' : 'fa-badge-mist')}><Icon name={prescription.status === 'approved' ? 'check' : 'close'} size={12} />{prescription.status === 'approved' ? 'Validada' : 'Recusada'}</span>}
                </div>
                <dl className="ph-kv" style={{ marginTop: 16 }}>
                  <dt>Prescritor</dt><dd>{prescription.doctor}</dd>
                  <dt>Registro</dt><dd>{prescription.crm}</dd>
                  <dt>Tipo</dt><dd>{prescription.type}</dd>
                  <dt>Emitida em</dt><dd>{prescription.issued}</dd>
                  <dt>Validade</dt><dd style={{ color: prescription.validDays < 0 ? 'var(--fa-error)' : 'var(--fa-success)', fontWeight: 700 }}>{prescription.validDays < 0 ? `Vencida há ${Math.abs(prescription.validDays)} dias` : `${prescription.validDays} dias restantes`}</dd>
                </dl>
                <div style={{ fontWeight: 800, fontSize: 14, margin: '20px 0 8px' }}>Medicamentos prescritos</div>
                {prescription.meds.map((medication, index) => (
                  <div key={index} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--fa-mist-2)', borderRadius: 12, marginBottom: 8 }}>
                    <span className="fa-iconbox" style={{ width: 38, height: 38, flex: 'none' }}><Icon name="pill" size={18} /></span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{medication.name}</div>
                      <div className="ph-cell-sub">{medication.dose} · {medication.qty}</div>
                    </div>
                    <span className={'fa-badge ' + (medication.match ? 'fa-badge-health' : 'fa-badge-warn')} style={{ alignSelf: 'flex-start' }}><Icon name={medication.match ? 'check' : 'alert'} size={11} />{medication.match ? 'confere' : 'verificar'}</span>
                  </div>
                ))}
                <div style={{ fontWeight: 800, fontSize: 14, margin: '20px 0 4px' }}>Conferência farmacêutica</div>
                <div>
                  {checkDefs.map((check) => {
                    const ok = prescription.checks[check.key];
                    return (
                      <div className="ph-check-row" key={check.key}>
                        <span className={'ph-check-ic ' + (ok ? 'ph-check-ok' : 'ph-check-no')}><Icon name={ok ? 'check' : 'close'} size={16} stroke={2.4} /></span>
                        <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{check.label}</span>
                        <span className="ph-cell-sub" style={{ color: ok ? 'var(--fa-success)' : 'var(--fa-error)', fontWeight: 700 }}>{ok ? 'OK' : 'Atenção'}</span>
                      </div>
                    );
                  })}
                </div>
                {prescription.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button className="fa-btn fa-btn-ghost" onClick={() => openChatForName(prescription.patient)}><Icon name="chat" size={16} />Falar c/ paciente</button>
                    <button className="fa-btn fa-btn-soft" style={{ color: 'var(--fa-error)' }} onClick={() => validateRx(prescription.id, 'rejected')}><Icon name="close" size={16} />Recusar</button>
                    <button className="fa-btn fa-btn-primary" style={{ flex: 1 }} onClick={() => validateRx(prescription.id, 'approved')}><Icon name="shield" size={16} />Validar e liberar</button>
                  </div>
                ) : (
                  <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: prescription.status === 'approved' ? 'var(--fa-success-soft)' : 'var(--fa-mist-2)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 13.5, color: prescription.status === 'approved' ? 'var(--fa-success)' : 'var(--fa-ink-2)' }}>
                    <Icon name={prescription.status === 'approved' ? 'check' : 'close'} size={18} />{prescription.status === 'approved' ? 'Receita validada — pedido liberado para separação.' : 'Receita recusada — paciente notificado.'}
                    <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => validateRx(prescription.id, 'pending')}>Reabrir</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export { RxScreen };
