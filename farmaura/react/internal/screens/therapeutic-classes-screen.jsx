import React, { useEffect, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Cadastro de classes terapêuticas. */
function TherapeuticClassesScreen({ ctx }) {
  const {
    therapeuticClasses, refreshTherapeuticClasses, categories, refreshCategories,
    addTherapeuticClass, updateTherapeuticClass, setTherapeuticClassActive, setTherapeuticClassDiscarded,
    notify, onLogout, user,
  } = ctx;
  const isAdmin = !!(user && window.FA_ACCESS && user.role === window.FA_ACCESS.ROLE.ADMIN);
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editClass, setEditClass] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [discardTarget, setDiscardTarget] = useState(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [selectedRecoverIds, setSelectedRecoverIds] = useState(() => new Set());
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    refreshTherapeuticClasses && refreshTherapeuticClasses();
    refreshCategories && refreshCategories();
  }, []);

  const availableClasses = (therapeuticClasses || []).filter((item) => !item.discarded);
  const activeCount = availableClasses.filter((item) => item.active).length;
  const inactiveCount = availableClasses.filter((item) => !item.active).length;
  const noCategoryCount = availableClasses.filter((item) => !item.categoryId).length;
  const categoryOptions = (categories || []).filter((category) => category.active && !category.discarded);
  const hasExtraFilters = kpiFilter !== 'all' || categoryFilter !== 'all';

  const rows = availableClasses.filter((item) => {
    if (kpiFilter === 'active' && !item.active) return false;
    if (kpiFilter === 'inactive' && item.active) return false;
    if (kpiFilter === 'no_category' && item.categoryId) return false;
    if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
    if (q && !(item.name + item.description).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const clearFilters = () => {
    setKpiFilter('all');
    setCategoryFilter('all');
  };

  const handleToggleActive = async (item) => {
    setSavingId(item.id);
    try {
      await setTherapeuticClassActive(item.id, !item.active);
      notify && notify(item.active ? 'Classe terapêutica desativada.' : 'Classe terapêutica ativada.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a classe terapêutica.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const confirmDiscard = async () => {
    const item = discardTarget;
    if (!item) return;
    setSavingId(item.id);
    try {
      await setTherapeuticClassDiscarded(item.id, true);
      notify && notify('Classe terapêutica descartada.', 'success');
      setDiscardTarget(null);
      setEditClass((prev) => (prev && prev.id === item.id ? null : prev));
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível descartar a classe terapêutica.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  const discardedClasses = (therapeuticClasses || []).filter((item) => item.discarded);

  const openRecoverModal = () => {
    setSelectedRecoverIds(new Set());
    setRecoverOpen(true);
  };

  const toggleRecoverSelection = (classId) => {
    setSelectedRecoverIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId); else next.add(classId);
      return next;
    });
  };

  const recoverClasses = async (ids) => {
    if (!ids.length) return;
    setRecovering(true);
    try {
      for (const id of ids) {
        await setTherapeuticClassDiscarded(id, false);
      }
      notify && notify(ids.length + ' classe(s) recuperada(s).', 'success');
      setRecoverOpen(false);
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível recuperar as classes selecionadas.', 'warn');
    } finally {
      setRecovering(false);
    }
  };

  const confirmRecoverAll = () => recoverClasses(discardedClasses.map((item) => item.id));
  const confirmRecoverSelected = () => recoverClasses(Array.from(selectedRecoverIds));

  return (
    <>
      <Topbar title="Classes terapêuticas" sub={rows.length + ' classe(s) exibida(s)'} onLogout={onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="pill" label="Todas" value={availableClasses.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativas" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativas" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
          <InventoryKpi icon="grid" label="Sem categoria" value={noCategoryCount} tone={noCategoryCount ? 'warn' : undefined} active={kpiFilter === 'no_category'} onClick={() => setKpiFilter('no_category')} />
          {isAdmin && (
            <InventoryKpi
              icon="trash"
              label="Descartadas"
              value={discardedClasses.length}
              tone={discardedClasses.length ? 'error' : undefined}
              active={false}
              onClick={discardedClasses.length ? openRecoverModal : undefined}
            />
          )}
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              {isAdmin && (
                <button
                  className="fa-btn fa-btn-soft fa-btn-sm"
                  disabled={!discardedClasses.length}
                  onClick={openRecoverModal}
                  title={discardedClasses.length ? 'Recuperar classes descartadas' : 'Não há classes descartadas'}
                >
                  <Icon name="repeat" size={15} />Recuperar descartadas{discardedClasses.length ? ' (' + discardedClasses.length + ')' : ''}
                </button>
              )}
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshTherapeuticClasses}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Nova classe</button>
            </div>
          </div>
          <div className="inv-toolbar-row is-filters">
            <div className="inv-filter-field">
              <label>Categoria</label>
              <select className="fa-select" style={{ minWidth: 170 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Todas as categorias</option>
                {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
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
                <th>Classe terapêutica</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><div className="ph-td-name">{item.name}</div></td>
                  <td>{item.categoryName || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td><span className="fa-badge" style={item.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{item.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditClass(item)}><Icon name="edit" size={14} />Editar</button>
                    <span style={{ marginLeft: 12, display: 'inline-flex', verticalAlign: 'middle', opacity: savingId === item.id ? 0.5 : 1, pointerEvents: savingId === item.id ? 'none' : 'auto' }}>
                      <Toggle
                        on={item.active}
                        onChange={() => handleToggleActive(item)}
                        ariaLabel={item.active ? 'Desativar classe' : 'Ativar classe'}
                      />
                    </span>
                    <button
                      className="fa-iconbtn"
                      style={{ marginLeft: 8, width: 34, height: 34 }}
                      disabled={savingId === item.id}
                      onClick={() => setDiscardTarget(item)}
                      aria-label="Descartar classe"
                      title="Descartar classe"
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
              <span className="fa-iconbox"><Icon name="pill" size={28} /></span>
              <div>Nenhuma classe terapêutica encontrada.</div>
              {(hasExtraFilters || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { clearFilters(); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editClass && (
        <TherapeuticClassModal
          title="Editar classe terapêutica"
          submitLabel="Salvar alterações"
          initialClass={editClass}
          categories={categoryOptions}
          activeBusy={savingId === editClass.id}
          onToggleActive={() => handleToggleActive(editClass)}
          onDiscard={() => setDiscardTarget(editClass)}
          onClose={() => setEditClass(null)}
          onSave={async (payload) => {
            try {
              await updateTherapeuticClass(editClass.id, payload);
              setEditClass(null);
              notify && notify('Classe terapêutica atualizada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar a classe terapêutica.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <TherapeuticClassModal
          title="Nova classe terapêutica"
          submitLabel="Cadastrar classe"
          categories={categoryOptions}
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addTherapeuticClass(payload);
              setNewOpen(false);
              notify && notify('Classe terapêutica cadastrada.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar a classe terapêutica.', 'warn');
            }
          }}
        />
      )}

      {discardTarget && (
        <ModalShell open={true} onClose={savingId === discardTarget.id ? () => {} : () => setDiscardTarget(null)} maxw={400}>
          <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14, background: '#FBEAE9', color: 'var(--fa-error)' }}><Icon name="trash" size={24} /></span>
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Descartar classe terapêutica?</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            <strong>{discardTarget.name}</strong> será descartada e deixará de aparecer na lista de classes. Um administrador pode recuperá-la a qualquer momento em "Recuperar descartadas".
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
          <h2 className="fa-h3" style={{ fontSize: 20 }}>Recuperar classes descartadas</h2>
          <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
            Recupere todas de uma vez ou escolha individualmente quais classes devem voltar a aparecer na lista.
          </p>
          {discardedClasses.length ? (
            <>
              <button className="fa-btn fa-btn-primary fa-btn-block" disabled={recovering} onClick={confirmRecoverAll}>
                <Icon name="repeat" size={15} />Recuperar todas ({discardedClasses.length})
              </button>
              <div className="ph-cell-sub" style={{ margin: '16px 0 8px' }}>Ou escolha quais recuperar:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: '1px solid var(--fa-mist)', borderRadius: 12, padding: 8 }}>
                {discardedClasses.map((item) => (
                  <label key={item.id} className="fa-check" data-on={selectedRecoverIds.has(item.id) ? '1' : '0'} onClick={() => toggleRecoverSelection(item.id)} style={{ padding: '6px 4px' }}>
                    <span className="box"><Icon name="check" size={14} stroke={2.6} /></span>
                    <span>{item.name}</span>
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
            <div className="ph-cell-sub">Nenhuma classe descartada no momento.</div>
          )}
          <button className="fa-btn fa-btn-ghost fa-btn-block" style={{ marginTop: 12 }} disabled={recovering} onClick={() => setRecoverOpen(false)}>Fechar</button>
        </ModalShell>
      )}
    </>
  );
}

function TherapeuticClassModal({ title, submitLabel, initialClass, categories, onClose, onSave, onToggleActive, onDiscard, activeBusy }) {
  const [form, setForm] = useState(() => ({
    name: initialClass && initialClass.name || '',
    description: initialClass && initialClass.description || '',
    categoryId: initialClass && initialClass.categoryId || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2 && !!form.categoryId;

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
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="pill" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>

      {initialClass && (
        <div className="fa-field" style={{ marginTop: 14, marginBottom: 4 }}>
          <label>Status da classe</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? 'none' : 'auto', display: 'inline-flex' }}>
              <Toggle on={initialClass.active} onChange={onToggleActive} ariaLabel={initialClass.active ? 'Desativar classe' : 'Ativar classe'} />
            </span>
            <span className="fa-badge" style={initialClass.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
              {initialClass.active ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <button type="button" className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} disabled={activeBusy} onClick={onDiscard}>
            <Icon name="trash" size={14} />Descartar classe
          </button>
          <div className="ph-cell-sub" style={{ marginTop: 4 }}>Descartar remove a classe da lista; um administrador pode recuperá-la depois.</div>
        </div>
      )}

      <div className="fa-field" style={{ marginTop: 14 }}><label>Nome *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Antibiótico" /></div>
      <div className="fa-field" style={{ marginTop: 12 }}>
        <label>Categoria *</label>
        <select className="fa-select" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">Selecione uma categoria</option>
          {(categories || []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <div className="ph-cell-sub" style={{ marginTop: 6 }}>Define em quais produtos esta classe pode ser usada, e como ela aparece no filtro "Tipo" do marketplace.</div>
      </div>
      <div className="fa-field" style={{ marginTop: 12 }}><label>Descrição</label><input className="fa-input" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { TherapeuticClassesScreen };
