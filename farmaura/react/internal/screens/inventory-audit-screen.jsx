import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon, PageHead, Badge, SearchInput, PillNav, DataTable, Drawer, EmptyState } from "../core/internal-ui.jsx";

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
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async (targetPage) => {
    setLoading(true);
    try {
      const result = await fetchInventoryAudit({
        page: targetPage,
        pageSize,
        entityType: "",
        action: action === "all" ? "" : action,
        actorQuery: "",
        dateFrom: "",
        dateTo: "",
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
  }, [action, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = [
    { key: "createdAt", label: "Quando", render: (e) => auditDate(e.createdAt) },
    { key: "actorName", label: "Usuário", render: (e) => e.actorName || "Usuário desconhecido" },
    { key: "action", label: "Ação", render: (e) => {
      const meta = ACTION_META[e.action] || { label: e.action };
      return <Badge tone="neutral">{meta.label}</Badge>;
    } },
    { key: "entityLabel", label: "Entidade / registro", render: (e) => e.entityLabel || "Registro removido" },
    { key: "entityType", label: "Categoria", render: (e) => <Badge tone="neutral">{ENTITY_TYPE_LABEL[e.entityType] || e.entityType}</Badge> },
  ];

  return (
    <div className="route-fade">
      <PageHead eyebrow="Catálogo & Estoque" title="Auditoria" desc="Log de tudo que acontece no estoque e no precificador — entradas, saídas e responsáveis." />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar produto ou local..." />
          <PillNav
            options={[
              { key: "all", label: "Todos" },
              ...Object.entries(ACTION_META).map(([key, meta]) => ({ key, label: meta.label })),
            ]}
            active={action} onChange={setAction}
          />
        </div>
        <DataTable
          columns={columns}
          rows={entries}
          rowKey="id"
          onRowClick={(entry) => setSelected(entry)}
          empty={loading ? "Carregando…" : "Nenhum registro encontrado"}
        />
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 18 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}><Icon name="chevL" size={14} />Anterior</button>
          <span className="cell-muted">Página {page} de {totalPages} · {total} registro(s)</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>Próxima<Icon name="chevR" size={14} /></button>
        </div>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? (selected.entityLabel || "Registro removido") : ""} subtitle={selected ? auditDate(selected.createdAt) : ""}>
        {selected && (() => {
          const meta = ACTION_META[selected.action] || { label: selected.action, icon: "activity", fg: "var(--text-secondary)", bg: "var(--surface-2)" };
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="stat-icon" style={{ width: 36, height: 36, background: meta.bg, color: meta.fg }}><Icon name={meta.icon} size={16} /></span>
                <div>
                  <div className="cell-strong">{meta.label}</div>
                  <div className="cell-muted">{ENTITY_TYPE_LABEL[selected.entityType] || selected.entityType}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, marginBottom: 14 }}>
                <Icon name="user" size={13} />
                <span style={{ fontWeight: 700 }}>{selected.actorName || "Usuário desconhecido"}</span>
                {selected.actorEmail && <span className="cell-muted">{selected.actorEmail}</span>}
                {selected.actorRole && <Badge tone="neutral">{selected.actorRole}</Badge>}
                {selected.ipAddress && <span className="mono cell-muted">IP {selected.ipAddress}</span>}
              </div>
              {selected.changes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.changes
                    .filter((change) => !(selected.action === "pdv_sale" && change.field === "reason"))
                    .map((change, index) => (
                      <div key={index} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, minWidth: 140 }}>{fieldLabel(change.field)}</span>
                        <span className="cell-muted">{formatChangeValue(change.field, change.old)}</span>
                        <Icon name="arrowR" size={12} />
                        <span style={{ fontWeight: 600 }}>{formatChangeValue(change.field, change.new)}</span>
                      </div>
                    ))}
                </div>
              ) : <EmptyState icon="shield" title="Sem alterações de campo registradas" />}
            </>
          );
        })()}
      </Drawer>
    </div>
  );
}

export { InventoryAuditScreen };
