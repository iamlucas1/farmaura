# Claude Guide

## Mission

Create and evolve the Farmaura backend in Python so the current frontend prototype can operate against real APIs, persistence, authorization, tenant isolation, file handling, and business rules.

This repository currently contains two frontend experiences:

- customer marketplace in `farmaura/react/marketplace/`;
- pharmacist and operations console in `farmaura/react/internal/`.

Any backend work must support both surfaces without mixing customer and backoffice responsibilities carelessly.

## Repository Layout

This repository hosts more than one product. Know which folder you are in before writing code, and never mix responsibilities across stacks.

- `farmaura/`: Farmaura frontend. Vanilla React (no meta-framework) bundled with Vite, with two strictly separated surfaces — `react/marketplace/` (customer marketplace) and `react/internal/` (pharmacist and operations console) — sharing common code in `react/shared/` (API client, access control, portal cache, observability). See "Marketplace/Internal Access Segregation" below for the mandatory access rule between these two surfaces.
- `farmaura-api/`: Farmaura backend. The FastAPI + Pydantic v2 + SQLAlchemy (async) + PostgreSQL + Valkey Python API specified by the rest of this document. Owns all Farmaura business data: catalog, cart, orders, prescriptions, inventory, PDV, CRM, delivery, fiscal documents.
- `lumos-api/`: backend for the separate Lumos product family (`identity` auth domain plus the `lumosmed` clinic domain), Flask + Gunicorn + SQLAlchemy, organized as `domains/<name>/{api,services}`. Not part of Farmaura's business domain, but it is a sibling stack in this repository and shares the same gateway.
- `lumosmed/`: Laravel (PHP) front-end and portal for the Lumos Med clinic product; consumes `lumos-api` over the internal network.
- `lumos-gateway/`: shared Nginx edge gateway (TLS via Certbot, GeoIP filtering, Fail2ban) that fronts every stack in this repository, including Farmaura per the constraint below.
- `dev-obsidian/_Compartilhado/Skills/`: canonical skill library for agents and human readers. Each skill has a human-oriented `<skill-name>.md` note and an executable `<skill-name>/SKILL.md` definition. The `SKILL.md` files encode repository requirements and must be read and applied while writing code.
- root docs: `claude.md` (this file), `agent.md` (mirror of the same guide for other agents).

## Knowledge Vault

Decisions, evolving documentation, standards, policies, business rules, integrations, APIs, databases, infrastructure, risks, vulnerabilities, pending items, architecture, and operating procedures for this repository (and any other project the user develops) live in an Obsidian vault at `dev-obsidian/` in this repository's root — tracked in this same git repository. Its `dev-obsidian/CLAUDE.md` is the authoritative governance file: read it before writing anything there.

The vault is organized **project-first**, not by category — each product gets its own top-level folder:

- `dev-obsidian/farmaura/` — this product (frontend `farmaura/`, backend `farmaura-api/`, infra `docker/`).
- `dev-obsidian/lumosmed/` — the LumosMed product, kept deliberately thin here; its deep documentation lives in the separate `lumos-obsidian` vault.
- `dev-obsidian/_Compartilhado/` — generic skills, agents, prompts, standards, and POPs not tied to one product, meant to be copied into other repositories.

Each project folder has the same 8 numbered categories, each with a ready `_Template.md` to copy from: `00_Decisoes` (ADRs), `01_Contexto_Usuario` (**read-only for AI — never write here**), `02_Documentacao`, `03_Padroes_Politicas` (standards/policies/assumptions/business rules), `04_Seguranca_Riscos` (security findings/vulnerabilities/risk register), `05_Integracoes_Infra` (APIs/integrations/databases/infra), `06_Pendencias` (open items/tech debt), `07_POPs_Processos`.

**Updating the vault is mandatory, not on-request — do it proactively, in the same change set as the work that produced the fact, without waiting to be asked:**

