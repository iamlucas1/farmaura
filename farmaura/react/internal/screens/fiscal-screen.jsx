import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon, PageHead, Badge, StatCard, Modal, Field, EmptyState } from "../core/internal-ui.jsx";

/* FARMAURA Console - Fiscal (NFC-e).
   - FiscalStatusCard: estado REAL da NFC-e de uma venda (usado no modal do balcao): mostra o que a SEFAZ respondeu,
     nunca presume "autorizada", e oferece imprimir / PDF / XML / reprocessar / consultar.
   - FiscalScreen: painel administrativo (contadores, filtros, acoes, reconciliacao, inutilizacao).
   Toda a regra fiscal vive no backend; aqui so ha apresentacao. Documentos so trafegam por chamadas autenticadas
   (blob), nunca por URL publica. */

const STATUS_LABEL = {
  DRAFT: "Aguardando emissão", VALIDATING: "Validando", SIGNING: "Assinando", SENDING: "Enviando",
  PROCESSING: "Processando", AUTHORIZED: "Autorizada", REJECTED: "Rejeitada", DENIED: "Denegada",
  CANCELED: "Cancelada", CONTINGENCY: "Contingência", PENDING_RECOVERY: "Pendente de sincronização",
  ERROR: "Erro", LEGACY_SIMULATED: "Simulada (protótipo)",
};
const STATUS_TONE = {
  AUTHORIZED: "good", CANCELED: "neutral", REJECTED: "critical", DENIED: "critical", ERROR: "critical",
  PENDING_RECOVERY: "warning", CONTINGENCY: "warning", LEGACY_SIMULATED: "neutral",
};
const SETTLED = ["AUTHORIZED", "REJECTED", "DENIED", "CANCELED", "ERROR", "LEGACY_SIMULATED"];
const POLL_MS = 2500;
const POLL_MAX_MS = 90000;

function statusLabel(status) { return STATUS_LABEL[status] || status || "-"; }
function statusTone(status) { return STATUS_TONE[status] || "accent"; }
function formatKey(key) { return (key || "").replace(/(\d{4})(?=\d)/g, "$1 "); }
function errorText(error) { return (error && error.message) || "Não foi possível concluir a operação."; }

