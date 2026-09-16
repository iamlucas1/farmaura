---
name: Farmaura
description: Warm Apothecary — a real neighborhood pharmacy's confident red trust and rosé-soft care, not a sterile blue/green pharmacy chain look.
colors:
  primary: "#A11017"
  primary-ink: "#7C0C12"
  vital: "#E03131"
  bg: "#FAF7F5"
  surface: "#FFFFFF"
  rose: "#FFD5D5"
  rose-soft: "#FFECEC"
  beige: "#F6F1E8"
  ink: "#2B1A1A"
  ink-2: "#6B5757"
  ink-3: "#746868"
  mist: "#E8E1DF"
  mist-2: "#F1EBE9"
  success: "#2E7D5B"
  success-soft: "#E4F1EB"
  warn: "#F2A03D"
  warn-soft: "#FCEEDB"
  warn-ink: "#945F22"
  error: "#B3261E"
  info: "#3A6EA5"
  info-soft: "#E6EDF5"
typography:
  display:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "clamp(28px, 4vw, 46px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "clamp(22px, 2.4vw, 30px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
  subtitle:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 800
  body:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  lead:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.14em"
  caption:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.06em"
  micro:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
  pageTitle:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "clamp(26px, 3vw, 36px)"
    fontWeight: 800
  compactTitle:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "clamp(24px, 2.6vw, 32px)"
    fontWeight: 800
  value:
    fontFamily: "'Nunito Sans', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    letterSpacing: "-0.01em"
  mono:
    fontFamily: "'Spline Sans Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 600
rounded:
  input: "10px"
  btn: "12px"
  card: "16px"
  icon: "20px"
  pill: "999px"
spacing:
  compact: "12px"
  regular: "20px"
  comfy: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  button-primary-hover:
    backgroundColor: "#890E14"
  button-vital:
    backgroundColor: "{colors.vital}"
    textColor: "#FFFFFF"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  button-soft:
    backgroundColor: "{colors.mist-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "13px 20px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "9px 15px"
  chip-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "9px 15px"
  card-product:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    height: "46px"
---

# Design System: Farmaura

## Overview

**Creative North Star: "Warm Apothecary"**

Farmaura is a real, single neighborhood pharmacy that also wants to feel like the biggest, most complete pharmacy in its region — and the visual system carries that tension deliberately. Instead of the generic sterile blue/green most pharmacy software defaults to, Farmaura's own tokens are named in the source itself: **Vermelho Vital** (confident red primary), the **vital accent** (a brighter red reserved for urgency and promotions), **Rosé Cuidado** (a soft, caring pink used for hover states and gentle emphasis), **Off-white Clínico** (a warm off-white background, not sterile white), **Bege Atalho** (a warm beige for quick-access tiles), and **Grafite Quente** (a warm charcoal ink instead of pure black). A literal `--fa-aura` token (0–1 intensity) drives soft decorative arcs and halos behind key surfaces — the brand's own name made into a visual device, not just a wordmark.

The system is shared, not duplicated: `farmaura/react/internal/internal.css` intentionally imports after `marketplace.css` and reuses its custom properties rather than redefining them, so the pharmacist console and the customer marketplace are two applications of one warm-apothecary language, not two identities. The internal console inverts the primary color onto a solid red sidebar (white text, soft white-alpha states) while the marketplace keeps red as an accent on a light warm-white canvas — same palette, different density and role.

Components favor confident warmth over sterile precision: soft, generous corner radii, gentle hover lifts, pill-shaped chips and badges, and exactly one deliberately loud, pulsing animation (the "superpromoção" badge) reserved for the single moment the interface should feel urgent. Everything else stays calm.

**Key Characteristics:**
- Red trust (`Vermelho Vital`) as the one recurring brand color, never diluted into a generic blue/green pharmacy palette.
- A caring, soft rosé (`Rosé Cuidado`) as the default "you're being taken care of" hover/focus color, distinct from the brighter vital accent.
- A literal decorative `--fa-aura` glow/arc layer as the brand's signature atmospheric device.
- Soft, low, warm-tinted shadows (never pure black) — depth is ambient, not dramatic.
- One shared token system across two segregated surfaces (marketplace + internal), never two competing systems.
- Tokens are plain CSS custom properties with fixed defaults (`--fa-radius-scale`, `data-density`, `--fa-aura`, `--fa-font-head`) — no runtime theme switcher; a value change means editing the token in code.

## Colors

Warm, red-and-rosé palette on an off-white clinical canvas — never the generic cold blue/green of pharmacy software.

### Primary
- **Vermelho Vital** (`#A11017`): the core brand color — primary buttons, active nav states, the internal console's entire sidebar background, links-as-buttons. This is the "trust" color.
- **Vermelho Vital, ink** (`#7C0C12`): darker red used for text set on rosé backgrounds, where the base primary wouldn't hold enough contrast.

### Secondary
- **Vital accent** (`#E03131`): reserved for energy and urgency — "superpromoção" badges/pulses, cart-count bubbles, destructive/urgent nav counters. Used sparingly; it is brighter than the primary on purpose and loses meaning if used broadly.

### Tertiary
- **Rosé Cuidado** (`#FFD5D5`) / **Rosé Cuidado, soft** (`#FFECEC`): the "care" color — hover backgrounds, focus rings (`box-shadow` glow on inputs/search), favorited/active icon backgrounds. This is what makes hover states feel gentle instead of clinical.
- **Bege Atalho** (`#F6F1E8`): warm beige reserved for quick-category/shortcut tiles — a secondary warm neutral distinct from the rosé care color.

### Neutral
- **Off-white Clínico** (`#FAF7F5`): page background — warm, not sterile white.
- **Surface** (`#FFFFFF`): card and elevated-surface background.
- **Grafite Quente** (`#2B1A1A`): primary text ink — warm charcoal, never pure black.
- **Grafite Quente, muted** (`#6B5757`): secondary/muted text (labels, meta).
- **Grafite Quente, faint** (`#746868`): tertiary/faint text (placeholders, disabled meta). Darkened from an earlier `#9A8A8A` after a critique found it failed WCAG AA contrast (~3.1-3.3:1) everywhere it was used.
- **Cinza Névoa** (`#E8E1DF`) / **Cinza Névoa, soft** (`#F1EBE9`): borders, dividers, and the "soft surface" fill behind segmented controls and disabled/out-of-stock cards.

### Semantic
- **Success** (`#2E7D5B` on `#E4F1EB`): confirmations, positive trends, savings pills.
- **Warn** (`#F2A03D` on `#FCEEDB`): star ratings, caution states, warn badges/surfaces (fill, not text).
- **Warn, ink** (`#945F22`): the readable-as-text version of Warn — urgency/scarcity copy ("restam poucas unidades"), warn badge labels. `--fa-warn` itself is too light to use as text; this token exists because a raw `#b9772a` had drifted into three separate places to work around exactly that, and still failed WCAG AA (~3.4-3.7:1).
- **Error** (`#B3261E`): destructive actions, form errors, negative trends.
- **Info** (`#3A6EA5` on `#E6EDF5`): informational banners/notices.

### Named Rules
**The No-Sterile-Palette Rule.** Never introduce the generic pharmacy blue/green as a primary or accent color. Primary and vital red are the only two "brand" hues; every other color in the system is a warm neutral or a semantic status color. This is a deliberate identity choice, not an artifact of limited options.

**The Two-Reds Rule.** Primary (`#A11017`, trust, default) and vital (`#E03131`, urgency, promotions) are never interchangeable. If something needs to feel calm and trustworthy, use primary; if it needs to feel urgent or like a can't-miss deal, use vital — never both roles from one color.

### Confirmed exceptions (deliberately outside the palette)
- **Payment card brand mockups** (`.fa-paycard[data-brand="Mastercard"]`, `[data-brand="Elo"]`): each uses that brand's own dark gradient (`#3a2230`→`#1d1016`, `#2b2b2b`→`#111`), not the app palette — a saved-card visual is supposed to look like the real card network, not like Farmaura.
- **Map canvas background** (`#EEF2EC`, `.ph-map`): a neutral terrain-like tone behind the Leaflet tile layer, not a UI surface — it reads as "map," not as an off-brand background.
- **`.fin-sec-band` gradient endpoint** (`#93131F`, alongside `--fa-primary`): a single banner-background gradient stop close to but distinct from the primary red, for one finance-section header treatment.

## Typography

**Body & Display Font:** Nunito Sans (with system-ui, sans-serif fallback) — used for everything, from display headlines down to labels; there is no separate display typeface.
**Label/Mono Font:** Spline Sans Mono (with ui-monospace, monospace fallback) — reserved for prices, order/tracking codes, and pickup codes, where tabular/mono alignment reads as precise and trustworthy.

**Character:** One warm, rounded humanist sans (Nunito Sans) carries the entire hierarchy through weight and size alone, with a monospace used narrowly as a "this is exact data" signal (money, codes) rather than a second display voice.

### Hierarchy
- **Display** (800, `clamp(28px, 4vw, 46px)`, line-height 1.04): page-level hero headlines (`.fa-h1` on its own).
- **Page Title** (800, `clamp(26px, 3vw, 36px)`): standalone page headings that need a strong but not hero-scale heading — checkout, order confirmation, cart, prescription upload, subscriptions, shop results (`.fa-h1` with an inline size override).
- **Compact Title** (800, `clamp(24px, 2.6vw, 32px)`): a step down from Page Title — product name on the product page, account greeting, login marketing headline.
- **Headline** (800, `clamp(22px, 2.4vw, 30px)`, line-height 1.1): section headings (`.fa-h2`), internal console stat values.
- **Title** (700, 18px, line-height 1.2): card/subsection titles (`.fa-h3`).
- **Subtitle** (800, 15.5px): a step below Title, used identically in both portals for compact card headers — analytics card headers, home-page differentiator titles.
- **Body** (400, 14.5px, line-height 1.5): default running text and form values.
- **Lead** (400, 17px, line-height 1.5, on muted ink): intro/lede paragraphs (`.fa-lead`).
- **Value** (800, 19px, letter-spacing -0.01em): price and stat emphasis — product price, deal-strip title, financial-flow totals. One step above Title, reserved for a number or price that should draw the eye without competing with the page's own heading.
- **Label** (700, 12px, letter-spacing 0.14em, uppercase, in Vermelho Vital): eyebrows/section kickers (`.fa-eyebrow`).
- **Caption** (700, 11px, letter-spacing 0.06em, usually uppercase): the next size down from Label — sidebar nav-group labels, table header cells, filter-field labels, small status badges. Distinct from Label mainly by not being a Vermelho Vital kicker.
- **Micro** (700, 10px): the smallest legible tier — nav-count badges, countdown segment units, chart-axis labels. Below this, use an icon instead of text.
- **Mono** (600, 13px, Spline Sans Mono): prices in stepper inputs, order/pickup codes, tracking IDs.

### Named Rules
**The One Typeface Rule.** Nunito Sans carries the entire hierarchy; don't introduce a second display face. Montserrat and Manrope are loaded in the HTML `<head>` as a pre-mount fallback but are not referenced anywhere in the stylesheets — treat them as legacy/unused, not as available design fonts.

## Layout

Content is capped at a `1240px` max-width wrap (`.fa-wrap`, 24px side padding, 16px under 640px) on the marketplace; the internal console instead runs a fixed `256px` sidebar (collapsible to `76px`) plus a fluid main area capped at `1320px`. Density is a first-class, live-adjustable token: `data-density="compact|regular|comfy"` on the root retunes `--fa-gap` (12/20/28px), `--fa-card-pad` (12/16/22px), and grid minimum column width (`--fa-grid-min`: 180/220/268px) together, so spacing rhythm scales as one system rather than per-component overrides. Product grids use `repeat(auto-fill, minmax(var(--fa-grid-min), 1fr))`-style responsive columns rather than fixed breakpoint counts. Sticky, blurred headers (`backdrop-filter: blur`) are used for both the marketplace header and the internal topbar, keeping navigation available without a hard shadow line.

## Elevation & Depth

Flat-by-default with soft, warm-tinted ambient shadows used only for real elevation moments (hover lift, dropdowns, modals) — never as a resting-state decoration on ordinary content.

### Shadow Vocabulary
- **sm** (`0 1px 2px rgba(43,26,26,.05), 0 1px 3px rgba(43,26,26,.06)`): resting cards, stat tiles, inputs.
- **md** (`0 4px 14px rgba(43,26,26,.07), 0 2px 6px rgba(43,26,26,.05)`): hovered product cards.
- **lg** (`0 18px 50px rgba(43,26,26,.13), 0 6px 16px rgba(43,26,26,.07)`): modals, dropdown menus, the collapsed-sidebar toggle.

### Named Rules
**The Warm Shadow Rule.** Every shadow is tinted from Grafite Quente (`rgba(43,26,26,...)`), never pure black — shadows stay part of the warm palette instead of reading as a cold, generic UI-kit default.

## Shapes

Generously rounded, never sharp: buttons and inputs use a `12px`/`10px` radius (`--fa-r-btn`/`--fa-r-input`), cards use `16px` (`--fa-r-card`), icon tiles use `20px` (`--fa-r-icon`), and chips/badges/segmented controls go fully pill-shaped (`999px`). All four radii scale together from one `--fa-radius-scale` multiplier, so the "roundness" of the whole system can be retuned as a single dial rather than per component. The one deliberate exception is the "image-led" product card variant, which drops to `0` radius on its image to read as a clean photo rather than a soft tile.

A couple of hero-scale, singular moments go rounder than the card scale on purpose: the launch-countdown page's large preview card (`.cd-card`, `24px`) and the home banner slider's decorative art frame (`.fa-slide-art-box`, `28px`) both read as intentionally softer/bigger set-pieces, not as ordinary content cards — don't reach for these on regular UI.

### Named Rules
**The Proportional Icon-Tile Rule.** Compact square icon containers below the fixed scale's own range (roughly 20–44px boxes — sidebar brand mark, stat-card icons, checkboxes, small status circles) are rounded to about 25–30% of their own box size rather than reusing `--fa-r-btn`/`--fa-r-card` verbatim: a 38px tile gets `11px`, a 42px mark gets `13px`, a 20–32px control gets `6–9px`. This is a real, consistent, observed pattern — not a fixed token — because the fixed scale was designed around buttons/inputs/cards, not icon containers smaller than an input. When adding a new compact icon tile, compute its radius the same way rather than reaching for the nearest fixed token.

## Components

### Buttons
- **Shape:** pill-adjacent rounded rectangle (`12px`, `--fa-r-btn`), never sharp corners.
- **Primary:** Vermelho Vital fill, white text, a soft red-tinted glow shadow (`0 6px 18px -8px var(--fa-primary)`); hover deepens to `#8A0D13`.
- **Vital:** vital-accent fill for the rare urgent/promotional CTA; hover brightens rather than deepens.
- **Ghost:** transparent fill, Vermelho Vital text and 1.5px border; hover fills with Rosé Cuidado soft.
- **Soft:** neutral Cinza Névoa fill for low-emphasis actions; hover darkens one step within the same neutral family.
- **State:** all buttons press with a `translateY(1px) scale(.99)` micro-tap on `:active`; disabled drops to 50% opacity and blocks pointer events.

### Chips & Badges
- **Chips:** pill-shaped, 1px Cinza Névoa border, surface background; hover shifts border/text to Rosé/primary; active state fills solid Vermelho Vital with white text.
- **Badges:** small pill labels (11px, bold, uppercase-adjacent letter-spacing) for flags like "Oferta", "Mais vendido", "Receita", "Assinatura" — each with its own semantic color, never all the same hue.
- **Superpromoção:** the one intentionally loud pattern — a 2px vital-accent-to-primary gradient badge that gently pulses (`scale 1 → 1.07`, 2.2s loop, respects `prefers-reduced-motion`). Reserved for genuine best-of-the-best deals; using it elsewhere would cheapen the signal.

### Cards / Containers
- **Corner Style:** `16px` (`--fa-r-card`), scaling with the global radius dial.
- **Background:** Surface white on the Off-white Clínico page background, with a 1px Cinza Névoa border.
- **Shadow Strategy:** flat at rest, `md` shadow + `-3px` lift + border shifts to Rosé on hover (product cards specifically).
- **Variants:** standard (padded, vertical), image-led (edge-to-edge photo, `4:3`), and list/horizontal (fixed 110px image, row layout) — same token set, three compositions for different density needs.
- **Out-of-stock state:** desaturates to grayscale and fades text to the faint ink tone rather than hiding the card.

### Inputs / Fields
- **Style:** `46px` height, 1px Cinza Névoa border, `10px` radius (`--fa-r-input`), surface background.
- **Focus:** border shifts to Vermelho Vital plus a `4px` Rosé Cuidado glow ring (`box-shadow: 0 0 0 4px var(--fa-rose-soft)`) — the same "care" glow used on search-bar focus.
- **Placeholder:** faint ink tone, never the muted or primary text color.

### Navigation
- **Marketplace:** sticky, blurred header with a solid-Vermelho-Vital utility topbar above a search row and a nav-link row; active links get a Rosé Cuidado pill background with Vermelho Vital text.
- **Internal:** fixed/collapsible sidebar with a solid Vermelho Vital fill, white-alpha text at rest, and a solid white pill for the active item (inverting to Vermelho Vital text) — the one place the primary color becomes a full-surface fill rather than an accent.

### Aura Decorations (signature component)
Soft, currentColor-bordered arcs (`.fa-aura-layer`, `.fa-arc`) layered behind hero/banner surfaces at an opacity driven by the single `--fa-aura` token (default 0.5). This is the system's named signature: a literal visualization of the brand's own name, tunable from fully off to fully present without touching any other token.

## Do's and Don'ts

### Do:
- **Do** keep primary and vital role-separated: trust/default vs. urgency/promotion.
- **Do** use the Rosé Cuidado glow (`box-shadow: 0 0 0 4px var(--fa-rose-soft)`) as the one focus/hover "care" signal across inputs, search, and favorited states.
- **Do** scale radius, density, and aura intensity through their single dial tokens (`--fa-radius-scale`, `data-density`, `--fa-aura`) instead of hand-tuning individual components.
- **Do** reuse `marketplace.css`'s tokens and the shared UI kit (`Modal`, `ModalShell`, `Toggle`, `QtyStepper`, `ProductCard`, `brl` — currently living in `farmaura/react/marketplace/core/marketplace-components.jsx`) from the internal console rather than redefining equivalents.
- **Do** tint every shadow from Grafite Quente; never use a neutral/black shadow default.

### Don't:
- **Don't** introduce the generic pharmacy blue/green as a primary or accent color — primary and vital red are the only two brand hues.
- **Don't** use the superpromoção pulse animation for anything other than genuine best-of-the-best deals; it only works because it's rare.
- **Don't** reference Montserrat or Manrope as active design fonts — they're loaded in the HTML head but unused in the stylesheets; Nunito Sans is the real body/display face.
- **Don't** treat the marketplace and internal surfaces as separate design systems — internal intentionally imports and extends marketplace tokens; a change to the shared token layer must work for both.
