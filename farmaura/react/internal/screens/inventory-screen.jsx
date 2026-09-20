import React, { useEffect, useState } from "react";
import { brl } from "../../marketplace/core/marketplace-components.jsx";
import { stockState } from "../core/internal-shell.jsx";
import { Icon, PageHead, Badge, StatCard, Tabs, PillNav, EmptyState, Modal, Field, SearchInput, DataTable, Drawer } from "../core/internal-ui.jsx";

const LOCATION_TYPE_OPTIONS = [
  { value: "estoque", label: "Estoque" },
  { value: "prateleira", label: "Prateleira" },
  { value: "gondola", label: "Gôndola" },
  { value: "caixa", label: "Caixa" },
  { value: "outro", label: "Outro" },
];
const LOCATION_TYPE_LABEL = Object.fromEntries(LOCATION_TYPE_OPTIONS.map((option) => [option.value, option.label]));

const LOT_STATUS_OPTIONS = [
  { value: "available", label: "Disponível", tone: "good" },
  { value: "reserved", label: "Reservado", tone: "neutral" },
  { value: "quarantine", label: "Quarentena", tone: "warning" },
  { value: "expired", label: "Vencido", tone: "critical" },
  { value: "written_off", label: "Baixado", tone: "neutral" },
];
const LOT_STATUS_LABEL = Object.fromEntries(LOT_STATUS_OPTIONS.map((option) => [option.value, option]));

function lotStatusBadge(statusValue) {
  const meta = LOT_STATUS_LABEL[statusValue] || { label: statusValue || "—", tone: "neutral" };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function isExpiringSoonIso(isoDate) {
  if (!isoDate) return false;
  const expiryDate = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(expiryDate.getTime())) return false;
  const diff = expiryDate.getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
}

function isExpiringSoon(expiry) {
  if (!expiry || expiry === "—") return false;
  const match = /^(\d{2})\/(\d{4})$/.exec(expiry);
  if (!match) return false;
  const month = Number(match[1]);
  const year = Number(match[2]);
  const expiryDate = new Date(year, month, 0);
  const diff = expiryDate.getTime() - Date.now();
  return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 120;
}

function formatIsoDate(isoDate) {
  if (!isoDate) return "—";
  const parsed = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("pt-BR");
}

/* identidade do produto ignorando lote/local — mesmo EAN, ou mesmo nome+marca, agrupam junto */
function productGroupKey(item) {
  const ean = (item.ean || "").trim();
  if (ean) return "ean:" + ean;
  return "name:" + (item.name || "").trim().toLowerCase() + "|" + (item.brand || "").trim().toLowerCase();
}
function productGroupLabel(item) {
  return (item.name || "Produto") + (item.brand ? " · " + item.brand : "");
}

/* Checkbox de rótulo (mesmo padrão usado em quotes-screen.jsx) */
function CheckLabel({ on, onClick, children, style }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", ...style }} onClick={onClick}>
      <span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: on ? "var(--accent)" : "transparent", borderColor: on ? "var(--accent)" : "var(--border-strong)", color: "#fff" }}>
        {on && <Icon name="check" size={12} />}
      </span>
      {children}
    </label>
  );
}

/* Divide modais extensos em blocos com nome (usado só nesta tela). */
function FormSection({ icon, title, actions, children }) {
  return (
    <div style={{ marginTop: 18, marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={14} style={{ color: "var(--info)" }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{title}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}

/* FARMAURA Console — Estoque operacional conectado ao backend. */
function InventoryScreen({ ctx }) {
  const {
    inventory,
    products,
    inventoryLocations,
    inventoryMovements,
    inventorySummary,
    inventoryBusy,
    refreshInventory,
    adjustStock,
    addInventory,
    updateInventory,
    addInventoryLocation,
    transferInventory,
    exportInventory,
    previewInventoryInvoice,
    confirmInventoryInvoice,
    stockLots,
    receiveLot,
    transferLot,
    adjustLot,
    suppliers,
    stores,
    notify,
  } = ctx;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("items");
  const [locationCode, setLocationCode] = useState("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState("all");
  const [lotStatusFilter, setLotStatusFilter] = useState("all");
  const [medicationClass, setMedicationClass] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [movementItem, setMovementItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [transferItem, setTransferItem] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [lotReceiptOpen, setLotReceiptOpen] = useState(false);
  const [lotTransferTarget, setLotTransferTarget] = useState(null);
  const [lotAdjustTarget, setLotAdjustTarget] = useState(null);
  // "Por produto" agora é o padrão: como o mesmo produto passou a ser compartilhado entre
  // lojas (só a quantidade/local/lote continuam por loja), listar "por categoria" fazia o
  // mesmo produto aparecer em duas linhas soltas e parecer duplicado.
  const [groupBy, setGroupBy] = useState("product"); // category | product — agrupa por classe ou pelo produto (ignorando o lote)
  const [selectedProductKey, setSelectedProductKey] = useState(null);
  const storeNameById = Object.fromEntries((stores || []).map((store) => [store.id, store.name]));
  const hasMultipleStores = new Set((inventory || []).map((item) => item.storeId).filter(Boolean)).size > 1;
  const summary = inventorySummary || {
    total_items: 0,
    normal_stock_items: 0,
    attention_stock_items: 0,
    low_stock_items: 0,
    out_of_stock_items: 0,
    controlled_items: 0,
  };
  const medicationClasses = [...new Set(inventory.map((item) => item.medClass || "Geral"))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const categoryOptions = [...new Set(inventory.map((item) => item.cat || "Medicamentos"))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const brandOptions = [...new Set(inventory.map((item) => (item.brand || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const locationsByCode = Object.fromEntries(inventoryLocations.map((location) => [location.code, location]));
  const lotsByItemId = stockLots.reduce((groups, lot) => {
    if (!groups[lot.itemId]) groups[lot.itemId] = [];
    groups[lot.itemId].push(lot);
    return groups;
  }, {});

  const applyExtraLocations = async (itemId, extraLocations) => {
    for (const row of extraLocations || []) {
      const location = locationsByCode[row.locationCode];
      if (!location) continue;
      await receiveLot({
        inventoryItemId: itemId,
        locationId: location.id,
        batchCode: row.batchCode,
        expiryDate: row.expiryDate || null,
        quantity: Number(row.quantity || 0),
      });
    }
  };

  const matchItem = (item) => {
    const state = stockState(item).key;
    if (filter === "normal" && state !== "normal" && state !== "attention") return false;
    if (filter === "low" && state !== "low" && state !== "out") return false;
    if (filter === "near_expiry") {
      const itemLotsForExpiry = lotsByItemId[item.id] || [];
      const hasNearExpiry = itemLotsForExpiry.length ? itemLotsForExpiry.some((lot) => isExpiringSoonIso(lot.expiry)) : isExpiringSoon(item.expiry);
      if (!hasNearExpiry) return false;
    }
    const itemLots = lotsByItemId[item.id] || [];
    const itemLocationCodes = itemLots.length ? itemLots.map((lot) => lot.locationCode) : [item.loc];
    const itemLocationTypes = itemLots.length ? itemLots.map((lot) => lot.locationType) : [(locationsByCode[item.loc] || {}).locationType];
    if (locationCode !== "all" && !itemLocationCodes.includes(locationCode)) return false;
    if (locationTypeFilter !== "all" && !itemLocationTypes.includes(locationTypeFilter)) return false;
    if (medicationClass !== "all" && (item.medClass || "Geral") !== medicationClass) return false;
    if (brandFilter !== "all" && (item.brand || "").trim() !== brandFilter) return false;
    if (q) {
      const haystack = (item.name + item.brand + item.ean + item.sku + item.loc + itemLocationCodes.join(" ") + item.cat + item.medClass).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  };

  const matchLot = (lot) => {
    const item = inventory.find((entry) => entry.id === lot.itemId);
    if (locationTypeFilter !== "all" && lot.locationType !== locationTypeFilter) return false;
    if (lotStatusFilter !== "all" && lot.status !== lotStatusFilter) return false;
    if (locationCode !== "all" && lot.locationCode !== locationCode) return false;
    if (brandFilter !== "all" && (item ? (item.brand || "").trim() : "") !== brandFilter) return false;
    if (q) {
      const haystack = ((item ? item.name : "") + lot.batch + lot.locationCode + lot.locationName + lot.supplierName).toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  };
  const lotRows = stockLots.filter(matchLot).slice().sort((left, right) => {
    const leftExpiry = left.expiry || "9999-99-99";
    const rightExpiry = right.expiry || "9999-99-99";
    return leftExpiry.localeCompare(rightExpiry);
  });

  const rows = inventory.filter(matchItem).slice().sort((left, right) => {
    if (groupBy === "product") {
      const productCompare = productGroupLabel(left).localeCompare(productGroupLabel(right), "pt-BR");
      if (productCompare !== 0) return productCompare;
      return (left.batch || "").localeCompare(right.batch || "", "pt-BR");
    }
    const categoryCompare = (left.cat || "Medicamentos").localeCompare(right.cat || "Medicamentos", "pt-BR");
    if (categoryCompare !== 0) return categoryCompare;
    const classCompare = (left.medClass || "Geral").localeCompare(right.medClass || "Geral", "pt-BR");
    if (classCompare !== 0) return classCompare;
    return (left.name || "").localeCompare(right.name || "", "pt-BR");
  });
  const groupedRows = rows.reduce((groups, item) => {
    const key = groupBy === "product" ? productGroupKey(item) : (item.cat || "Medicamentos");
    const label = groupBy === "product" ? productGroupLabel(item) : (item.cat || "Medicamentos");
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(item);
    return groups;
  }, {});
  const groupedEntries = Object.entries(groupedRows);

  /* Uma linha por produto (soma as quantidades entre lotes/locais) — visão padrão da tela,
     equivalente à tabela plana do artifact "Farmaura Operações". O detalhe por lote/local
     continua real e completo, só que fica no drawer ao clicar na linha, em vez de sempre
     expandido — nenhum dado de lote é descartado, só deixa de ficar sempre visível. */
  const productSummaryRows = groupedEntries.map(([key, group]) => {
    const items = group.items;
    const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
    const primary = items[0];
    const itemLots = items.flatMap((item) => lotsByItemId[item.id] || []);
    const locationCodes = [...new Set(itemLots.length ? itemLots.map((lot) => lot.locationCode) : items.map((item) => item.loc))];
    const expiries = (itemLots.length ? itemLots.map((lot) => lot.expiry) : items.map((item) => item.expiry)).filter(Boolean).sort();
    return {
      key, label: group.label, items,
      totalQty, locationCodes,
      nearestExpiry: expiries[0] || null,
      min: primary.min || primary.lowThreshold || 0,
      state: stockState({ ...primary, qty: totalQty }),
    };
  });

  const movementRows = inventoryMovements.filter((movement) => {
    if (q && !(movement.itemName + movement.reason + movement.reference + movement.from + movement.to).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const locationRows = inventoryLocations.filter((location) => {
    if (q && !(location.code + location.name + location.zone + location.description).toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "controlled" && !location.controlledOnly) return false;
    return true;
  });

  const handleExport = async () => {
    try {
      await exportInventory({
        query: q,
        stockStatus: filter === "controlled" ? "all" : filter,
        controlledOnly: filter === "controlled",
        locationCode: locationCode === "all" ? "" : locationCode,
        medicationClassName: medicationClass === "all" ? "" : medicationClass,
      });
    } catch (error) {
      notify(error && error.message ? error.message : "Não foi possível exportar o estoque.", "warn");
    }
  };

  return (
    <div className="route-fade" data-screen-label="Estoque">
      <PageHead
        eyebrow="Catálogo & Estoque" title="Estoque"
        desc={summary.total_items + " SKUs · " + summary.attention_stock_items + " em atenção · " + summary.low_stock_items + " baixos · " + summary.out_of_stock_items + " esgotados"}
        actions={<SearchInput value={q} onChange={setQ} placeholder="Buscar por nome, EAN, SKU, classe, categoria ou local" />}
      />

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <StatCard icon="dollar" label="Valor total em estoque" value={brl(inventory.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.qty || 0), 0))} tone="accent" />
        <StatCard icon="alerttriangle" label="Abaixo do mínimo" value={summary.low_stock_items + summary.out_of_stock_items} tone="critical" />
        <StatCard icon="calendar" label="Próximos do vencimento (60d)" value={stockLots.filter((lot) => isExpiringSoonIso(lot.expiry)).length} tone="warning" />
      </div>

      <Tabs
        tabs={[
          { key: "all", label: "Todos", count: summary.total_items },
          { key: "low", label: "Estoque baixo", count: summary.low_stock_items + summary.out_of_stock_items },
          { key: "near_expiry", label: "Perto do vencimento", count: stockLots.filter((lot) => isExpiringSoonIso(lot.expiry)).length },
          { key: "normal", label: "Estoque normal", count: summary.normal_stock_items + summary.attention_stock_items },
        ]}
        active={filter} onChange={setFilter}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 14, flexWrap: "wrap" }}>
        <PillNav
          options={[{ key: "items", label: "Itens" }, { key: "lots", label: "Lotes por local" }, { key: "movements", label: "Movimentações" }, { key: "locations", label: "Armazenamentos" }]}
          active={view} onChange={setView}
        />
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={refreshInventory} disabled={inventoryBusy}><Icon name="repeat" size={15} />Atualizar</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={inventoryBusy}><Icon name="download" size={15} />Exportar CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setInvoiceOpen(true)} disabled={!inventoryLocations.length}><Icon name="scan" size={15} />Ler nota com IA</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setLocationOpen(true)}><Icon name="box" size={15} />Novo local</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setLotReceiptOpen(true)} disabled={!inventoryLocations.length || !inventory.length}><Icon name="boxes" size={15} />Receber mercadoria</button>
          <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)} disabled={!inventoryLocations.length}><Icon name="plus" size={15} />Novo item</button>
        </div>
      </div>

      {view === "lots" && (
        <div className="card">
          <div className="card-head">
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Lotes por local</div>
              <div className="card-head-sub">{lotRows.length} lote(s) neste filtro</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Produto</th><th>Lote</th><th>Validade</th><th>Local</th><th>Quantidade</th><th>Status</th><th>Fornecedor</th><th></th></tr>
              </thead>
              <tbody>
                {lotRows.map((lot) => {
                  const item = inventory.find((entry) => entry.id === lot.itemId);
                  return (
                    <tr key={lot.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span className="stat-icon" style={{ width: 30, height: 30, flex: "none" }}><Icon name={item && item.controlled ? "lock" : "pill"} size={15} /></span>
                          <div style={{ minWidth: 0 }}>
                            <div className="cell-strong" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {item ? item.name : "Item removido"}
                              {item && item.controlled && <Badge tone="critical"><Icon name="lock" size={10} />Tarja</Badge>}
                            </div>
                            <div className="cell-muted">{item ? item.brand : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{lot.batch || "—"}</td>
                      <td style={isExpiringSoonIso(lot.expiry) ? { color: "var(--warning)", fontWeight: 700 } : undefined}>{formatIsoDate(lot.expiry)}</td>
                      <td>
                        <span className="mono">{lot.locationCode}</span>
                        <div className="cell-muted">{lot.locationName} · {LOCATION_TYPE_LABEL[lot.locationType] || lot.locationType}</div>
                      </td>
                      <td style={{ fontWeight: 800 }}>{lot.qty} <span className="cell-muted" style={{ fontWeight: 600, fontSize: 12 }}>un</span></td>
                      <td>{lotStatusBadge(lot.status)}</td>
                      <td>{lot.supplierName || "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setLotTransferTarget(lot)}><Icon name="route" size={14} />Transferir</button>
                          <button className="icon-btn" onClick={() => setLotAdjustTarget(lot)} aria-label="Ajustar lote" title="Ajustar lote"><Icon name="edit" size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lotRows.length && <EmptyState icon="boxes" title="Nenhum lote encontrado neste filtro" />}
          </div>
        </div>
      )}

      {view === "items" && (
        <div className="card">
          <DataTable
            columns={[
              { key: "label", label: "Produto" },
              { key: "locationCodes", label: "Localização", mono: true, render: (row) => row.locationCodes.join(", ") || "—" },
              { key: "totalQty", label: "Estoque", render: (row) => row.totalQty + " " + (row.items[0].unit || "un") },
              { key: "min", label: "Mínimo", render: (row) => row.min + " " + (row.items[0].unit || "un") },
              { key: "state", label: "Nível", render: (row) => <Badge tone={row.state.key === "low" || row.state.key === "out" ? "critical" : row.state.key === "attention" ? "warning" : "good"}>{row.state.label}</Badge> },
              { key: "nearestExpiry", label: "Vencimento", render: (row) => row.nearestExpiry ? <span style={isExpiringSoonIso(row.nearestExpiry) ? { color: "var(--warning)", fontWeight: 700 } : undefined}>{formatIsoDate(row.nearestExpiry)}</span> : <span className="cell-muted">—</span> },
            ]}
            rows={productSummaryRows}
            rowKey="key"
            onRowClick={(row) => setSelectedProductKey(row.key)}
            empty="Nenhum item encontrado neste filtro"
          />
        </div>
      )}

      <Drawer
        open={!!selectedProductKey}
        onClose={() => setSelectedProductKey(null)}
        title={selectedProductKey ? (groupedRows[selectedProductKey] || {}).label : ""}
        subtitle={selectedProductKey ? `${(groupedRows[selectedProductKey] || { items: [] }).items.length} lote(s)` : ""}
      >
        {selectedProductKey && (groupedRows[selectedProductKey] || { items: [] }).items.map((item) => {
          const itemLots = (lotsByItemId[item.id] || []).filter((lot) => lot.qty > 0);
          return (
            <div key={item.id} className="card card-pad" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="stat-icon" style={{ width: 32, height: 32, flex: "none" }}><Icon name={item.controlled ? "lock" : "pill"} size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-strong">{item.medClass || "Geral"}{item.controlled && <Badge tone="critical" style={{ marginLeft: 6 }}>Tarja</Badge>}</div>
                  {hasMultipleStores && storeNameById[item.storeId] && <div className="cell-muted">{storeNameById[item.storeId]}</div>}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(item)}><Icon name="edit" size={13} />Editar</button>
                  <button className="icon-btn" onClick={() => setMovementItem(item)} aria-label="Movimentar item" title="Movimentar item"><Icon name="boxes" size={15} /></button>
                  <button className="icon-btn" onClick={() => setTransferItem(item)} aria-label="Transferir item" title="Transferir item"><Icon name="route" size={15} /></button>
                </div>
              </div>
              {(itemLots.length ? itemLots : [{ id: item.id, locationCode: item.loc, batch: item.batch, expiry: item.expiry, qty: item.qty }]).map((lot) => (
                <div key={lot.id} className="kv">
                  <span className="kv-label mono">{lot.locationCode} · lote {lot.batch || "—"}</span>
                  <span className="kv-value">{lot.qty} un · vence {formatIsoDate(lot.expiry)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </Drawer>

      {view === "movements" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {movementRows.map((movement) => {
            const isTransfer = movement.type === "transfer";
            const isPositive = movement.delta >= 0;
            const tone = isTransfer ? "info" : isPositive ? "good" : "warning";
            const toneVar = isTransfer ? "var(--info)" : isPositive ? "var(--good)" : "var(--warning)";
            return (
              <div key={movement.id} className="card card-pad" style={{ borderLeft: "3px solid " + toneVar }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span className="stat-icon" style={{ width: 36, height: 36, background: tone === "info" ? "var(--info-soft)" : tone === "good" ? "var(--good-soft)" : "var(--warning-soft)", color: toneVar }}>
                    <Icon name={isTransfer ? "route" : isPositive ? "plus" : "minus"} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-strong" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movement.itemName}</div>
                    <div className="cell-muted">{inventoryMovementLabel(movement.type)} · {movement.reason}</div>
                  </div>
                  <Badge tone={tone}>{movement.delta > 0 ? "+" : ""}{movement.delta}</Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12.5 }}>
                  <div className="kv"><span className="kv-label">Antes</span><span className="kv-value mono">{movement.before}</span></div>
                  <div className="kv"><span className="kv-label">Depois</span><span className="kv-value mono">{movement.after}</span></div>
                  <div className="kv"><span className="kv-label">Origem</span><span className="kv-value mono">{movement.from || "—"}</span></div>
                  <div className="kv"><span className="kv-label">Destino</span><span className="kv-value mono">{movement.to || "—"}</span></div>
                  <div className="kv"><span className="kv-label">Referência</span><span className="kv-value mono">{movement.reference || "—"}</span></div>
                  <div className="kv"><span className="kv-label">Quando</span><span className="kv-value">{inventoryMovementDate(movement.createdAt)}</span></div>
                </div>
                {movement.note && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 13.5 }}>{movement.note}</div>}
              </div>
            );
          })}
          {!movementRows.length && <div className="card"><EmptyState icon="activity" title="Nenhuma movimentação encontrada" /></div>}
        </div>
      )}

      {view === "locations" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {locationRows.map((location) => (
            <div key={location.id} className="card card-pad" style={{ borderLeft: "3px solid " + (location.controlledOnly ? "var(--brand)" : "var(--border-strong)") }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span className="stat-icon" style={{ width: 36, height: 36 }}><Icon name={location.controlledOnly ? "lock" : "box"} size={16} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-strong">{location.code} · {location.name}</div>
                  <div className="cell-muted">{location.zone || "Sem zona"} · {location.controlledOnly ? "Somente controlados" : "Uso geral"}</div>
                </div>
                <Badge tone="neutral">{LOCATION_TYPE_LABEL[location.locationType] || location.locationType}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12.5 }}>
                <div className="kv"><span className="kv-label">Itens alocados</span><span className="kv-value">{location.allocatedItems}</span></div>
                <div className="kv"><span className="kv-label">Temperatura</span><span className="kv-value">{location.temperatureRange || "Ambiente"}</span></div>
              </div>
              <div className="cell-muted" style={{ marginTop: 10 }}>{location.description || "Sem descrição operacional."}</div>
            </div>
          ))}
          {!locationRows.length && <div className="card"><EmptyState icon="box" title="Nenhum local de armazenamento encontrado" /></div>}
        </div>
      )}

      {movementItem && (
        <StockMovementModal
          key={movementItem.id + ":" + (lotsByItemId[movementItem.id] || []).filter((lot) => lot.qty > 0).map((lot) => lot.id + "-" + lot.qty).join("|")}
          item={movementItem}
          locations={inventoryLocations}
          lots={(lotsByItemId[movementItem.id] || []).filter((lot) => lot.qty > 0)}
          notify={notify}
          onClose={() => setMovementItem(null)}
          onSave={async (payload) => {
            await adjustStock(movementItem.id, payload, movementItem.storeId);
            setMovementItem(null);
          }}
          onTransferLot={(lot) => { setMovementItem(null); setLotTransferTarget(lot); }}
          onAdjustLot={(lot) => { setMovementItem(null); setLotAdjustTarget(lot); }}
          onQuickEntry={async (payload) => {
            await receiveLot({ inventoryItemId: movementItem.id, storeId: movementItem.storeId, ...payload });
            setMovementItem(null);
          }}
          onQuickAdjust={async (lotId, payload, storeId) => {
            await adjustLot(lotId, payload, storeId);
            setMovementItem(null);
          }}
        />
      )}
      {editItem && (
        <InventoryItemModal
          mode="edit"
          title="Editar medicamento"
          submitLabel="Salvar alterações"
          products={products}
          locations={inventoryLocations}
          initialItem={editItem}
          stockLots={stockLots}
          onClose={() => setEditItem(null)}
          onSave={async (payload) => {
            try {
              await updateInventory(editItem.id, payload);
              await applyExtraLocations(editItem.id, payload.extraLocations);
              setEditItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível atualizar o medicamento.", "warn");
            }
          }}
        />
      )}
      {transferItem && (
        <TransferInventoryModal
          item={transferItem}
          locations={inventoryLocations}
          lots={(lotsByItemId[transferItem.id] || []).filter((lot) => lot.qty > 0)}
          onClose={() => setTransferItem(null)}
          onSave={async (payload) => {
            try {
              await transferInventory(transferItem.id, payload);
              setTransferItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível transferir o item.", "warn");
            }
          }}
          onTransferLot={async (lotId, payload) => {
            try {
              await transferLot(lotId, payload);
              setTransferItem(null);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível transferir o lote.", "warn");
            }
          }}
        />
      )}
      {newOpen && (
        <InventoryItemModal
          mode="create"
          title="Novo item de estoque"
          submitLabel="Cadastrar item"
          products={products}
          locations={inventoryLocations}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              const created = await addInventory(payload);
              if (created && created.id) {
                await applyExtraLocations(created.id, payload.extraLocations);
              }
              setNewOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível cadastrar o item.", "warn");
            }
          }}
        />
      )}
      {locationOpen && (
        <LocationModal
          onClose={() => setLocationOpen(false)}
          onSave={async (payload) => {
            try {
              await addInventoryLocation(payload);
              setLocationOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível cadastrar o local.", "warn");
            }
          }}
        />
      )}
      {invoiceOpen && (
        <InvoiceImportModal
          inventory={inventory}
          locations={inventoryLocations}
          categoryOptions={categoryOptions}
          onClose={() => setInvoiceOpen(false)}
          onPreview={previewInventoryInvoice}
          onConfirm={confirmInventoryInvoice}
          notify={notify}
        />
      )}
      {lotReceiptOpen && (
        <LotReceiptModal
          inventory={inventory}
          locations={inventoryLocations}
          suppliers={suppliers || []}
          onClose={() => setLotReceiptOpen(false)}
          onSave={async (payload) => {
            try {
              await receiveLot(payload);
              setLotReceiptOpen(false);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível registrar o recebimento.", "warn");
            }
          }}
        />
      )}
      {lotTransferTarget && (
        <LotTransferModal
          lot={lotTransferTarget}
          locations={inventoryLocations}
          onClose={() => setLotTransferTarget(null)}
          onSave={async (payload) => {
            try {
              await transferLot(lotTransferTarget.id, { ...payload, storeId: lotTransferTarget.storeId });
              setLotTransferTarget(null);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível transferir o lote.", "warn");
            }
          }}
        />
      )}
      {lotAdjustTarget && (
        <LotAdjustmentModal
          lot={lotAdjustTarget}
          onClose={() => setLotAdjustTarget(null)}
          onSave={async (payload) => {
            try {
              await adjustLot(lotAdjustTarget.id, payload, lotAdjustTarget.storeId);
              setLotAdjustTarget(null);
            } catch (error) {
              notify(error && error.message ? error.message : "Não foi possível ajustar o lote.", "warn");
            }
          }}
        />
      )}
    </div>
  );
}

function InventoryItemModal({ mode, title, submitLabel, products, locations, initialItem, stockLots, onClose, onSave }) {
  const productOptions = (products || []).filter((product) => product.active).slice().sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));
  const [productId, setProductId] = useState("");
  const selectedProduct = mode === "create" ? productOptions.find((product) => product.id === productId) : null;
  const [form, setForm] = useState(() => buildInventoryItemForm({ item: initialItem, locations }));
  const [locationRows, setLocationRows] = useState(() => (
    mode === "create"
      ? [{ key: Date.now() + "-" + Math.random(), locationCode: locations[0] ? locations[0].code : "", quantity: 1, batchCode: "", expiryDate: "" }]
      : []
  ));
  const addLocationRow = () => {
    setLocationRows((prev) => [...prev, {
      key: Date.now() + "-" + Math.random(),
      locationCode: locations[0] ? locations[0].code : "",
      quantity: 1,
      batchCode: "",
      expiryDate: "",
    }]);
  };
  const updateLocationRow = (index, key, value) => {
    setLocationRows((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };
  const removeLocationRow = (index) => {
    setLocationRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  useEffect(() => {
    if (mode === "edit") {
      setForm(buildInventoryItemForm({ item: initialItem, locations }));
      return;
    }
    if (!selectedProduct) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      loc: prev.loc || (locations[0] ? locations[0].code : ""),
      qty: 0,
    }));
  }, [mode, productId, initialItem, locations]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const thresholdsValid = Number(form.lowThreshold || 0) <= Number(form.attentionThreshold || 0) && Number(form.attentionThreshold || 0) <= Number(form.normalThreshold || 0);
  const validLocationRows = locationRows.filter((row) => row.locationCode && Number(row.quantity) > 0 && row.batchCode.trim());
  const primaryRow = validLocationRows[0];
  const rowsValid = mode === "create" ? !!primaryRow : true;
  const priceValid = mode === "create" ? Number(form.price || 0) > 0 : true;
  const productValid = mode === "create" ? !!productId : true;
  const valid = productValid && thresholdsValid && rowsValid && priceValid;
  const itemLots = mode === "edit" && initialItem
    ? (stockLots || []).filter((lot) => lot.itemId === initialItem.id && lot.qty > 0).slice().sort((left, right) => right.qty - left.qty)
    : [];

  return (
    <Modal
      open onClose={onClose} title={title} wide
      subtitle={mode === "edit" ? "Ajuste localização, lote, validade, faixas de estoque e preço deste item nesta loja." : "Selecione um produto já cadastrado e informe onde e quanto desse produto entra no estoque desta loja."}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid} onClick={() => onSave({
            ...form,
            productId,
            loc: mode === "create" && primaryRow ? primaryRow.locationCode : form.loc,
            qty: mode === "create" ? 0 : form.qty,
            extraLocations: validLocationRows,
          })}><Icon name="check" size={16} />{submitLabel}</button>
        </>
      )}
    >
      {mode === "edit" && (
        <FormSection icon="map" title="Localizações atuais deste medicamento">
          {itemLots.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {itemLots.map((lot) => (
                <div key={lot.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono">{lot.locationCode}</span>
                  <span className="cell-muted">{lot.locationName} · lote {lot.batch || "—"} · {lot.qty} un</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cell-muted">Nenhum lote individual registrado ainda — este item usa apenas o local único do cadastro abaixo. Use "Receber mercadoria" para começar a rastrear por lote e local.</div>
          )}
        </FormSection>
      )}
      {mode === "create" && (
        <FormSection icon="capsule" title="Produto *">
          <Field label="Selecione o produto cadastrado">
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Selecione um produto</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>{product.name} · {product.sku} · {product.brandName || "Sem marca"}</option>
              ))}
            </select>
          </Field>
          {!productOptions.length && (
            <div className="cell-muted" style={{ marginTop: 8 }}>Nenhum produto cadastrado ainda. Cadastre o produto na tela <strong>Produtos</strong> antes de lançar o estoque.</div>
          )}
        </FormSection>
      )}
      {(selectedProduct || (mode === "edit" && initialItem)) && (
        <FormSection icon="tag" title="Identificação do produto">
          <div className="cell-muted">
            <strong>{(selectedProduct || initialItem).name}</strong> · SKU {(selectedProduct || initialItem).sku} · {(selectedProduct ? selectedProduct.brandName : initialItem.brand) || "Sem marca"}<br />
            {(selectedProduct ? selectedProduct.categoryName : initialItem.cat) || "Sem categoria"} · {(selectedProduct ? selectedProduct.medicationClassName : initialItem.medClass) || "Sem classe"} · EAN {(selectedProduct ? selectedProduct.eanCode : initialItem.ean) || "—"}
            {(selectedProduct ? selectedProduct.isControlled : initialItem.controlled) ? " · Controlado" : ""}
            {(selectedProduct ? selectedProduct.isGeneric : initialItem.isGeneric) ? " · Genérico" : ""}
          </div>
          {mode === "edit" && <div className="cell-muted" style={{ marginTop: 6 }}>Para alterar nome, marca, categoria, classe terapêutica ou imagens deste produto, use a tela <strong>Produtos</strong>.</div>}
        </FormSection>
      )}
      <FormSection icon="gauge" title="Faixas de estoque">
        <div className="grid g-2">
          <Field label="Estoque base"><input className="input" type="number" value={form.min} onChange={(e) => set("min", Number(e.target.value || 0))} /></Field>
          <Field label="Faixa baixa"><input className="input" type="number" value={form.lowThreshold} onChange={(e) => set("lowThreshold", Number(e.target.value || 0))} /></Field>
          <Field label="Faixa atenção"><input className="input" type="number" value={form.attentionThreshold} onChange={(e) => set("attentionThreshold", Number(e.target.value || 0))} /></Field>
          <Field label="Faixa normal"><input className="input" type="number" value={form.normalThreshold} onChange={(e) => set("normalThreshold", Number(e.target.value || 0))} /></Field>
          <div style={{ gridColumn: "1 / -1" }}><Field label="Observação operacional"><input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} /></Field></div>
        </div>
        {!thresholdsValid && <div className="card card-pad" style={{ marginTop: 12, background: "var(--critical-soft)", color: "var(--critical)", fontWeight: 700 }}>A faixa baixa deve ser menor ou igual à faixa de atenção, que deve ser menor ou igual à faixa normal.</div>}
        {mode === "edit" && <p className="cell-muted" style={{ marginTop: 12 }}>Preço, custo, preço de referência e promoção são definidos na tela <strong>Precificador</strong>.</p>}
      </FormSection>
      {mode === "create" && (
        <FormSection icon="tag" title="Preço de venda">
          <div className="grid g-2">
            <Field label="Preço (R$) *"><input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => set("price", Number(e.target.value || 0))} /></Field>
          </div>
          <p className="cell-muted" style={{ marginTop: 12 }}>Custo, preço de referência e promoção são definidos depois na tela <strong>Precificador</strong>.</p>
        </FormSection>
      )}
      <FormSection
        icon="map"
        title={"Localizações e quantidades" + (mode === "create" ? " *" : "")}
        actions={<button type="button" className="btn btn-secondary btn-sm" onClick={addLocationRow}><Icon name="plus" size={13} />Adicionar localização</button>}
      >
        <div className="cell-muted" style={{ marginBottom: 10 }}>{mode === "create" ? "Defina em quais locais o estoque inicial deste medicamento fica, e a quantidade em cada um." : "Adicione estoque deste medicamento em um ou mais locais (recebimento por lote)."}</div>
        {locationRows.map((row, index) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1fr 0.9fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
            <Field label="Local"><select className="input" value={row.locationCode} onChange={(e) => updateLocationRow(index, "locationCode", e.target.value)}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></Field>
            <Field label="Quantidade"><input className="input" type="number" min="1" value={row.quantity} onChange={(e) => updateLocationRow(index, "quantity", Number(e.target.value || 0))} /></Field>
            <Field label="Lote *"><input className="input" value={row.batchCode} onChange={(e) => updateLocationRow(index, "batchCode", e.target.value)} placeholder="Ex.: LOT-2026-001" /></Field>
            <Field label="Validade"><input className="input" type="date" value={row.expiryDate} onChange={(e) => updateLocationRow(index, "expiryDate", e.target.value)} /></Field>
            <button type="button" className="icon-btn" onClick={() => removeLocationRow(index)} aria-label="Remover localização" title="Remover localização"><Icon name="minus" size={14} /></button>
          </div>
        ))}
        {!locationRows.length && <div className="cell-muted">Nenhuma localização adicionada ainda.</div>}
      </FormSection>
      {mode === "edit" && (
        <FormSection icon="shield" title="Status">
          <CheckLabel on={form.active} onClick={() => set("active", !form.active)}>Item ativo nesta loja</CheckLabel>
        </FormSection>
      )}
    </Modal>
  );
}

function buildInventoryItemForm({ item, locations }) {
  return {
    loc: item && item.loc || (locations[0] ? locations[0].code : ""),
    batch: item && item.batch && item.batch !== "—" ? item.batch : "",
    expiry: item && item.expiry && item.expiry !== "—" ? item.expiry : "",
    qty: 0,
    min: Number(item && (item.min || item.lowThreshold) || 0),
    lowThreshold: Number(item && (item.lowThreshold || item.min) || 0),
    attentionThreshold: Number(item && (item.attentionThreshold || item.lowThreshold || item.min) || 0),
    normalThreshold: Number(item && (item.normalThreshold || item.attentionThreshold || item.lowThreshold || item.min) || 0),
    price: Number(item && item.price || 0),
    cost: Number(item && item.cost || 0),
    ref: Number(item && item.ref || 0),
    promo: Number(item && item.promo || 0),
    active: item && item.active == null ? true : !!(item && item.active),
    marketplaceVisible: item && item.marketplaceVisible == null ? true : !!(item && item.marketplaceVisible),
    note: item && item.note || "",
  };
}

function InvoiceImportModal({ inventory, locations, categoryOptions, onClose, onPreview, onConfirm, notify }) {
  const [stage, setStage] = useState("upload");
  const [provider, setProvider] = useState("gemini");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [draftItems, setDraftItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const classOptions = [...new Set(inventory.map((item) => item.medClass || "Geral"))].sort((left, right) => left.localeCompare(right, "pt-BR"));

  useEffect(() => {
    if (!preview) {
      setDraftItems([]);
      return;
    }
    setReferenceCode(buildInvoiceReference(preview.header));
    setNote(preview.header.notes || "");
    setDraftItems((preview.items || []).map((item) => buildInvoiceDraftLine(item, locations, categoryOptions)));
  }, [preview, locations, categoryOptions]);

  const setDraftItem = (lineId, patch) => {
    setDraftItems((prev) => prev.map((item) => item.lineId === lineId ? { ...item, ...patch } : item));
  };

  const handleAnalyze = async () => {
    if (!file) {
      notify("Selecione uma nota fiscal em PDF ou imagem.", "warn");
      return;
    }
    setBusy(true);
    setStage("processing");
    try {
      const payload = await onPreview({ file, provider, model: "" });
      setPreview(payload);
      setStage("review");
    } catch (error) {
      setStage("upload");
      notify(error && error.message ? error.message : "Não foi possível ler a nota fiscal.", "warn");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    const activeLines = draftItems.filter((item) => item.action !== "skip");
    if (!activeLines.length) {
      notify("Selecione ao menos uma linha para importar.", "warn");
      return;
    }
    const invalidNew = activeLines.find((item) => item.action === "new" && (!item.name.trim() || !item.storageLocationCode.trim() || !item.medicationClassName.trim() || !item.categoryName.trim()));
    if (invalidNew) {
      notify("Preencha nome, categoria, classe e localização para todos os novos itens antes de confirmar.", "warn");
      return;
    }
    const invalidExisting = activeLines.find((item) => item.action === "existing" && !item.matchedItemId);
    if (invalidExisting) {
      notify("Selecione o item correspondente para cada linha vinculada a um SKU existente.", "warn");
      return;
    }
    const invalidThresholds = activeLines.find((item) => Number(item.lowStockThreshold || 0) > Number(item.attentionStockThreshold || 0) || Number(item.attentionStockThreshold || 0) > Number(item.normalStockThreshold || 0));
    if (invalidThresholds) {
      notify("Revise as faixas de estoque. A ordem deve ser baixa <= atenção <= normal.", "warn");
      return;
    }
    setBusy(true);
    try {
      await onConfirm({
        supplierName: preview.header.supplierName,
        invoiceNumber: preview.header.invoiceNumber,
        invoiceSeries: preview.header.invoiceSeries,
        referenceCode,
        note,
        items: draftItems,
      });
      onClose();
    } catch (error) {
      notify(error && error.message ? error.message : "Não foi possível confirmar a importação da nota fiscal.", "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} wide title="Importar nota fiscal com IA">
      {stage === "upload" && (
        <div>
          <p className="cell-muted" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 16 }}>
            Envie o PDF ou a imagem da nota fiscal. A IA extrai os itens e você confere tudo antes da gravação no estoque.
          </p>
          <div className="grid g-2">
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Arquivo da nota fiscal">
                <input className="input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
              </Field>
            </div>
            <Field label="Provider de leitura">
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
              </select>
            </Field>
            <Field label="Observação">
              <div className="card card-pad" style={{ minHeight: 46, display: "flex", alignItems: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
                Para PDF, prefira Gemini. OpenAI nesta etapa está voltado para imagens.
              </div>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!file} onClick={handleAnalyze}><Icon name="scan" size={16} />Analisar nota</button>
          </div>
        </div>
      )}

      {stage === "processing" && (
        <div style={{ textAlign: "center", padding: "24px 8px 12px" }}>
          <span className="spinner" style={{ width: 56, height: 56, borderWidth: 4, margin: "0 auto 16px" }} />
          <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Processando nota fiscal</h2>
          <p className="cell-muted" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 520, margin: "10px auto 0" }}>
            Estamos lendo o documento, extraindo os itens e sugerindo o melhor encaixe com o estoque atual para a sua conferência.
          </p>
          <div className="card card-pad" style={{ marginTop: 18, background: "var(--info-soft)", color: "var(--info)", fontWeight: 700 }}>
            Arquivo em análise: {file ? file.name : "nota-fiscal"}
          </div>
        </div>
      )}

      {stage === "review" && preview && (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ fontWeight: 800, fontSize: 22, margin: 0 }}>Conferência antes da entrada</h2>
              <p className="cell-muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                Revise o cabeçalho, ajuste os itens linha a linha e confirme a gravação no estoque apenas quando tudo estiver consistente.
              </p>
            </div>
            <div className="card card-pad" style={{ minWidth: 300, flex: "0 0 340px" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{preview.header.supplierName || "Fornecedor não identificado"}</div>
              <div className="cell-muted" style={{ lineHeight: 1.7 }}>
                <div>NF: <span className="mono">{preview.header.invoiceSeries || "—"} {preview.header.invoiceNumber || "—"}</span></div>
                <div>Emissão: <span className="mono">{preview.header.issueDate || "—"}</span></div>
                <div>Total: <span className="mono">{brl(Number(preview.header.totalAmount || 0))}</span></div>
                <div>Arquivo: <span className="mono">{preview.sourceFileName}</span></div>
              </div>
            </div>
          </div>

          <div className="grid g-2" style={{ marginBottom: 16 }}>
            <Field label="Referência da movimentação"><input className="input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></Field>
            <Field label="Provider usado"><input className="input" value={preview.provider + " · " + preview.model} disabled /></Field>
            <div style={{ gridColumn: "1 / -1" }}><Field label="Observação geral"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notas operacionais da importação" /></Field></div>
          </div>

          <div className="scrollbar-thin" style={{ maxHeight: "54vh", overflowY: "auto", paddingRight: 6, display: "grid", gap: 12 }}>
            {draftItems.map((item, index) => {
              const matched = inventory.find((entry) => entry.id === item.matchedItemId) || null;
              const accent = item.action === "new" ? "var(--good)" : item.action === "skip" ? "var(--border-strong)" : "var(--info)";
              return (
                <div key={item.lineId} className="card card-pad" style={{ borderLeft: "4px solid " + accent }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <Badge tone="neutral">Linha {index + 1}</Badge>
                    <div style={{ fontWeight: 800, flex: 1, minWidth: 220 }}>{item.description || item.name || "Item sem descrição"}</div>
                    <Badge tone="neutral">{item.quantity} un</Badge>
                    <Badge tone="warning">{brl(Number(item.acquisitionCost || 0))} custo</Badge>
                  </div>
                  <PillNav
                    options={[{ key: "existing", label: "Vincular existente" }, { key: "new", label: "Criar novo" }, { key: "skip", label: "Ignorar linha" }]}
                    active={item.action}
                    onChange={(key) => setDraftItem(item.lineId, key === "existing" ? { action: "existing", matchedItemId: item.matchedItemId || (item.matchCandidates[0] ? item.matchCandidates[0].id : "") } : { action: key })}
                  />

                  {item.action === "existing" && (
                    <div className="grid g-2" style={{ marginTop: 14, marginBottom: 12 }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <Field label="Item correspondente">
                          <select className="input" value={item.matchedItemId} onChange={(e) => {
                            const selected = item.matchCandidates.find((candidate) => candidate.id === e.target.value);
                            setDraftItem(item.lineId, {
                              matchedItemId: e.target.value,
                              storageLocationCode: selected ? selected.storageLocationCode : item.storageLocationCode,
                              isControlled: selected ? selected.isControlled : item.isControlled,
                              minimumQuantity: selected ? selected.minimumQuantity : item.minimumQuantity,
                              categoryName: selected ? selected.categoryName || item.categoryName : item.categoryName,
                              medicationClassName: selected ? selected.medicationClassName : item.medicationClassName,
                              lowStockThreshold: selected ? selected.lowStockThreshold : item.lowStockThreshold,
                              attentionStockThreshold: selected ? selected.attentionStockThreshold : item.attentionStockThreshold,
                              normalStockThreshold: selected ? selected.normalStockThreshold : item.normalStockThreshold,
                            });
                          }}>
                            <option value="">Selecione um item já cadastrado</option>
                            {item.matchCandidates.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.brandName || "Sem marca"} · {candidate.eanCode || candidate.sku}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Localização de entrada"><select className="input" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></Field>
                      <Field label="Estoque atual"><input className="input" value={matched ? matched.qty : 0} disabled /></Field>
                    </div>
                  )}

                  {item.action === "new" && (
                    <div className="grid g-2" style={{ marginTop: 14, marginBottom: 12 }}>
                      <Field label="SKU"><input className="input" value={item.sku} onChange={(e) => setDraftItem(item.lineId, { sku: e.target.value })} /></Field>
                      <div style={{ gridColumn: "1 / -1" }}><Field label="Nome *"><input className="input" value={item.name} onChange={(e) => setDraftItem(item.lineId, { name: e.target.value })} /></Field></div>
                      <Field label="Marca"><input className="input" value={item.brandName} onChange={(e) => setDraftItem(item.lineId, { brandName: e.target.value })} /></Field>
                      <Field label="Categoria"><select className="input" value={item.categoryName} onChange={(e) => setDraftItem(item.lineId, { categoryName: e.target.value })}>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
                      <Field label="Classe terapêutica">
                        <div style={{ display: "flex", gap: 8 }}>
                          <select className="input" value={item.useNewMedicationClass ? "__new__" : item.medicationClassName} onChange={(e) => {
                            if (e.target.value === "__new__") { setDraftItem(item.lineId, { useNewMedicationClass: true }); return; }
                            setDraftItem(item.lineId, { useNewMedicationClass: false, medicationClassName: e.target.value });
                          }}>
                            {classOptions.map((itemClass) => <option key={itemClass} value={itemClass}>{itemClass}</option>)}
                            <option value="__new__">Adicionar nova classe terapêutica</option>
                          </select>
                          {!item.useNewMedicationClass && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraftItem(item.lineId, { useNewMedicationClass: true })}><Icon name="plus" size={14} />Nova</button>}
                        </div>
                        {item.useNewMedicationClass && <input className="input" style={{ marginTop: 8 }} value={item.newMedicationClassName || ""} onChange={(e) => setDraftItem(item.lineId, { newMedicationClassName: e.target.value, medicationClassName: e.target.value })} placeholder="Ex.: Antibiótico, Gripal" />}
                      </Field>
                      <Field label="EAN"><input className="input" value={item.eanCode} onChange={(e) => setDraftItem(item.lineId, { eanCode: e.target.value })} /></Field>
                      <Field label="Localização *"><select className="input" value={item.storageLocationCode} onChange={(e) => setDraftItem(item.lineId, { storageLocationCode: e.target.value })}>{locations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></Field>
                    </div>
                  )}

                  {item.action !== "skip" && (
                    <FormSection icon="gauge" title="Lote e precificação">
                      <div className="grid g-2">
                        <Field label="Lote"><input className="input" value={item.batchCode} onChange={(e) => setDraftItem(item.lineId, { batchCode: e.target.value })} /></Field>
                        <Field label="Validade"><input className="input" value={item.expiryLabel} onChange={(e) => setDraftItem(item.lineId, { expiryLabel: e.target.value })} placeholder="MM/AAAA" /></Field>
                        <Field label="Quantidade"><input className="input" type="number" min="0" value={item.quantity} onChange={(e) => setDraftItem(item.lineId, { quantity: Number(e.target.value || 0) })} /></Field>
                        <Field label="Estoque base"><input className="input" type="number" min="0" value={item.minimumQuantity} onChange={(e) => setDraftItem(item.lineId, { minimumQuantity: Number(e.target.value || 0) })} /></Field>
                        <Field label="Faixa baixa"><input className="input" type="number" min="0" value={item.lowStockThreshold} onChange={(e) => setDraftItem(item.lineId, { lowStockThreshold: Number(e.target.value || 0) })} /></Field>
                        <Field label="Faixa atenção"><input className="input" type="number" min="0" value={item.attentionStockThreshold} onChange={(e) => setDraftItem(item.lineId, { attentionStockThreshold: Number(e.target.value || 0) })} /></Field>
                        <Field label="Faixa normal"><input className="input" type="number" min="0" value={item.normalStockThreshold} onChange={(e) => setDraftItem(item.lineId, { normalStockThreshold: Number(e.target.value || 0) })} /></Field>
                        <Field label="Custo de aquisição (R$)"><input className="input" type="number" step="0.01" min="0" value={item.acquisitionCost} disabled /></Field>
                        <Field label="Valor total de compra (R$)"><input className="input" type="number" step="0.01" min="0" value={item.purchaseTotalCost || 0} disabled /></Field>
                        <Field label="Preço venda (R$)"><input className="input" type="number" step="0.01" min="0" value={item.salePrice} onChange={(e) => setDraftItem(item.lineId, { salePrice: Number(e.target.value || 0) })} /></Field>
                        <Field label="Preço referência (R$)"><input className="input" type="number" step="0.01" min="0" value={item.marketReferencePrice} onChange={(e) => setDraftItem(item.lineId, { marketReferencePrice: Number(e.target.value || 0) })} /></Field>
                        <Field label="Promoção (%)"><input className="input" type="number" step="0.01" min="0" value={item.promotionalDiscountPercent} onChange={(e) => setDraftItem(item.lineId, { promotionalDiscountPercent: Number(e.target.value || 0) })} /></Field>
                        <Field label="Custo de imposto (R$)"><input className="input" type="number" step="0.01" min="0" value={item.taxCostAmount} onChange={(e) => setDraftItem(item.lineId, { taxCostAmount: e.target.value })} placeholder="Opcional" /></Field>
                        <div style={{ gridColumn: "1 / -1" }}><Field label="Observação da linha"><input className="input" value={item.note} onChange={(e) => setDraftItem(item.lineId, { note: e.target.value })} placeholder="Ex.: divergência de lote, conferido manualmente" /></Field></div>
                      </div>
                      <CheckLabel on={item.isControlled} onClick={() => setDraftItem(item.lineId, { isControlled: !item.isControlled })} style={{ marginTop: 12 }}>Tipo regulatório sujeito a controle</CheckLabel>
                      <CheckLabel on={item.isSubjectToIcmsSt} onClick={() => setDraftItem(item.lineId, { isSubjectToIcmsSt: !item.isSubjectToIcmsSt })} style={{ marginTop: 8 }}>Sujeito a ICMS-ST nesta compra</CheckLabel>
                    </FormSection>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button className="btn btn-secondary" onClick={() => { setStage("upload"); setPreview(null); setDraftItems([]); }}>Analisar outro arquivo</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy} onClick={handleConfirm}><Icon name="check" size={16} />Confirmar entrada no estoque</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function buildInvoiceReference(header) {
  if (!header) return "NF-IMPORT";
  if (header.invoiceSeries && header.invoiceNumber) return "NF-" + header.invoiceSeries + "-" + header.invoiceNumber;
  if (header.invoiceNumber) return "NF-" + header.invoiceNumber;
  return "NF-IMPORT";
}

function resolveInvoiceAcquisitionCost(item) {
  const quantity = Number(item && item.quantity || 0);
  const totalCost = Number(item && item.totalCost || 0);
  const suggestedAcquisitionCost = Number(item && item.suggestedAcquisitionCost || 0);
  const unitCost = Number(item && item.unitCost || 0);
  if (suggestedAcquisitionCost > 0) return suggestedAcquisitionCost;
  if (quantity > 0 && totalCost > 0) return Math.round(totalCost / quantity * 100) / 100;
  return unitCost;
}

function buildInvoiceDraftLine(item, locations, categoryOptions) {
  const firstCandidate = item.matchCandidates && item.matchCandidates[0] ? item.matchCandidates[0] : null;
  const fallbackLocation = item.suggestedStorageLocationCode || (firstCandidate ? firstCandidate.storageLocationCode : "") || (locations[0] ? locations[0].code : "");
  const acquisitionCost = resolveInvoiceAcquisitionCost(item);
  return {
    lineId: item.lineId,
    action: firstCandidate ? "existing" : "new",
    matchedItemId: firstCandidate ? firstCandidate.id : "",
    description: item.description || "",
    sku: item.suggestedSku || "",
    name: item.suggestedName || item.description || "",
    brandName: item.suggestedBrandName || item.brandName || "",
    categoryName: item.suggestedCategoryName || categoryOptions[0] || "Medicamentos",
    medicationClassName: item.suggestedMedicationClassName || (firstCandidate ? firstCandidate.medicationClassName : "") || "Geral",
    useNewMedicationClass: false,
    newMedicationClassName: "",
    eanCode: item.eanCode || "",
    storageLocationCode: fallbackLocation,
    batchCode: item.batchCode || "",
    expiryLabel: item.expiryLabel || "",
    quantity: Number(item.quantity || 0),
    minimumQuantity: Number(item.suggestedMinimumQuantity || (firstCandidate ? firstCandidate.minimumQuantity : 0) || 0),
    lowStockThreshold: Number(item.suggestedLowStockThreshold || (firstCandidate ? firstCandidate.lowStockThreshold : 0) || 0),
    attentionStockThreshold: Number(item.suggestedAttentionStockThreshold || (firstCandidate ? firstCandidate.attentionStockThreshold : 0) || 0),
    normalStockThreshold: Number(item.suggestedNormalStockThreshold || (firstCandidate ? firstCandidate.normalStockThreshold : 0) || 0),
    salePrice: Number(item.suggestedSalePrice || acquisitionCost || 0),
    acquisitionCost: acquisitionCost,
    purchaseTotalCost: Number(item.totalCost || 0),
    marketReferencePrice: Number(item.suggestedMarketReferencePrice || acquisitionCost || 0),
    promotionalDiscountPercent: Number(item.suggestedPromotionalDiscountPercent || 0),
    isControlled: firstCandidate ? !!firstCandidate.isControlled : !!item.suggestedIsControlled,
    taxCostAmount: item.suggestedTaxCostAmount == null ? "" : item.suggestedTaxCostAmount,
    isSubjectToIcmsSt: item.suggestedIsSubjectToIcmsSt == null ? null : item.suggestedIsSubjectToIcmsSt,
    note: "",
    matchCandidates: item.matchCandidates || [],
  };
}

function StockMovementModal({ item, locations, lots, notify, onClose, onSave, onTransferLot, onAdjustLot, onQuickEntry, onQuickAdjust }) {
  const hasLots = (lots || []).length > 0;
  const [movementType, setMovementType] = useState("entry");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Manual stock entry");
  const [referenceCode, setReferenceCode] = useState("");
  const [note, setNote] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const locationOptions = locations;
  const [locationCode, setLocationCode] = useState(
    hasLots ? (lots[0] ? lots[0].locationCode : "") : (item.loc || (locations[0] ? locations[0].code : ""))
  );
  const [selectedLotId, setSelectedLotId] = useState("");

  useEffect(() => {
    if (!locationOptions.some((location) => location.code === locationCode)) {
      setLocationCode(locationOptions[0] ? locationOptions[0].code : "");
    }
  }, [movementType]);

  const lotsWithStock = hasLots
    ? lots.filter((lot) => lot.qty > 0).slice().sort((left, right) => (left.expiry || "9999-99-99").localeCompare(right.expiry || "9999-99-99"))
    : [];

  useEffect(() => {
    if (!lotsWithStock.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lotsWithStock[0] ? lotsWithStock[0].id : "");
    }
  }, [movementType, lots]);

  const selectedLot = lotsWithStock.find((lot) => lot.id === selectedLotId) || null;
  const availableQuantity = hasLots ? Number(selectedLot ? selectedLot.qty : 0) : Number(item.qty || 0);
  const exceedsAvailableQuantity = movementType === "exit" && Number(quantity) > availableQuantity;

  const valid = quantity > 0 && reason.trim() && !!locationCode && (
    !hasLots ? true : (movementType === "entry" ? batchCode.trim() !== "" : !!selectedLot)
  ) && !exceedsAvailableQuantity;

  const save = async () => {
    if (!valid || isSaving) return;
    setErrorMessage("");
    setIsSaving(true);
    const signedDelta = movementType === "exit" ? -Math.abs(quantity) : Math.abs(quantity);
    try {
      if (!hasLots) {
        await onSave({ movementType, quantityDelta: signedDelta, reason, referenceCode, storageLocationCode: locationCode, note });
        return;
      }
      if (movementType === "entry") {
        const location = locations.find((candidate) => candidate.code === locationCode);
        await onQuickEntry({
          locationId: location ? location.id : "",
          batchCode,
          expiryDate: expiryDate || null,
          quantity: Math.abs(quantity),
          referenceCode,
          note,
        });
        return;
      }
      await onQuickAdjust(selectedLot.id, { quantityDelta: signedDelta, reason, note }, selectedLot.storeId);
    } catch (error) {
      const message = error && error.message ? error.message : "Não foi possível registrar a movimentação de estoque.";
      setErrorMessage(message);
      notify(message, "warn");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title="Movimentar estoque" subtitle={item.name + " · saldo total " + item.qty + " un"}
      footer={(
        <>
          <button className="btn btn-secondary" disabled={isSaving} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid || isSaving} onClick={save}><Icon name="check" size={16} />{isSaving ? "Registrando..." : "Registrar movimentação"}</button>
        </>
      )}
    >
      {errorMessage && (
        <div role="alert" className="card card-pad" style={{ marginBottom: 18, background: "var(--critical-soft)", color: "var(--critical)", fontWeight: 700 }}>
          {errorMessage}
        </div>
      )}

      <FormSection icon="boxes" title="Saldo por local">
        {hasLots ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lots.map((lot) => (
              <div key={lot.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="mono">{lot.locationCode}</span>
                <span className="cell-muted" style={{ flex: 1, minWidth: 0 }}>{lot.locationName} · lote {lot.batch || "—"} · {lot.qty} un</span>
                <button className="btn btn-secondary btn-sm" onClick={() => onTransferLot(lot)}><Icon name="route" size={13} />Transferir</button>
                <button className="icon-btn" onClick={() => onAdjustLot(lot)} aria-label="Ajustar lote" title="Ajustar lote"><Icon name="edit" size={14} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="cell-muted">Nenhum lote individual registrado ainda para este item.</div>
        )}
      </FormSection>

      <FormSection icon="repeat" title="Movimentação">
        <PillNav
          options={[{ key: "entry", label: "Entrada" }, { key: "exit", label: "Saída" }, { key: "adjustment", label: "Ajuste" }]}
          active={movementType}
          onChange={(key) => { setMovementType(key); setReason(key === "entry" ? "Manual stock entry" : key === "exit" ? "Manual stock exit" : "Inventory adjustment"); }}
        />
        <div className="grid g-2" style={{ marginTop: 14 }}>
          {(!hasLots || movementType === "entry") && (
            <Field label="Localização *">
              <select className="input" value={locationCode} onChange={(e) => setLocationCode(e.target.value)}>
                {locationOptions.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}
              </select>
            </Field>
          )}
          {hasLots && movementType !== "entry" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Lote *">
                <select className="input" value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} disabled={lotsWithStock.length === 0}>
                  {lotsWithStock.length === 0 && <option value="">Nenhum lote com saldo</option>}
                  {lotsWithStock.map((lot) => (
                    <option key={lot.id} value={lot.id}>{lot.locationCode} · {lot.batch || "Sem lote"} · vence {lot.expiry || "—"} · {lot.qty} un</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <Field label="Quantidade"><input className="input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></Field>
          {hasLots && movementType === "entry" && (
            <>
              <Field label="Lote *"><input className="input" value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="Ex.: LOT-2026-001" /></Field>
              <Field label="Validade"><input className="input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
            </>
          )}
          <div style={hasLots && movementType !== "entry" ? undefined : { gridColumn: "1 / -1" }}><Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
          {(!hasLots || movementType === "entry") && (
            <Field label="Referência"><input className="input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder="NF, ajuste, inventário..." /></Field>
          )}
          <div style={hasLots && movementType !== "entry" ? { gridColumn: "1 / -1" } : undefined}><Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
        </div>
        {hasLots && movementType !== "entry" && !selectedLot && (
          <div className="card card-pad" style={{ marginTop: 12, background: "var(--critical-soft)", color: "var(--critical)", fontWeight: 700 }}>
            Nenhum lote com saldo disponível para registrar saída ou ajuste.
          </div>
        )}
        {exceedsAvailableQuantity && (
          <div role="alert" className="card card-pad" style={{ marginTop: 12, background: "var(--critical-soft)", color: "var(--critical)", fontWeight: 700 }}>
            A saída não pode ser maior que o saldo disponível de {availableQuantity} un.
          </div>
        )}
      </FormSection>
    </Modal>
  );
}

function TransferInventoryModal({ item, locations, lots, onClose, onSave, onTransferLot }) {
  const hasLots = (lots || []).length > 0;
  const lotsWithStock = hasLots
    ? lots.filter((lot) => lot.qty > 0).slice().sort((left, right) => (left.expiry || "9999-99-99").localeCompare(right.expiry || "9999-99-99"))
    : [];
  const [selectedLotId, setSelectedLotId] = useState(lotsWithStock[0] ? lotsWithStock[0].id : "");

  useEffect(() => {
    if (!lotsWithStock.some((lot) => lot.id === selectedLotId)) {
      setSelectedLotId(lotsWithStock[0] ? lotsWithStock[0].id : "");
    }
  }, [lots]);

  const sourceLot = lotsWithStock.find((lot) => lot.id === selectedLotId) || null;
  const fromLocationCode = hasLots ? (sourceLot ? sourceLot.locationCode : "") : (item.loc || "");
  const availableLocations = locations.filter((location) => location.code !== fromLocationCode);
  const [toLocationCode, setToLocationCode] = useState(availableLocations[0] ? availableLocations[0].code : "");
  const [quantity, setQuantity] = useState(hasLots && sourceLot ? sourceLot.qty : 1);
  const [reason, setReason] = useState("Internal transfer");
  const [referenceCode, setReferenceCode] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!availableLocations.some((location) => location.code === toLocationCode)) {
      setToLocationCode(availableLocations[0] ? availableLocations[0].code : "");
    }
  }, [fromLocationCode]);

  useEffect(() => {
    if (hasLots && sourceLot) {
      setQuantity(sourceLot.qty);
    }
  }, [selectedLotId]);

  const valid = hasLots
    ? !!sourceLot && !!toLocationCode && Number(quantity) > 0 && Number(quantity) <= sourceLot.qty
    : !!toLocationCode;

  const save = async () => {
    if (hasLots) {
      const toLocation = locations.find((location) => location.code === toLocationCode);
      await onTransferLot(sourceLot.id, { toLocationId: toLocation ? toLocation.id : "", quantity: Number(quantity), reason, referenceCode, note });
      return;
    }
    await onSave({ toLocationCode, reason, referenceCode, note });
  };

  return (
    <Modal
      open onClose={onClose} title="Transferir item" subtitle={item.name}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid} onClick={save}><Icon name="check" size={16} />Confirmar transferência</button>
        </>
      )}
    >
      <div className="grid g-2">
        {hasLots ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Lote *">
              <select className="input" value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)} disabled={lotsWithStock.length === 0}>
                {lotsWithStock.length === 0 && <option value="">Nenhum lote com saldo</option>}
                {lotsWithStock.map((lot) => (
                  <option key={lot.id} value={lot.id}>{lot.locationCode} · {lot.batch || "Sem lote"} · vence {lot.expiry || "—"} · {lot.qty} un</option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <Field label="Origem"><input className="input" value={fromLocationCode} disabled /></Field>
        )}
        <Field label="Destino *"><select className="input" value={toLocationCode} onChange={(e) => setToLocationCode(e.target.value)}>{availableLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></Field>
        {hasLots && <Field label="Quantidade"><input className="input" type="number" min="1" max={sourceLot ? sourceLot.qty : undefined} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></Field>}
        <div style={{ gridColumn: "1 / -1" }}><Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        {!hasLots && <Field label="Referência"><input className="input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></Field>}
        <div style={hasLots ? { gridColumn: "1 / -1" } : undefined}><Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function LocationModal({ onClose, onSave }) {
  const [f, setF] = useState({ code: "", name: "", zone: "", description: "", temperatureRange: "", locationType: "estoque", controlledOnly: false });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.code.trim() && f.name.trim();
  return (
    <Modal
      open onClose={onClose} title="Novo local de armazenamento" subtitle="Cadastre prateleiras, gôndolas, caixas e demais áreas operacionais."
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid} onClick={() => onSave(f)}><Icon name="check" size={16} />Cadastrar local</button>
        </>
      )}
    >
      <div className="grid g-2">
        <Field label="Código *"><input className="input" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="Ex.: A1-01" /></Field>
        <Field label="Nome *"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Gôndola frontal" /></Field>
        <Field label="Tipo de local">
          <select className="input" value={f.locationType} onChange={(e) => set("locationType", e.target.value)}>
            {LOCATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Zona"><input className="input" value={f.zone} onChange={(e) => set("zone", e.target.value)} /></Field>
        <Field label="Temperatura"><input className="input" value={f.temperatureRange} onChange={(e) => set("temperatureRange", e.target.value)} placeholder="Ambiente, refrigerado..." /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Descrição"><input className="input" value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
      </div>
      <CheckLabel on={f.controlledOnly} onClick={() => set("controlledOnly", !f.controlledOnly)} style={{ marginTop: 12 }}>Reservado para itens controlados</CheckLabel>
    </Modal>
  );
}

function LotReceiptModal({ inventory, locations, suppliers, onClose, onSave }) {
  const sortedItems = inventory.slice().sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    inventoryItemId: sortedItems[0] ? sortedItems[0].id : "",
    locationId: locations[0] ? locations[0].id : "",
    supplierId: "",
    batchCode: "",
    expiryDate: "",
    quantity: 1,
    referenceCode: "",
    note: "",
  });
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));
  const valid = f.inventoryItemId && f.locationId && f.batchCode.trim() && Number(f.quantity) > 0;
  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(f);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open onClose={busy ? () => {} : onClose} title="Receber mercadoria"
      subtitle="Registre a entrada de um lote em um local específico. O saldo agregado do produto é atualizado automaticamente."
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />Registrar recebimento</button>
        </>
      )}
    >
      <div className="grid g-2">
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Produto *">
            <select className="input" value={f.inventoryItemId} onChange={(e) => set("inventoryItemId", e.target.value)}>
              {sortedItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.brand || "Sem marca"}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Local de destino *">
          <select className="input" value={f.locationId} onChange={(e) => set("locationId", e.target.value)}>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name} ({LOCATION_TYPE_LABEL[location.locationType] || location.locationType})</option>)}
          </select>
        </Field>
        <Field label="Fornecedor">
          <select className="input" value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
            <option value="">Não informado</option>
            {suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.legalName}</option>)}
          </select>
        </Field>
        <Field label="Lote *"><input className="input" value={f.batchCode} onChange={(e) => set("batchCode", e.target.value)} placeholder="Ex.: LOT-2026-001" /></Field>
        <Field label="Validade"><input className="input" type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} /></Field>
        <Field label="Quantidade *"><input className="input" type="number" min="1" value={f.quantity} onChange={(e) => set("quantity", Number(e.target.value || 0))} /></Field>
        <Field label="Referência"><input className="input" value={f.referenceCode} onChange={(e) => set("referenceCode", e.target.value)} placeholder="NF, pedido de compra..." /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Observação"><input className="input" value={f.note} onChange={(e) => set("note", e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function LotTransferModal({ lot, locations, onClose, onSave }) {
  const availableLocations = locations.filter((location) => location.id !== lot.locationId);
  const [toLocationId, setToLocationId] = useState(availableLocations[0] ? availableLocations[0].id : "");
  const [quantity, setQuantity] = useState(lot.qty);
  const [reason, setReason] = useState("Transferência interna");
  const [referenceCode, setReferenceCode] = useState("");
  const [note, setNote] = useState("");
  const valid = toLocationId && Number(quantity) > 0 && Number(quantity) <= lot.qty;
  return (
    <Modal
      open onClose={onClose} title="Transferir lote"
      subtitle={<>Lote <span className="mono">{lot.batch || "—"}</span> · {lot.qty} un disponíveis em <span className="mono">{lot.locationCode}</span></>}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid} onClick={() => onSave({ toLocationId, quantity, reason, referenceCode, note })}><Icon name="check" size={16} />Confirmar transferência</button>
        </>
      )}
    >
      <div className="grid g-2">
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Destino">
            <select className="input" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
              {availableLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name} ({LOCATION_TYPE_LABEL[location.locationType] || location.locationType})</option>)}
            </select>
          </Field>
        </div>
        <Field label="Quantidade"><input className="input" type="number" min="1" max={lot.qty} value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></Field>
        <Field label="Referência"><input className="input" value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function LotAdjustmentModal({ lot, onClose, onSave }) {
  const [direction, setDirection] = useState("loss");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("Quebra ou perda");
  const [note, setNote] = useState("");
  const valid = Number(quantity) > 0 && reason.trim() && (direction === "gain" || Number(quantity) <= lot.qty);
  const save = () => {
    const signedDelta = direction === "loss" ? -Math.abs(Number(quantity)) : Math.abs(Number(quantity));
    onSave({ quantityDelta: signedDelta, reason, note });
  };
  return (
    <Modal
      open onClose={onClose} title="Ajustar lote"
      subtitle={<>Lote <span className="mono">{lot.batch || "—"}</span> · {lot.qty} un em <span className="mono">{lot.locationCode}</span></>}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid} onClick={save}><Icon name="check" size={16} />Registrar ajuste</button>
        </>
      )}
    >
      <PillNav
        options={[{ key: "loss", label: "Perda / quebra" }, { key: "gain", label: "Correção (a mais)" }]}
        active={direction}
        onChange={(key) => { setDirection(key); setReason(key === "loss" ? "Quebra ou perda" : "Correção de contagem"); }}
      />
      <div className="grid g-2" style={{ marginTop: 14 }}>
        <Field label="Quantidade"><input className="input" type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value || 0))} /></Field>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        <div style={{ gridColumn: "1 / -1" }}><Field label="Observação"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function inventoryMovementLabel(type) {
  if (type === "initial") return "Carga inicial";
  if (type === "entry") return "Entrada";
  if (type === "exit") return "Saída";
  if (type === "transfer") return "Transferência";
  return "Ajuste";
}

function inventoryMovementDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString("pt-BR") : "Data indisponível";
}

export { InventoryItemModal, InventoryScreen, InvoiceImportModal, LOCATION_TYPE_LABEL, LOCATION_TYPE_OPTIONS, LOT_STATUS_OPTIONS, LocationModal, StockMovementModal, TransferInventoryModal, buildInventoryItemForm, buildInvoiceDraftLine, buildInvoiceReference, formatIsoDate, inventoryMovementDate, inventoryMovementLabel, isExpiringSoonIso, lotStatusBadge, resolveInvoiceAcquisitionCost };