/* Abre/baixa um arquivo fiscal usando o token do operador (rota protegida: window.open nao enviaria o bearer). */
async function openFiscalFile(fiscalApi, documentId, kind, options) {
  const result = await fiscalApi.download(documentId, kind);
  const url = URL.createObjectURL(result.blob);
  if (kind === "xml") {
    const link = document.createElement("a");
    link.href = url;
    link.download = "NFCe-" + documentId + ".xml";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else if (kind === "printable" && options && options.print) {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.onload = function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { window.open(url, "_blank", "noopener"); }
    };
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(function () { frame.remove(); }, 60000);
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
}

/* Acompanha a NFC-e ate ela "assentar" (autorizada, rejeitada, erro...). */
function useFiscalDocument(initial, fiscalApi) {
  const [doc, setDoc] = useState(initial || null);
  const id = initial && initial.id;
  const status = doc && doc.status;
  useEffect(() => {
    if (!id || !fiscalApi || (status && SETTLED.indexOf(status) >= 0)) return undefined;
    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(function () {
      if (Date.now() - started > POLL_MAX_MS) { clearInterval(timer); return; }
      fiscalApi.get(id).then(function (fresh) { if (!cancelled && fresh) setDoc(fresh); }).catch(function () {});
    }, POLL_MS);
    return function () { cancelled = true; clearInterval(timer); };
  }, [id, status, fiscalApi]);
  return [doc, setDoc];
}

function DocRow({ label, value, mono }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "3px 0" }}>
      <span className="cell-muted">{label}</span>
      <span className={mono ? "mono" : ""} style={{ textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function FiscalStatusCard({ initial, fiscalApi, notify }) {
  const [doc, setDoc] = useFiscalDocument(initial, fiscalApi);
  const [busy, setBusy] = useState("");
  if (!doc) {
    return (
      <div style={{ padding: 12, borderRadius: "var(--radius-md)", background: "var(--warning-soft)", fontSize: 13 }}>
        <b>Nota fiscal não emitida.</b> O módulo de NFC-e não está habilitado para esta venda.
      </div>
    );
  }
  const run = async function (name, action) {
    setBusy(name);
    try { await action(); } catch (error) { if (notify) notify(errorText(error), "error"); } finally { setBusy(""); }
  };
  const refresh = function (fresh) { if (fresh) setDoc(fresh); };
  const authorized = doc.status === "AUTHORIZED";
  const failed = doc.status === "REJECTED" || doc.status === "ERROR";
  const waiting = !failed && !authorized && doc.status !== "CANCELED" && doc.status !== "DENIED";
  const homologation = doc.environment === "homologacao";
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Badge tone={statusTone(doc.status)} dot>{statusLabel(doc.status)}</Badge>
        {homologation && <Badge tone="warning">Homologação · sem valor fiscal</Badge>}
        {doc.simulated && <Badge tone="neutral">Simulada</Badge>}
      </div>
      {authorized && <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}><Icon name="check" size={16} /> NFC-e autorizada</div>}
      {waiting && <div className="cell-muted" style={{ marginBottom: 6 }}>Emitindo a NFC-e junto à SEFAZ… você já pode iniciar a próxima venda.</div>}
      <DocRow label="Número" value={doc.number} />
      <DocRow label="Série" value={doc.serie} />
      <DocRow label="Chave de acesso" value={formatKey(doc.access_key)} mono />
      <DocRow label="Protocolo" value={doc.protocol} mono />
      {failed && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: "var(--radius-md)", background: "var(--critical-soft)", fontSize: 12.5 }}>
          {doc.cstat ? <div><b>Código: {doc.cstat}</b></div> : null}
          <div><b>Motivo:</b> {doc.status_message || "Verifique os dados fiscais."}</div>
          {(doc.error_details || []).length > 0 && (
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              {doc.error_details.map(function (line, index) { return <li key={index}>{line}</li>; })}
            </ul>
          )}
        </div>
      )}
      {doc.status === "PENDING_RECOVERY" && doc.status_message && <div className="cell-muted" style={{ marginTop: 6 }}>{doc.status_message}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {authorized && (
          <React.Fragment>
            <button className="btn btn-primary" disabled={!!busy} onClick={function () { run("print", function () { return openFiscalFile(fiscalApi, doc.id, "printable", { print: true }); }); }}><Icon name="receipt" size={15} />Imprimir</button>
            <button className="btn btn-secondary" disabled={!!busy} onClick={function () { run("pdf", function () { return openFiscalFile(fiscalApi, doc.id, "pdf"); }); }}>PDF</button>
            <button className="btn btn-secondary" disabled={!!busy} onClick={function () { run("xml", function () { return openFiscalFile(fiscalApi, doc.id, "xml"); }); }}>XML</button>
          </React.Fragment>
        )}
        {failed && (
          <button className="btn btn-secondary" disabled={!!busy} onClick={function () { run("reprocess", function () { return fiscalApi.reprocess(doc.id).then(refresh); }); }}>Reprocessar</button>
        )}
        {(doc.status === "PENDING_RECOVERY" || doc.status === "SENDING" || doc.status === "ERROR" || doc.status === "PROCESSING") && (
          <button className="btn btn-secondary" disabled={!!busy} onClick={function () { run("sync", function () { return fiscalApi.sync(doc.id).then(refresh); }); }}>Consultar SEFAZ</button>
        )}
      </div>
    </div>
  );
}

/* ---------------- painel administrativo ---------------- */

const FILTERS_EMPTY = { status: "", number: "", serie: "", access_key: "", consumer_cpf: "", sale_id: "", date_from: "", date_to: "" };

