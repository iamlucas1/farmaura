import React, { useEffect, useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { InventoryKpi } from "./inventory-screen.jsx";

/* FARMAURA Console — Cadastro de serviços de saúde (procedimentos e valores) oferecidos pela farmácia. */
function HealthServicesScreen({ ctx }) {
  const { healthServicesAdmin, refreshHealthServicesAdmin, addHealthService, updateHealthService, setHealthServiceActive, notify } = ctx;
  const [q, setQ] = useState('');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [editService, setEditService] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    refreshHealthServicesAdmin && refreshHealthServicesAdmin();
  }, []);

  const services = healthServicesAdmin || [];
  const activeCount = services.filter((service) => service.active).length;
  const inactiveCount = services.filter((service) => !service.active).length;

  const rows = services.filter((service) => {
    if (kpiFilter === 'active' && !service.active) return false;
    if (kpiFilter === 'inactive' && service.active) return false;
    if (q && !(service.name + service.group + service.description).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((left, right) => (left.name || '').localeCompare(right.name || '', 'pt-BR'));

  const handleToggleActive = async (service) => {
    setSavingId(service.id);
    try {
      await setHealthServiceActive(service.id, !service.active);
      notify && notify(service.active ? 'Serviço desativado.' : 'Serviço ativado.', 'success');
    } catch (error) {
      notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o serviço.', 'warn');
    } finally {
      setSavingId('');
    }
  };

  return (
    <>
      <Topbar title="Serviços de saúde" sub={rows.length + ' serviço(s) exibido(s)'} onLogout={ctx.onLogout} ctx={ctx}>
        <div className="ph-topsearch">
          <Icon name="search" size={17} style={{ color: 'var(--fa-ink-3)' }} />
          <input placeholder="Buscar por nome, grupo ou descrição" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Topbar>

      <div className="ph-content ph-content-wide">
        <div className="inv-kpis">
          <InventoryKpi icon="grid" label="Todos" value={services.length} active={kpiFilter === 'all'} onClick={() => setKpiFilter('all')} />
          <InventoryKpi icon="check" label="Ativos" value={activeCount} tone="success" active={kpiFilter === 'active'} onClick={() => setKpiFilter('active')} />
          <InventoryKpi icon="pause" label="Inativos" value={inactiveCount} active={kpiFilter === 'inactive'} onClick={() => setKpiFilter('inactive')} />
        </div>

        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="inv-actions">
              <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={refreshHealthServicesAdmin}><Icon name="repeat" size={15} />Atualizar</button>
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setNewOpen(true)}><Icon name="plus" size={15} stroke={2.2} />Novo serviço</button>
            </div>
          </div>
        </div>

        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Grupo</th>
                <th>Duração</th>
                <th>Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((service) => (
                <tr key={service.id}>
                  <td>
                    <div className="ph-td-name">{service.name}</div>
                    <div className="ph-cell-sub">{service.code}</div>
                  </td>
                  <td>{service.group || '—'}</td>
                  <td>{service.durationLabel || '—'}</td>
                  <td>{'R$ ' + service.price.toFixed(2).replace('.', ',')}</td>
                  <td><span className="fa-badge" style={service.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>{service.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setEditService(service)}><Icon name="edit" size={14} />Editar</button>
                    <span style={{ marginLeft: 12, display: 'inline-flex', verticalAlign: 'middle', opacity: savingId === service.id ? 0.5 : 1, pointerEvents: savingId === service.id ? 'none' : 'auto' }}>
                      <Toggle
                        on={service.active}
                        onChange={() => handleToggleActive(service)}
                        ariaLabel={service.active ? 'Desativar serviço' : 'Ativar serviço'}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="ph-empty">
              <span className="fa-iconbox"><Icon name="activity" size={28} /></span>
              <div>Nenhum serviço de saúde encontrado.</div>
              {(kpiFilter !== 'all' || q) && (
                <button className="fa-btn fa-btn-soft fa-btn-sm" style={{ marginTop: 10 }} onClick={() => { setKpiFilter('all'); setQ(''); }}>
                  <Icon name="close" size={14} />Limpar busca e filtros
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editService && (
        <HealthServiceModal
          title="Editar serviço"
          submitLabel="Salvar alterações"
          initialService={editService}
          activeBusy={savingId === editService.id}
          onToggleActive={() => handleToggleActive(editService)}
          onClose={() => setEditService(null)}
          onSave={async (payload) => {
            try {
              await updateHealthService(editService.id, { ...payload, active: editService.active });
              setEditService(null);
              notify && notify('Serviço atualizado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível atualizar o serviço.', 'warn');
            }
          }}
        />
      )}
      {newOpen && (
        <HealthServiceModal
          title="Novo serviço"
          submitLabel="Cadastrar serviço"
          onClose={() => setNewOpen(false)}
          onSave={async (payload) => {
            try {
              await addHealthService(payload);
              setNewOpen(false);
              notify && notify('Serviço cadastrado.', 'success');
            } catch (error) {
              notify && notify(error && error.message ? error.message : 'Não foi possível cadastrar o serviço.', 'warn');
            }
          }}
        />
      )}
    </>
  );
}

function HealthServiceModal({ title, submitLabel, initialService, onClose, onSave, onToggleActive, activeBusy }) {
  const [form, setForm] = useState(() => ({
    name: initialService && initialService.name || '',
    group: initialService && initialService.group || '',
    icon: initialService && initialService.icon || 'activity',
    description: initialService && initialService.description || '',
    durationLabel: initialService && initialService.durationLabel || '',
    durationMinutes: initialService ? initialService.durationMinutes : 0,
    price: initialService ? initialService.price : 0,
  }));
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const valid = form.name.trim().length >= 2 && form.price >= 0;

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell open={true} onClose={busy ? () => {} : onClose} maxw={560}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name={form.icon || 'activity'} size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{title}</h2>

      {initialService && (
        <div className="fa-field" style={{ marginTop: 14, marginBottom: 4 }}>
          <label>Status do serviço</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ opacity: activeBusy ? 0.5 : 1, pointerEvents: activeBusy ? 'none' : 'auto', display: 'inline-flex' }}>
              <Toggle on={initialService.active} onChange={onToggleActive} ariaLabel={initialService.active ? 'Desativar serviço' : 'Ativar serviço'} />
            </span>
            <span className="fa-badge" style={initialService.active ? { background: 'var(--fa-success-soft)', color: 'var(--fa-success)' } : { background: 'var(--fa-mist-2)', color: 'var(--fa-ink-3)' }}>
              {initialService.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
      )}

      <div className="fa-form2" style={{ marginTop: 14 }}>
        <div className="fa-field fa-span2"><label>Nome do procedimento *</label><input className="fa-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Aplicação de vacina influenza" /></div>
        <div className="fa-field"><label>Grupo</label><input className="fa-input" value={form.group} onChange={(e) => set('group', e.target.value)} placeholder="Ex.: Imunização" /></div>
        <div className="fa-field"><label>Ícone</label><input className="fa-input" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="activity, shield, syringe..." /></div>
        <div className="fa-field"><label>Duração (rótulo)</label><input className="fa-input" value={form.durationLabel} onChange={(e) => set('durationLabel', e.target.value)} placeholder="Ex.: 20 min" /></div>
        <div className="fa-field"><label>Duração (minutos)</label><input className="fa-input" type="number" min="0" value={form.durationMinutes} onChange={(e) => set('durationMinutes', Math.max(0, Number(e.target.value) || 0))} /></div>
        <div className="fa-field fa-span2"><label>Valor (R$) *</label><input className="fa-input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', Math.max(0, Number(e.target.value) || 0))} /></div>
        <div className="fa-field fa-span2"><label>Descrição</label><input className="fa-input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="O que o cliente deve esperar do procedimento" /></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="fa-btn fa-btn-primary" style={{ flex: 2 }} disabled={!valid || busy} onClick={handleSave}><Icon name="check" size={16} />{submitLabel}</button>
      </div>
    </ModalShell>
  );
}

export { HealthServiceModal, HealthServicesScreen };
