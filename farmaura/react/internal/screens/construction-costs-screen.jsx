import React, { useEffect, useState } from "react";
import { Icon, PageHead, Badge, StatCard, EmptyState, Modal, Field } from "../core/internal-ui.jsx";

/* FARMAURA Console — Custo de Construção por loja.
   CRUD do investimento (dinheiro + tempo) gasto para construir cada loja, e o ROI calculado
   em cima do faturamento real (pedidos + PDV) daquela loja desde a data de abertura informada.
   Os nomes de campo no wire seguem exatamente o schema do backend (snake_case) — não há
   conversão automática de caixa entre o front e a API. Admin-only. */

const _br = (n, d = 0) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const _pct = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const _dateBr = (iso) => {
  if (!iso) return "";
  const parts = String(iso).split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : iso;
};

const CATEGORY_SUGGESTIONS = [
  "Reforma", "Projeto/Arquitetura", "Mobiliário", "Equipamentos", "Licenças e alvarás",
  "Mão de obra", "Sinalização e fachada", "Sistema (TI/PDV)", "Estoque inicial", "Outros",
];

function newCostItem() {
  return { id: "item-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), label: "", category: "", amount: 0, days: 0, note: "" };
}

function buildEntryForm(entry) {
  return {
    opened_at: (entry && entry.opened_at) || "",
    construction_started_at: (entry && entry.construction_started_at) || "",
    net_margin_pct: entry && entry.net_margin_pct != null ? Number(entry.net_margin_pct) : 15,
    items: entry && Array.isArray(entry.items) && entry.items.length ? entry.items.map((item) => ({ ...item })) : [newCostItem()],
  };
}

function ConstructionCostsScreen({ ctx }) {
  const { storeDirectory, constructionCosts, constructionCostsBusy, constructionCostsError, refreshConstructionCosts, saveConstructionCosts, notify } = ctx;
  const [editStore, setEditStore] = useState(null);

  useEffect(() => {
    refreshConstructionCosts && refreshConstructionCosts();
  }, []);

  const allStores = storeDirectory || [];
  const storesData = constructionCosts && constructionCosts.stores ? constructionCosts.stores : {};
  const rows = allStores
    .map((store) => ({ store, entry: storesData[store.id] || null }))
    .sort((left, right) => (left.store.name || "").localeCompare(right.store.name || "", "pt-BR"));

  const totalInvested = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.total_invested) : 0), 0);
  const totalDays = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.total_days) : 0), 0);
  const totalRevenue = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.revenue_since_opening) : 0), 0);
  const totalProfit = rows.reduce((sum, row) => sum + (row.entry ? Number(row.entry.estimated_profit_since_opening) : 0), 0);
  const avgRoiPct = totalInvested > 0 ? (totalProfit - totalInvested) / totalInvested * 100 : null;

  const saveStoreEntry = async (storeId, form) => {
    const nextStores = {};
    rows.forEach(({ store, entry }) => {
      if (entry) {
        nextStores[store.id] = {
          opened_at: entry.opened_at,
          construction_started_at: entry.construction_started_at,
          net_margin_pct: entry.net_margin_pct,
          items: entry.items,
        };
      }
    });
    nextStores[storeId] = form;
    await saveConstructionCosts(nextStores);
  };

  if (constructionCostsError) {
    return (
      <div className="route-fade">
        <PageHead eyebrow="Custos" title="Custo de Construção" desc="Investimento e ROI por loja" />
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <Icon name="info" size={22} style={{ color: "var(--critical)" }} />
          <div style={{ fontWeight: 800, marginTop: 10 }}>Não foi possível carregar o custo de construção</div>
          <div className="cell-muted" style={{ marginTop: 4 }}>{constructionCostsError}</div>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={refreshConstructionCosts}><Icon name="repeat" size={14} />Tentar novamente</button>
        </div>
      </div>
    );
  }

  return (
    <div className="route-fade" data-screen-label="Custo de construção por loja">
      <PageHead eyebrow="Custos" title="Custo de Construção" desc={rows.length + " loja(s)"} />

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <StatCard icon="store" value={_br(totalInvested)} label="Investido em construção (todas as lojas)" />
        <StatCard icon="clock" value={totalDays + " dias"} label="Tempo de obra somado" tone="accent" />
        <StatCard icon="money" value={_br(totalRevenue)} label="Faturamento real desde a abertura" tone="good" />
        <StatCard icon="trendup" value={avgRoiPct == null ? "—" : _pct(avgRoiPct)} label="ROI estimado (lucro sobre investimento)"
          tone={avgRoiPct == null ? undefined : avgRoiPct >= 0 ? "good" : "critical"} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Abertura</th>
                <th>Investido</th>
                <th>Tempo de obra</th>
                <th>Faturamento desde a abertura</th>
                <th>ROI · Payback</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ store, entry }) => {
                const hasOpenedAt = !!(entry && entry.opened_at);
                return (
                  <tr key={store.id}>
                    <td>
                      <div className="cell-strong">{store.name}</div>
                      <div className="cell-muted">{store.code}{store.city ? " · " + store.city : ""}</div>
                    </td>
                    <td>{hasOpenedAt ? _dateBr(entry.opened_at) : <Badge tone="warning">Definir data</Badge>}</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{_br(entry ? entry.total_invested : 0)}</td>
                    <td>{entry && entry.total_days ? entry.total_days + " dias" : "—"}</td>
                    <td className="mono">{hasOpenedAt ? _br(entry.revenue_since_opening) : "—"}</td>
                    <td>
                      {hasOpenedAt && entry.roi_pct != null ? (
                        <span style={{ color: entry.roi_pct >= 0 ? "var(--good)" : "var(--critical)", fontWeight: 700 }}>{_pct(entry.roi_pct)}</span>
                      ) : <span className="cell-muted">sem investimento lançado</span>}
                      {hasOpenedAt && entry.payback_months != null && (
                        <div className="cell-muted">payback ~{Math.round(entry.payback_months)} meses</div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditStore(store)}><Icon name="edit" size={14} />Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <EmptyState icon="pin" title="Nenhuma loja cadastrada ainda" />}
        </div>
      </div>

      {editStore && (
        <ConstructionCostModal
          store={editStore}
          entry={storesData[editStore.id] || null}
          busy={constructionCostsBusy}
          onClose={() => setEditStore(null)}
          onSave={async (form) => {
            try {
              await saveStoreEntry(editStore.id, form);
              setEditStore(null);
            } catch (error) {
              notify && notify(error && error.message ? error.message : "Não foi possível salvar o custo de construção.", "warn");
            }
          }}
        />
      )}
    </div>
  );
}

