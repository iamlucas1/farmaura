import React, { useState } from "react";
import { ModalShell, Toggle } from "../../marketplace/core/marketplace-components.jsx";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";
import { AnCard } from "./analytics-screen.jsx";
import { InventoryEmpty } from "./inventory-screen.jsx";
import { TaxBreakdown, simplesEffectiveRate } from "./pricing-screen.jsx";

/* FARMAURA Console — Configurações do sistema.
   Reúne dados fiscais da farmácia: o regime tributário (hoje só Simples
   Nacional é implementado, com o cálculo real do Anexo I da LC 123/2006) e
   os CNAEs registrados, incluindo quais têm ICMS-ST — dados que o
   Precificador usa para tributar cada produto automaticamente. */

const CNAE_CODE_PATTERN = /^\d{2}\.\d{2}-\d-\d{2}$/;
const _p1 = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

const BR_STATES = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

function SettingsScreen({ ctx }) {
  const { cnaeSettings, setCnaeItems, setTaxRegime, saveCnaeSettings, cnaeSettingsBusy, onLogout } = ctx;
  const items = (cnaeSettings && cnaeSettings.items) || [];
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || { regime: 'simples_nacional', stateCode: '', trailing12mRevenue: 0 };
  const [modalState, setModalState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', index }
  const simples = simplesEffectiveRate(taxRegime.trailing12mRevenue);

  const upsertEntry = (entry, index) => {
    const next = items.slice();
    if (index == null) {
      next.push(entry);
    } else {
      next[index] = entry;
    }
    setCnaeItems(next);
    setModalState(null);
  };
  const removeEntry = (index) => setCnaeItems(items.filter((_, i) => i !== index));

  return (
    <>
      <Topbar title="Configurações do sistema" sub="Regime tributário e CNAEs usados para tributar cada produto no Precificador" onLogout={onLogout} ctx={ctx} />

      <div className="ph-content ph-content-wide" data-screen-label="Configurações do sistema">
        <AnCard icon="bank" title="Regime tributário" sub="Hoje só Simples Nacional está implementado — a alíquota efetiva sai do Anexo I da LC 123/2006, vigente desde 01/2018"
          right={<span className="fa-badge fa-badge-health"><Icon name="check" size={12} />Simples Nacional</span>}>
          <div className="fa-form2">
            <div className="fa-field">
              <label>Estado (UF)</label>
              <select className="fa-select" value={taxRegime.stateCode} onChange={(e) => setTaxRegime({ stateCode: e.target.value })}>
                <option value="">Selecione</option>
                {BR_STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
              </select>
              <div className="ph-cell-sub" style={{ marginTop: 4 }}>No Simples Nacional o ICMS é recolhido de forma unificada pelo DAS — o estado não muda a alíquota efetiva abaixo do sublimite (R$ 3.600.000,00/ano).</div>
            </div>
            <div className="fa-field">
              <label>Faturamento dos últimos 12 meses (RBT12)</label>
              <input
                className="fa-input"
                type="number"
                step="0.01"
                min="0"
                value={taxRegime.trailing12mRevenue}
                onChange={(e) => setTaxRegime({ trailing12mRevenue: Number(e.target.value || 0) })}
              />
            </div>
          </div>

          <div className="prc-breakdown" style={{ marginTop: 16 }}>
            <div className="prc-bd-title">Alíquota efetiva calculada</div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="ph-cell-sub">Faixa {simples.bracket} do Anexo I</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: 'var(--fa-primary)' }}>{_p1(simples.aliquotaEfetiva)}</span>
            </div>
            <TaxBreakdown simples={simples} stExempt={false} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={saveCnaeSettings} disabled={!!cnaeSettingsBusy}>
              <Icon name="check" size={14} />{cnaeSettingsBusy ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </AnCard>

        <div className="inv-card" style={{ marginTop: 18 }}>
          <div className="inv-card-head">
            <div>
              <div className="inv-card-head-title">CNAEs da farmácia</div>
              <div className="inv-card-head-sub">{items.length} atividade(s) registrada(s) · define o CNAE — e se o ICMS já vem por substituição tributária — de cada produto no Precificador</div>
            </div>
            <div className="inv-card-head-actions">
              <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={() => setModalState({ mode: 'create' })}>
                <Icon name="plus" size={14} stroke={2.2} />Adicionar CNAE
              </button>
            </div>
          </div>
          <div style={{ padding: items.length ? '4px 18px 18px' : 0 }}>
            {items.length === 0 && <InventoryEmpty icon="bank" label="Nenhum CNAE cadastrado ainda." />}
            {items.map((entry, index) => (
              <div className="fin-line" key={entry.code + '-' + index}>
                <span className="ic-soft" style={{ background: 'var(--fa-rose-soft)', color: 'var(--fa-primary)' }}>
                  <Icon name="bank" size={16} />
                </span>
                <div className="nm" style={{ flex: 1, minWidth: 0 }}>
                  <span className="fa-mono">{entry.code}</span>
                  {entry.isPrincipal && <span className="fa-badge fa-badge-health" style={{ fontSize: 10.5, marginLeft: 8 }}>Principal</span>}
                  {entry.isSubjectToIcmsSt && <span className="fa-badge fa-badge-mist" style={{ fontSize: 10.5, marginLeft: 8 }}><Icon name="lock" size={10} />ICMS-ST</span>}
                  <small>{entry.description || 'Sem descrição'}</small>
                </div>
                <div className="ph-row-actions">
                  <button className="fa-btn fa-btn-soft fa-btn-sm" onClick={() => setModalState({ mode: 'edit', index })}>
                    <Icon name="edit" size={14} />Editar
                  </button>
                  <button className="fa-iconbtn" style={{ width: 34, height: 34 }} onClick={() => removeEntry(index)} aria-label="Remover CNAE" title="Remover CNAE">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--fa-mist)' }}>
            <button className="fa-btn fa-btn-primary fa-btn-sm" onClick={saveCnaeSettings} disabled={!!cnaeSettingsBusy}>
              <Icon name="check" size={14} />{cnaeSettingsBusy ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>

        <div className="ph-cell-sub" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="info" size={13} style={{ flex: 'none' }} />
          O cálculo usa o Anexo I da LC 123/2006 (comércio) vigente desde 01/2018 — lei tributária muda com o tempo, então vale checar periodicamente com a contabilidade da farmácia. Marque "ICMS-ST" nos CNAEs cujos produtos já chegam com o ICMS recolhido pelo fornecedor (caso comum em medicamentos), para o Precificador não cobrar o imposto em dobro.
        </div>
      </div>

      {modalState && (
        <CnaeEntryModal
          initial={modalState.mode === 'edit' ? items[modalState.index] : null}
          onClose={() => setModalState(null)}
          onSave={(entry) => upsertEntry(entry, modalState.mode === 'edit' ? modalState.index : null)}
        />
      )}
    </>
  );
}

/* ===================== MODAL: ADICIONAR / EDITAR CNAE ===================== */
function CnaeEntryModal({ initial, onClose, onSave }) {
  const [code, setCode] = useState(initial ? initial.code : '');
  const [description, setDescription] = useState(initial ? initial.description : '');
  const [isPrincipal, setIsPrincipal] = useState(initial ? !!initial.isPrincipal : false);
  const [isSubjectToIcmsSt, setIsSubjectToIcmsSt] = useState(initial ? !!initial.isSubjectToIcmsSt : false);
  const codeValid = CNAE_CODE_PATTERN.test(code.trim());

  return (
    <ModalShell open={true} onClose={onClose} maxw={480}>
      <span className="fa-iconbox" style={{ width: 52, height: 52, marginBottom: 14 }}><Icon name="bank" size={26} /></span>
      <h2 className="fa-h3" style={{ fontSize: 20 }}>{initial ? 'Editar CNAE' : 'Adicionar CNAE'}</h2>
      <p className="fa-muted" style={{ fontSize: 13.5, marginTop: 6, marginBottom: 18 }}>
        Produtos atribuídos a este CNAE no Precificador são tributados pela alíquota efetiva do Simples Nacional definida acima.
      </p>

      <div className="fa-form2">
        <div className="fa-field">
          <label>Código do CNAE</label>
          <input className="fa-input" placeholder="00.00-0-00" value={code} onChange={(e) => setCode(e.target.value)} />
          {!codeValid && !!code.trim() && <div className="ph-cell-sub" style={{ color: 'var(--fa-error)', marginTop: 4 }}>Use o formato 00.00-0-00.</div>}
        </div>
        <div className="fa-field">
          <label>Descrição da atividade</label>
          <input className="fa-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Comércio varejista de produtos farmacêuticos" />
        </div>
      </div>

      <div className="fa-row" style={{ padding: 0, border: 'none', marginTop: 16 }}>
        <div className="fa-row-main">
          <div className="fa-row-label">Definir como CNAE principal</div>
          <div className="fa-row-desc">a atividade principal registrada na Receita Federal</div>
        </div>
        <Toggle on={isPrincipal} onChange={setIsPrincipal} ariaLabel="definir como CNAE principal" />
      </div>

      <div className="fa-row" style={{ padding: 0, border: 'none', marginTop: 14 }}>
        <div className="fa-row-main">
          <div className="fa-row-label">Produtos com ICMS-ST</div>
          <div className="fa-row-desc">o ICMS já vem recolhido pelo fornecedor/distribuidor — comum em medicamentos</div>
        </div>
        <Toggle on={isSubjectToIcmsSt} onChange={setIsSubjectToIcmsSt} ariaLabel="produtos deste CNAE têm ICMS-ST" />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="fa-btn fa-btn-soft" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
        <button
          className="fa-btn fa-btn-primary"
          style={{ flex: 2 }}
          disabled={!codeValid}
          onClick={() => onSave({ code: code.trim(), description: description.trim(), isPrincipal, isSubjectToIcmsSt })}
        >
          <Icon name="check" size={16} stroke={2.2} />{initial ? 'Salvar alterações' : 'Adicionar CNAE'}
        </button>
      </div>
    </ModalShell>
  );
}

export { CnaeEntryModal, SettingsScreen };
