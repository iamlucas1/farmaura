import React, { useState } from "react";
import { Icon, PageHead, Badge, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console — Requisições de desbloqueio de chat (contestação do cliente). */

const STATUS_LABEL = { pending: "Pendente", approved: "Aceita", denied: "Negada" };
const STATUS_TONE = { pending: "warning", approved: "good", denied: "critical" };

function UnblockRequestsScreen({ ctx }) {
  const { unblockRequests, decideUnblockRequest } = ctx;
  const requests = Array.isArray(unblockRequests) ? unblockRequests : [];
  const [selectedId, setSelectedId] = useState(requests[0] ? requests[0].id : null);
  const [notes, setNotes] = useState("");
  const [deciding, setDeciding] = useState("");
  const selected = requests.find((entry) => entry.id === selectedId) || requests[0];
  const pendingCount = requests.filter((entry) => entry.status === "pending").length;

  const decide = async (status) => {
    if (!selected) {
      return;
    }
    setDeciding(status);
    await decideUnblockRequest(selected.id, status, notes);
    setNotes("");
    setDeciding("");
  };

  return (
    <div className="route-fade">
      <PageHead eyebrow="Atendimento" title="Requisições de desbloqueio" desc={`${pendingCount} aguardando decisão`} />
      <div className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        <div className="card" style={{ padding: 8, alignSelf: "stretch" }}>
          {requests.length === 0 && <EmptyState icon="lock" title="Nenhuma contestação recebida ainda" />}
          {requests.map((entry) => (
            <button
              key={entry.id}
              onClick={() => { setSelectedId(entry.id); setNotes(""); }}
              style={{ width: "100%", textAlign: "left", border: "none", background: selected && selected.id === entry.id ? "var(--surface-2)" : "transparent", borderRadius: "var(--radius-md)", padding: 12, display: "flex", gap: 11, cursor: "pointer", marginBottom: 2 }}
            >
              <span className="stat-icon" style={{ width: 40, height: 40, flex: "none", background: entry.status === "pending" ? "var(--warning-soft)" : entry.status === "approved" ? "var(--good-soft)" : "var(--critical-soft)", color: entry.status === "pending" ? "var(--warning)" : entry.status === "approved" ? "var(--good)" : "var(--critical)" }}><Icon name="lock" size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.customerName}</div>
                <div className="cell-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.customerMessage}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <Badge tone={STATUS_TONE[entry.status] || "warning"}>{STATUS_LABEL[entry.status] || entry.status}</Badge>
                  <span className="cell-muted">{entry.createdAtLabel ? new Date(entry.createdAtLabel).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>{selected.customerName}</h2>
                <div className="cell-muted" style={{ marginTop: 4 }}>
                  {selected.permanentlyBlocked ? "Bloqueio definitivo" : "Nível de violação " + selected.violationCount + " de 4"} · {selected.totalRequests} contestaç{selected.totalRequests === 1 ? "ão" : "ões"} no total
                </div>
              </div>
              <Badge tone={STATUS_TONE[selected.status] || "warning"}>{STATUS_LABEL[selected.status] || selected.status}</Badge>
            </div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: "20px 0 8px" }}>Justificativa do cliente</div>
            <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: "var(--radius-md)", fontSize: 13.5, lineHeight: 1.5 }}>{selected.customerMessage}</div>

            <div style={{ fontWeight: 800, fontSize: 14, margin: "20px 0 8px" }}>Mensagens recentes do cliente</div>
            <div className="scrollbar-thin" style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {selected.recentMessages.length === 0 && <div className="cell-muted">Nenhuma mensagem recente encontrada.</div>}
              {selected.recentMessages.map((message, index) => (
                <div key={index} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: 13, wordBreak: "break-word" }}>{message.text}</span>
                  <span className="cell-muted" style={{ flex: "none" }}>{message.at}</span>
                </div>
              ))}
            </div>

            {selected.status === "pending" ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 14, margin: "20px 0 8px" }}>Nota da decisão (opcional)</div>
                <textarea
                  className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Ex.: confirmado pelo histórico, não era spam."
                  style={{ width: "100%", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn btn-danger" style={{ flex: 1, justifyContent: "center" }} disabled={!!deciding} onClick={() => decide("denied")}>
                    {deciding === "denied" ? "Negando…" : "Negar"}
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!!deciding} onClick={() => decide("approved")}>
                    {deciding === "approved" ? "Aceitando…" : "Aceitar e desbloquear"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 20, padding: 14, background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Decidido em {selected.decidedAt ? new Date(selected.decidedAt).toLocaleString("pt-BR") : "—"}</div>
                {selected.pharmacistNotes && <div className="cell-muted" style={{ marginTop: 6 }}>{selected.pharmacistNotes}</div>}
              </div>
            )}
          </div>
        ) : (
          <div className="card"><EmptyState icon="lock" title="Selecione uma requisição" /></div>
        )}
      </div>
    </div>
  );
}

export { UnblockRequestsScreen };
