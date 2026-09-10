import React, { useState } from "react";
import {
  Icon, PageHead, Modal, Field, FormGrid, SwitchToggle, Badge, RowIconBtn,
  EmptyState, confirmAction, showToast,
} from "../core/internal-ui.jsx";
import { TaxBreakdown, simplesEffectiveRate } from "./pricing-screen.jsx";

/* FARMAURA Console — Configurações do sistema.
   Reúne dados fiscais da farmácia: o regime tributário (hoje só Simples
   Nacional é implementado, com o cálculo real do Anexo I da LC 123/2006) e
   os CNAEs registrados, incluindo quais têm ICMS-ST — dados que o
   Precificador usa para tributar cada produto automaticamente. */

const CNAE_CODE_PATTERN = /^\d{2}\.\d{2}-\d-\d{2}$/;
const _p1 = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

const BR_STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"],
  ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
];

function SettingsScreen({ ctx }) {
  const { cnaeSettings, setCnaeItems, setTaxRegime, saveCnaeSettings, cnaeSettingsBusy } = ctx;
  const items = (cnaeSettings && cnaeSettings.items) || [];
  const taxRegime = (cnaeSettings && cnaeSettings.taxRegime) || { regime: "simples_nacional", stateCode: "", trailing12mRevenue: 0 };
  const [modalState, setModalState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', index }
  const simples = simplesEffectiveRate(taxRegime.trailing12mRevenue);

  const upsertEntry = (entry, index) => {
    const next = items.slice();
    if (index == null) next.push(entry); else next[index] = entry;
    setCnaeItems(next);
    setModalState(null);
  };
  const removeEntry = async (index) => {
    const ok = await confirmAction({ title: "Remover CNAE?", body: "O CNAE deixa de estar disponível para tributar produtos no Precificador.", entity: items[index].code, danger: true, confirmLabel: "Remover" });
    if (ok) setCnaeItems(items.filter((_, i) => i !== index));
  };
  const save = async () => {
    try {
      await saveCnaeSettings();
      showToast({ message: "Configurações fiscais salvas." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível salvar." });
    }
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Sistema"
        title="Configurações"
        desc="Regime tributário e CNAEs usados para tributar cada produto no Precificador."
        actions={(
          <button className="btn btn-primary" onClick={save} disabled={!!cnaeSettingsBusy}>
            <Icon name="check" size={14} />{cnaeSettingsBusy ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>Regime tributário</h3>
            <div className="card-head-sub">A alíquota efetiva sai do Anexo I da LC 123/2006, vigente desde 01/2018.</div>
          </div>
          <Badge tone="good" dot>Simples Nacional</Badge>
        </div>
        <div className="card-pad">
          <div className="grid g-2">
            <Field label="Estado (UF)" hint="No Simples o ICMS é recolhido de forma unificada pelo DAS — o estado não muda a alíquota efetiva abaixo do sublimite (R$ 3.600.000,00/ano).">
              <select className="input" value={taxRegime.stateCode} onChange={(e) => setTaxRegime({ stateCode: e.target.value })}>
                <option value="">Selecione</option>
                {BR_STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
              </select>
            </Field>
            <Field label="Faturamento dos últimos 12 meses (RBT12)">
              <input
                className="input" type="number" step="0.01" min="0"
                value={taxRegime.trailing12mRevenue}
                onChange={(e) => setTaxRegime({ trailing12mRevenue: Number(e.target.value || 0) })}
              />
            </Field>
          </div>

          <div className="card card-pad" style={{ marginTop: 16, background: "var(--surface-2)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span className="page-desc" style={{ margin: 0 }}>Alíquota efetiva · faixa {simples.bracket} do Anexo I</span>
              <span style={{ fontWeight: 800, fontSize: 22, color: "var(--accent)" }}>{_p1(simples.aliquotaEfetiva)}</span>
            </div>
            <TaxBreakdown simples={simples} stExempt={false} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>CNAEs da farmácia</h3>
            <div className="card-head-sub">{items.length} atividade(s) registrada(s) · define o CNAE — e se o ICMS já vem por substituição tributária — de cada produto no Precificador.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModalState({ mode: "create" })}>
            <Icon name="plus" size={13} />Adicionar CNAE
          </button>
        </div>
        <div className="card-pad">
          {items.length === 0
            ? <EmptyState icon="bank" title="Nenhum CNAE cadastrado ainda" />
            : items.map((entry, index) => (
              <div key={entry.code + "-" + index} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: index < items.length - 1 ? "1px solid var(--border)" : "none" }}>
                <span className="stat-icon" style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}><Icon name="bank" size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono cell-strong">{entry.code}</span>
                    {entry.isPrincipal && <Badge tone="good">Principal</Badge>}
                    {entry.isSubjectToIcmsSt && <Badge tone="neutral"><Icon name="lock" size={10} />ICMS-ST</Badge>}
                  </div>
                  <div className="cell-muted" style={{ fontSize: 12, marginTop: 2 }}>{entry.description || "Sem descrição"}</div>
                </div>
                <div className="row-actions">
                  <RowIconBtn name="edit" onClick={() => setModalState({ mode: "edit", index })} label="Editar" />
                  <RowIconBtn name="trash" tone="danger" onClick={() => removeEntry(index)} label="Remover CNAE" />
                </div>
              </div>
            ))}
        </div>
      </div>

      <p className="page-desc" style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 7 }}>
        <Icon name="info" size={13} style={{ flex: "none", marginTop: 2 }} />
        O cálculo usa o Anexo I da LC 123/2006 (comércio) vigente desde 01/2018 — lei tributária muda, então vale checar com a contabilidade. Marque "ICMS-ST" nos CNAEs cujos produtos já chegam com o ICMS recolhido pelo fornecedor, para o Precificador não cobrar o imposto em dobro.
      </p>

      {modalState && (
        <CnaeEntryModal
          initial={modalState.mode === "edit" ? items[modalState.index] : null}
          onClose={() => setModalState(null)}
          onSave={(entry) => upsertEntry(entry, modalState.mode === "edit" ? modalState.index : null)}
        />
      )}
    </div>
  );
}

function CnaeEntryModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    code: initial ? initial.code : "",
    description: initial ? initial.description : "",
    isPrincipal: initial ? !!initial.isPrincipal : false,
    isSubjectToIcmsSt: initial ? !!initial.isSubjectToIcmsSt : false,
  }));
  const [errors, setErrors] = useState([]);
  const codeValid = CNAE_CODE_PATTERN.test((form.code || "").trim());
  const change = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => p.filter((x) => x !== k)); };

  const submit = () => {
    if (!codeValid) { setErrors(["code"]); return; }
    onSave({ code: form.code.trim(), description: (form.description || "").trim(), isPrincipal: form.isPrincipal, isSubjectToIcmsSt: form.isSubjectToIcmsSt });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Editar CNAE" : "Adicionar CNAE"}
      subtitle="Produtos atribuídos a este CNAE são tributados pela alíquota efetiva do Simples definida na tela."
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!codeValid} onClick={submit}>
            <Icon name="check" size={14} />{initial ? "Salvar alterações" : "Adicionar CNAE"}
          </button>
        </>
      )}
    >
      <FormGrid
        fields={[
          { key: "code", label: "Código do CNAE", required: true, placeholder: "00.00-0-00", hint: form.code && !codeValid ? "Use o formato 00.00-0-00." : undefined },
          { key: "description", label: "Descrição da atividade", placeholder: "Ex.: Comércio varejista de produtos farmacêuticos" },
        ]}
        values={form}
        onChange={change}
        errors={errors}
      />
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Definir como CNAE principal</div>
            <div className="page-desc" style={{ margin: "2px 0 0" }}>a atividade principal registrada na Receita Federal</div>
          </div>
          <SwitchToggle on={form.isPrincipal} onChange={(v) => change("isPrincipal", v)} label="definir como CNAE principal" />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Produtos com ICMS-ST</div>
            <div className="page-desc" style={{ margin: "2px 0 0" }}>o ICMS já vem recolhido pelo fornecedor/distribuidor — comum em medicamentos</div>
          </div>
          <SwitchToggle on={form.isSubjectToIcmsSt} onChange={(v) => change("isSubjectToIcmsSt", v)} label="produtos deste CNAE têm ICMS-ST" />
        </div>
      </div>
    </Modal>
  );
}

export { CnaeEntryModal, SettingsScreen };
