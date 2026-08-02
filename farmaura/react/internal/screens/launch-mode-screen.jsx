import React from "react";
import { Icon } from "../../marketplace/core/marketplace-icons.jsx";
import { Topbar } from "../core/internal-shell.jsx";

const DEFAULT_LAUNCH_AT_LOCAL = '2026-09-05T09:00';

const pad2 = (n) => String(n).padStart(2, '0');

// `<input type="datetime-local">` has no timezone — the value is interpreted (and re-displayed)
// in whatever timezone the admin's browser is running in, which for this single-tenant pharmacy
// console is assumed to be the store's own local time. Converted to/from a real ISO instant so the
// marketplace's countdown (which compares against `new Date()`, UTC-aware) resolves correctly
// regardless of the admin's or a visitor's own browser timezone.
const isoToLocalInputValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const localInputValueToIso = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

/* FARMAURA Console — Modo "em breve"/contador regressivo que substitui a vitrine inteira do marketplace até a data de lançamento, para todo visitante. */
function LaunchModeScreen({ ctx }) {
  const { launchMode, setLaunchMode, saveLaunchMode, launchModeBusy } = ctx;
  const enabled = !!(launchMode && launchMode.enabled);
  const launchAtLocal = isoToLocalInputValue(launchMode && launchMode.launchAt) || DEFAULT_LAUNCH_AT_LOCAL;
  const headline = (launchMode && launchMode.headline) || '';
  const subtext = (launchMode && launchMode.subtext) || '';

  const launchDate = new Date(localInputValueToIso(launchAtLocal) || launchMode.launchAt);
  const isPast = !Number.isNaN(launchDate.getTime()) && launchDate.getTime() <= Date.now();

  const handleSave = async () => {
    await saveLaunchMode();
  };

  return (
    <>
      <Topbar title="Modo de lançamento" sub="Página de 'em breve' com contador, exibida no lugar do marketplace até a data escolhida" onLogout={ctx.onLogout} ctx={ctx} />

      <div className="ph-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: 14, background: enabled ? 'var(--fa-rose-soft)' : 'var(--fa-mist-2)', borderRadius: 14, flexWrap: 'wrap' }}>
          <Icon name={enabled ? 'clock' : 'info'} size={20} style={{ color: 'var(--fa-primary)', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700 }}>{enabled ? 'Contador ativo' : 'Marketplace aberto normalmente'}</div>
            <div className="ph-cell-sub">
              {enabled
                ? 'Todo visitante (logado ou não) vê a página de contador no lugar da vitrine. O console interno continua funcionando normalmente.'
                : 'A vitrine funciona normalmente para qualquer visitante.'}
            </div>
          </div>
          <button
            className={enabled ? 'fa-btn fa-btn-soft' : 'fa-btn fa-btn-primary'}
            type="button"
            onClick={() => setLaunchMode({ enabled: !enabled })}
            disabled={launchModeBusy}
          >
            <Icon name={enabled ? 'close' : 'clock'} size={15} />{enabled ? 'Desativar contador' : 'Ativar contador'}
          </button>
        </div>

        <div className="fa-form2">
          <div className="fa-field">
            <label>Data e hora do lançamento</label>
            <input
              className="fa-input"
              type="datetime-local"
              value={launchAtLocal}
              onChange={(e) => setLaunchMode({ launchAt: localInputValueToIso(e.target.value) })}
            />
          </div>
          <div className="fa-field">
            <label>&nbsp;</label>
            <div className="ph-cell-sub" style={{ paddingTop: 8 }}>
              {isPast
                ? 'Esta data já passou — com o contador ativo, ele chegaria zerado (efeito prático igual a manter desativado).'
                : `Interpretada no fuso horário deste navegador (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
            </div>
          </div>
          <div className="fa-field fa-span2">
            <label>Título (opcional)</label>
            <input
              className="fa-input"
              value={headline}
              onChange={(e) => setLaunchMode({ headline: e.target.value })}
              placeholder="Estamos quase lá"
              maxLength={140}
            />
          </div>
          <div className="fa-field fa-span2">
            <label>Texto complementar (opcional)</label>
            <textarea
              className="fa-input"
              style={{ minHeight: 90 }}
              value={subtext}
              onChange={(e) => setLaunchMode({ subtext: e.target.value })}
              placeholder="A drogaria Farmaura está chegando. Volte em breve para conferir."
              maxLength={400}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="fa-btn fa-btn-primary" disabled={launchModeBusy} onClick={handleSave}>
            <Icon name="check" size={16} />{launchModeBusy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </>
  );
}

export { LaunchModeScreen };
