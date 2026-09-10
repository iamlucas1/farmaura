import React from "react";
import { Icon, PageHead, Field, SwitchToggle, showToast } from "../core/internal-ui.jsx";

const DEFAULT_LAUNCH_AT_LOCAL = "2026-09-05T09:00";
const pad2 = (n) => String(n).padStart(2, "0");

/* `<input type="datetime-local">` has no timezone — the value is interpreted (and re-displayed)
   in whatever timezone the admin's browser is running in, which for this single-tenant pharmacy
   console is assumed to be the store's own local time. Converted to/from a real ISO instant so the
   marketplace's countdown (which compares against `new Date()`, UTC-aware) resolves correctly
   regardless of the admin's or a visitor's own browser timezone. */
const isoToLocalInputValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const localInputValueToIso = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

/* FARMAURA Console — Modo "em breve"/contador regressivo que substitui a vitrine inteira do
   marketplace até a data de lançamento, para todo visitante. */
function LaunchModeScreen({ ctx }) {
  const { launchMode, setLaunchMode, saveLaunchMode, launchModeBusy } = ctx;
  const enabled = !!(launchMode && launchMode.enabled);
  const launchAtLocal = isoToLocalInputValue(launchMode && launchMode.launchAt) || DEFAULT_LAUNCH_AT_LOCAL;
  const headline = (launchMode && launchMode.headline) || "";
  const subtext = (launchMode && launchMode.subtext) || "";

  const launchDate = new Date(localInputValueToIso(launchAtLocal) || (launchMode && launchMode.launchAt));
  const isPast = !Number.isNaN(launchDate.getTime()) && launchDate.getTime() <= Date.now();

  const save = async () => {
    try {
      await saveLaunchMode();
      showToast({ message: "Modo de lançamento salvo." });
    } catch (err) {
      showToast({ message: (err && err.message) || "Não foi possível salvar." });
    }
  };

  return (
    <div className="route-fade">
      <PageHead
        eyebrow="Vitrine"
        title="Modo de lançamento"
        desc="Página de 'em breve' com contador, exibida no lugar do marketplace até a data escolhida."
        actions={(
          <button className="btn btn-primary" disabled={launchModeBusy} onClick={save}>
            <Icon name="check" size={14} />{launchModeBusy ? "Salvando…" : "Salvar"}
          </button>
        )}
      />

      <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap", background: enabled ? "var(--accent-soft)" : "var(--surface)" }}>
        <span className="stat-icon" style={{ background: enabled ? "var(--accent-soft-strong)" : "var(--surface-2)", color: enabled ? "var(--accent)" : "var(--text-muted)" }}>
          <Icon name={enabled ? "clock" : "info"} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{enabled ? "Contador ativo" : "Marketplace aberto normalmente"}</div>
          <div className="page-desc" style={{ margin: "2px 0 0" }}>
            {enabled
              ? "Todo visitante (logado ou não) vê a página de contador no lugar da vitrine. O console interno continua funcionando normalmente."
              : "A vitrine funciona normalmente para qualquer visitante."}
          </div>
        </div>
        <SwitchToggle on={enabled} onChange={(v) => setLaunchMode({ enabled: v })} label="Ativar contador" />
      </div>

      <div className="card card-pad">
        <div className="grid g-2">
          <Field
            label="Data e hora do lançamento"
            hint={isPast
              ? "Esta data já passou — com o contador ativo, ele chegaria zerado."
              : `Interpretada no fuso deste navegador (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
          >
            <input
              className="input"
              type="datetime-local"
              value={launchAtLocal}
              onChange={(e) => setLaunchMode({ launchAt: localInputValueToIso(e.target.value) })}
            />
          </Field>
          <div />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Título (opcional)">
              <input className="input" value={headline} maxLength={140} placeholder="Estamos quase lá" onChange={(e) => setLaunchMode({ headline: e.target.value })} />
            </Field>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Texto complementar (opcional)">
              <textarea
                className="input" style={{ minHeight: 90 }} value={subtext} maxLength={400}
                placeholder="A drogaria Farmaura está chegando. Volte em breve para conferir."
                onChange={(e) => setLaunchMode({ subtext: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

export { LaunchModeScreen };
