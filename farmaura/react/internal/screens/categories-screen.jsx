import React, { useEffect, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Cadastro de categorias de produto. */
function CategoriesScreen({ ctx }) {
  const { categories, refreshCategories, addCategory, updateCategory, setCategoryActive, setCategoryDiscarded, notify, onLogout, user } = ctx;
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [editCategory, setEditCategory] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [discardTarget, setDiscardTarget] = useState(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [selectedRecoverIds, setSelectedRecoverIds] = useState(() => new Set());
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    refreshCategories && refreshCategories();
  }, []);

  const availableCategories = (categories || []).filter((category) => !category.discarded);
  const activeCount = availableCategories.filter((category) => category.active).length;
  const inactiveCount = availableCategories.filter((category) => !category.active).length;
  const noDescriptionCount = availableCategories.filter((category) => !category.description).length;

  const rows = availableCategories.filter((category) => {
    if (kpiFilter === 'active' && !category.active) return false;
    if (kpiFilter === 'inactive' && category.active) return false;
    if (kpiFilter === 'no_description' && category.description) return false;
    if (q && !(category.name + category.description).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const handleToggleActive = async (category) => {
    setSavingId(category.id);
    try {
      await setCategoryActive(category.id, !category.active);
      notify && notify(category.active ? 'Categoria desativada.' : 'Categoria ativada.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a categoria.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const confirmDiscard = async () => {
    const category = discardTarget;
    if (!category) return;
    setSavingId(category.id);
    try {
      await setCategoryDiscarded(category.id, true);
      notify && notify('Categoria descartada.', 'success');
      setDiscardTarget(null);
      setEditCategory((prev) => (prev && prev.id === category.id ? null : prev));
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível descartar a categoria.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const discardedCategories = (categories || []).filter((category) => category.discarded);

  const openRecoverModal = () => {
    setSelectedRecoverIds(new Set());
    setRecoverOpen(true);
  };

  const toggleRecoverSelection = (categoryId) => {
    setSelectedRecoverIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
      return next;
    });
  };

  const recoverCategories = async (ids) => {
    if (!ids.length) return;
    setRecovering(true);
    try {
      for (const id of ids) {
        await setCategoryDiscarded(id, false);
      }
      notify && notify(ids.length + ' categoria(s) recuperada(s).', 'success');
      setRecoverOpen(false);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível recuperar as categorias selecionadas.', 'warn');
    } finally {
      setRecovering(false);
    }
  };

  const confirmRecoverAll = () => recoverCategories(discardedCategories.map((category) => category.id));
  const confirmRecoverSelected = () => recoverCategories(Array.from(selectedRecoverIds));

  return (
    <>
      <Topbar title="Categorias" sub={rows.length + ' categoria(s) exibida(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todas" value={availableCategories.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativas" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativas" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="edit" label="Sem descrição" value={noDescriptionCount} tone={noDescriptionCount ? 'warn' : undefined} active={kpiFilter === 'no_description'} onClick={() => setKpiFilter('no_description')} />
          {isAdmin && (
            <InventoryKpi
              icon="trash"
              label="Descartadas"
              value={discardedCategories.length}
              tone={discardedCategories.length ? 'error' : undefined}
              active={false}
              onClick={discardedCategories.length ? openRecoverModal : undefined}
            />
          )}
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              {isAdmin && (
                <button
                  className="fa-btn fa-btn-soft fa-btn-sm"
                  disabled={!discardedCategories.length}
                  onClick={openRecoverModal}
                  title={discardedCategories.length ? 'Recuperar categorias descartadas' : 'Não há categorias descartadas'}
                >
                  <Icon name="repeat" size={15} />Recuperar descartadas{discardedCategories.length ? ' (' + discardedCategories.length + ')' : ''}
                </button>
              )}
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshCategories}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Nova categoria</button>
            </div>
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((category) => (
                <tr key={category.id}>
                  <td><div className="ph-td-name">{category.name}</div></td>
                  <td>{category.description || '—'}</td>
                  <td><span className="fa-badge" style={category.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{category.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditCategory(category)}><Icon name="edit" size={14} />Editar</button>
                    <span style={{ marginLeft: 12, display: 'inline-flex', verticalAlign: 'middle', opacity: savingId === category.id ? 0.5 : 1, pointerEvents: savingId === category.id ? 'none' : 'auto' }}>
                      <Toggle
                        on={category.active}
                        onChange={() => handleToggleActive(category)}
                        ariaLabel={category.active ? 'Desativar categoria' : 'Ativar categoria'}
                      />
                    </span>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === category.id}
                      onClick={() => setDiscardTarget(category)}
                      aria-label="Descartar categoria"
                      title="Descartar categoria"
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
              <span className="fa-iconbox"><Icon name="grid" size={28} /></span>
              <div>Nenhuma categoria encontrada.</div>
              {(kpiFilter !== 'all' || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { setKpiFilter('all'); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editCategory && (
        <CategoryModal
          title="Editar categoria"
          submitLabel="Salvar alterações"
          initialCategory={editCategory}
          activeBusy={savingId === editCategory.id}
          onToggleActive={() => handleToggleActive(editCategory)}
          onDiscard={() => setDiscardTarget(editCategory)}
          onClose={() => setEditCategory(null)}
          onSave={async (payload) => {
            try {
              await updateCategory(editCategory.id, payload);
              setEditCategory(null);
              notify && notify('Categoria atualizada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a categoria.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <CategoryModal
          title="Nova categoria"
          submitLabel="Cadastrar categoria"
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addCategory(payload);
              setNewOpen(false);
              notify && notify('Categoria cadastrada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar a categoria.', 'warn');
            }
          }}
        />
      )}

      {discardTarget && (
        <ModalShell open={true} onClose={savingId === discardTarget.id ? () => {} : () => setDiscardTarget(null)} maxw={400}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14, background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="trash" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Descartar categoria?</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            <strong>{discardTarget.name}</strong> será descartada e deixará de aparecer na lista de categorias. Um administrador pode recuperá-la a qualquer momento em "Recuperar descartadas".
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
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Recuperar categorias descartadas</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            Recupere todas de uma vez ou escolha individualmente quais categorias devem voltar a aparecer na lista.
          </p>
          {discardedCategories.length ? (
            <>
              <button className="fa-btn fa-btn-primary fa-btn-block" disabled={recovering} onClick={confirmRecoverAll}>
                <Icon name="repeat" size={15} />Recuperar todas ({discardedCategories.length})
              </button>
              <div className="ph-cell-sub" style={{ margin: '16px 0 8px' }}>Ou escolha quais recuperar:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 8 }}>
                {discardedCategories.map((category) => (
                  <label key={category.id} className="fa-check" data-on={selectedRecoverIds.has(category.id) ? '1' : '0'} onClick={() => toggleRecoverSelection(category.id)} style={{ padding: '6px 4px' }}>
                    <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
                    <span>{category.name}</span>
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
            <div className="ph-cell-sub">Nenhuma categoria descartada no momento.</div>
          )}
          <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 12 }} disabled={recovering} onClick={() => setRecoverOpen(false)}>Fechar</button>
        </ModalShell>
      )}
    </>
  );
}

function CategoryModal({ title, submitLabel, initialCategory, onClose, onSave, onToggleActive, onDiscard, activeBusy }) {
  const [form, setForm] = useState(() => ({
    name: initialCategory && initialCategory.name || '',
    description: initialCategory && initialCategory.description || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={480}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="grid" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>

      {initialCategory && (
        <div className="fa-field" style={{ marginTop: 14, marginBottom: 4 }}>
          <label>Status da categoria</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? 'none' : 'auto', display: 'inline-flex' }}>
              <Toggle on={initialCategory.active} onChange={onToggleActive} ariaLabel={initialCategory.active ? 'Desativar categoria' : 'Ativar categoria'} />
            </span>
            <span className="fa-badge" style={initialCategory.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
              {initialCategory.active ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={14} />Descartar categoria
          </button>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Descartar remove a categoria da lista; um administrador pode recuperá-la depois.</div>
        </div>
      )}

      <div className="fa-field" style={{ marginTop: 14 }}><label>Nome *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Perfumaria" /></div>
      <div className="fa-field" style={{ marginTop: 12 }}><label>Descrição</label><input className="fa-input" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { CategoriesScreen };
