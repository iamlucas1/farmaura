import React, { useEffect, useState } from "react";
import { ModalShell, brl } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/* FARMAURA Console — Cadastro de fornecedores. */
function SuppliersScreen({ ctx }) {
  const { suppliers, refreshSuppliers, addSupplier, updateSupplier, setSupplierActive, notify, onLogout } = ctx;
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ufFilter, setUfFilter] = useState('all');
  const [editSupplier, setEditSupplier] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    refreshSuppliers && refreshSuppliers();
  }, []);

  const allSuppliers = suppliers || [];
  const activeCount = allSuppliers.filter((supplier) => supplier.active).length;
  const inactiveCount = allSuppliers.filter((supplier) => !supplier.active).length;
  const noLocationCount = allSuppliers.filter((supplier) => !supplier.uf && !supplier.city).length;
  const categoryOptions = Array.from(new Set(allSuppliers.map((supplier) => supplier.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ufOptions = UF_OPTIONS.filter((uf) => allSuppliers.some((supplier) => supplier.uf === uf));
  const hasExtraFilters = kpiFilter !== 'all' || categoryFilter !== 'all' || ufFilter !== 'all';

  const rows = allSuppliers.filter((supplier) => {
    if (kpiFilter === 'active' && !supplier.active) return false;
    if (kpiFilter === 'inactive' && supplier.active) return false;
    if (kpiFilter === 'no_location' && (supplier.uf || supplier.city)) return false;
    if (categoryFilter !== 'all' && supplier.category !== categoryFilter) return false;
    if (ufFilter !== 'all' && supplier.uf !== ufFilter) return false;
    if (q && !(supplier.legalName + supplier.tradeName + supplier.cnpj + supplier.category + supplier.city).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.legalName || '').localeCompare(right.legalName || '', 'pt-BR'));

  const clearFilters = () => {
    setKpiFilter('all');
    setCategoryFilter('all');
    setUfFilter('all');
  };

  const handleToggleActive = async (supplier) => {
    setSavingId(supplier.id);
    try {
      await setSupplierActive(supplier.id, !supplier.active);
      notify && notify(supplier.active ? 'Fornecedor desativado.' : 'Fornecedor reativado.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o fornecedor.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  return (
    <>
      <Topbar title="Fornecedores" sub={rows.length + ' fornecedor(es) exibido(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, CNPJ, categoria ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todos" value={allSuppliers.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativos" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativos" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="pin" label="Sem UF/cidade" value={noLocationCount} tone={noLocationCount ? 'warn' : undefined} active={kpiFilter === 'no_location'} onClick={() => setKpiFilter('no_location')} />
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshSuppliers}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Novo fornecedor</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Categoria</label>
              <select className="fa-select" style={{ minWidth: 170 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Todas as categorias</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
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
                <th>Fornecedor</th>
                <th>CNPJ</th>
                <th>Categoria</th>
                <th>UF · Cidade</th>
                <th>Prazo entrega</th>
                <th>Pedido mínimo</th>
                <th>Frete</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <div className="ph-td-name">{supplier.legalName}</div>
                    <div className="ph-cell-sub">{supplier.tradeName || 'Sem nome fantasia'}{supplier.website ? ' · ' + supplier.website : ''}</div>
                  </td>
                  <td className="fa-mono">{supplier.cnpj}</td>
                  <td>{supplier.category || '—'}</td>
                  <td>{supplier.uf || '—'}{supplier.city ? ' · ' + supplier.city : ''}</td>
                  <td>{supplier.leadTimeDays} dia(s)</td>
                  <td className="fa-mono">{brl(supplier.minimumOrderAmount)}</td>
                  <td>{supplier.freightPolicy || '—'}</td>
                  <td>{supplier.paymentTerms || '—'}</td>
                  <td><span className="fa-badge" style={supplier.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{supplier.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditSupplier(supplier)}><Icon name="edit" size={14} />Editar</button>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === supplier.id}
                      onClick={() => handleToggleActive(supplier)}
                      aria-label={supplier.active ? 'Desativar fornecedor' : 'Reativar fornecedor'}
                      title={supplier.active ? 'Desativar fornecedor' : 'Reativar fornecedor'}
                    >
                      <Icon name={supplier.active ? 'trash' : 'repeat'} size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="truck" size={28} /></span>
              <div>Nenhum fornecedor encontrado.</div>
              {(hasExtraFilters || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { clearFilters(); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editSupplier && (
        <SupplierModal
          title="Editar fornecedor"
          submitLabel="Salvar alterações"
          initialSupplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSave={async (payload) => {
            try {
              await updateSupplier(editSupplier.id, payload);
              setEditSupplier(null);
              notify && notify('Fornecedor atualizado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o fornecedor.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <SupplierModal
          title="Novo fornecedor"
          submitLabel="Cadastrar fornecedor"
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addSupplier(payload);
              setNewOpen(false);
              notify && notify('Fornecedor cadastrado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o fornecedor.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function buildSupplierForm(supplier) {
  return {
    legalName: supplier && supplier.legalName || '',
    tradeName: supplier && supplier.tradeName || '',
    cnpj: supplier && supplier.cnpj || '',
    email: supplier && supplier.email || '',
    phone: supplier && supplier.phone || '',
    website: supplier && supplier.website || '',
    category: supplier && supplier.category || '',
    contactPersonName: supplier && supplier.contactPersonName || '',
    uf: supplier && supplier.uf || '',
    city: supplier && supplier.city || '',
    addressLine: supplier && supplier.addressLine || '',
    leadTimeDays: Number(supplier && supplier.leadTimeDays || 0),
    minimumOrderAmount: Number(supplier && supplier.minimumOrderAmount || 0),
    freightPolicy: supplier && supplier.freightPolicy || '',
    paymentTerms: supplier && supplier.paymentTerms || '',
    notes: supplier && supplier.notes || '',
  };
}

function SupplierModal({ title, submitLabel, initialSupplier, onClose, onSave }) {
  const [form, setForm] = useState(() => buildSupplierForm(initialSupplier));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.legalName.trim().length >= 2 && form.cnpj.trim().length >= 11;

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
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="truck" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Cadastre os dados comerciais do fornecedor para uso no recebimento de mercadorias e na gestão de estoque.
      </p>
      <div className="fa-form2">
        <div className="fa-field fa-span2"><label>Razão social *</label><input className="fa-input" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Ex.: Distribuidora Saúde Total Ltda." /></div>
        <div className="fa-field"><label>Nome fantasia</label><input className="fa-input" value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></div>
        <div className="fa-field"><label>CNPJ *</label><input className="fa-input" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
        <div className="fa-field"><label>Categoria</label><input className="fa-input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex.: Distribuidora, Fabricante" /></div>
        <div className="fa-field"><label>Site</label><input className="fa-input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></div>
        <div className="fa-field"><label>Telefone</label><input className="fa-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div className="fa-field"><label>E-mail</label><input className="fa-input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="fa-field"><label>Contato responsável</label><input className="fa-input" value={form.contactPersonName} onChange={(e) => set('contactPersonName', e.target.value)} /></div>
        <div className="fa-field">
          <label>UF</label>
          <select className="fa-select" value={form.uf} onChange={(e) => set('uf', e.target.value)}>
            <option value="">Selecione</option>
            {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>
        <div className="fa-field"><label>Cidade</label><input className="fa-input" value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
        <div className="fa-field fa-span2"><label>Endereço</label><input className="fa-input" value={form.addressLine} onChange={(e) => set('addressLine', e.target.value)} /></div>
        <div className="fa-field"><label>Prazo de entrega (dias)</label><input className="fa-input" type="number" min="0" value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Pedido mínimo (R$)</label><input className="fa-input" type="number" step="0.01" min="0" value={form.minimumOrderAmount} onChange={(e) => set('minimumOrderAmount', Number(e.target.value || 0))} /></div>
        <div className="fa-field"><label>Frete</label><input className="fa-input" value={form.freightPolicy} onChange={(e) => set('freightPolicy', e.target.value)} placeholder="Ex.: CIF, FOB, R$ 50 fixo" /></div>
        <div className="fa-field"><label>Condição de pagamento</label><input className="fa-input" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} placeholder="Ex.: 30/60/90 dias" /></div>
        <div className="fa-field fa-span2"><label>Observações</label><input className="fa-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { SuppliersScreen };