- made an architecture or trade-off decision → write an ADR in `<projeto>/00_Decisoes/`;
- touched or added an API, integration, database, or infra piece → update `<projeto>/05_Integracoes_Infra/`;
- found, fixed, or accepted a security issue, vulnerability, or risk → update `<projeto>/04_Seguranca_Riscos/`;
- formalized a standard, policy, assumption, or business rule not already covered by this file → update `<projeto>/03_Padroes_Politicas/`;
- agreed to defer something instead of doing it now → log it in `<projeto>/06_Pendencias/`;
- documented a repeatable operational procedure → update `<projeto>/07_POPs_Processos/`;
- built a skill, agent, or prompt reusable beyond this project → put it in `dev-obsidian/_Compartilhado/`;
- materially edited a living-doc note (`02_Documentacao`, `03_Padroes_Politicas`, `04_Seguranca_Riscos`, `05_Integracoes_Infra`, `07_POPs_Processos`, `08_Skills_Agentes_Prompts`, or any `_Compartilhado/*` note), or adopted a new technology/library/tool relevant to it → append a dated entry (`- AAAA-MM-DD: what changed`) to that note's `## Atualizações` section, most recent first. Does not apply to `00_Decisoes` (ADRs are point-in-time by design — a changed decision is a new ADR, not an update to the old one).

Before starting relevant work in a project, check its `Hub.md`, `01_Contexto_Usuario/`, and `00_Decisoes/` for prior context. Never write in `01_Contexto_Usuario/` under any project — it is human-authored only. Never write secrets or real `.env` values into any vault note, only their purpose/contract.


## Agent Skill Execution Protocol

The executable skills live in `dev-obsidian/_Compartilhado/Skills/<skill-name>/SKILL.md`. They are mandatory workflow instructions, not optional documentation. Before implementing, refactoring, reviewing, or testing code, identify every applicable skill below, read its complete `SKILL.md` (and its referenced files when applicable), then execute its requirements during the task.

- `secure-python-backend`: Python backend foundations, models, persistence, services, configuration, or architecture.
- `secure-api-endpoint`: FastAPI routes, contracts, authorization, tenant scope, pagination, idempotency, or public endpoints.
- `secure-auth-rbac-jwt`: authentication, JWTs, RBAC, ownership, tenant isolation, password flows, sessions, rate limits, or account lockouts.
- `secure-file-upload`: uploads, downloads, file storage, OCR, document/image processing, or file endpoints.
- `secure-service-communication`: browser-to-API, service-to-service, portal-to-API, CORS, CSRF, token transport/storage, or `lumos-gateway` routing changes.
- `security-vulnerability-testing`: security verification of authentication, payment, upload, sensitive-data, or abuse-sensitive work.
- `qa-functional-review`: functional verification of a changed UI screen, form, route, or interactive component.
- `project-test-orientation`: selecting a stack, container, local port, or health endpoint for a test in this repository.

Read the matching human note at `dev-obsidian/_Compartilhado/Skills/<skill-name>.md` when its repository links or operational context help the task. The executable `SKILL.md` is the source of truth for agent behavior; the human note must not be treated as a substitute.


## Agent Prompt Execution Protocol

The executable prompts live in `dev-obsidian/_Compartilhado/Prompts/<prompt-name>/PROMPT.md`. When a user explicitly names a prompt, or the requested work directly matches a cataloged prompt, read the complete `PROMPT.md` and execute its instructions. The human note at `dev-obsidian/_Compartilhado/Prompts/<prompt-name>.md` provides context but does not replace the executable prompt.

Available prompts:

- `prompt-qa-funcional`: functional QA of a UI screen or feature.
- `prompt-varredura-vulnerabilidades`: security scan of a sensitive feature or change.
- `prompt-teste-geral-feature`: end-to-end verification of a new feature.

## Development Environment Policy

This repository is currently a development environment, not a live production deployment. That changes a few defaults from what a mature production codebase would do:

- do not preserve legacy code paths, deprecated fields, backward-compatibility shims, feature flags for old behavior, or "just in case" fallbacks — when a design changes, change it everywhere it applies and delete what it replaces in the same change set, across `farmaura/`, `farmaura-api/`, `lumos-api/`, and `lumosmed/` alike;
- do not create database migrations (Alembic in `farmaura-api/`, or any equivalent in `lumos-api/`/`lumosmed/`) for schema changes made during this development phase — change the ORM models directly and apply the schema through the project's existing dev bootstrap path (e.g. `farmaura-api/scripts/bootstrap_database.py`, `lumos-api/database/runtime_bootstrap.py` and `schema_updates.py`) instead of hand-writing a migration file; this overrides the "Local Development Standard", "Seed Data Standard", and "Implementation Sequence" sections below wherever they mention migrations, since those describe the eventual production-grade posture, not the current one;
- always apply the applicable executable skills in `dev-obsidian/_Compartilhado/Skills/` while implementing anything touching authentication, authorization, request handling, file uploads, backend business logic, cross-service communication, UI behavior, or testing — treat them as required steps in the workflow, not optional references.

