import React, { useEffect, useState } from "react";
import { ModalShell } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/* FARMAURA Console — Cadastro de lojas (filiais) do tenant. */
function StoresScreen({ ctx }) {
  const { storeDirectory, refreshStoreDirectory, addStoreEntry, updateStoreEntry, setStoreEntryActive, notify, onLogout } = ctx;
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [ufFilter, setUfFilter] = useState('all');
  const [editStore, setEditStore] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    refreshStoreDirectory && refreshStoreDirectory();
  }, []);

  const allStores = storeDirectory || [];
  const activeCount = allStores.filter((store) => store.active).length;
  const inactiveCount = allStores.filter((store) => !store.active).length;
  const noCnpjCount = allStores.filter((store) => !store.cnpj).length;
  const ufOptions = UF_OPTIONS.filter((uf) => allStores.some((store) => store.stateCode === uf));
  const hasExtraFilters = kpiFilter !== 'all' || ufFilter !== 'all';

  const rows = allStores.filter((store) => {
    if (kpiFilter === 'active' && !store.active) return false;
    if (kpiFilter === 'inactive' && store.active) return false;
    if (kpiFilter === 'no_cnpj' && store.cnpj) return false;
    if (ufFilter !== 'all' && store.stateCode !== ufFilter) return false;
    if (q && !(store.name + store.code + store.city + store.cnpj).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const clearFilters = () => {
    setKpiFilter('all');
    setUfFilter('all');
  };

  const handleToggleActive = async (store) => {
    setSavingId(store.id);
    try {
      await setStoreEntryActive(store.id, !store.active);
      notify && notify(store.active ? 'Loja desativada.' : 'Loja reativada.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a loja.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  return (
    <>
      <Topbar title="Lojas" sub={rows.length + ' loja(s) exibida(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, código, cidade ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todas" value={allStores.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativas" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativas" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="edit" label="Sem CNPJ" value={noCnpjCount} tone={noCnpjCount ? 'warn' : undefined} active={kpiFilter === 'no_cnpj'} onClick={() => setKpiFilter('no_cnpj')} />
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshStoreDirectory}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Nova loja</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>UF</label>
              <select className="fa-select" style={{ minWidth: 120 }} value={ufFilter} onChange={(e) => setUfFilter(e.target.value)}>
                <option value="all">Todas as UFs</option>
                {ufOptions.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            {hasExtraFilters && (
              <button className="fa-btn fa-btn-ghost fa-btn-sm" onClick={clearFilters}>
                <Icon name="close" size={14} />Limpar filtros
              </button>
            )}
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Código</th>
                <th>UF · Cidade</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th>Principal</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((store) => (
                <tr key={store.id}>
                  <td>
                    <div className="ph-td-name">{store.name}</div>
                    <div className="ph-cell-sub">{store.addressLine || 'Endereço não informado'}</div>
                  </td>
                  <td className="fa-mono">{store.code}</td>
                  <td>{store.stateCode || '—'}{store.city ? ' · ' + store.city : ''}</td>
                  <td className="fa-mono">{store.cnpj || '—'}</td>
                  <td>{store.phone || '—'}</td>
                  <td>{store.isPrimary ? <span className="fa-badge fa-badge-health">Principal</span> : '—'}</td>
                  <td><span className="fa-badge" style={store.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{store.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditStore(store)}><Icon name="edit" size={14} />Editar</button>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === store.id}
                      onClick={() => handleToggleActive(store)}
                      aria-label={store.active ? 'Desativar loja' : 'Reativar loja'}
                      title={store.active ? 'Desativar loja' : 'Reativar loja'}
                    >
                      <Icon name={store.active ? 'trash' : 'repeat'} size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="pin" size={28} /></span>
              <div>Nenhuma loja encontrada.</div>
              {(hasExtraFilters || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { clearFilters(); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editStore && (
        <StoreModal
          title="Editar loja"
          submitLabel="Salvar alterações"
          initialStore={editStore}
          onClose={() => setEditStore(null)}
          onSave={async (payload) => {
            try {
              await updateStoreEntry(editStore.id, payload);
              setEditStore(null);
              notify && notify('Loja atualizada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a loja.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <StoreModal
          title="Nova loja"
          submitLabel="Cadastrar loja"
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addStoreEntry(payload);
              setNewOpen(false);
              notify && notify('Loja cadastrada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar a loja.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function buildStoreForm(store) {
  return {
    code: store && store.code || '',
    name: store && store.name || '',
    addressLine: store && store.addressLine || '',
    district: store && store.district || '',
    city: store && store.city || '',
    stateCode: store && store.stateCode || '',
    postalCode: store && store.postalCode || '',
    phone: store && store.phone || '',
    cnpj: store && store.cnpj || '',
    isPrimary: store ? !!store.isPrimary : false,
  };
}

function StoreModal({ title, submitLabel, initialStore, onClose, onSave }) {
  const [form, setForm] = useState(() => buildStoreForm(initialStore));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.code.trim().length >= 2 && form.name.trim().length >= 2;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={760}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="pin" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Cadastre os dados da loja física — eles são usados no estoque, no PDV e na roteirização de entregas.
      </p>
      <div className="fa-form2">
        <div className="fa-field"><label>Código *</label><input className="fa-input" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="Ex.: LOJA-01" /></div>
        <div className="fa-field"><label>Nome *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Farmaura Centro" /></div>
        <div className="fa-field fa-span2"><label>Endereço</label><input className="fa-input" value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} /></div>
        <div className="fa-field"><label>Bairro</label><input className="fa-input" value={form.district} onChange={(e) => set('district', e.target.value)} /></div>
        <div className="fa-field"><label>Cidade</label><input className="fa-input" value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
        <div className="fa-field">
          <label>UF</label>
          <select className="fa-select" value={form.stateCode} onChange={(e) => set('stateCode', e.target.value)}>
            <option value="">Selecione</option>
            {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>CEP</label><input className="fa-input" value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></div>
        <div className="fa-field"><label>Telefone</label><input className="fa-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="fa-field"><label>CNPJ</label><input className="fa-input" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
      </div>
      <label className="fa-check" data-on={form.isPrimary ? '1' : '0'} onClick={() => set('isPrimary', !form.isPrimary)} style={{ marginTop: 12 }}>
        <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>Loja principal (matriz)
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { StoresScreen };
