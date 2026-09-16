/*
farmaura/react/marketplace/core/marketplace-bands.jsx

Full-bleed colored-band primitive every screen composes against, instead of each screen
inventing its own escape from `.fa-wrap`. Mechanics are copied 1:1 from the reference demo
(dev-obsidian/farmaura/09_Design_Visual — "padrão farmácia" demo artifact, recovered and
re-read directly from its published HTML to correct an earlier, non-faithful implementation):

- each band paints its own background via the `--band-bg` custom property (not a `background`
  inline style directly), matching the demo's `.band { background: var(--band-bg) }`;
- the wave divider is a child of the band it visually leads INTO, pinned to that band's own top
  edge and pushed upward by its own height (`transform: translateY(-100%)`), filled with that
  same band's color — so band N "bites" a wave shape out of whatever sits above it, using its
  own color, rather than a preceding band predicting the next color;
- alternating bands mirror the wave horizontally (`scaleX(-1)`) rather than vertically, purely
  so two waves in a row don't read as a stamped repeat;
- FA_BAND_SEQUENCE is the demo's real 7-color rhythm, in the demo's real order, including the
  semantic-soft tokens (info/success/warn) the demo itself uses for this specific full-bleed
  decorative purpose — an earlier version of this file avoided those tokens by an overly cautious
  reading of DESIGN.md's Two-Reds Rule, which does not apply to background rhythm.

Content still renders inside `.fa-wrap` (max-width + horizontal padding), unlike the demo's own
`.band-inner` (which has no max-width of its own) — because the demo is staged inside its own
centered `.stage` card (max-width 1320px) that caps width for it, while the real app's <main> is
genuinely edge-to-edge. Capping content width here is the faithful adaptation of the demo's actual
proportions, not a deviation from them.
*/

import React from "react";

const FA_BAND_SEQUENCE = [
  { color: "var(--fa-rose-soft)", flip: false },
  { color: "var(--fa-rose)", flip: false },
  { color: "var(--fa-beige)", flip: true },
  { color: "var(--fa-bg)", flip: false },
  { color: "var(--fa-info-soft)", flip: true },
  { color: "var(--fa-success-soft)", flip: false },
  { color: "var(--fa-warn-soft)", flip: true },
];

function faBandStep(index) {
  return FA_BAND_SEQUENCE[((index % FA_BAND_SEQUENCE.length) + FA_BAND_SEQUENCE.length) % FA_BAND_SEQUENCE.length];
}

// Wave shape pinned to the top of its own band, filled with that band's own color — see file
// header. Path curve copied verbatim from the demo's `.band-wave svg path`.
function BandWave({ color, flip }) {
  return (
    <div className="fa-band-wave" aria-hidden="true">
      <svg viewBox="0 0 1440 74" preserveAspectRatio="none" style={flip ? { transform: "scaleX(-1)" } : undefined}>
        <path fill={color} d="M0,40 C320,90 1120,0 1440,40 L1440,74 L0,74 Z" />
      </svg>
    </div>
  );
}

// Centered marketing-style heading, matching the demo's `.band-head` (h2 + optional lead
// paragraph, centered, max 560px wide) — distinct from `SectionHead` (left-aligned, eyebrow +
// action), which is what the rest of the app uses outside band context.
function BandHead({ title, subtitle }) {
  if (!title) return null;
  return (
    <div className="fa-band-head">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

// Full-bleed colored section. `index` picks a color+flip from FA_BAND_SEQUENCE; pass explicit
// `color`/`flip` to opt out of the shared rhythm for a one-off band (e.g. a band that must land on
// a specific color regardless of position). `headTitle`/`headSubtitle` render a BandHead above
// `children`; omit them when the caller already renders its own heading (breadcrumbs, custom
// layouts) — most non-home screens do.
function FullBleedBand({ index = 0, color, flip, headTitle, headSubtitle, children, style, contentStyle, className = "" }) {
  const step = color != null ? { color, flip: !!flip } : faBandStep(index);
  return (
    <section className={"fa-band " + className} style={{ "--band-bg": step.color, ...style }}>
      <BandWave color={step.color} flip={step.flip} />
      <div className="fa-wrap" style={contentStyle}>
        <BandHead title={headTitle} subtitle={headSubtitle} />
        {children}
      </div>
    </section>
  );
}

export { FA_BAND_SEQUENCE, FullBleedBand, BandHead, BandWave, faBandStep };