None of this relaxes the Security Baseline below: skipping migrations and legacy compatibility is about development velocity, not about weakening tenant isolation, input validation, authorization, or any other control in this document.

## Existing Gateway Constraint

This repository already contains an operational gateway stack in `lumos-gateway/`.

That stack must be preserved as the official public edge.

Required assumptions:

- `lumos-gateway` remains the single ingress;
- TLS termination, certificate lifecycle, and HTTP-to-HTTPS redirect remain there;
- public host routing remains there;
- the backend must integrate as an upstream service;
- the backend must not be exposed directly to the public internet outside the gateway model;
- application stacks must join the external Docker network `lumos_gateway` only for public web routing needs;
- private services such as database, Valkey, and workers must remain on private internal networks.

## Approved Versions

Use these versions as the initial locked baseline.

### Platform

- Python `3.13.13`
- PostgreSQL `17.x`
- Valkey `9.1.x`
- Docker Engine `29.5.3`
- Nginx `1.30.2` stable via the existing `lumos-gateway`

### Python Packages

- `fastapi==0.136.3`
- `pydantic==2.13.4`
- `sqlalchemy==2.0.50`
- `alembic==1.18.4`
- `uv==0.11.19`
- `valkey==6.1.1`
- `PyJWT==2.13.0`
- `pwdlib[argon2]==0.3.0`
- `argon2-cffi==25.1.0`
- `python-multipart==0.0.32`
- `httpx==0.28.1`
- `structlog==26.1.0`
- `ruff==0.15.16`
- `mypy==2.1.0`
- `pytest==9.0.3`

Lock exact versions and commit `uv.lock`.

### JavaScript Tooling Policy

Do not use `npm` for the Python backend.

If frontend tooling becomes necessary later, use:

- Node.js `24.16.0 LTS`
- npm `11.13.0` bundled with that Node release
- committed `package-lock.json`
- `npm ci`
- `npm install --ignore-scripts` by default during audit or verification workflows

Do not use `latest` tags or floating semver ranges for critical dependencies.

## Technical Direction

Use a modern service-oriented FastAPI backend with explicit layers and typed contracts.

Preferred stack:

- FastAPI;
- Pydantic v2;
- SQLAlchemy 2.x;
- Alembic;
- PostgreSQL;
- Valkey;
- `uv`;
- `pytest`;
- `ruff`;
- `mypy`.

Do not default to Django, Flask, or ad-hoc script-based APIs.

## Core Principles

- Prefer explicit business flows over clever abstractions.
- Keep route handlers thin.
- Keep business logic inside services.
- Keep persistence logic inside repositories.
- Keep schemas strongly typed.
- Keep naming consistent and domain-driven.
- Keep the project production-ready from the first commit.
- Treat security requirements as architecture, not as follow-up hardening.

## Security Baseline

Assume all client-side data is untrusted:

- body;
- query string;
- route params;
- headers;
- cookies;
- hidden inputs;
- URL fragments;
- `localStorage`;
- `sessionStorage`;
- cached frontend state.

Assume users can tamper with anything they send.
Assume repeated requests, replay, brute force, race conditions, and abusive uploads will happen.
Assume tenant boundaries must be enforced in the backend and, when justified, in the database.

Also assume the gateway is part of the production security boundary and must stay aligned with backend behavior.

Frontend portal segregation must follow the same security model — see "Marketplace/Internal Access Segregation" below for the full mandatory rule.

## Marketplace/Internal Access Segregation

This repository has two strictly separated `farmaura/` application surfaces:

- `farmaura/react/marketplace/` for the customer marketplace;
- `farmaura/react/internal/` for the internal operations console.

Customer identities must never gain access to the internal console experience.

Mandatory behavior:

- a `customer` role must be treated as marketplace-only by default;
- the internal login flow must reject customer identities before mounting any internal shell, sidebar, route, widget, or business data;
- blocked internal access must return a generic login failure message and must not disclose whether the denial was caused by role, scope, tenant, or any other authorization rule;
- stored marketplace sessions restored inside the internal portal must be cleared and returned to the login screen with the same generic denial message;
- frontend role gating is only UX support and never replaces backend or database authorization.

