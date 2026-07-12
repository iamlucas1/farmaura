import React, { useEffect } from "react";
import { TweakSection, TweakSelect, TweaksPanel, useTweaks } from "../../marketplace/core/marketplace-tweaks-panel.jsx";

/* FARMAURA — Tweaks: experimentar fontes da interface e dos títulos.
   Aplica as escolhas às variáveis CSS --fa-font (interface) e --fa-font-head (títulos),
   então a aparência inteira do portal atualiza em tempo real. */

/* fontes da interface (corpo + componentes) */
const FA_UI_FONTS = {
  'Montserrat': "'Montserrat', system-ui, sans-serif",
  'Manrope': "'Manrope', system-ui, sans-serif",
  'Plus Jakarta Sans': "'Plus Jakarta Sans', system-ui, sans-serif",
  'DM Sans': "'DM Sans', system-ui, sans-serif",
  'Figtree': "'Figtree', system-ui, sans-serif",
  'Albert Sans': "'Albert Sans', system-ui, sans-serif",
  'Nunito Sans': "'Nunito Sans', system-ui, sans-serif",
};

/* fontes dos títulos (cabeçalhos, valores de destaque) */
const FA_HEAD_SAME = 'Igual à interface';
const FA_HEAD_FONTS = {
  'Spline Sans': "'Spline Sans', system-ui, sans-serif",
  'Space Grotesk': "'Space Grotesk', system-ui, sans-serif",
  'Sora': "'Sora', system-ui, sans-serif",
  'Bricolage Grotesque': "'Bricolage Grotesque', system-ui, sans-serif",
};

const FA_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "uiFont": "Nunito Sans",
  "headingFont": "Igual à interface"
}/*EDITMODE-END*/;

function FontTweaks() {
  const [t, setTweak] = useTweaks(FA_TWEAK_DEFAULTS);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--fa-font', FA_UI_FONTS[t.uiFont] || FA_UI_FONTS['Nunito Sans']);
    document.body.style.fontFamily = ''; // descarta qualquer override inline
    const head = (t.headingFont === FA_HEAD_SAME)
      ? 'var(--fa-font)'
      : (FA_HEAD_FONTS[t.headingFont] || 'var(--fa-font)');
    root.style.setProperty('--fa-font-head', head);
  }, [t.uiFont, t.headingFont]);

  return (
    <TweaksPanel title="Tweaks · Fontes">
      <TweakSection label="Tipografia" />
      <TweakSelect label="Interface" value={t.uiFont}
        options={Object.keys(FA_UI_FONTS)} onChange={(v) => setTweak('uiFont', v)} />
      <TweakSelect label="Títulos" value={t.headingFont}
        options={[FA_HEAD_SAME, ...Object.keys(FA_HEAD_FONTS)]} onChange={(v) => setTweak('headingFont', v)} />
      <div style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(41,38,27,.5)', paddingTop: 2 }}>
        Escolha e o portal inteiro — menu, tabelas, cabeçalhos — atualiza na hora para você comparar.
      </div>
    </TweaksPanel>
  );
}

export { FA_HEAD_FONTS, FA_TWEAK_DEFAULTS, FA_UI_FONTS, FontTweaks };
