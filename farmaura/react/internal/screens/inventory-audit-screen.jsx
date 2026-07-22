import React, { useEffect, useState } from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryEmpty } from "./inventory-screen.jsx";

const ENTITY_TYPE_LABEL = { item: 'Item', location: 'Local' };

const ACTION_META = {
  create: { label: 'Criação', icon: 'plus', fg: 'var(--fa-success)', bg: 'var(--fa-success-soft)' },
  update: { label: 'Edição', icon: 'edit', fg: 'var(--fa-info)', bg: 'var(--fa-info-soft)' },
  status_change: { label: 'Mudança de status', icon: 'repeat', fg: 'var(--fa-warn)', bg: 'var(--fa-warn-soft)' },
  stock_movement: { label: 'Movimentação de estoque', icon: 'boxes', fg: 'var(--fa-primary)', bg: 'var(--fa-rose-soft)' },
  pdv_sale: { label: 'Venda no PDV', icon: 'card', fg: 'var(--fa-success)', bg: 'var(--fa-success-soft)' },
};

const FIELD_LABELS = {
  sku: 'SKU', name: 'Nome', brand_name: 'Marca', category_name: 'Categoria',
  medication_class_name: 'Classe terapêutica', ean_code: 'Código EAN',
  storage_location: 'Local de armazenamento', batch_code: 'Lote', expiry_label: 'Validade',
  minimum_quantity: 'Estoque base', low_stock_threshold: 'Faixa baixa',
  attention_stock_threshold: 'Faixa atenção', normal_stock_threshold: 'Faixa normal',
  sale_price: 'Preço de venda', acquisition_cost: 'Custo de aquisição',
  market_reference_price: 'Preço de referência', promotional_discount_percent: 'Promoção',
  is_controlled: 'Medicamento controlado', controlled_category: 'Tipo regulatório', is_generic: 'Medicamento genérico',
  is_active: 'Ativo', is_marketplace_visible: 'Visível no marketplace',
  marketplace_image_url: 'Imagem principal', marketplace_gallery_urls: 'Galeria de imagens',
  code: 'Código', zone: 'Zona', description: 'Descrição', temperature_range: 'Temperatura',
  location_type: 'Tipo de local', is_controlled_only: 'Somente controlados',
  quantity: 'Quantidade', reason: 'Motivo', reference_code: 'Referência',
};

const MONEY_FIELDS = new Set(['sale_price', 'acquisition_cost', 'market_reference_price']);
const BOOL_FIELDS = new Set(['is_active', 'is_controlled', 'is_marketplace_visible', 'is_controlled_only']);

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function formatChangeValue(field, value) {
  if (value === '' || value == null) return '—';
  if (BOOL_FIELDS.has(field)) return value === 'true' ? 'Sim' : 'Não';
  if (MONEY_FIELDS.has(field)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? brl(numeric) : value;
  }
  if (field === 'promotional_discount_percent') return value + '%';
  return value;
}

function auditDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('pt-BR') : 'Data indisponível';
}