Any future change touching authentication, sessions, portal routing, RBAC, or identity normalization must preserve this segregation rule for both new code and refactors.

## Gateway Integration Rules

The Python backend must plug into `lumos-gateway` as an upstream.

Rules:

- keep `lumos-gateway` as the canonical edge for TLS, redirect, host routing, GeoIP, and Fail2ban;
- give the backend a stable upstream service name for gateway routing;
- expose backend health endpoints that work for gateway and orchestrator checks;
- do not publish direct public backend ports when the gateway can route internally;
- keep the backend web service on the shared `lumos_gateway` network only as needed for gateway access;
- keep database, Valkey, workers, and internal-only services off the shared edge network;
- keep backend security headers compatible with gateway-managed edge headers.

## Standard Directory Layout

Use this target structure:

```text
farmaura-api/
  pyproject.toml
  uv.lock
  .python-version
  .env.example
  alembic.ini
  README.md
  app/
    main.py
    api/
      deps.py
      router.py
      middleware/
        request_id.py
        security_headers.py
        body_limits.py
      v1/
        health.py
        auth.py
        catalog.py
        customers.py
        cart.py
        orders.py
        prescriptions.py
        inventory.py
        deliveries.py
        crm.py
        pdv.py
        uploads.py
    core/
      config.py
      database.py
      logging.py
      security.py
      jwt.py
      password_hashing.py
      csrf.py
      rate_limit.py
      idempotency.py
      file_validation.py
      exceptions.py
      pagination.py
    domain/
      enums.py
      errors.py
      permissions.py
    models/
    repositories/
    services/
    schemas/
    tests/
  scripts/
lumos-gateway/
  Dockerfile
  docker-compose.yml
  nginx/
  certbot/
  fail2ban/
```

If a better subdivision is needed, extend this structure without collapsing concerns.
Do not fold `lumos-gateway` into the backend app. Integrate with it.

## API Conventions

All routes must live under:

- `/api/v1`

Use:

- plural resource names;
- stable path names;
- query params for filtering and pagination;
- explicit request and response models;
- predictable structured error payloads.

