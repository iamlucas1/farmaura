import React, { useEffect, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Cadastro de marcas, vinculadas aos fornecedores que as distribuem. */
function BrandsScreen({ ctx }) {
  const { brands, suppliers, refreshBrands, refreshSuppliers, addBrand, updateBrand, setBrandActive, setBrandDiscarded, notify, onLogout, user } = ctx;
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [editBrand, setEditBrand] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [discardTarget, setDiscardTarget] = useState(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [selectedRecoverIds, setSelectedRecoverIds] = useState(() => new Set());
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    refreshBrands && refreshBrands();
    refreshSuppliers && refreshSuppliers();
  }, []);

  const availableBrands = (brands || []).filter((brand) => !brand.discarded);
  const activeCount = availableBrands.filter((brand) => brand.active).length;
  const inactiveCount = availableBrands.filter((brand) => !brand.active).length;
  const noSupplierCount = availableBrands.filter((brand) => !brand.suppliers.length).length;
  const supplierOptions = (suppliers || []).map((supplier) => ({ id: supplier.id, name: supplier.tradeName || supplier.legalName })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const hasExtraFilters = kpiFilter !== 'all' || supplierFilter !== 'all';

  const rows = availableBrands.filter((brand) => {
    if (kpiFilter === 'active' && !brand.active) return false;
    if (kpiFilter === 'inactive' && brand.active) return false;
    if (kpiFilter === 'no_supplier' && brand.suppliers.length) return false;
    if (supplierFilter !== 'all' && !brand.supplierIds.includes(supplierFilter)) return false;
    if (q && !(brand.name + brand.description).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const clearFilters = () => {
    setKpiFilter('all');
    setSupplierFilter('all');
  };

  const handleToggleActive = async (brand) => {
    setSavingId(brand.id);
    try {
      await setBrandActive(brand.id, !brand.active);
      notify && notify(brand.active ? 'Marca desativada.' : 'Marca ativada.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a marca.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const confirmDiscard = async () => {
    const brand = discardTarget;
    if (!brand) return;
    setSavingId(brand.id);
    try {
      await setBrandDiscarded(brand.id, true);
      notify && notify('Marca descartada.', 'success');
      setDiscardTarget(null);
      setEditBrand((prev) => (prev && prev.id === brand.id ? null : prev));
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível descartar a marca.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const discardedBrands = (brands || []).filter((brand) => brand.discarded);

  const openRecoverModal = () => {
    setSelectedRecoverIds(new Set());
    setRecoverOpen(true);
  };

  const toggleRecoverSelection = (brandId) => {
    setSelectedRecoverIds((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId); else next.add(brandId);
      return next;
    });
  };

  const recoverBrands = async (ids) => {
    if (!ids.length) return;
    setRecovering(true);
    try {
      for (const id of ids) {
        await setBrandDiscarded(id, false);
      }
      notify && notify(ids.length + ' marca(s) recuperada(s).', 'success');
      setRecoverOpen(false);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível recuperar as marcas selecionadas.', 'warn');
    } finally {
      setRecovering(false);
    }
  };

  const confirmRecoverAll = () => recoverBrands(discardedBrands.map((brand) => brand.id));
  const confirmRecoverSelected = () => recoverBrands(Array.from(selectedRecoverIds));

  return (
    <>
      <Topbar title="Marcas" sub={rows.length + ' marca(s) exibida(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todas" value={availableBrands.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativas" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativas" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="truck" label="Sem fornecedor" value={noSupplierCount} tone={noSupplierCount ? 'warn' : undefined} active={kpiFilter === 'no_supplier'} onClick={() => setKpiFilter('no_supplier')} />
          {isAdmin && (
            <InventoryKpi
              icon="trash"
              label="Descartadas"
              value={discardedBrands.length}
              tone={discardedBrands.length ? 'error' : undefined}
              active={false}
              onClick={discardedBrands.length ? openRecoverModal : undefined}
            />
          )}
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              {isAdmin && (
                <button
                  className="fa-btn fa-btn-soft fa-btn-sm"
                  disabled={!discardedBrands.length}
                  onClick={openRecoverModal}
                  title={discardedBrands.length ? 'Recuperar marcas descartadas' : 'Não há marcas descartadas'}
                >
                  <Icon name="repeat" size={15} />Recuperar descartadas{discardedBrands.length ? ' (' + discardedBrands.length + ')' : ''}
                </button>
              )}
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshBrands}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Nova marca</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Fornecedor</label>
              <select className="fa-select" style={{ minWidth: 180 }} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                <option value="all">Todos os fornecedores</option>
                {supplierOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
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
                <th>Marca</th>
                <th>Fornecedores</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((brand) => (
                <tr key={brand.id}>
                  <td>
                    <div className="ph-td-name">{brand.name}</div>
                    <div className="ph-cell-sub">{brand.description || 'Sem descrição'}</div>
                  </td>
                  <td>
                    {brand.suppliers.length
                      ? brand.suppliers.map((supplier) => (
                        <span key={supplier.id} className="fa-badge fa-badge-mist" style={{ marginRight: 6, marginBottom: 4, display: 'inline-flex' }}>{supplier.tradeName || supplier.legalName}</span>
                      ))
                      : <span className="ph-cell-sub">Nenhum fornecedor vinculado</span>}
                  </td>
                  <td><span className="fa-badge" style={brand.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{brand.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditBrand(brand)}><Icon name="edit" size={14} />Editar</button>
                    <span style={{ marginLeft: 12, display: 'inline-flex', verticalAlign: 'middle', opacity: savingId === brand.id ? 0.5 : 1, pointerEvents: savingId === brand.id ? 'none' : 'auto' }}>
                      <Toggle
                        on={brand.active}
                        onChange={() => handleToggleActive(brand)}
                        ariaLabel={brand.active ? 'Desativar marca' : 'Ativar marca'}
                      />
                    </span>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === brand.id}
                      onClick={() => setDiscardTarget(brand)}
                      aria-label="Descartar marca"
                      title="Descartar marca"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="tag" size={28} /></span>
              <div>Nenhuma marca encontrada.</div>
              {(hasExtraFilters || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { clearFilters(); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editBrand && (
        <BrandModal
          title="Editar marca"
          submitLabel="Salvar alterações"
          initialBrand={editBrand}
          suppliers={suppliers || []}
          activeBusy={savingId === editBrand.id}
          onToggleActive={() => handleToggleActive(editBrand)}
          onDiscard={() => setDiscardTarget(editBrand)}
          onClose={() => setEditBrand(null)}
          onSave={async (payload) => {
            try {
              await updateBrand(editBrand.id, payload);
              setEditBrand(null);
              notify && notify('Marca atualizada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a marca.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <BrandModal
          title="Nova marca"
          submitLabel="Cadastrar marca"
          suppliers={suppliers || []}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addBrand(payload);
              setNewOpen(false);
              notify && notify('Marca cadastrada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar a marca.', 'warn');
            }
          }}
        />
      )}

      {discardTarget && (
        <ModalShell open={true} onClose={savingId === discardTarget.id ? () => {} : () => setDiscardTarget(null)} maxw={400}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14, background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="trash" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Descartar marca?</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            <strong>{discardTarget.name}</strong> será descartada e deixará de aparecer na lista de marcas. Um administrador pode recuperá-la a qualquer momento em "Recuperar descartadas".
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fa-btn fa-btn-ghost fa-btn-block" disabled={savingId === discardTarget.id} onClick={() => setDiscardTarget(null)}>Cancelar</button>
            <button className="fa-btn fa-btn-block" style={{ background: 'var(--fa-error)', color: '#fff', border: 'none' }} disabled={savingId === discardTarget.id} onClick={confirmDiscard}>
              <Icon name="trash" size={15} />Descartar
            </button>
          </div>
        </ModalShell>
      )}

      {recoverOpen && (
        <ModalShell open={true} onClose={recovering ? () => {} : () => setRecoverOpen(false)} maxw={480}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="repeat" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Recuperar marcas descartadas</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            Recupere todas de uma vez ou escolha individualmente quais marcas devem voltar a aparecer na lista.
          </p>
          {discardedBrands.length ? (
            <>
              <button className="fa-btn fa-btn-primary fa-btn-block" disabled={recovering} onClick={confirmRecoverAll}>
                <Icon name="repeat" size={15} />Recuperar todas ({discardedBrands.length})
              </button>
              <div className="ph-cell-sub" style={{ margin: '16px 0 8px' }}>Ou escolha quais recuperar:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 8 }}>
                {discardedBrands.map((brand) => (
                  <label key={brand.id} className="fa-check" data-on={selectedRecoverIds.has(brand.id) ? '1' : '0'} onClick={() => toggleRecoverSelection(brand.id)} style={{ padding: '6px 4px' }}>
                    <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
                    <span>{brand.name}</span>
                  </label>
                ))}
              </div>
              <button
                className="fa-btn fa-btn-soft fa-btn-block"
                style={{ marginTop: 12 }}
                disabled={recovering || !selectedRecoverIds.size}
                onClick={confirmRecoverSelected}
              >
                <Icon name="check" size={15} />Recuperar selecionadas ({selectedRecoverIds.size})
              </button>
            </>
          ) : (
            <div className="ph-cell-sub">Nenhuma marca descartada no momento.</div>
          )}
          <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 12 }} disabled={recovering} onClick={() => setRecoverOpen(false)}>Fechar</button>
        </ModalShell>
      )}
    </>
  );
}

function BrandModal({ title, submitLabel, initialBrand, suppliers, onClose, onSave, onToggleActive, onDiscard, activeBusy }) {
  const [form, setForm] = useState(() => ({
    name: initialBrand && initialBrand.name || '',
    description: initialBrand && initialBrand.description || '',
    supplierIds: initialBrand && initialBrand.supplierIds ? [...initialBrand.supplierIds] : [],
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2;

  const toggleSupplier = (supplierId) => {
    setForm((prev) => ({
      ...prev,
      supplierIds: prev.supplierIds.includes(supplierId)
        ? prev.supplierIds.filter((id) => id !== supplierId)
        : [...prev.supplierIds, supplierId],
    }));
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  const activeSuppliers = suppliers.filter((supplier) => supplier.active);

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={620}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="tag" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>

      {initialBrand && (
        <div className="fa-field" style={{ marginBottom: 18 }}>
          <label>Status da marca</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? 'none' : 'auto', display: 'inline-flex' }}>
              <Toggle on={initialBrand.active} onChange={onToggleActive} ariaLabel={initialBrand.active ? 'Desativar marca' : 'Ativar marca'} />
            </span>
            <span className="fa-badge" style={initialBrand.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
              {initialBrand.active ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={14} />Descartar marca
          </button>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Descartar remove a marca da lista; um administrador pode recuperá-la depois.</div>
        </div>
      )}

      <div className="fa-form2" style={{ marginTop: 14 }}>
        <div className="fa-field fa-span2"><label>Nome *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: EMS, Neo Química" /></div>
        <div className="fa-field fa-span2"><label>Descrição</label><input className="fa-input" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      </div>
      <div className="fa-field" style={{ marginTop: 12 }}>
        <label>Fornecedores que distribuem esta marca</label>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--fa-line)', borderRadius: 'var(--fa-r-input)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeSuppliers.length ? activeSuppliers.map((supplier) => (
            <label key={supplier.id} className="fa-check" data-on={form.supplierIds.includes(supplier.id) ? '1' : '0'} onClick={() => toggleSupplier(supplier.id)}>
              <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
              {supplier.tradeName || supplier.legalName}
            </label>
          )) : <div className="ph-cell-sub">Nenhum fornecedor ativo cadastrado ainda.</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { BrandsScreen };
