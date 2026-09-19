---
target: marketplace design (hierarchy, clarity, spacing, typography, composition, CTAs, SEO, UX)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-22T23-47-47Z
slug: farmaura-react-marketplace
---
# Critique: Farmaura Marketplace

Method: dual-agent (A: a965bc05c8ab9283a · B: a77a1b524dce2d214)

## Cross-cutting font-specificity bug (affects this surface)
`marketplace.html` ships `<body style="font-family: Montserrat">` as a pre-mount fallback. `marketplace.css` sets `body { font-family: var(--fa-font) }` (Nunito Sans) with no `!important`. Inline style always outranks the external rule, so the real, permanent rendered font of the entire marketplace is Montserrat, not the documented Nunito Sans — confirmed via `getComputedStyle`, independent of network conditions. This contradicts DESIGN.md's "One Typeface Rule."

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Cart coupon-apply gives no loading feedback |
| 2 | Match System/Real World | 4 | Fluent domain Portuguese throughout |
| 3 | User Control and Freedom | 3 | Modal Esc/stack solid; no visible "or press Esc" cue |
| 4 | Consistency and Standards | 3 | Checkout's final CTA breaks the system's own color rule |
| 5 | Error Prevention | 3 | Delivery coverage, CPF gate, password strength all proactive |
| 6 | Recognition Rather Than Recall | 3 | Icon-only view-toggle/favorite buttons |
| 7 | Flexibility and Efficiency | 3 | Saved cards/addresses, reorder, subscriptions |
| 8 | Aesthetic and Minimalist Design | 3 | Home stacks 9 sections with no way to skip ahead |
| 9 | Error Recovery | 4 | Coupon rejection messages are specific and actionable |
| 10 | Help and Documentation | 2 | Two footer help links are dead `<a>` tags |
| **Total** | | **31/40 (Good)** | |

## Design Specificity Verdict
Authored, not templated: named token system matching DESIGN.md 1:1, hand-built split-flap countdown clock, real Brazilian pharmacy domain logic (receita retention, PDV-vs-site coupon channels, delivery-coverage gating).

Deterministic scan: 111 detector findings, 49 (44%) from `core/marketplace-tweaks-panel.jsx` (dev-only tool, not shipped UI — false positive). Real signal: `layout-transition` x3 (low impact), recurring undocumented `clamp(24px,2.6vw,32px)`/`clamp(26px,3vw,36px)` heading tier across 7 screens, undocumented color `#b9772a` used identically 3x.

Browser overlays (5 states injected): `low-contrast` on `#e03131` (4.2:1, needs 4.5), `kicker-above-heading` x3 on Home, `overused-font` (Montserrat) confirmed real per the cross-cutting finding above.

## Overall Impression
Well-designed at the token level with real craft on the launch-countdown experience, but the actual homepage silently breaks in its real current (empty-catalog) state, the highest-stakes checkout button uses the wrong brand color by the system's own rules, and the site isn't rendering in its documented typeface.

## What's Working
1. Token-to-implementation fidelity — DESIGN.md's spec reproduced almost verbatim in marketplace.css.
2. The countdown/launch screen is real design work, not a placeholder.
3. Error messaging is consistently specific and non-generic.

## Priority Issues

**[P0] Home screen breaks visibly in the actual current production state.**
Why it matters: `HomeScreen`'s "Destaque do dia," "Vistos recentemente," "Cuidados pessoais" render headers unconditionally even with an empty product list — bare headers over blank grids, contradicting PRODUCT.md's own Principle 5. `DealOfTheDayStrip` already guards against this; the other three didn't inherit it.
Fix: same empty-guard, or a shared "catálogo chegando em breve" state.
Suggested command: /impeccable harden

**[P1] Checkout's final CTA violates the system's own Two-Reds Rule.**
Why it matters: "Confirmar e pagar" (checkout-screen.jsx:536) and "Comprar agora" (product-screen.jsx:82) use fa-btn-vital (urgency/promo red) instead of fa-btn-primary (trust wine) — while "Finalizar compra" one step earlier correctly uses primary.
Fix: swap to fa-btn-primary.
Suggested command: /impeccable clarify

**[P1] Form labels have no programmatic association with their inputs, app-wide.**
Why it matters: login, register, and checkout render `<label>`/`<input>` as unlinked siblings — no htmlFor/id. Screen readers can't associate them on the highest-stakes screens.
Suggested command: /impeccable harden

**[P2] No SEO fundamentals three and a half weeks from public launch.**
Why it matters: no per-route title/meta description/canonical/OG/Twitter Card, no favicon anywhere in the repo, no robots.txt/sitemap.xml, homepage has zero <h1>.
Suggested command: /impeccable optimize or /impeccable document

**[P2] Sub-AA contrast on frequently-used tokens.**
Why it matters: --fa-ink-3 (3.1-3.3:1) and urgency-label color #b9772a (3.4-3.7:1) both fail WCAG AA 4.5:1, used pervasively.
Suggested command: /impeccable harden

## Persona Red Flags
Riley (Stress Tester): hits the P0 above immediately. Cart coupons silently re-validate and can null out on quantity change with only a small red line of text.
Jordan (First-Timer): icon-only view-toggle/favorite buttons; "Comprar agora" vs "Adicionar ao carrinho" unexplained.
Casey (Mobile): favorite button (32x32px) and cart-remove button (34x34px) both under 44x44pt tap minimum.

## Minor Observations
- Footer's "Central de atendimento"/"Trocas e devoluções" are dead links (8 of 12 footer items unrouted).
- `.fa-acct-grid` hardcodes 28px gap instead of var(--fa-gap).
- Mobile drawer backdrop isn't fully opaque.
- Login's marketing-panel heading is an h2 styled as h1 while the real h1 is the form heading beside it.

## Questions to Consider
- If Vermelho Vital "loses meaning if used broadly," why is it on the single highest-stakes button in the app?
- The countdown screen got real design attention for its pre-launch state — why didn't the home page's empty-catalog state get the same care, when PRODUCT.md commits to designing for both?
- Is SEO/shareability simply not built yet, or deliberately deferred — and does the team know which, three weeks out?
