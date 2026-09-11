/* ============================================================
   Farmaura Console — Internal UI kit
   ------------------------------------------------------------
   Shared presentation components for the internal console,
   ported from the "Farmaura Operações" prototype (artifact
   b75209e1). Styling lives in internal.css. These components
   are pure presentation: data and mutations are always passed
   in by the screen (which gets them from `ctx`), never fetched
   here.
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon as BaseIcon } from "../../marketplace/core/marketplace-icons.jsx";

/* ---------- formatting helpers ---------- */
const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numfmt = (n) => Number(n || 0).toLocaleString("pt-BR");

/* ---------- Icon: artifact-era names mapped onto the real icon set ---------- */
const ICON_ALIAS = {
  x: "close",
  dashboard: "layout",
  pencil: "edit",
  filetext: "doc",
  package: "box",
  factory: "store",
  ticket: "gift",
  heartpulse: "activity",
  mappin: "pin",
  sliders: "cog",
  calculator: "card",
  rocket: "bolt",
  zap: "bolt",
  radar: "search",
  checksquare: "plusCircle",
  chevrondown: "chevD",
  barchart: "chart",
  alerttriangle: "alert",
  up: "arrowupright",
  down: "trenddown",
};
function Icon({ name, ...rest }) {
  return <BaseIcon name={ICON_ALIAS[name] || name} {...rest} />;
}

const ICON_LABELS = {
  eye: "Ver detalhes", edit: "Editar", pencil: "Editar", trash: "Excluir",
  check: "Aprovar", x: "Reprovar", close: "Reprovar", printer: "Reimprimir nota",
  plus: "Adicionar", minus: "Diminuir",
};

const SERIES = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)",
  "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)",
];

/* ---------- status → tone ---------- */
const STATUS_GOOD = ["Aprovada", "Entregue", "Pago", "Ativa", "Ativo", "Recebido", "Concluído", "Confirmado", "Pronto para retirada", "Respondida"];
const STATUS_BAD = ["Cancelado", "Reprovada", "Estornado", "Expirado", "Inativo", "Inativa"];
const STATUS_ACCENT = ["A caminho", "Em rota"];
const STATUS_WARN = ["Pendente", "Em análise", "Aguardando", "Separando", "Agendada", "Férias", "Recebido - aguardando conferência", "Aguardando retirada na loja"];
function statusTone(raw) {
  const s = String(raw || "").trim();
  if (STATUS_GOOD.includes(s)) return "good";
  if (STATUS_BAD.some((x) => s.includes(x))) return "critical";
  if (STATUS_ACCENT.includes(s)) return "accent";
  if (STATUS_WARN.some((x) => s.includes(x))) return "warning";
  return "neutral";
}

