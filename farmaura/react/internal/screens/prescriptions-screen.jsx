import React, { useMemo, useState } from "react";
import {
  Icon, PageHead, Badge, StatCard, Tabs, SearchInput, DataTable, RowIconBtn, Drawer,
} from "../core/internal-ui.jsx";

/* FARMAURA Console — Validação de receita digital. */

const RX_STATUS_TONE = { pending: "warning", approved: "good", rejected: "critical" };
const RX_STATUS_LABEL = { pending: "Pendente", approved: "Aprovada", rejected: "Recusada" };

const CHECK_DEFS = [
  { key: "legible", label: "Receita legível e sem rasuras" },
  { key: "validDate", label: "Dentro do prazo de validade" },
  { key: "doseOk", label: "Posologia compatível com o pedido" },
  { key: "crmOk", label: "CRM e assinatura do prescritor" },
];

const TABS = [
  { key: "todas", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "approved", label: "Aprovadas" },
  { key: "rejected", label: "Recusadas" },
];

function RxScreen({ ctx }) {
  const { prescriptions, validateRx, openChatForName } = ctx;
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("todas");
  const [selectedId, setSelectedId] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const byStatus = useMemo(() => ({
    pending: prescriptions.filter((entry) => entry.status === "pending"),
    approved: prescriptions.filter((entry) => entry.status === "approved"),
    rejected: prescriptions.filter((entry) => entry.status === "rejected"),
  }), [prescriptions]);

  const filtered = tab === "todas" ? prescriptions : byStatus[tab] || [];
  const q = query.trim().toLowerCase();
  const rows = q
    ? filtered.filter((entry) => (entry.patient || "").toLowerCase().includes(q) || (entry.id || "").toLowerCase().includes(q) || (entry.order || "").toLowerCase().includes(q))
    : filtered;

  const prescription = prescriptions.find((entry) => entry.id === selectedId) || null;

  const openDetail = (entry) => { setSelectedId(entry.id); setRejecting(false); setRejectReason(""); };
  const closeDetail = () => setSelectedId(null);

  const columns = useMemo(() => [
    { key: "id", label: "Código", mono: true },
    { key: "order", label: "Pedido", render: (e) => <span className="mono">{e.order}</span> },
    { key: "patient", label: "Paciente" },
    { key: "type", label: "Tipo", render: (e) => e.type || <span className="cell-muted">—</span> },
    { key: "meds", label: "Medicamento(s)", render: (e) => e.meds.map((m) => m.name).join(", ") || <span className="cell-muted">—</span> },
    { key: "doctor", label: "Prescritor", render: (e) => e.doctor || <span className="cell-muted">—</span> },
    { key: "status", label: "Status", render: (e) => <Badge tone={RX_STATUS_TONE[e.status]} dot>{RX_STATUS_LABEL[e.status]}</Badge> },
  ], []);

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Atendimento"
        title="Receitas"
        desc="Receitas digitais enviadas pelos clientes, vinculadas ao pedido de origem."
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="clock" label="Aguardando validação" value={byStatus.pending.length} tone="warning" />
        <StatCard icon="check" label="Aprovadas" value={byStatus.approved.length} tone="good" />
        <StatCard icon="x" label="Recusadas" value={byStatus.rejected.length} tone="critical" />
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: t.key === "todas" ? prescriptions.length : (byStatus[t.key] || []).length }))}
        active={tab}
        onChange={setTab}
      />

      <div className="card">
        <div className="card-head">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por paciente, código ou pedido..." />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          empty="Nenhuma receita nesse filtro"
          renderActions={(e) => <RowIconBtn name="eye" onClick={() => openDetail(e)} label="Ver detalhes" />}
        />
      </div>

      <Drawer open={!!prescription} onClose={closeDetail} title={prescription ? prescription.id : ""} subtitle={prescription ? prescription.patient : ""}>
        {prescription && (
          <>
            <Badge tone={RX_STATUS_TONE[prescription.status]} dot>{RX_STATUS_LABEL[prescription.status]}</Badge>

            <div style={{ marginTop: 14 }}>
              <div className="kv"><span className="kv-label">Pedido vinculado</span><span className="kv-value mono">{prescription.order}</span></div>
              <div className="kv"><span className="kv-label">Tipo</span><span className="kv-value">{prescription.type || "—"}</span></div>
              <div className="kv"><span className="kv-label">Prescritor</span><span className="kv-value">{prescription.doctor || "—"}</span></div>
              <div className="kv"><span className="kv-label">Registro</span><span className="kv-value">{prescription.crm || "—"}</span></div>
              <div className="kv"><span className="kv-label">Emitida em</span><span className="kv-value">{prescription.issued || "—"}</span></div>
              <div className="kv">
                <span className="kv-label">Validade</span>
                <span className="kv-value" style={{ color: prescription.validDays < 0 ? "var(--critical)" : "var(--good)" }}>
                  {prescription.validDays < 0 ? `Vencida há ${Math.abs(prescription.validDays)} dias` : `${prescription.validDays} dias restantes`}
                </span>
              </div>
              {prescription.status === "rejected" && prescription.rejectionReason && (
                <div className="kv"><span className="kv-label">Motivo da recusa</span><span className="kv-value">{prescription.rejectionReason}</span></div>
              )}
            </div>

            {prescription.digitalReferenceUrl ? (
              <div className="rx-doc-card">
                <Icon name="rx" size={16} style={{ color: "var(--text-muted)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>Receita enviada como link</div>
                  <a href={prescription.digitalReferenceUrl} target="_blank" rel="noopener noreferrer" className="cell-muted mono" style={{ fontSize: 10.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prescription.digitalReferenceUrl}</a>
                </div>
                <a href={prescription.digitalReferenceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Icon name="expand" size={13} />Abrir</a>
              </div>
            ) : (
              <div className="rx-doc-card">
                <Icon name="rx" size={16} style={{ color: "var(--text-muted)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 12.5 }}>Imagem da receita</div>
                <button className="btn btn-secondary btn-sm"><Icon name="expand" size={13} />Ampliar</button>
                <button className="btn btn-secondary btn-sm"><Icon name="download" size={13} />Baixar</button>
              </div>
            )}

            <div style={{ fontWeight: 800, fontSize: 13, margin: "18px 0 8px" }}>Medicamentos prescritos</div>
            {prescription.meds.map((medication, index) => (
              <div key={index} className="pdv-rx-product-row" style={{ marginBottom: 6 }}>
                <Icon name="pill" size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{medication.name}</div>
                  <div className="cell-muted" style={{ fontSize: 11 }}>{medication.dose} · {medication.qty}</div>
                </div>
                <Badge tone={medication.match ? "good" : "warning"}>
                  <Icon name={medication.match ? "check" : "alert"} size={11} />{medication.match ? "confere" : "verificar"}
                </Badge>
              </div>
            ))}

            <div style={{ fontWeight: 800, fontSize: 13, margin: "18px 0 4px" }}>Conferência farmacêutica</div>
            {CHECK_DEFS.map((check) => {
              const ok = prescription.checks[check.key];
              return (
                <div key={check.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                  <span className="stat-icon" style={{ width: 26, height: 26, flex: "none", background: ok ? "var(--good-soft)" : "var(--critical-soft)", color: ok ? "var(--good)" : "var(--critical)" }}><Icon name={ok ? "check" : "close"} size={14} /></span>
                  <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1 }}>{check.label}</span>
                  <span className="cell-muted" style={{ color: ok ? "var(--good)" : "var(--critical)", fontWeight: 700 }}>{ok ? "OK" : "Atenção"}</span>
                </div>
              );
            })}

            {prescription.status === "pending" && rejecting && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                <label htmlFor="rx-reject-reason" style={{ fontWeight: 700, fontSize: 12.5, display: "block", marginBottom: 8 }}>Motivo da recusa</label>
                <textarea
                  id="rx-reject-reason" className="input" rows={3}
                  placeholder="Explique ao paciente por que a receita não pôde ser validada…"
                  value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn btn-secondary" onClick={() => { setRejecting(false); setRejectReason(""); }}>Cancelar</button>
                  <button
                    className="btn btn-danger" style={{ flex: 1, justifyContent: "center" }} disabled={!rejectReason.trim()}
                    onClick={async () => { await validateRx(prescription.id, "rejected", rejectReason); setRejecting(false); setRejectReason(""); closeDetail(); }}
                  >
                    <Icon name="close" size={14} />Confirmar recusa
                  </button>
                </div>
              </div>
            )}
            {prescription.status === "pending" && !rejecting && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => openChatForName(prescription.patient)}><Icon name="chat" size={14} />Falar c/ paciente</button>
                <button className="btn btn-secondary" style={{ color: "var(--critical)" }} onClick={() => { setRejecting(true); setRejectReason(""); }}><Icon name="close" size={14} />Recusar</button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => validateRx(prescription.id, "approved")}><Icon name="check" size={14} />Validar e liberar</button>
              </div>
            )}
            {prescription.status !== "pending" && (
              <div className={"order-action" + (prescription.status === "approved" ? "" : " blocked")} style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name={prescription.status === "approved" ? "check" : "close"} size={16} />
                  <span style={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>{prescription.status === "approved" ? "Receita validada — pedido liberado para separação." : "Receita recusada — paciente notificado."}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => validateRx(prescription.id, "pending")}>Reabrir</button>
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}

export { RxScreen };
