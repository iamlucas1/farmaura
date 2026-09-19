---
target: internal console design (hierarchy, clarity, spacing, typography, composition, CTAs, SEO, UX)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-22T23-48-43Z
slug: farmaura-react-internal
---
# Critique: Farmaura Internal Console

Method: dual-agent (A: ad17e9dfeda52747f · B: a9975d23cbfb5ed82)

## Cross-cutting font-specificity bug (affects this surface)
`internal.html` also ships `<body style="font-family: Montserrat">`, same specificity bug as the marketplace: the real rendered font is Montserrat, not the documented Nunito Sans, in every network condition.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Global toast + busy states solid; no skeletons on data-heavy screens |
| 2 | Match System/Real World | 4 | Fluent pharmacist domain vocabulary |
| 3 | User Control and Freedom | 2 | "Esqueci a senha" is a dead link; Coupons/Promotions delete with no confirm |
| 4 | Consistency and Standards | 1 | 3 parallel stat-card systems; fa-btn-vital defined but used 0 times |
| 5 | Error Prevention | 2 | Catalog screens confirm destructive actions; Coupons/Promotions don't |
| 6 | Recognition Rather Than Recall | 2 | Catálogo nav group: 13 flat items, no sub-grouping |
| 7 | Flexibility and Efficiency | 1 | Zero keyboard shortcuts app-wide beyond Enter/Escape |
| 8 | Aesthetic and Minimalist Design | 3 | Token-level polish undercut by structural sprawl |
| 9 | Error Recovery | 2 | Rx screen has real undo; login surfaces raw backend error text |
| 10 | Help and Documentation | 1 | One contextual-help pocket, never extended past Coupons |
| **Total** | | **21/40 (Acceptable)** | |

## Design Specificity Verdict
Specific at the token/component level (Vinho Aura full sidebar fill exactly as DESIGN.md prescribes, Spline Sans Mono on order IDs), generic/ad-hoc at the structural level: three unreconciled stat-card grammars, and the documented density system (--fa-gap/--fa-card-pad/data-density) is referenced zero times across all 40 screen files.

Deterministic scan: 122 findings, 48 (39%) from dev-only tooling (tweaks-panel.jsx, explicitly marked @ds-adherence-ignore). Real signal: literal radius values off-scale in 23 places in internal.css, deliveries-screen.jsx using raw Tailwind grays instead of the --fa-ink scale.

Browser overlays: login screen showed clipped-overflow-container x3. An authenticated-shell fixture (built and cleanly deleted) showed undersized-ui-text (10.5px label below 11px floor) and confirmed --fa-ink-3 fails contrast (3.1:1) in the topbar subtitle.

## Overall Impression
The shell (sidebar, topbar, modal/drawer stack) is genuinely well-engineered and consistently applied across all 38 screens. Below that shell, 38 screens built incrementally never converged on one shared vocabulary for stat cards, empty states, or destructive actions.

## What's Working
1. Shared modal/drawer infrastructure (useModalStack) — correct Escape-stacking, deliberate backdrop-click protection, zero opt-outs.
2. PDV's primary-action clarity — autofocus search, disabled-until-valid checkout, role-based context banner.
3. Token-level brand execution — Vinho Aura as full-surface sidebar fill, warm shadows, mono for prices.

## Priority Issues

**[P1] Coupons and Promotions delete with zero confirmation, unlike every comparable screen.**
Why it matters: removeCoupon/removePromotion fire immediately on click; Brands/Categories/Products/Therapeutic-Classes all route the same action through a confirm modal.
Suggested command: /impeccable harden

**[P1] The documented density/spacing system is dead code on this surface.**
Why it matters: zero of 40 screens reference var(--fa-gap)/var(--fa-card-pad); data-density never set on #ph-root; 16 distinct hardcoded gap values across 33 ad-hoc inline grids.
Suggested command: /impeccable harden (or narrow DESIGN.md's claim to marketplace-only)

**[P2] 13-item flat "Catálogo" sidebar group breaks the working-memory rule 3x over.**
Why it matters: exactly the "Wall of Options" violation, for the exact daily power-user persona this surface serves.
Suggested command: /impeccable layout

**[P2] Destructive-button system exists but is never used.**
Why it matters: fa-btn-vital is fully built (hover, glow shadow), 0 of 40 screens use it; 7+ destructive buttons hand-roll inline styles instead.
Suggested command: /impeccable clarify

**[P3] --fa-ink-3 fails WCAG AA contrast (~3.1-3.3:1) for its documented use as placeholder/tertiary text.**
Suggested command: /impeccable harden

## Persona Red Flags
Alex (Power User): zero keyboard shortcuts across 38 screens; 13-item Catálogo group forces re-scan instead of muscle-memory recall; no bulk actions in Inventory/Products lists.
Sam (Accessibility): "Esqueci a senha" is keyboard-unreachable (no href, no tabindex); 6 of 44 icon-only buttons have neither aria-label nor title.

## Minor Observations
- Three parallel stat-card systems (.ph-stat, .inv-kpi, .fin-sec-band).
- prescriptions-screen.jsx has no empty-state message at all.
- Login surfaces raw backend error text directly to the user.
- No meta robots noindex and no repo-wide robots.txt — internal portal is crawlable by default if ever reachable publicly.

## Questions to Consider
- Three stat-card systems, three empty-state conventions, a density system defined but never consumed — is this still one product, or 38 screens built by precedent?
- Coupons/Promotions can delete a live record with one unconfirmed click while Products/Brands cannot — deliberate risk decision, or did the pattern just not carry forward?
- At what item count does "add it to Catálogo" stop being the right default?