/* ---------- overlay plumbing: escape stack + focus trap ---------- */
const _modalStack = [];
function useModalStack(open, onClose) {
  const token = useRef({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const mine = token.current;
    _modalStack.push(mine);
    const onKey = (e) => {
      if (e.key === "Escape" && _modalStack[_modalStack.length - 1] === mine) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      const i = _modalStack.indexOf(mine);
      if (i >= 0) _modalStack.splice(i, 1);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return token.current;
}
function useDialogFocus(open, ref) {
  const prev = useRef(null);
  useEffect(() => {
    if (open) {
      prev.current = document.activeElement;
      const node = ref.current;
      if (node) {
        const first = node.querySelector('input:not([type="hidden"]),select,textarea,button,[tabindex]:not([tabindex="-1"])');
        try { (first || node).focus({ preventScroll: true }); } catch { /* noop */ }
      }
    } else if (prev.current && prev.current.focus) {
      try { prev.current.focus({ preventScroll: true }); } catch { /* noop */ }
      prev.current = null;
    }
  }, [open]);
}
function trapTab(e, root) {
  if (e.key !== "Tab" || !root) return;
  const nodes = [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter((n) => n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- global confirm + toast singletons (mounted once by the shell) ---------- */
let _confirm = null;
let _toast = null;
/** Promise<boolean>. opts: { title, body, entity, danger, confirmLabel, cancelLabel, requireCheck } */
function confirmAction(opts) {
  if (!_confirm) return Promise.resolve(window.confirm((opts && opts.body) || "Confirmar?"));
  return _confirm(opts || {});
}
/** opts: { message, actionLabel, onAction, duration } */
function showToast(opts) {
  if (_toast) _toast(typeof opts === "string" ? { message: opts } : (opts || {}));
}

function ConfirmHost() {
  const [state, setState] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    _confirm = (opts) => new Promise((resolve) => { setChecked(false); setState({ opts, resolve }); });
    return () => { _confirm = null; };
  }, []);
  if (!state) return null;
  const { opts, resolve } = state;
  const done = (val) => { setState(null); resolve(val); };
  const blocked = !!opts.requireCheck && !checked;
  return (
    <Modal
      open
      onClose={() => done(false)}
      title={opts.title || "Confirmar ação"}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={() => done(false)}>{opts.cancelLabel || "Cancelar"}</button>
          <button className={"btn " + (opts.danger ? "btn-danger-solid" : "btn-primary")} disabled={blocked} onClick={() => done(true)}>
            <Icon name={opts.danger ? "trash" : "check"} size={14} />{opts.confirmLabel || "Confirmar"}
          </button>
        </>
      )}
    >
      {opts.body && <div className="confirm-body">{opts.body}</div>}
      {opts.entity && <div className="confirm-entity"><Icon name="doc" size={13} />{opts.entity}</div>}
      {opts.requireCheck && (
        <label className="confirm-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{opts.requireCheck}</span>
        </label>
      )}
    </Modal>
  );
}

function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    _toast = (opts) => {
      const id = Date.now() + Math.random();
      const entry = { id, message: opts.message || "Feito", actionLabel: opts.actionLabel, onAction: opts.onAction };
      setItems((cur) => [...cur, entry]);
      entry._timer = setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), opts.duration || 6000);
    };
    return () => { _toast = null; };
  }, []);
  const drop = (id) => setItems((cur) => cur.filter((x) => x.id !== id));
  if (!items.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-icon"><Icon name="check" size={14} /></span>
          <span>{t.message}</span>
          {t.actionLabel && (
            <button className="toast-action" onClick={() => { if (t._timer) clearTimeout(t._timer); if (t.onAction) t.onAction(); drop(t.id); }}>
              {t.actionLabel}
            </button>
          )}
          <button className="toast-close" aria-label="Dispensar" onClick={() => drop(t.id)}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------- badges / avatar ---------- */
function Badge({ tone = "neutral", children, dot = false }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="badge-dot" />}{children}</span>;
}
function StatusBadge({ status }) {
  return <Badge tone={statusTone(status)} dot>{status}</Badge>;
}
function TierBadge({ tier }) {
  return <span className={`badge tier-${String(tier || "").toLowerCase()}`}>{tier}</span>;
}
function Avatar({ initials, size = 32 }) {
  return <div className="avatar" style={{ width: size, height: size, fontSize: 0.36 * size }}>{initials}</div>;
}

/* ---------- stat card ---------- */
function StatCard({ icon, label, value, delta, deltaTone = "flat", tone = "accent" }) {
  const bg = { accent: "var(--accent-soft)", good: "var(--good-soft)", warning: "var(--warning-soft)", critical: "var(--critical-soft)" }[tone] || "var(--accent-soft)";
  const fg = { accent: "var(--accent)", good: "var(--good)", warning: "var(--warning)", critical: "var(--critical)" }[tone] || "var(--accent)";
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" style={{ background: bg, color: fg }}><Icon name={icon} size={16} /></span>
      </div>
      <div className="stat-value tnum">{value}</div>
      {delta && (
        <span className={`stat-delta ${deltaTone}`}>
          <Icon name={deltaTone === "up" ? "arrowupright" : deltaTone === "down" ? "arrowdownright" : "minus"} size={11} />
          {delta}
        </span>
      )}
    </div>
  );
}

