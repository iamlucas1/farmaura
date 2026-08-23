# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two permission-segregated audiences, one real physical pharmacy (Drogaria Farmaura):

- **Marketplace** (`farmaura/react/marketplace/`) — end customers in the pharmacy's local region, ordering medicine and health/wellness products for home delivery or in-store pickup.
- **Internal** (`farmaura/react/internal/`) — the pharmacist and operations staff of that same pharmacy, running catalog, orders, prescriptions, inventory, PDV (counter/point of sale), CRM (cashback, coupons, subscriptions), deliveries, fiscal documents, and purchasing/supplier quotes.

## Product Purpose

Give Drogaria Farmaura — a real, single physical pharmacy, not a demo or a multi-store chain — a genuine e-commerce and operations platform ahead of its public launch. Customers order pharmacy and health products online for delivery or pickup; staff run the full store operation (catalog through fiscal) from one system. Payments (Pix/card via Asaas), fiscal document issuance, and distance-based delivery pricing are real integrations, not mocked.

## Positioning

The neighborhood pharmacy that also behaves like the biggest, most complete pharmacy in the region: fast local delivery, competitive pricing with cashback and loyalty, and differentiated health services, combined with "everything the customer needs" in one place. This is meant to beat national chain apps and delivery marketplaces (iFood/Rappi-style pharmacy delivery) on trust and locality, and beat smaller independent neighborhood pharmacies on breadth and completeness.

## Operating Context

- Public launch target: 2026-09-19, at `drogariafarmaura.com.br` (production server `lumos-prd`); staging mirror at `dev.drogariafarmaura.com.br` (`lumos-dev`).
- Currently in a pre-launch "modo lançamento" (countdown) state: real infrastructure is live, but public catalog/inventory is not yet populated.
- Marketplace and Internal are strictly segregated by permission and share only `farmaura/react/shared/` (API client, access control, portal cache, observability, map loaders) — never mixed in one component/route.
- Backend of record is `farmaura-api` (FastAPI + Pydantic v2 + SQLAlchemy async + PostgreSQL + Valkey), owning catalog, cart/orders, prescriptions, inventory, PDV, CRM, delivery, fiscal, chat, portal config, auth, stores/suppliers/team, and purchase quotes.

## Capabilities and Constraints

- Single-tenant in practice: one real pharmacy, not a multi-tenant SaaS product, even though the backend has multi-tenant/RLS infrastructure.
- Real payments (Pix/card via Asaas), real fiscal document issuance (deferred 7 days by policy), and real delivery pricing by distance — these must stay genuine in both product behavior and how the marketplace represents them; never simulate or fake these in the UI.
- Marketplace/Internal access segregation is a hard rule, not a convention to relax under deadline pressure.
- Frontend is plain React 18 + Vite (no meta-framework); no per-screen code-splitting yet (known debt, not a target to silently fix as part of design work).
- Pre-launch state (empty catalog/inventory, countdown) is a real, expected product state that surfaces must degrade into correctly — not an edge case to ignore.

## Brand Commitments

The name "Farmaura" (product) and "Drogaria Farmaura" (the pharmacy) are fixed. No tagline, voice, real store photography, pharmacist license (CRF) display, or public address is confirmed yet — explicitly open, per the user, for future work to define rather than invent.

## Evidence on Hand

No testimonials, case studies, press, or customer quotes exist yet — future work must not fabricate them. Production already carries real payment, fiscal, and delivery integrations, but the public-facing catalog/inventory is not yet populated (pre-launch).

## Product Principles

1. Real business, real transactions — payments, fiscal issuance, and delivery pricing are genuine integrations; the product must never present or imply mocked commerce.
2. Two audiences, one hard boundary — marketplace (customer) and internal (staff) serve different jobs and stay permission-segregated; never blur them for convenience.
3. Neighborhood trust at regional scale — the differentiator is a real local pharmacy relationship combined with the breadth of the region's most complete pharmacy, not logistics speed alone.
4. Price, cashback, loyalty, and health services carry real competitive weight and should not be treated as secondary to catalog/checkout mechanics.
5. Pre-launch is a real state, not a placeholder — countdown/launch-mode behavior for 2026-09-19 must be designed and treated as genuine product behavior, including correct handling of an empty catalog/inventory.
