import React, { useState } from "react";
import { Icon, PageHead, Badge, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — Validação de receita digital (master-detail). */

const RX_STATUS_TONE = { pending: "warning", approved: "good", rejected: "neutral" };
const RX_STATUS_LABEL = { pending: "Pendente", approved: "Validada", rejected: "Recusada" };

function RxScreen({ ctx }) {
  const { prescriptions, validateRx, openChatForName } = ctx;
  const pendingFirst = [...prescriptions].sort((left, right) => (left.status === "pending" ? -1 : 1) - (right.status === "pending" ? -1 : 1));
  const [selectedId, setSelectedId] = useState(pendingFirst[0] ? pendingFirst[0].id : null);
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const prescription = prescriptions.find((entry) => entry.id === selectedId) || pendingFirst[0];
  const checkDefs = [
    { key: "legible", label: "Receita legível e sem rasuras" },
    { key: "validDate", label: "Dentro do prazo de validade" },
    { key: "doseOk", label: "Posologia compatível com o pedido" },
    { key: "crmOk", label: "CRM e assinatura do prescritor" },
  ];

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento"
        title="Receitas digitais"
        desc={`${prescriptions.filter((entry) => entry.status === "pending").length} aguardando validação farmacêutica`}
      />
      <div className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        <div className="card" style={{ padding: 8, alignSelf: "stretch" }}>
          {pendingFirst.length === 0 && <EmptyState icon="rx" title="Nenhuma receita recebida ainda" />}
          {pendingFirst.map((entry) => (
            <button
              key={entry.id} onClick={() => setSelectedId(entry.id)}
              style={{ width: "100%", textAlign: "left", border: "none", background: prescription && prescription.id === entry.id ? "var(--surface-2)" : "transparent", borderRadius: "var(--radius-md)", padding: 12, display: "flex", gap: 11, cursor: "pointer", marginBottom: 2 }}
            >
              <span className="stat-icon" style={{ width: 40, height: 40, flex: "none", background: entry.status === "pending" ? "var(--warning-soft)" : "var(--good-soft)", color: entry.status === "pending" ? "var(--warning)" : "var(--good)" }}><Icon name="rx" size={19} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.patient}</div>
                <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.meds[0] ? entry.meds[0].name : entry.type}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <Badge tone={RX_STATUS_TONE[entry.status]}>{RX_STATUS_LABEL[entry.status]}</Badge>
                  <span className="cell-muted">{entry.sentAt}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {prescription ? (
          <div className="grid" style={{ gridTemplateColumns: "300px 1fr", gap: 18, alignItems: "start" }}>
            <div>
              {prescription.digitalReferenceUrl ? (
                <div className="card card-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}><Icon name="rx" size={16} />Receita enviada como link</div>
                  <a href={prescription.digitalReferenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10, fontSize: 12.5, wordBreak: "break-all", color: "var(--accent)" }}>{prescription.digitalReferenceUrl}</a>
                  <a href={prescription.digitalReferenceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: "100%", justifyContent: "center" }}><Icon name="expand" size={15} />Abrir link</a>
                </div>
              ) : (
                <>
                  <div className="card" style={{ aspectRatio: "3/4", display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
                    <span className="cell-muted">imagem da receita</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }}><Icon name="expand" size={15} />Ampliar</button>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }}><Icon name="download" size={15} />Baixar</button>
                  </div>
                </>
              )}
            </div>
            <div className="card card-pad">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 800, fontSize: 16 }}>{prescription.id}</span>
                    <Badge tone="neutral">Pedido {prescription.order}</Badge>
                  </div>
                  <h2 style={{ fontWeight: 800, fontSize: 20, margin: "8px 0 2px" }}>{prescription.patient} <span className="cell-muted" style={{ fontWeight: 600, fontSize: 14 }}>· {prescription.age} anos</span></h2>
                </div>
                {prescription.status !== "pending" && <Badge tone={prescription.status === "approved" ? "good" : "neutral"}><Icon name={prescription.status === "approved" ? "check" : "close"} size={12} />{prescription.status === "approved" ? "Validada" : "Recusada"}</Badge>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, fontSize: 12.5 }}>
                <div className="kv"><span className="kv-label">Prescritor</span><span className="kv-value">{prescription.doctor}</span></div>
                <div className="kv"><span className="kv-label">Registro</span><span className="kv-value">{prescription.crm}</span></div>
                <div className="kv"><span className="kv-label">Tipo</span><span className="kv-value">{prescription.type}</span></div>
                <div className="kv"><span className="kv-label">Emitida em</span><span className="kv-value">{prescription.issued}</span></div>
                <div className="kv"><span className="kv-label">Validade</span><span className="kv-value" style={{ color: prescription.validDays < 0 ? "var(--critical)" : "var(--good)", fontWeight: 700 }}>{prescription.validDays < 0 ? `Vencida há ${Math.abs(prescription.validDays)} dias` : `${prescription.validDays} dias restantes`}</span></div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, margin: "20px 0 8px" }}>Medicamentos prescritos</div>
              {prescription.meds.map((medication, index) => (
                <div key={index} style={{ display: "flex", gap: 12, padding: 12, background: "var(--surface-2)", borderRadius: "var(--radius-md)", marginBottom: 8 }}>
                  <span className="stat-icon" style={{ width: 38, height: 38, flex: "none" }}><Icon name="pill" size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{medication.name}</div>
                    <div className="cell-muted">{medication.dose} · {medication.qty}</div>
                  </div>
                  <span style={{ alignSelf: "flex-start" }}><Badge tone={medication.match ? "good" : "warning"}><Icon name={medication.match ? "check" : "alert"} size={11} />{medication.match ? "confere" : "verificar"}</Badge></span>
                </div>
              ))}
              <div style={{ fontWeight: 800, fontSize: 14, margin: "20px 0 4px" }}>Conferência farmacêutica</div>
              <div>
                {checkDefs.map((check) => {
                  const ok = prescription.checks[check.key];
                  return (
                    <div key={check.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                      <span className="stat-icon" style={{ width: 28, height: 28, flex: "none", background: ok ? "var(--good-soft)" : "var(--critical-soft)", color: ok ? "var(--good)" : "var(--critical)" }}><Icon name={ok ? "check" : "close"} size={15} /></span>
                      <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{check.label}</span>
                      <span className="cell-muted" style={{ color: ok ? "var(--good)" : "var(--critical)", fontWeight: 700 }}>{ok ? "OK" : "Atenção"}</span>
                    </div>
                  );
                })}
              </div>
              {prescription.status === "pending" && rejectingId === prescription.id && (
                <div style={{ marginTop: 20, padding: 14, borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                  <label htmlFor="rx-reject-reason" style={{ fontWeight: 700, fontSize: 13.5, display: "block", marginBottom: 8 }}>Motivo da recusa</label>
                  <textarea
                    id="rx-reject-reason" className="input" rows={3} style={{ width: "100%", resize: "vertical" }}
                    placeholder="Explique ao paciente por que a receita não pôde ser validada…"
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn btn-secondary" onClick={() => { setRejectingId(""); setRejectReason(""); }}>Cancelar</button>
                    <button
                      className="btn btn-danger" style={{ flex: 1, justifyContent: "center" }} disabled={!rejectReason.trim()}
                      onClick={async () => { await validateRx(prescription.id, "rejected", rejectReason); setRejectingId(""); setRejectReason(""); }}
                    >
                      <Icon name="close" size={16} />Confirmar recusa
                    </button>
                  </div>
                </div>
              )}
              {prescription.status === "pending" && rejectingId !== prescription.id && (
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button className="btn btn-secondary" onClick={() => openChatForName(prescription.patient)}><Icon name="chat" size={16} />Falar c/ paciente</button>
                  <button className="btn btn-secondary" style={{ color: "var(--critical)" }} onClick={() => { setRejectingId(prescription.id); setRejectReason(""); }}><Icon name="close" size={16} />Recusar</button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => validateRx(prescription.id, "approved")}><Icon name="shield" size={16} />Validar e liberar</button>
                </div>
              )}
              {prescription.status !== "pending" && (
                <div style={{ marginTop: 20, padding: 14, borderRadius: "var(--radius-md)", background: prescription.status === "approved" ? "var(--good-soft)" : "var(--surface-2)", fontWeight: 700, fontSize: 13.5, color: prescription.status === "approved" ? "var(--good)" : "var(--text-secondary)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name={prescription.status === "approved" ? "check" : "close"} size={18} />{prescription.status === "approved" ? "Receita validada — pedido liberado para separação." : "Receita recusada — paciente notificado."}
                    <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => validateRx(prescription.id, "pending")}>Reabrir</button>
                  </div>
                  {prescription.status === "rejected" && prescription.rejectionReason ? (
                    <div style={{ marginTop: 8, fontWeight: 500, fontSize: 12.5, color: "var(--text-secondary)" }}>Motivo: {prescription.rejectionReason}</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card"><EmptyState icon="check" title="Tudo em dia" desc="Nenhuma receita para validar no momento." /></div>
        )}
      </div>
    </div>
  );
}

export { RxScreen };