function ConstructionCostModal({ store, entry, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => buildEntryForm(entry));
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, newCostItem()] }));
  const updateItem = (id, patch) => setForm((prev) => ({ ...prev, items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const removeItem = (id) => setForm((prev) => ({ ...prev, items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items }));

  const validItems = form.items.filter((item) => item.label.trim().length > 0);
  const totalAmount = form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalDays = form.items.reduce((sum, item) => sum + (Number(item.days) || 0), 0);
  const valid = validItems.length > 0 && !!form.opened_at;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        opened_at: form.opened_at,
        construction_started_at: form.construction_started_at,
        net_margin_pct: Number(form.net_margin_pct) || 0,
        items: validItems.map((item) => ({
          id: item.id,
          label: item.label.trim(),
          category: item.category || "",
          amount: Number(item.amount) || 0,
          days: Number(item.days) || 0,
          note: item.note || "",
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open onClose={(busy || saving) ? () => {} : onClose} title={"Custo de construção · " + store.name}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={busy || saving}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!valid || busy || saving} onClick={handleSave}>
            <Icon name="check" size={16} />{saving ? "Salvando…" : "Salvar custo de construção"}
          </button>
        </>
      )}
    >
      <p className="cell-muted" style={{ marginBottom: 18 }}>
        Lance os itens de custo (valor e dias gastos) e a data de abertura. O ROI é calculado sozinho a
        partir das vendas reais desta loja desde a abertura, aplicando a margem líquida esperada abaixo.
      </p>

      <div className="grid g-3">
        <Field label="Data de abertura *" hint="A partir desta data as vendas da loja entram no cálculo de faturamento e ROI.">
          <input className="input" type="date" value={form.opened_at} onChange={(e) => setField("opened_at", e.target.value)} />
        </Field>
        <Field label="Início da obra">
          <input className="input" type="date" value={form.construction_started_at} onChange={(e) => setField("construction_started_at", e.target.value)} />
        </Field>
        <Field label="Margem líquida esperada (%)" hint="Usada para estimar o lucro sobre o faturamento real e calcular o ROI.">
          <input className="input" type="number" step="0.5" min="0" max="100" value={form.net_margin_pct} onChange={(e) => setField("net_margin_pct", e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="store" size={15} style={{ color: "var(--info)" }} />
          <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>Itens de custo</span>
          <span className="cell-muted">{_br(totalAmount)} · {totalDays} dias</span>
        </div>

        <datalist id="construction-cost-categories">
          {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
        </datalist>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.items.map((item) => (
            <div key={item.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10 }}>
              <input className="input" style={{ flex: "2 1 160px" }} placeholder="Descrição (ex.: Reforma do salão)" value={item.label} onChange={(e) => updateItem(item.id, { label: e.target.value })} />
              <input className="input" style={{ flex: "1 1 140px" }} list="construction-cost-categories" placeholder="Categoria" value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })} />
              <input className="input" type="number" step="0.01" min="0" style={{ flex: "1 1 110px" }} placeholder="R$" value={item.amount} onChange={(e) => updateItem(item.id, { amount: e.target.value })} />
              <input className="input" type="number" step="1" min="0" style={{ flex: "0 1 90px" }} placeholder="dias" value={item.days} onChange={(e) => updateItem(item.id, { days: e.target.value })} />
              <button type="button" className="icon-btn" onClick={() => removeItem(item.id)} aria-label="Remover item" title="Remover item">
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addItem}><Icon name="plus" size={14} />Adicionar item de custo</button>
      </div>
    </Modal>
  );
}

export { ConstructionCostsScreen };
