import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon, PageHead, Badge, SearchInput, EmptyState, Field } from "../core/internal-ui.jsx";

const ENTITY_TYPE_LABEL = { item: "Item", location: "Local" };

const ACTION_META = {
  create: { label: "Criação", icon: "plus", fg: "var(--good)", bg: "var(--good-soft)" },
  update: { label: "Edição", icon: "edit", fg: "var(--info)", bg: "var(--info-soft)" },
  status_change: { label: "Mudança de status", icon: "repeat", fg: "var(--warning)", bg: "var(--warning-soft)" },
  stock_movement: { label: "Movimentação de estoque", icon: "boxes", fg: "var(--brand)", bg: "var(--accent-soft)" },
  pdv_sale: { label: "Venda no PDV", icon: "card", fg: "var(--good)", bg: "var(--good-soft)" },
};

const FIELD_LABELS = {
  sku: "SKU", name: "Nome", brand_name: "Marca", category_name: "Categoria",
  medication_class_name: "Classe terapêutica", ean_code: "Código EAN",
  storage_location: "Local de armazenamento", batch_code: "Lote", expiry_label: "Validade",
  minimum_quantity: "Estoque base", low_stock_threshold: "Faixa baixa",
  attention_stock_threshold: "Faixa atenção", normal_stock_threshold: "Faixa normal",
  sale_price: "Preço de venda", acquisition_cost: "Custo de aquisição",
  market_reference_price: "Preço de referência", promotional_discount_percent: "Promoção",
  is_controlled: "Medicamento controlado", controlled_category: "Tipo regulatório", is_generic: "Medicamento genérico",
  is_active: "Ativo", is_marketplace_visible: "Visível no marketplace",
  marketplace_image_url: "Imagem principal", marketplace_gallery_urls: "Galeria de imagens",
  code: "Código", zone: "Zona", description: "Descrição", temperature_range: "Temperatura",
  location_type: "Tipo de local", is_controlled_only: "Somente controlados",
  quantity: "Quantidade", reason: "Motivo", reference_code: "Referência",
};

const MONEY_FIELDS = new Set(["sale_price", "acquisition_cost", "market_reference_price"]);
const BOOL_FIELDS = new Set(["is_active", "is_controlled", "is_marketplace_visible", "is_controlled_only"]);

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function formatChangeValue(field, value) {
  if (value === "" || value == null) return "—";
  if (BOOL_FIELDS.has(field)) return value === "true" ? "Sim" : "Não";
  if (MONEY_FIELDS.has(field)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? brl(numeric) : value;
  }
  if (field === "promotional_discount_percent") return value + "%";
  return value;
}

function auditDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString("pt-BR") : "Data indisponível";
}

/* FARMAURA Console — Auditoria do Estoque e Precificador (somente admin). */
function InventoryAuditScreen({ ctx }) {
  const { fetchInventoryAudit, notify } = ctx;
  const pageSize = 30;
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [actorQuery, setActorQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  const load = async (targetPage) => {
    setLoading(true);
    try {
      const result = await fetchInventoryAudit({
        page: targetPage,
        pageSize,
        entityType: entityType === "all" ? "" : entityType,
        action: action === "all" ? "" : action,
        actorQuery,
        dateFrom: dateFrom ? dateFrom + "T00:00:00" : "",
        dateTo: dateTo ? dateTo + "T23:59:59" : "",
        q,
      });
      setEntries(result.items);
      setPage(result.page);
      setTotal(result.total);
    } catch (error) {
      notify(error && error.message ? error.message : "Não foi possível carregar a auditoria.", "warn");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, action]);

  const applyFilters = () => load(1);
  const clearFilters = () => {
    setEntityType("all");
    setAction("all");
    setActorQuery("");
    setDateFrom("");
    setDateTo("");
    setQ("");
  };
  const hasFilters = entityType !== "all" || action !== "all" || !!actorQuery || !!dateFrom || !!dateTo || !!q;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Catálogo & Estoque" title="Auditoria" desc={total + " registro(s) no filtro atual"}
        actions={<SearchInput value={q} onChange={setQ} placeholder="Buscar por produto ou local" />}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 18 }}>
        <Field label="Tipo">
          <select className="input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="all">Todos</option>
            <option value="item">Item</option>
            <option value="location">Local</option>
          </select>
        </Field>
        <Field label="Ação">
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">Todas</option>
            <option value="create">Criação</option>
            <option value="update">Edição</option>
            <option value="status_change">Mudança de status</option>
            <option value="stock_movement">Movimentação de estoque</option>
            <option value="pdv_sale">Venda no PDV</option>
          </select>
        </Field>
        <Field label="Usuário">
          <input className="input" placeholder="Nome ou e-mail" value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} />
        </Field>
        <Field label="De"><input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
        <Field label="Até"><input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
        <button className="btn btn-primary btn-sm" onClick={applyFilters} disabled={loading}><Icon name="filter" size={14} />Filtrar</button>
        {hasFilters && <button className="btn btn-secondary btn-sm" onClick={clearFilters} disabled={loading}><Icon name="close" size={13} />Limpar</button>}
        <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => load(page)} disabled={loading}><Icon name="repeat" size={15} />Atualizar</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map((entry) => {
          const meta = ACTION_META[entry.action] || { label: entry.action, icon: "activity", fg: "var(--text-secondary)", bg: "var(--surface-2)" };
          return (
            <div key={entry.id} className="card card-pad">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="stat-icon" style={{ width: 36, height: 36, background: meta.bg, color: meta.fg }}><Icon name={meta.icon} size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-strong">{entry.entityLabel || "Registro removido"}</div>
                  <div className="cell-muted">{ENTITY_TYPE_LABEL[entry.entityType] || entry.entityType} · {meta.label}</div>
                </div>
                <div className="cell-muted">{auditDate(entry.createdAt)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                <Icon name="user" size={13} />
                <span style={{ fontWeight: 700 }}>{entry.actorName || "Usuário desconhecido"}</span>
                {entry.actorEmail && <span className="cell-muted">{entry.actorEmail}</span>}
                {entry.actorRole && <Badge tone="neutral">{entry.actorRole}</Badge>}
                {entry.ipAddress && <span className="mono cell-muted">IP {entry.ipAddress}</span>}
              </div>
              {entry.changes.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {entry.changes
                    .filter((change) => !(entry.action === "pdv_sale" && change.field === "reason"))
                    .map((change, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, minWidth: 140 }}>{fieldLabel(change.field)}</span>
                        <span className="cell-muted">{formatChangeValue(change.field, change.old)}</span>
                        <Icon name="arrowR" size={12} />
                        <span style={{ fontWeight: 600 }}>{formatChangeValue(change.field, change.new)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
        {!loading && !entries.length && <div className="card"><EmptyState icon="shield" title="Nenhum registro de auditoria encontrado neste filtro" /></div>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 18 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><Icon name="chevL" size={14} />Anterior</button>
          <span className="cell-muted">Página {page} de {totalPages} · {total} registro(s)</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Próxima<Icon name="chevR" size={14} /></button>
        </div>
      )}
    </div>
  );
}

export { InventoryAuditScreen };