/* FARMAURA Console — Auditoria do Estoque e Precificador (somente admin). */
function InventoryAuditScreen({ ctx }) {
  const { fetchInventoryAudit, notify, onLogout } = ctx;
  const pageSize = 30;
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [actorQuery, setActorQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [q, setQ] = useState('');

  const load = async (targetPage) => {
    setLoading(true);
    try {
      const result = await fetchInventoryAudit({
        page: targetPage,
        pageSize,
        entityType: entityType === 'all' ? '' : entityType,
        action: action === 'all' ? '' : action,
        actorQuery,
        dateFrom: dateFrom ? dateFrom + 'T00:00:00' : '',
        dateTo: dateTo ? dateTo + 'T23:59:59' : '',
        q,
      });
      setEntries(result.items);
      setPage(result.page);
      setTotal(result.total);
    } catch (error) {
      notify(error && error.message ? error.message : 'Não foi possível carregar a auditoria.', 'warn');
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
    setEntityType('all');
    setAction('all');
    setActorQuery('');
    setDateFrom('');
    setDateTo('');
    setQ('');
  };
  const hasFilters = entityType !== 'all' || action !== 'all' || !!actorQuery || !!dateFrom || !!dateTo || !!q;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Topbar title="Auditoria" sub={total + ' registro(s) no filtro atual'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input
            placeholder="Buscar por produto ou local"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
          />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide audit-screen">
        <div className="audit-toolbar">
          <div className="audit-filter-field">
            <label>Tipo</label>
            <select className="fa-select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="all">Todos</option>
              <option value="item">Item</option>
              <option value="location">Local</option>
            </select>
          </div>
          <div className="audit-filter-field">
            <label>Ação</label>
            <select className="fa-select" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="all">Todas</option>
              <option value="create">Criação</option>
              <option value="update">Edição</option>
              <option value="status_change">Mudança de status</option>
              <option value="stock_movement">Movimentação de estoque</option>
              <option value="pdv_sale">Venda no PDV</option>
            </select>
          </div>
          <div className="audit-filter-field">
            <label>Usuário</label>
            <input
              className="fa-input"
              placeholder="Nome ou e-mail"
              value={actorQuery}
              onChange={(e) => setActorQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
            />
          </div>
          <div className="audit-filter-field">
            <label>De</label>
            <input className="fa-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="audit-filter-field">
            <label>Até</label>
            <input className="fa-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={applyFilters} disabled={loading}>
            <Icon name="filter" size={14} />Filtrar
          </button>
          {hasFilters && (
            <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={clearFilters} disabled={loading}>
              <Icon name="close" size={13} />Limpar
            </button>
          )}
          <button className="fa-btn fa-btn-soft fa-btn-sm audit-refresh-btn" onClick={() => load(page)} disabled={loading}>
            <Icon name="repeat" size={15} />Atualizar
          </button>
        </div>

        <div className="audit-list">
          {entries.map((entry) => {
            const meta = ACTION_META[entry.action] || { label: entry.action, icon: 'activity', fg: 'var(--fa-ink-2)', bg: 'var(--fa-mist-2)' };
            return (
              <div key={entry.id} className="audit-card">
                <div className="audit-card-head">
                  <span className="fa-iconbox" style={{ width: 38, height: 38, background: meta.bg, color: meta.fg }}>
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <div className="audit-card-title">
                    <div className="audit-card-entity">{entry.entityLabel || 'Registro removido'}</div>
                    <div className="ph-cell-sub">{ENTITY_TYPE_LABEL[entry.entityType] || entry.entityType} · {meta.label}</div>
                  </div>
                  <div className="audit-card-when">{auditDate(entry.createdAt)}</div>
                </div>
                <div className="audit-card-actor">
                  <Icon name="user" size={13} />
                  <span className="audit-actor-name">{entry.actorName || 'Usuário desconhecido'}</span>
                  {entry.actorEmail && <span className="ph-cell-sub">{entry.actorEmail}</span>}
                  {entry.actorRole && <span className="fa-badge fa-badge-mist">{entry.actorRole}</span>}
                  {entry.ipAddress && <span className="fa-mono audit-actor-ip">IP {entry.ipAddress}</span>}
                </div>
                {entry.changes.length > 0 && (
                  <div className="audit-changes">
                    {entry.changes
                      .filter((change) => !(entry.action === 'pdv_sale' && change.field === 'reason'))
                      .map((change, index) => (
                      <div key={index} className="audit-change-row">
                        <span className="audit-change-field">{fieldLabel(change.field)}</span>
                        <span className="audit-change-old">{formatChangeValue(change.field, change.old)}</span>
                        <Icon name="arrowR" size={12} />
                        <span className="audit-change-new">{formatChangeValue(change.field, change.new)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && !entries.length && <InventoryEmpty icon="shield" label="Nenhum registro de auditoria encontrado neste filtro." />}
        </div>

        {totalPages > 1 && (
          <div className="audit-pagination">
            <button className="fa-btn fa-btn-soft fa-btn-sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
              <Icon name="chevL" size={14} />Anterior
            </button>
            <span className="ph-cell-sub">Página {page} de {totalPages} · {total} registro(s)</span>
            <button className="fa-btn fa-btn-soft fa-btn-sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
              Próxima<Icon name="chevR" size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export { InventoryAuditScreen };