Examples:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/catalog/products`
- `GET /api/v1/orders/{order_id}`
- `POST /api/v1/prescriptions`
- `PATCH /api/v1/prescriptions/{prescription_id}/status`
- `PATCH /api/v1/inventory/items/{item_id}/stock`
- `POST /api/v1/uploads`
- `GET /api/v1/uploads/{file_id}/download`

## Roles and Permissions

Roles must be explicit:

- `customer`;
- `pharmacist`;
- `operator`;
- `admin`.

Permission checks must happen in the backend.

Examples:

- customers can access only their own carts, orders, addresses, documents, and profile data;
- pharmacists can manage prescriptions, inventory, and operations for authorized stores only;
- admins can manage global operational resources.

## Authentication, Session, and JWT Rules

If JWT is used, implement it correctly:

- short-lived access token;
- refresh token rotation;
- server-side refresh token storage and revocation;
- family invalidation on theft suspicion or logout;
- explicit validation of `iss`, `aud`, `sub`, `exp`, `nbf`, and `iat`;
- explicit allowed algorithms only;
- no sensitive medical, financial, or overbroad authorization payload in tokens.

Do not trust any privilege, tenant, clinic, patient, file, or order relationship purely because it appears in the token or request payload.
Always cross-check with backend state.

If cookies are used:

- `HttpOnly`;
- `Secure`;
- reviewed `SameSite`;
- CSRF protection on state-changing requests;
- session invalidation after password reset or privilege change.

Login, password-reset-request, and any user-lookup flow must return the same generic response regardless of whether the identifier exists, to prevent account enumeration — the same principle already required below for internal-portal access denial.

## Multi-Tenancy and RLS

The backend must enforce real isolation between tenants, stores, users, and operational scopes.

Required behavior:

- every sensitive query must scope by tenant, store, or ownership where relevant;
- documents and downloads must also be covered by authorization;
- dashboards, reports, CRM views, and operational lists must not leak cross-tenant data;
- PostgreSQL RLS should be used for the highest-risk multi-tenant domains when justified.

Never assume an ID in the URL belongs to the authenticated actor.

## Persistence Rules

Use PostgreSQL as the source of truth.

Recommended model families:

- users;
- customers;
- stores;
- products;
- categories;
- orders;
- order_items;
- prescriptions;
- inventory_items;
- addresses;
- payments;
- service_bookings;
- file_assets;
- chat_threads;
- chat_messages;
- pdv_sales;
- refresh_tokens;
- idempotency_keys;
- audit_events.

Every important model should include:

- `id`;
- `created_at`;
- `updated_at`.

Use enums for stable workflow states.
Use `JSONB` only when the structure is genuinely flexible.
Use foreign keys, unique constraints, and scoped uniqueness intentionally.

## Workflow and Status Rules

Represent statuses explicitly and centrally.

Suggested enums:

- order: `pending`, `awaiting_prescription`, `approved`, `preparing`, `ready`, `dispatched`, `delivered`, `cancelled`;
- prescription: `pending`, `approved`, `rejected`, `expired`;
- payment: `pending`, `paid`, `failed`, `refunded`.

Never scatter hard-coded status strings through unrelated files.
Never allow unchecked state transitions directly from request payloads.

## Input Validation Rules

Validate all incoming inputs in the backend:

- type;
- length;
- numeric range;
- enum membership;
- date sanity;
- UUID format;
- decimal precision;
- nested payload size;
- normalization rules.

Defend against:

- mass assignment;
- overposting;
- hidden extra fields;
- coercion surprises;
- malformed arrays and nested structures;
- trusting frontend-only validation.

Reject unknown fields by default for sensitive models where practical.

## Injection and Output Safety

Build with protections against:

- SQL injection;
- NoSQL injection if any NoSQL system is added later;
- command injection;
- template injection;
- path traversal;
- header injection;
- LDAP injection if LDAP is ever introduced;
- SSRF;
- reflected, stored, and DOM-assisted XSS;
- open redirect;
- log injection.

Rules:

- parameterize queries;
- never interpolate user input into SQL;
- never pass user-controlled strings to shell execution;
- sanitize or reject risky HTML or markdown-rich content;
- do not fetch arbitrary user URLs without SSRF restrictions;
- deny internal IP ranges and metadata endpoints for outbound fetches.

## File Upload and Download Security

Uploads must use:

- extension allowlist;
- real MIME validation;
- signature or magic-byte validation;
- strict size limits;
- file count limits;
- per-user and per-tenant quotas;
- server-generated storage names;
- tenant-separated storage layout;
- authorization on download;
- no public raw filesystem exposure.

Reject or quarantine:

- executables;
- scripts;
- HTML;
- suspicious SVG;
- double extensions;
- polyglot files;
- malformed archives;
- archive bombs;
- files that exceed memory or CPU-safe processing thresholds.

Never trust client-declared MIME or filename.

## Passwords, Secrets, and Hashing

Use Argon2id through `pwdlib[argon2]` or equivalent approved wrapper.

Rules:

- strong minimum password policy;
- no plaintext passwords or reset tokens in logs;
- no secrets in source control;
- rotate refresh tokens;
- invalidate active sessions after password changes;
- support credential rotation.

## Browser and HTTP Security

Use safe CORS:

- explicit origins only;
- no wildcard with credentials;
- explicit methods and headers.

Use CSRF protection where applicable.

Set secure headers through gateway or app:

- `Strict-Transport-Security`;
- `Content-Security-Policy`;
- `X-Frame-Options` or CSP `frame-ancestors`;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- `Permissions-Policy`.

The gateway already owns edge concerns. Backend code should complement that instead of duplicating contradictory logic.

## Concurrency and Idempotency

Sensitive flows must be safe under:

- double click;
- retry;
- duplicate webhook;
- parallel requests;
- page refresh.

Required tools:

- idempotency keys;
- transactions;
- unique constraints;
- row locks or optimistic concurrency where needed;
- explicit state validation before mutation.

Critical candidates:

- order creation;
- prescription actions;
- stock adjustments;
- payment confirmation;
- refunds;
- file metadata registration.

## Availability and Abuse Controls

Protect against:

- DDoS;
- brute force;
- credential stuffing;
- spam of requests;
- abusive pagination;
- upload abuse;
- memory exhaustion;
- CPU exhaustion;
- storage exhaustion.

Required controls:

- route-specific rate limits;
- stricter auth and upload limits;
- request body limits;
- pagination caps;
- quotas;
- timeouts;
- abuse counters;
- bounded worker concurrency;
- CAPTCHA (or equivalent human/proof-of-work challenge) on public high-risk forms — signup, password-reset request, anonymous checkout — after repeated suspicious attempts from the same actor or IP;
- MFA required for staff/admin roles and any elevated-privilege operation, using the existing MFA challenge token type in `core/jwt.py` — this makes it a mandatory control, not just available infrastructure.

Account-security notifications (failed-login alerts, password-reset e-mails, lockout notices) must include a standard anti-phishing notice: this company never calls, texts, or e-mails asking for a password, OTP, or full card number.

## Logging, Errors, and Exposure Control

Requirements:

- no stack traces, SQL, file paths, or secrets in client-facing errors;
- structured logs;
- masked PII, JWTs, cookies, credentials, financial data, and clinical data in logs;
- audit events for sensitive actions;
- minimal response payloads;
- no debug mode outside local development.

## AI, LLM, OCR, and Prompt Injection

If AI or OCR workflows are introduced:

- treat all user text, document text, OCR text, HTML, markdown, and image-derived text as hostile;
- separate trusted instructions from untrusted content;
- never execute model output directly;
- validate any side effects programmatically or via human review;
- prevent cross-tenant leakage in prompts and outputs.

## Supply Chain Requirements

Treat supply chain as a security boundary.

Required controls:

- exact dependency pinning;
- committed lockfiles;
- reproducible builds;
- base image pinning by digest;
- no `latest` tags;
- no unreviewed install scripts;
- no untrusted registries;
- vulnerability scanning in CI;
- no secrets baked into images or layers;
- dependency review before adoption;
- no curl-pipe-shell bootstrap inside Dockerfiles or CI.

If JavaScript tooling is used later:

- `npm ci`;
- committed lockfile;
- inspect lifecycle scripts;
- prefer `--ignore-scripts` during audit contexts;
- prevent dependency confusion with explicit registry configuration.

If PHP/Composer tooling is touched (`lumosmed/`, a sibling stack in its own nested git repository):

- commit `composer.lock`, install with `composer install --no-dev --no-scripts` outside local development;
- pin exact versions for anything touching auth, crypto, or HTTP clients instead of unconstrained `^`/`~` ranges;
- review a package before requiring it, never install from an unreviewed registry;
- no unreviewed Composer scripts (`post-install-cmd`, `post-update-cmd`).

This file covers `farmaura`/`farmaura-api`/`lumos-gateway` directly. `lumosmed`/`lumos-api` are separate git repositories without their own copy of this file — the full multi-stack version-locking policy (Python, npm, Composer, Docker) lives in `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-supply-chain-multi-stack.md` for manual copy into those repositories.

Gateway-specific notes:

- preserve the current split between Nginx, Certbot, and Fail2ban services;
- if touching gateway compose, replace floating image tags with pinned tags or digests;
- never commit live TLS materials;
- keep `/etc/letsencrypt` read-only on the Nginx side and writable only where certificate management requires it.

## Backend Scope

The backend must eventually cover at least:

- authentication and user sessions;
- catalog, categories, and product details;
- customer profiles and addresses;
- cart and checkout support;
- orders and order tracking;
- prescription submission and pharmacist validation;
- stores and pickup flows;
- inventory and stock control;
- pharmacist dashboard data;
- service bookings;
- CRM;
- delivery support;
- PDV sales;
- loyalty and cashback.

Do not try to implement everything in one file or one iteration.
Build by domains with stable contracts.

## Service Design

Service methods should express business use-cases.

Good examples:

- `authenticate_user`;
- `list_catalog_products`;
- `create_order`;
- `approve_prescription`;
- `reject_prescription`;
- `adjust_stock`;
- `dispatch_orders`;
- `create_pdv_sale`;
- `store_uploaded_file`.

Bad examples:

- `execute`;
- `run_flow`;
- `process_data`;
- `manager_helper`.

Services should own:

- domain validation;
- authorization checks;
- orchestration;
- transactional boundaries;
- invariant enforcement.

## Repository Design

Repositories should encapsulate database access for each aggregate or domain family.

They should:

- expose focused query and persistence methods;
- avoid leaking raw SQL all over the codebase;
- avoid becoming giant god-objects.

Do not create a repository layer so abstract that simple reads become harder than raw ORM usage.

## Error Standard

Create domain errors and map them centrally.

Examples:

- `ResourceNotFoundError`;
- `DomainValidationError`;
- `PermissionDeniedError`;
- `ConflictStateError`;
- `RateLimitExceededError`;
- `UnsafeFileError`.

Suggested HTTP mapping:

- `400`: invalid business input;
- `401`: unauthenticated;
- `403`: unauthorized;
- `404`: not found;
- `409`: state conflict;
- `413`: payload too large;
- `415`: unsupported media type;
- `422`: schema validation;
- `429`: rate limit;
- `500`: unexpected internal failure.

## Configuration Standard

Use typed settings with Pydantic.

Minimum environment variables:

- `APP_NAME`;
- `APP_ENV`;
- `APP_DEBUG`;
- `API_PREFIX`;
- `SECRET_KEY`;
- `JWT_ISSUER`;
- `JWT_AUDIENCE`;
- `JWT_PRIVATE_KEY`;
- `JWT_PUBLIC_KEY`;
- `DATABASE_URL`;
- `VALKEY_URL`;
- `ACCESS_TOKEN_EXPIRE_MINUTES`;
- `REFRESH_TOKEN_EXPIRE_DAYS`;
- `CORS_ORIGINS`;
- `CSRF_SECRET`;
- `MAX_REQUEST_BODY_BYTES`;
- `MAX_UPLOAD_BYTES`;
- `LOG_LEVEL`.

Always keep `.env.example` complete and current.

## Local Development Standard

The backend must be runnable locally with a documented flow.

Required developer commands:

- install dependencies;
- run API server;
- apply the schema through the dev bootstrap path (no migrations while in the development phase — see "Development Environment Policy");
- seed development data;
- run tests;
- run lint and type checks.

Document those commands in `farmaura-api/README.md`.

## Testing Requirements

Every completed domain must include tests.

Minimum test types:

- unit tests for business rules;
- integration tests for repository behavior;
- API tests for route contracts and permissions;
- security tests for invalid inputs, authorization gaps, and abuse cases;
- concurrency tests for duplicate-sensitive flows.

Minimum critical path tests:

- login success and failure;
- refresh token rotation;
- product listing;
- order creation;
- prescription approval and rejection;
- inventory stock adjustment;
- customer access isolation;
- pharmacist access isolation;
- upload rejection and acceptance;
- download authorization;
- duplicate request safety.

## Seed Data Standard

Provide deterministic seed data compatible with the existing prototype.

Include:

- one admin;
- one pharmacist;
- one operator if needed;
- sample customers;
- stores;
- product catalog;
- sample orders;
- pending and approved prescriptions;
- inventory baseline.

## Observability and Operations

Include from the start:

- structured logs;
- request correlation where practical;
- health endpoint;
- readiness endpoint when infra support is added;
- consistent exception logging;
- audit trail for sensitive events.

Do not hide operational failures behind silent fallbacks.

## Implementation Sequence

Follow this order unless the task explicitly requires a different dependency path:

1. backend scaffold and pinned tooling;
2. map gateway integration points with `lumos-gateway`, including upstream naming, health routes, and networks;
3. config, database, logging, middleware, and schema bootstrap;
4. auth, password hashing, JWT, refresh, and authorization primitives;
5. users, stores, tenant scope, catalog, and categories;
6. customers, addresses, cart;
7. orders and order items with idempotency;
8. secure uploads and prescriptions;
9. inventory and dashboard aggregates;
10. CRM, deliveries, chat, PDV, loyalty.

## Code Generation Rules

When producing code:

- create complete files;
- wire imports and registrations fully;
- apply schema changes directly to the models and dev bootstrap path (no migration files, per "Development Environment Policy");
- add or update tests in the same change;
- avoid placeholder stubs unless explicitly requested;
- keep names explicit and consistent;
- implement the security baseline in the first version of each feature.

## Final Constraint

The backend must be understandable by a senior engineer reading it cold.

If a design choice makes the code harder to reason about, prefer the simpler and more explicit approach even if it is slightly more verbose.