/* ---------- misc primitives ---------- */
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="topbar-search" style={{ width: "auto", flex: 1, minWidth: 200, maxWidth: 320 }}>
      <Icon name="search" size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Buscar..."} />
    </div>
  );
}
function EmptyState({ icon = "box", title, desc }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <div className="empty-title">{title}</div>
      {desc && <div style={{ fontSize: 12, maxWidth: 320 }}>{desc}</div>}
    </div>
  );
}
function KV({ label, value }) {
  return <div className="kv"><span className="kv-label">{label}</span><span className="kv-value">{value}</span></div>;
}
function SwitchToggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={"switch " + (on ? "on" : "")} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}
function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={"tab " + (active === t.key ? "active" : "")} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
function PillNav({ options, active, onChange }) {
  return (
    <div className="pillnav">
      {options.map((o) => (
        <button key={o.key} className={active === o.key ? "active" : ""} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

/* ---------- modal / drawer ---------- */
function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  const ref = useRef(null);
  useModalStack(open, onClose);
  useDialogFocus(open, ref);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal " + (wide ? "wide" : "")} ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onKeyDown={(e) => trapTab(e, ref.current)}>
        <div className="modal-head">
          <div><h3>{title}</h3>{subtitle && <div className="card-head-sub">{subtitle}</div>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" size={15} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
function Drawer({ open, onClose, title, subtitle, children }) {
  const ref = useRef(null);
  useModalStack(open, onClose);
  useDialogFocus(open, ref);
  if (!open) return null;
  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onKeyDown={(e) => trapTab(e, ref.current)}>
        <div className="drawer-head">
          <div><h3>{title}</h3>{subtitle && <div className="card-head-sub">{subtitle}</div>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" size={15} /></button>
        </div>
        <div className="drawer-body scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}

/* ---------- forms ---------- */
function Field({ label, hint, children }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="hint">{hint}</span>}</div>;
}
const DEFAULT_ICON_CHOICES = ["pill", "activity", "boxes", "star", "box", "gift", "heart", "capsule", "tag", "grid", "leaf", "syringe", "thermometer", "drop", "shield", "truck"];
function IconPicker({ value, onChange, choices = DEFAULT_ICON_CHOICES }) {
  return (
    <div className="icon-picker scrollbar-thin">
      {choices.map((name) => (
        <button key={name} type="button" className={"icon-picker-item" + (value === name ? " active" : "")} onClick={() => onChange(name)} title={name}>
          <Icon name={name} size={16} />
        </button>
      ))}
    </div>
  );
}
function FormGrid({ fields, values, onChange, errors = [] }) {
  return (
    <div className="grid g-2">
      {fields.map((f) => {
        const invalid = errors.includes(f.key);
        const cls = "input" + (invalid ? " invalid" : "");
        let control;
        if (f.type === "select") {
          control = (
            <select className={cls} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">Selecione...</option>
              {(f.options || []).map((o) => {
                const [ov, ol] = Array.isArray(o) ? o : [o, o];
                return <option key={ov} value={ov}>{ol}</option>;
              })}
            </select>
          );
        } else if (f.type === "textarea") {
          control = <textarea className={cls} rows={3} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />;
        } else if (f.type === "switch") {
          control = <SwitchToggle on={!!values[f.key]} onChange={(v) => onChange(f.key, v)} label={f.label} />;
        } else if (f.type === "multiselect") {
          const picked = Array.isArray(values[f.key]) ? values[f.key] : [];
          const opts = (f.options || []).map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : (typeof o === "object" ? o : { value: o, label: o })));
          control = (
            <div className="icon-picker scrollbar-thin" style={{ display: "block", gridTemplateColumns: "none", maxHeight: 180 }}>
              {opts.length === 0 && <div className="cell-muted" style={{ fontSize: 12 }}>Nada disponível.</div>}
              {opts.map((o) => (
                <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 12.5, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(o.value)}
                    onChange={() => onChange(f.key, picked.includes(o.value) ? picked.filter((v) => v !== o.value) : [...picked, o.value])}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          );
        } else if (f.type === "icon") {
          control = <IconPicker value={values[f.key]} onChange={(v) => onChange(f.key, v)} choices={f.choices} />;
        } else {
          control = <input className={cls} type={f.type || "text"} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />;
        }
        return (
          <div key={f.key} style={f.full ? { gridColumn: "1 / -1" } : undefined}>
            <Field label={f.label + (f.required ? " *" : "")} hint={f.hint}>
              {control}
              {invalid && <span className="field-error">Campo obrigatório</span>}
            </Field>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- table ---------- */
function DataTable({ columns, rows, rowKey, onRowClick, renderActions, empty }) {
  if (!rows.length) {
    return <EmptyState title={empty || "Nenhum registro encontrado"} desc="Ajuste os filtros ou cadastre um novo item." />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
            {renderActions && <th style={{ width: 90 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={typeof rowKey === "function" ? rowKey(row, i) : rowKey ? row[rowKey] : i}
              className={onRowClick ? "clickable" : ""}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row, i); } } : undefined}
            >
              {columns.map((c) => <td key={c.key} className={c.mono ? "mono" : ""}>{c.render ? c.render(row, i) : row[c.key]}</td>)}
              {renderActions && <td onClick={(e) => e.stopPropagation()}><div className="row-actions">{renderActions(row, i)}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- KPI filter chip (clickable stat card) ---------- */
function KpiChip({ icon, label, value, tone, active, onClick }) {
  const fg = { good: "var(--good)", warning: "var(--warning)", critical: "var(--critical)" }[tone] || "var(--text-secondary)";
  return (
    <button
      type="button"
      className="stat-card"
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: "left", cursor: onClick ? "pointer" : "default", gap: 6,
        borderColor: active ? "var(--accent)" : "var(--border)",
        boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "var(--shadow-sm)",
      }}
    >
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" style={{ background: "var(--surface-2)", color: fg }}><Icon name={icon} size={15} /></span>
      </div>
      <div className="stat-value tnum" style={{ fontSize: 20 }}>{value}</div>
    </button>
  );
}

/* ---------- recover-discarded modal (soft-delete restore) ---------- */
function RecoverModal({ label, discarded, nameOf = (d) => d.name, onClose, onRecover }) {
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const run = async (ids) => { setBusy(true); try { await onRecover(ids); } finally { setBusy(false); } };
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Recuperar ${label} descartadas`}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Fechar</button>
          <button className="btn btn-primary" disabled={busy || !picked.size} onClick={() => run([...picked])}>
            <Icon name="check" size={14} />Recuperar selecionadas ({picked.size})
          </button>
        </>
      )}
    >
      <p className="page-desc" style={{ marginTop: 0 }}>Recupere todas de uma vez ou escolha individualmente.</p>
      <button className="btn btn-secondary" style={{ marginBottom: 12 }} disabled={busy || !discarded.length} onClick={() => run(discarded.map((d) => d.id))}>
        <Icon name="repeat" size={14} />Recuperar todas ({discarded.length})
      </button>
      {discarded.length === 0
        ? <EmptyState title="Nada descartado no momento" />
        : (
          <div className="icon-picker scrollbar-thin" style={{ display: "block", gridTemplateColumns: "none", maxHeight: 260 }}>
            {discarded.map((d) => (
              <label key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 12.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={picked.has(d.id)}
                  onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                  style={{ accentColor: "var(--accent)" }}
                />
                {nameOf(d)}
              </label>
            ))}
          </div>
        )}
    </Modal>
  );
}

/* ---------- page scaffolding ---------- */
function PageHead({ eyebrow, title, desc, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
function RowIconBtn({ name, onClick, tone, label, disabled }) {
  return (
    <button
      className="icon-btn"
      style={{ width: 28, height: 28, color: tone === "danger" ? "var(--critical)" : undefined }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label || ICON_LABELS[name] || name}
    >
      <Icon name={name} size={13} />
    </button>
  );
}

/* ---------- CrudPage: generic list + form + detail, backed by ctx callbacks ----------
   Props:
     title, eyebrow, desc, addLabel, emptyLabel, drawerTitle(row)
     columns   : [{ key, label, width?, mono?, render?(row) }]
     rows      : array from ctx
     searchKeys: which keys the search box filters on (default: column keys)
     formFields: FormGrid field descriptors; first field / {required:true} are mandatory
     toForm(row)     -> object of form values for editing (default: row)
     toPayload(form) -> object sent to onCreate/onUpdate (default: form)
     onCreate(payload) / onUpdate(row, payload) / onDelete(row)  — async; omit to hide the action
     canEdit(row) / canDelete(row) — optional predicates
     busy      — disables submit
     extra     — node rendered between PageHead and the card (filters, KPIs)
     headerActions — extra nodes next to the "add" button
*/
function CrudPage({
  eyebrow, title, desc, addLabel = "Novo", emptyLabel, drawerTitle,
  columns, rows = [], searchKeys, formFields = [],
  toForm = (r) => ({ ...r }), toPayload = (f) => f,
  onCreate, onUpdate, onDelete, canEdit, canDelete, busy = false,
  extra, headerActions,
}) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // row being edited, or null for create
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState([]);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const requiredKeys = useMemo(
    () => (formFields || []).filter((f, i) => f.required || i === 0).map((f) => f.key),
    [formFields],
  );
  const keys = searchKeys || columns.map((c) => c.key);
  const visible = query
    ? rows.filter((r) => keys.some((k) => String(r[k] ?? "").toLowerCase().includes(query.toLowerCase())))
    : rows;

  const openCreate = () => { setEditing(null); setValues({}); setErrors([]); setFormOpen(true); };
  const openEdit = (row) => { setEditing(row); setValues(toForm(row)); setErrors([]); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setErrors([]); };

  const submit = async () => {
    const missing = requiredKeys.filter((k) => {
      const v = values[k];
      return v == null || String(v).trim() === "";
    });
    if (missing.length) { setErrors(missing); return; }
    setSaving(true);
    try {
      const payload = toPayload(values);
      if (editing) await onUpdate(editing, payload);
      else await onCreate(payload);
      showToast({ message: editing ? "Registro atualizado." : "Registro criado." });
      closeForm();
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    const name = String(row[columns[0] && columns[0].key] ?? row.id ?? "este registro");
    const ok = await confirmAction({
      title: "Excluir registro",
      body: `O registro será removido de ${title.toLowerCase()}.`,
      entity: name, danger: true, confirmLabel: "Excluir",
    });
    if (!ok) return;
    try {
      await onDelete(row);
      showToast({ message: "Registro excluído." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível excluir." });
    }
  };

  const renderActions = (row) => (
    <>
      <RowIconBtn name="eye" onClick={() => setDetail(row)} />
      {onUpdate && (!canEdit || canEdit(row)) && <RowIconBtn name="edit" onClick={() => openEdit(row)} />}
      {onDelete && (!canDelete || canDelete(row)) && <RowIconBtn name="trash" tone="danger" onClick={() => remove(row)} />}
    </>
  );

  return (
    <div className="route-fade">
      <PageHead
        eyebrow={eyebrow}
        title={title}
        desc={desc}
        actions={(
          <>
            {headerActions}
            {onCreate && (
              <button className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={14} />{addLabel}
              </button>
            )}
          </>
        )}
      />
      {extra}
      <div className="card">
        <div className="card-head">
          <SearchInput value={query} onChange={setQuery} placeholder={`Buscar em ${title.toLowerCase()}...`} />
          <span className="card-head-sub">{visible.length} de {rows.length} registros</span>
        </div>
        <DataTable columns={columns} rows={visible} empty={emptyLabel} renderActions={onCreate || onUpdate || onDelete ? renderActions : undefined} />
      </div>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Editar registro" : addLabel}
        wide
        footer={(
          <>
            <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving || busy} onClick={submit}>
              <Icon name="check" size={14} />{saving ? "Salvando..." : "Salvar"}
            </button>
          </>
        )}
      >
        <FormGrid
          fields={(formFields || []).map((f, i) => (f.required || i === 0 ? { ...f, required: true } : f))}
          values={values}
          onChange={(k, v) => { setValues((prev) => ({ ...prev, [k]: v })); setErrors((prev) => prev.filter((x) => x !== k)); }}
          errors={errors}
        />
        {errors.length > 0 && <div className="field-error" style={{ marginTop: 12 }}>Preencha os campos obrigatórios (*) para salvar.</div>}
      </Modal>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail && drawerTitle ? drawerTitle(detail) : "Detalhes"}>
        {detail && columns.map((c) => (
          <KV key={c.key} label={c.label} value={c.render ? c.render(detail) : String(detail[c.key] ?? "—")} />
        ))}
      </Drawer>
    </div>
  );
}

/* ---------- charts ---------- */
function ChartData({ caption, cols, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{cols.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>
        ))}
      </tbody>
    </table>
  );
}
function ChartTooltip({ x, y, children }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-115%)", background: "var(--text-primary)", color: "var(--bg)", fontSize: 11, fontWeight: 600, padding: "6px 9px", borderRadius: 7, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5, boxShadow: "var(--shadow-md)" }}>
      {children}
    </div>
  );
}
function VBars({ data, height = 170, color = "var(--accent)", format = (v) => numfmt(v), labelEvery = 1, label = "Gráfico de barras" }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = 100 / data.length;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0] || { label: "—", value: 0 });
  return (
    <figure className="chart-fig" role="group" tabIndex={0} style={{ position: "relative" }}
      aria-label={`${label}. ${data.length} colunas; pico ${format(peak.value)} em ${peak.label}. Tabela de dados a seguir.`}>
      <svg viewBox={`0 0 ${10 * data.length} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="chart-svg" aria-hidden="true">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2={10 * data.length} y1={20 + t * (height - 40)} y2={20 + t * (height - 40)} className="chart-grid-line" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 40);
          return (
            <rect key={i} x={10 * i + 1.5} y={height - 20 - h} width={7} height={Math.max(h, 1.5)}
              fill={hover === i ? "var(--accent-hover)" : color}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />
          );
        })}
        <line x1="0" y1={height - 20} x2={10 * data.length} y2={height - 20} className="chart-axis-line" strokeWidth="1" />
      </svg>
      <div style={{ display: "flex", marginTop: 2 }} aria-hidden="true">
        {data.map((d, i) => (
          <div key={i} style={{ width: `${slot}%`, textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>{i % labelEvery === 0 ? d.label : ""}</div>
        ))}
      </div>
      {hover != null && (
        <ChartTooltip x={`${(hover + 0.5) * slot}%`} y={height - 30 - (data[hover].value / max) * (height - 40)}>
          {data[hover].label}: {format(data[hover].value)}
        </ChartTooltip>
      )}
      <ChartData caption={label} cols={["Período", "Valor"]} rows={data.map((d) => [d.label, format(d.value)])} />
    </figure>
  );
}
function AreaTrend({ data, height = 170, color = "var(--series-1)", format = (v) => numfmt(v), label = "Tendência", dayLabel = (i) => `Dia ${i + 1}` }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, height - 4 - ((v - min) / (max - min || 1)) * (height - 8)]);
  const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(2) + "," + p[1].toFixed(2)).join(" ");
  const area = line + ` L100,${height - 4} L0,${height - 4} Z`;
  const peak = data.indexOf(Math.max(...data));
  const gid = useMemo(() => "areaFill" + Math.random().toString(36).slice(2, 8), []);
  return (
    <figure className="chart-fig" role="group" tabIndex={0} style={{ position: "relative" }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        let idx = Math.round(((e.clientX - rect.left) / rect.width) * 100 / (100 / (data.length - 1)));
        idx = Math.max(0, Math.min(data.length - 1, idx));
        setHover(idx);
      }}
      onMouseLeave={() => setHover(null)}
      aria-label={`${label}. ${data.length} pontos, de ${format(data[0])} a ${format(data[data.length - 1])}; pico ${format(data[peak])} em ${dayLabel(peak)}. Tabela de dados a seguir.`}>
      <svg viewBox={`0 0 100 ${height}`} width="100%" height={height} preserveAspectRatio="none" className="chart-svg" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2="100" y1={4 + t * (height - 8)} y2={4 + t * (height - 8)} className="chart-grid-line" strokeWidth="0.3" />
        ))}
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={4} y2={height - 4} className="chart-grid-line" strokeWidth="0.4" />}
      </svg>
      <span style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: color, border: "1.5px solid var(--surface)", left: `${pts[pts.length - 1][0]}%`, top: pts[pts.length - 1][1], transform: "translate(-50%,-50%)", pointerEvents: "none" }} />
      {hover != null && (
        <ChartTooltip x={`${pts[hover][0]}%`} y={pts[hover][1]}>{dayLabel(hover)}: {format(data[hover])}</ChartTooltip>
      )}
      <ChartData caption={label} cols={["Período", "Valor"]} rows={data.map((v, i) => [dayLabel(i), format(v)])} />
    </figure>
  );
}
function HBarList({ data, labelKey = "label", valueKey = "value", format = (v) => numfmt(v), colorFor }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{d[labelKey]}</span>
            <span className="tnum" style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{format(d[valueKey])}</span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(d[valueKey] / max) * 100}%`, borderRadius: 5, background: colorFor ? colorFor(d, i) : SERIES[i % SERIES.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Heatmap({ rows, hours = ["8h", "9h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h", "19h", "20h", "21h"], label = "Picos de movimento por dia e horário" }) {
  const [hover, setHover] = useState(null);
  const all = rows.flatMap((r) => r.horas);
  const max = Math.max(...all, 1);
  let peak = { dia: "—", hora: "—", v: -1 };
  rows.forEach((r) => r.horas.forEach((v, i) => { if (v > peak.v) peak = { dia: r.dia, hora: hours[i], v }; }));
  return (
    <figure className="chart-fig" role="group" tabIndex={0} style={{ position: "relative" }}
      aria-label={`${label}. Movimento mais intenso: ${peak.dia} às ${peak.hora} com ${peak.v}. Tabela de dados a seguir.`}>
      <div style={{ display: "grid", gridTemplateColumns: `34px repeat(${hours.length}, 1fr)`, gap: 3 }} aria-hidden="true">
        <div />
        {hours.map((h) => <div key={h} style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>{h}</div>)}
        {rows.map((r, ri) => (
          <React.Fragment key={ri}>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, display: "flex", alignItems: "center" }}>{r.dia}</div>
            {r.horas.map((v, ci) => {
              const a = 0.1 + (v / max) * 0.85;
              const on = hover && hover[0] === ri && hover[1] === ci;
              return (
                <div key={ci} onMouseEnter={() => setHover([ri, ci])} onMouseLeave={() => setHover(null)}
                  style={{ aspectRatio: "1", borderRadius: 4, background: `rgba(var(--heat), ${a})`, outline: on ? "2px solid var(--accent)" : "none", cursor: "pointer" }} />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {hover && (
        <ChartTooltip x={`${34 + (hover[1] + 0.5) * (66 / hours.length)}px`} y={22 + 17 * hover[0]}>
          {rows[hover[0]].dia} · {hours[hover[1]]}: {rows[hover[0]].horas[hover[1]]}
        </ChartTooltip>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 10.5, color: "var(--text-muted)" }} aria-hidden="true">
        <span>Menos</span>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((a) => <div key={a} style={{ width: 14, height: 8, borderRadius: 2, background: `rgba(var(--heat), ${a})` }} />)}
        <span>Mais movimento</span>
      </div>
      <ChartData caption={label} cols={["Dia", ...hours]} rows={rows.map((r) => [r.dia, ...r.horas])} />
    </figure>
  );
}

export {
  Icon, ICON_LABELS, SERIES, money, numfmt, statusTone,
  confirmAction, showToast, ConfirmHost, ToastHost,
  Badge, StatusBadge, TierBadge, Avatar, StatCard,
  SearchInput, EmptyState, KV, SwitchToggle, Tabs, PillNav,
  Modal, Drawer, Field, FormGrid, IconPicker, DataTable,
  PageHead, RowIconBtn, CrudPage, KpiChip, RecoverModal,
  ChartData, ChartTooltip, VBars, AreaTrend, HBarList, Heatmap,
  useModalStack, useDialogFocus, trapTab,
};