function FiscalScreen({ ctx }) {
  const fiscalApi = ctx.fiscalApi;
  const notify = ctx.notify;
  const role = ctx.user && ctx.user.role;
  const canCancel = role === "admin" || role === "manager";
  const isAdmin = role === "admin";
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState(FILTERS_EMPTY);
  const [applied, setApplied] = useState(FILTERS_EMPTY);
  const [selected, setSelected] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [inutOpen, setInutOpen] = useState(false);
  const [inut, setInut] = useState({ first_number: "", last_number: "", justification: "" });
  const [busy, setBusy] = useState(false);
  const limit = 20;

  const loadInfo = function (live) {
    return fiscalApi.status(live).then(setInfo).catch(function (error) { if (notify) notify(errorText(error), "error"); });
  };
  const loadRows = function () {
    const params = { limit: limit, offset: offset };
    Object.keys(applied).forEach(function (key) {
      const value = applied[key];
      if (value === "") return;
      params[key] = (key === "date_from" || key === "date_to") ? new Date(value).toISOString() : value;
    });
    return fiscalApi.list(params).then(function (page) { setRows(page.items || []); setTotal(page.total || 0); })
      .catch(function (error) { if (notify) notify(errorText(error), "error"); });
  };
  useEffect(function () { loadInfo(false); }, []);
  useEffect(function () { loadRows(); }, [offset, applied]);

  const act = async function (action, success) {
    setBusy(true);
    try {
      await action();
      if (success && notify) notify(success, "success");
      await Promise.all([loadRows(), loadInfo(false)]);
    } catch (error) {
      if (notify) notify(errorText(error), "error");
    } finally { setBusy(false); }
  };

  const counts = (info && info.counts) || {};
  const pending = (counts.PENDING_RECOVERY || 0) + (counts.SENDING || 0) + (counts.PROCESSING || 0) + (counts.DRAFT || 0) + (counts.ERROR || 0);
  const cert = info && info.certificate;

  return (
    <div className="page">
      <PageHead
        eyebrow="Fiscal"
        title="NFC-e"
        desc="Notas fiscais de consumidor emitidas no balcão: autorizações, rejeições, cancelamentos e pendências junto à SEFAZ."
        actions={(
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={function () { loadInfo(true); }}>Status da SEFAZ</button>
            {isAdmin && <button className="btn btn-secondary" disabled={busy} onClick={function () { act(function () { return fiscalApi.reconcile(); }, "Reconciliação concluída."); }}>Reconciliar com SEFAZ</button>}
            {isAdmin && <button className="btn btn-secondary" onClick={function () { setInutOpen(true); }}>Inutilizar numeração</button>}
          </div>
        )}
      />

      {info && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={info.environment === "producao" ? "critical" : "warning"} dot>{info.environment === "producao" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</Badge>
            <Badge tone={info.enabled ? "good" : "neutral"}>{info.enabled ? "Módulo ativo" : "Módulo desativado"}</Badge>
            {cert && <Badge tone={cert.ok ? (cert.expiring_soon ? "warning" : "good") : "critical"}>{cert.ok ? "Certificado válido até " + new Date(cert.expires_at).toLocaleDateString("pt-BR") : "Certificado com problema"}</Badge>}
            {info.sefaz && <Badge tone={info.sefaz.cstat === 107 ? "good" : "critical"}>SEFAZ: {info.sefaz.message}</Badge>}
          </div>
          {(info.problems || []).length > 0 && (
            <ul style={{ margin: "10px 0 0 16px", padding: 0, fontSize: 12.5, color: "var(--critical)" }}>
              {info.problems.map(function (problem, index) { return <li key={index}>{problem}</li>; })}
            </ul>
          )}
          {cert && cert.message && <div className="cell-muted" style={{ marginTop: 8 }}>{cert.message}</div>}
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <StatCard icon="check" label="Autorizadas" value={counts.AUTHORIZED || 0} tone="good" />
        <StatCard icon="close" label="Rejeitadas" value={counts.REJECTED || 0} tone="critical" />
        <StatCard icon="trash" label="Canceladas" value={counts.CANCELED || 0} tone="accent" />
        <StatCard icon="clock" label="Em contingência" value={counts.CONTINGENCY || 0} tone="warning" />
        <StatCard icon="repeat" label="Pendentes / sincronizar" value={pending} tone="warning" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <Field label="Situação">
            <select className="input" value={filters.status} onChange={function (e) { setFilters(Object.assign({}, filters, { status: e.target.value })); }}>
              <option value="">Todas</option>
              {Object.keys(STATUS_LABEL).filter(function (s) { return s !== "LEGACY_SIMULATED"; }).map(function (s) { return <option key={s} value={s}>{STATUS_LABEL[s]}</option>; })}
            </select>
          </Field>
          <Field label="Número"><input className="input" inputMode="numeric" value={filters.number} onChange={function (e) { setFilters(Object.assign({}, filters, { number: e.target.value.replace(/\D/g, "") })); }} /></Field>
          <Field label="Série"><input className="input" inputMode="numeric" value={filters.serie} onChange={function (e) { setFilters(Object.assign({}, filters, { serie: e.target.value.replace(/\D/g, "") })); }} /></Field>
          <Field label="Chave (44 dígitos)"><input className="input mono" value={filters.access_key} onChange={function (e) { setFilters(Object.assign({}, filters, { access_key: e.target.value.replace(/\D/g, "").slice(0, 44) })); }} /></Field>
          <Field label="CPF do consumidor"><input className="input" inputMode="numeric" value={filters.consumer_cpf} onChange={function (e) { setFilters(Object.assign({}, filters, { consumer_cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })); }} /></Field>
          <Field label="Venda (id)"><input className="input mono" value={filters.sale_id} onChange={function (e) { setFilters(Object.assign({}, filters, { sale_id: e.target.value.trim() })); }} /></Field>
          <Field label="De"><input className="input" type="date" value={filters.date_from} onChange={function (e) { setFilters(Object.assign({}, filters, { date_from: e.target.value })); }} /></Field>
          <Field label="Até"><input className="input" type="date" value={filters.date_to} onChange={function (e) { setFilters(Object.assign({}, filters, { date_to: e.target.value })); }} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" onClick={function () { setOffset(0); setApplied(filters); }}>Filtrar</button>
          <button className="btn btn-secondary" onClick={function () { setFilters(FILTERS_EMPTY); setOffset(0); setApplied(FILTERS_EMPTY); }}>Limpar</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="money" title="Nenhuma NFC-e encontrada" desc="Ajuste os filtros ou conclua uma venda no balcão." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nº / série</th><th>Situação</th><th>Valor</th><th>Emissão</th><th>Consumidor</th><th /></tr></thead>
            <tbody>
              {rows.map(function (row) {
                return (
                  <tr key={row.id}>
                    <td className="mono">{row.number || "-"} / {row.serie || "-"}</td>
                    <td><Badge tone={statusTone(row.status)} dot>{statusLabel(row.status)}</Badge>{row.cstat ? <span className="cell-muted"> cStat {row.cstat}</span> : null}</td>
                    <td className="mono">{brl(row.gross_total_amount)}</td>
                    <td>{row.issue_datetime_label || "-"}</td>
                    <td className="mono">{row.recipient_document_snapshot ? "***" + row.recipient_document_snapshot.replace(/\D/g, "").slice(-4) : "Não identificado"}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="btn btn-secondary" onClick={function () { setSelected(row); }}>Ver</button>{" "}
                      {row.status === "AUTHORIZED" && <button className="btn btn-secondary" onClick={function () { act(function () { return openFiscalFile(fiscalApi, row.id, "printable", { print: true }); }); }}>Imprimir</button>}{" "}
                      {row.status === "AUTHORIZED" && canCancel && <button className="btn btn-secondary" onClick={function () { setCancelTarget(row); setReason(""); }}>Cancelar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <span className="cell-muted">{total} documento(s)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" disabled={offset === 0} onClick={function () { setOffset(Math.max(0, offset - limit)); }}>Anterior</button>
          <button className="btn btn-secondary" disabled={offset + limit >= total} onClick={function () { setOffset(offset + limit); }}>Próxima</button>
        </div>
      </div>

      {selected && (
        <Modal open onClose={function () { setSelected(null); loadRows(); }} title={"NFC-e " + (selected.number || "")} subtitle={statusLabel(selected.status)}>
          <FiscalStatusCard initial={selected} fiscalApi={fiscalApi} notify={notify} />
        </Modal>
      )}

      {cancelTarget && (
        <Modal open onClose={function () { setCancelTarget(null); }} title="Cancelar NFC-e" subtitle={"Nº " + cancelTarget.number + " · prazo até " + (cancelTarget.cancel_deadline ? new Date(cancelTarget.cancel_deadline).toLocaleTimeString("pt-BR") : "-")}>
          <Field label="Justificativa (15 a 255 caracteres)" hint="Fica registrada no evento fiscal junto com o seu usuário.">
            <textarea className="input" rows={3} value={reason} maxLength={255} onChange={function (e) { setReason(e.target.value); }} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={function () { setCancelTarget(null); }}>Voltar</button>
            <button className="btn btn-primary" disabled={busy || reason.trim().length < 15} onClick={function () {
              act(function () { return fiscalApi.cancel(cancelTarget.id, reason.trim()); }, "NFC-e cancelada.").then(function () { setCancelTarget(null); });
            }}>Confirmar cancelamento</button>
          </div>
        </Modal>
      )}

      {inutOpen && (
        <Modal open onClose={function () { setInutOpen(false); }} title="Inutilizar numeração" subtitle="Só para números que nunca serão usados. A SEFAZ é quem valida.">
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Número inicial"><input className="input" inputMode="numeric" value={inut.first_number} onChange={function (e) { setInut(Object.assign({}, inut, { first_number: e.target.value.replace(/\D/g, "") })); }} /></Field>
            <Field label="Número final"><input className="input" inputMode="numeric" value={inut.last_number} onChange={function (e) { setInut(Object.assign({}, inut, { last_number: e.target.value.replace(/\D/g, "") })); }} /></Field>
          </div>
          <Field label="Justificativa (15 a 255 caracteres)">
            <textarea className="input" rows={3} value={inut.justification} maxLength={255} onChange={function (e) { setInut(Object.assign({}, inut, { justification: e.target.value })); }} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={function () { setInutOpen(false); }}>Voltar</button>
            <button className="btn btn-primary" disabled={busy || !inut.first_number || !inut.last_number || inut.justification.trim().length < 15} onClick={function () {
              act(function () { return fiscalApi.inutilize({ first_number: Number(inut.first_number), last_number: Number(inut.last_number), justification: inut.justification.trim() }); }, "Inutilização registrada.")
                .then(function () { setInutOpen(false); setInut({ first_number: "", last_number: "", justification: "" }); });
            }}>Inutilizar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { FiscalScreen, FiscalStatusCard, openFiscalFile, statusLabel };
