import React, { useEffect, useRef, useState } from "react";
import { Icon, PageHead, Badge, EmptyState, Avatar } from "../core/internal-ui.jsx";

/* FARMAURA Console — Conversas com clientes (lado farmacêutico). */

// Same protected-download pattern as the marketplace widget (marketplace-care-actions.jsx):
// the file lives behind /uploads/{file_id}, which re-checks access server-side on every read
// (owner, or — this being the internal console — staff within the same tenant), so it's always
// fetched through authClient.download rather than a plain <img>/<a href>.
async function openChatAttachment(authClient, fileId) {
  const result = await authClient.download("/uploads/" + encodeURIComponent(fileId), { method: "GET" });
  const blobUrl = URL.createObjectURL(result.blob);
  window.open(blobUrl, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

function formatBlockedUntil(isoString) {
  if (!isoString) {
    return "";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function initialsOf(name) {
  return (name || "").split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function ChatScreen({ ctx }) {
  const { threads, activeThread, setActiveThread, sendChat, validateRx, authClient, flagSpam, unblockCustomer } = ctx;
  const [decidingId, setDecidingId] = useState("");
  const [resolvedStatuses, setResolvedStatuses] = useState({}); // override otimista: prescriptionId -> status, até o backend confirmar
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [attachError, setAttachError] = useState("");
  const [spamBusy, setSpamBusy] = useState(false);
  const [unblockBusy, setUnblockBusy] = useState(false);
  const thread = threads.find((entry) => entry.id === activeThread) || threads[0];
  const [input, setInput] = useState("");
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [thread && thread.msgs.length, activeThread]);

  const send = (event) => {
    event && event.preventDefault();
    const value = input.trim();
    if (!value || !thread) {
      return;
    }
    sendChat(thread.id, value);
    setInput("");
  };
  const totalUnread = threads.reduce((sum, entry) => sum + entry.unread, 0);
  const frozen = !!(thread && thread.threadStatus === "closed");
  const currentlyBlocked = !!(thread && (thread.customerPermanentlyBlocked || thread.customerBlockedUntil));

  return (
    <div className="route-fade">
      <PageHead eyebrow="Atendimento" title="Conversas" desc={`${threads.length} clientes · ${totalUnread} não lidas`} />
      <div className="grid" style={{ gridTemplateColumns: "320px 1fr", gap: 0, alignItems: "stretch", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", minHeight: 560, background: "var(--surface)" }}>
        <div className="scrollbar-thin" style={{ borderRight: "1px solid var(--border)", overflowY: "auto", maxHeight: 640 }}>
          {threads.map((entry) => (
            <div
              key={entry.id}
              onClick={() => setActiveThread(entry.id)}
              style={{ display: "flex", gap: 10, padding: "12px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: thread && thread.id === entry.id ? "var(--surface-2)" : "transparent" }}
            >
              <div style={{ position: "relative", flex: "none" }}>
                <Avatar initials={initialsOf(entry.customer)} size={38} />
                {entry.online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 99, background: "var(--good)", border: "2px solid var(--surface)" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.customer}</span>
                  <span className="cell-muted" style={{ fontSize: 11 }}>{entry.lastAt}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="cell-muted" style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.msgs.length ? entry.msgs[entry.msgs.length - 1].text : "Sem mensagens"}</span>
                  {entry.unread > 0 && <span className="badge badge-critical" style={{ marginLeft: "auto" }}>{entry.unread}</span>}
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <Badge tone="neutral"><Icon name={entry.order !== "—" ? "bag" : "chat"} size={10} />{entry.order !== "—" ? entry.order : ("Protocolo " + (entry.protocol || "—"))}</Badge>
                  {entry.threadStatus === "closed" && <Badge tone="neutral"><Icon name="lock" size={10} />Encerrado</Badge>}
                  {entry.customerPermanentlyBlocked && <Badge tone="critical">Bloqueado</Badge>}
                  {!entry.customerPermanentlyBlocked && entry.customerBlockedUntil && <Badge tone="warning">Bloqueado até {formatBlockedUntil(entry.customerBlockedUntil)}</Badge>}
                  {entry.customerFlaggedSpam && <Badge tone="warning">Spam</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {thread ? (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px 12px 14px", borderBottom: "1px solid var(--border)" }}>
              <Avatar initials={initialsOf(thread.customer)} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{thread.customer}</div>
                <div style={{ fontSize: 12.5, color: thread.online ? "var(--good)" : "var(--text-muted)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>{thread.online && <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--good)", display: "inline-block" }} />}{thread.online ? "Online agora" : "Visto " + thread.lastAt} · {thread.topic}</div>
              </div>
              <button className="btn btn-secondary btn-sm" disabled={spamBusy} onClick={async () => { setSpamBusy(true); await flagSpam(thread.id, !thread.customerFlaggedSpam); setSpamBusy(false); }}>
                <Icon name="info" size={14} />{thread.customerFlaggedSpam ? "Remover spam" : "Marcar spam"}
              </button>
              {currentlyBlocked && (
                <button className="btn btn-primary btn-sm" disabled={unblockBusy} onClick={async () => { setUnblockBusy(true); await unblockCustomer(thread.id); setUnblockBusy(false); }}>
                  <Icon name="lock" size={14} />Desbloquear
                </button>
              )}
              <button className="btn btn-secondary btn-sm" style={{ width: 34, padding: 0, justifyContent: "center" }} aria-label="ligar"><Icon name="phone" size={17} /></button>
              <button className="btn btn-secondary btn-sm" style={{ width: 34, padding: 0, justifyContent: "center" }} aria-label="ver pedido"><Icon name="bag" size={17} /></button>
            </div>
            <div className="scrollbar-thin" ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ textAlign: "center", margin: "4px 0 8px" }}><Badge tone="neutral">{thread.order !== "—" ? "Pedido " + thread.order : "Protocolo " + (thread.protocol || "—")} · {thread.topic}</Badge></div>
              {currentlyBlocked && (
                <div style={{ textAlign: "center", margin: "4px 0 8px" }}>
                  <Badge tone={thread.customerPermanentlyBlocked ? "critical" : "warning"}>
                    <Icon name="lock" size={11} />
                    {thread.customerPermanentlyBlocked ? "Cliente bloqueado permanentemente" : "Cliente bloqueado até " + formatBlockedUntil(thread.customerBlockedUntil)}
                  </Badge>
                </div>
              )}
              {thread.msgs.map((message, index) => {
                const mine = message.from !== "cust";
                return (
                  <div key={index} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "72%", background: mine ? "var(--accent)" : "var(--surface-2)", color: mine ? "var(--accent-contrast)" : "var(--text-primary)", borderRadius: "var(--radius-lg)", padding: "10px 13px" }}>
                    {message.prescriptionId ? (
                      <div style={{ minWidth: 220 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, marginBottom: 4 }}>
                          <Icon name="rx" size={14} />Validação de receita
                        </div>
                        <div style={{ fontSize: 12.5, marginBottom: 8, wordBreak: "break-all" }}>{message.text}</div>
                        {message.attachment && (
                          <button
                            type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 8, width: "100%", justifyContent: "center" }}
                            onClick={async () => {
                              try { await openChatAttachment(authClient, message.attachment.fileId); }
                              catch (error) { setAttachError((error && error.message) || "Não foi possível abrir o anexo."); }
                            }}
                          >
                            <Icon name={String(message.attachment.contentType || "").startsWith("image/") ? "camera" : "rx"} size={15} />
                            Ver {message.attachment.name || "anexo"}
                          </button>
                        )}
                        {(() => {
                          const effectiveStatus = resolvedStatuses[message.prescriptionId] || message.prescriptionStatus;
                          if (effectiveStatus === "pending" && rejectingId === message.prescriptionId) {
                            return (
                              <div style={{ background: "var(--surface)", borderRadius: 10, padding: 10 }}>
                                <label htmlFor={"rx-reject-reason-" + message.prescriptionId} style={{ fontWeight: 700, fontSize: 12, display: "block", marginBottom: 6, color: "var(--text-primary)" }}>Motivo da recusa</label>
                                <textarea
                                  id={"rx-reject-reason-" + message.prescriptionId} className="input" rows={2} style={{ width: "100%", resize: "vertical", fontSize: 12.5 }}
                                  placeholder="Explique ao paciente por que a receita não pôde ser validada…"
                                  value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                />
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <button className="btn btn-secondary btn-sm" onClick={() => { setRejectingId(""); setRejectReason(""); }}>Cancelar</button>
                                  <button
                                    className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: "center" }} disabled={decidingId === message.prescriptionId || !rejectReason.trim()}
                                    onClick={async () => {
                                      setDecidingId(message.prescriptionId);
                                      await validateRx(message.prescriptionId, "rejected", rejectReason);
                                      setResolvedStatuses((prev) => ({ ...prev, [message.prescriptionId]: "rejected" }));
                                      setDecidingId(""); setRejectingId(""); setRejectReason("");
                                    }}
                                  >
                                    Confirmar recusa
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          if (effectiveStatus === "pending") {
                            return (
                              <div style={{ display: "flex", gap: 8 }}>
                                <button className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: "center" }} disabled={decidingId === message.prescriptionId} onClick={() => { setRejectingId(message.prescriptionId); setRejectReason(""); }}>
                                  Recusar
                                </button>
                                <button
                                  className="btn btn-sm" style={{ flex: 1, justifyContent: "center", background: "var(--good)", color: "#fff", border: "none" }} disabled={decidingId === message.prescriptionId}
                                  onClick={async () => { setDecidingId(message.prescriptionId); await validateRx(message.prescriptionId, "approved"); setResolvedStatuses((prev) => ({ ...prev, [message.prescriptionId]: "approved" })); setDecidingId(""); }}
                                >
                                  Validar
                                </button>
                              </div>
                            );
                          }
                          return <Badge tone={effectiveStatus === "approved" ? "good" : "critical"}>{effectiveStatus === "approved" ? "Validada" : "Recusada"}</Badge>;
                        })()}
                      </div>
                    ) : <span style={{ fontSize: 13.5 }}>{message.text}</span>}
                    <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 4, textAlign: "right" }}>{message.at}</div>
                  </div>
                );
              })}
              {thread.typing && (
                <div style={{ alignSelf: "flex-start", background: "var(--surface-2)", borderRadius: "var(--radius-lg)", padding: "10px 13px", display: "flex", gap: 4 }}>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </div>
            {attachError && <div style={{ padding: "0 16px 8px", color: "var(--critical)", fontSize: 12.5 }}>{attachError}</div>}
            {frozen ? (
              <div style={{ padding: "12px 16px", fontSize: 12.5, color: "var(--text-secondary)", background: "var(--surface-2)", display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--border)" }}>
                <Icon name="lock" size={15} style={{ flex: "none", marginTop: 1 }} />
                <span>
                  {thread.closedReason === "order_completed"
                    ? "Este atendimento foi encerrado porque o pedido foi concluído."
                    : "Este atendimento foi encerrado."} Não é mais possível enviar mensagens nesta conversa.
                </span>
              </div>
            ) : (
              <form onSubmit={send} style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
                <button type="button" className="btn btn-secondary btn-sm" style={{ width: 34, padding: 0, justifyContent: "center" }} aria-label="anexar"><Icon name="rx" size={18} /></button>
                <input className="input" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva uma resposta…" aria-label="mensagem" />
                <button type="submit" className="btn btn-primary" aria-label="enviar" disabled={!input.trim()}><Icon name="send" size={17} /></button>
              </form>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center" }}><EmptyState icon="chat" title="Selecione uma conversa" /></div>
        )}
      </div>
    </div>
  );
}

export { ChatScreen };
