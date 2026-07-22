# Agent Guide

## Objective

Build the production backend for Farmaura in Python to support both current frontend surfaces:

- `farmaura/react/marketplace/`: customer marketplace;
- `farmaura/react/internal/`: pharmacist and operations console.

The backend must be production-oriented from the first commit, with secure defaults, typed contracts, supply-chain discipline, strong tenant isolation, and explicit business rules.

## Repository Layout

This repository hosts more than one product. Know which folder you are in before writing code, and never mix responsibilities across stacks.

- `farmaura/`: Farmaura frontend. Vanilla React (no meta-framework) bundled with Vite, with two strictly separated surfaces — `react/marketplace/` (customer marketplace) and `react/internal/` (pharmacist and operations console) — sharing common code in `react/shared/` (API client, access control, portal cache, observability). See "Marketplace/Internal Access Segregation" below for the mandatory access rule between these two surfaces.
- `farmaura-api/`: Farmaura backend. The FastAPI + Pydantic v2 + SQLAlchemy (async) + PostgreSQL + Valkey Python API specified by the rest of this document. Owns all Farmaura business data: catalog, cart, orders, prescriptions, inventory, PDV, CRM, delivery, fiscal documents.
- `lumos-api/`: backend for the separate Lumos product family (`identity` auth domain plus the `lumosmed` clinic domain), Flask + Gunicorn + SQLAlchemy, organized as `domains/<name>/{api,services}`. Not part of Farmaura's business domain, but it is a sibling stack in this repository and shares the same gateway.
- `lumosmed/`: Laravel (PHP) front-end and portal for the Lumos Med clinic product; consumes `lumos-api` over the internal network.
- `lumos-gateway/`: shared Nginx edge gateway (TLS via Certbot, GeoIP filtering, Fail2ban) that fronts every stack in this repository, including Farmaura per the constraint below.
- `dev-obsidian/_Compartilhado/Skills/`: canonical skill library for agents and human readers. Each skill has a human-oriented `<skill-name>.md` note and an executable `<skill-name>/SKILL.md` definition. The `SKILL.md` files encode repository requirements and must be read and applied while writing code.
- root docs: `agent.md` (this file), `claude.md` (Claude-specific mirror of the same guide).

## Knowledge Vault

Decisions, evolving documentation, standards, policies, business rules, integrations, APIs, databases, infrastructure, risks, vulnerabilities, pending items, architecture, and operating procedures for this repository (and any other project the user develops) live in an Obsidian vault at `dev-obsidian/` in this repository's root — tracked in this same git repository. Its `dev-obsidian/CLAUDE.md` is the authoritative governance file: read it before writing anything there.

The vault is organized **project-first**, not by category — each product gets its own top-level folder:

- `dev-obsidian/farmaura/` — this product (frontend `farmaura/`, backend `farmaura-api/`, infra `docker/`).
- `dev-obsidian/lumosmed/` — the LumosMed product, kept deliberately thin here; its deep documentation lives in the separate `lumos-obsidian` vault.
- `dev-obsidian/_Compartilhado/` — generic skills, agents, prompts, standards, and POPs not tied to one product, meant to be copied into other repositories.

Each project folder has the same 8 numbered categories, each with a ready `_Template.md` to copy from: `00_Decisoes` (ADRs), `01_Contexto_Usuario` (**read-only for AI agents — never write here**), `02_Documentacao`, `03_Padroes_Politicas` (standards/policies/assumptions/business rules), `04_Seguranca_Riscos` (security findings/vulnerabilities/risk register), `05_Integracoes_Infra` (APIs/integrations/databases/infra), `06_Pendencias` (open items/tech debt), `07_POPs_Processos`.

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
- do not create database migrations (Alembic in `farmaura-api/`, or any equivalent in `lumos-api/`/`lumosmed/`) for schema changes made during this development phase — change the ORM models directly and apply the schema through the project's existing dev bootstrap path (e.g. `farmaura-api/scripts/bootstrap_database.py`, `lumos-api/database/runtime_bootstrap.py` and `schema_updates.py`) instead of hand-writing a migration file; this overrides the "Migrations and Seed Data" section below, which describes the eventual production-grade posture, not the current one;
- always apply the applicable executable skills in `dev-obsidian/_Compartilhado/Skills/` while implementing anything touching authentication, authorization, request handling, file uploads, backend business logic, cross-service communication, UI behavior, or testing — treat them as required steps in the workflow, not optional references.

None of this relaxes the Security-First Rules below: skipping migrations and legacy compatibility is about development velocity, not about weakening tenant isolation, input validation, authorization, or any other control in this document.

## Existing Infrastructure Constraint

This repository already contains an existing gateway stack in `lumos-gateway/`.

That stack must be preserved and treated as the canonical public edge.

Required assumptions:

- `lumos-gateway` remains the single public ingress;
- TLS termination, certificate lifecycle, and HTTP-to-HTTPS redirect remain in `lumos-gateway`;
- public host-based routing remains in `lumos-gateway`;
- backend services must not be exposed directly to the public internet outside the gateway model;
- application stacks connect to the shared external Docker network `lumos_gateway` only for edge routing needs;
- each application stack keeps its own private internal network for database, cache, workers, and non-public services.

## Approved Runtime and Toolchain Versions

Use these exact versions or these exact version families when creating the backend baseline.

### Core Runtime

- Python `3.13.13`;
- PostgreSQL `17.x`, starting from `17.0` and pinned to a tested patch release in deployment images;
- Valkey `9.1.x`, pinned by exact image digest in containers;
- Docker Engine `29.5.3` or newer within the `29.x` line after validation;
- Nginx `1.30.2` stable through the existing `lumos-gateway` stack.

### Python Dependencies

Pin exact versions in `pyproject.toml` and lock them in `uv.lock`.

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

Only add new dependencies when there is a concrete need, and every new dependency must be justified in code review.

### JavaScript Tooling Policy

Do not use `npm` for the Python backend itself.

If frontend tooling becomes necessary later, use:

- Node.js `24.16.0 LTS`;
- bundled npm `11.13.0` for that Node release, unless a later npm patch is explicitly approved and pinned;
- `package-lock.json` committed;
- `npm ci` instead of `npm install` in CI;
- `npm install --ignore-scripts` by default for audit and inspection flows unless a package script is explicitly required and reviewed.

Do not use `latest`.
Do not use open-ended ranges like `^`, `~`, `>=`, or `*` in critical application dependencies.

## Mandatory Stack

Use the following stack unless a concrete technical blocker is found:

- FastAPI;
- Pydantic v2;
- SQLAlchemy 2.x;
- Alembic;
- PostgreSQL;
- Valkey;
- `uv` for environment and dependency management;
- `pytest` for tests;
- `ruff` for lint and formatting;
- `mypy` for static typing;
- `httpx` for API and integration tests;
- `structlog` or equivalent JSON structured logging.

Do not build this backend with Django.
Do not use Flask.
Do not use ORMs or auth libraries that hide critical security behavior.
Do not use synchronous patterns by default if the selected architecture is async.

## Architecture Standard

Follow a layered and explicit architecture:

- `app/api/`: HTTP layer, route registration, dependency wiring, request and response schemas;
- `app/core/`: settings, database, logging, security, rate limits, exception mapping, pagination, shared security helpers;
- `app/domain/`: enums, domain errors, domain constants, business invariants;
- `app/models/`: ORM models;
- `app/repositories/`: focused persistence operations;
- `app/services/`: business use-cases and orchestration;
- `app/tasks/`: background jobs only when required;
- `app/tests/`: unit, integration, API, concurrency, and abuse-resistance tests.

Do not place business rules directly inside routes.
Do not place SQL queries directly inside routes.
Do not create generic “utils” dumping grounds.
Do not introduce ceremony-heavy abstractions that reduce clarity.

## Recommended Project Layout

Create the backend in a dedicated root directory:

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
      router.py
      deps.py
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
      responses.py
    domain/
      enums.py
      errors.py
      permissions.py
    models/
      base.py
      user.py
      customer.py
      store.py
      category.py
      product.py
      order.py
      order_item.py
      prescription.py
      inventory_item.py
      address.py
      payment.py
      service_booking.py
      file_asset.py
      audit_event.py
      refresh_token.py
      idempotency_key.py
    repositories/
      user_repository.py
      product_repository.py
      order_repository.py
      prescription_repository.py
      inventory_repository.py
      file_repository.py
    services/
      auth_service.py
      token_service.py
      catalog_service.py
      cart_service.py
      order_service.py
      prescription_service.py
      inventory_service.py
      delivery_service.py
      crm_service.py
      pdv_service.py
      upload_service.py
      audit_service.py
    schemas/
      common.py
      auth.py
      catalog.py
      customers.py
      cart.py
      orders.py
      prescriptions.py
      inventory.py
      uploads.py
    tests/
      conftest.py
      unit/
      integration/
      api/
      security/
      concurrency/
  scripts/
    dev.py
    seed.py
    audit_dependencies.py
lumos-gateway/
  Dockerfile
  docker-compose.yml
  nginx/
  certbot/
  fail2ban/
  scripts/
```

Do not merge the gateway into the backend application structure.
The backend must integrate with the existing `lumos-gateway/` directory already present in this repository.

## Security-First Rules

Security is not an optional hardening pass. It is part of the baseline architecture.

Every implementation must assume:

- the frontend is untrusted;
- every ID coming from the client is untrusted;
- every value from body, query string, path params, headers, cookies, `localStorage`, `sessionStorage`, hidden inputs, URL fragment, or frontend state is untrusted;
- users may tamper with payloads;
- automation, brute force, spam, replay, race conditions, and malicious file uploads will happen;
- tenant boundaries must be enforced in the backend and, where applicable, at the database level.
- the gateway is part of the trust boundary and must stay aligned with backend security behavior.

## Gateway Integration Rules

The Python backend must integrate with `lumos-gateway` as an upstream service.

Required rules:

- expose the backend only through internal Docker networking plus the shared `lumos_gateway` network when needed for gateway routing;
- do not bind backend ports directly to the host for normal operation;
- define a stable backend upstream service name and wire it into gateway templates and environment variables;
- preserve gateway-managed HTTPS, redirect logic, certificate renewal, GeoIP filtering, and Fail2ban protections;
- keep gateway config as the source of truth for hostnames, upstreams, health probes, and public entrypoints;
- ensure backend health routes work cleanly behind the gateway model;
- keep backend-added security headers compatible with gateway headers instead of creating contradictory policy behavior.

Network model:

- shared edge network: `lumos_gateway`;
- backend private network: application-only, for PostgreSQL, Valkey, workers, and internal-only services;
- PostgreSQL and Valkey must not be placed on the shared edge network unless there is a justified operational requirement.

Deployment model:

- `lumos-gateway` remains its own stack;
- the backend remains a separate stack;
- the backend web service joins `lumos_gateway`;
- backend internal services remain private to the backend stack.

## Authentication, Session, JWT, and Authorization

Use JWT with refresh tokens only if the implementation includes all of the following:

- short-lived access tokens;
- revocable refresh tokens stored server-side with rotation;
- token family invalidation on suspected theft or logout;
- explicit `iss`, `aud`, `sub`, `exp`, `nbf`, and `iat` validation;
- explicit allowed-algorithm whitelist;
- no acceptance of `alg=none` or implicit algorithm negotiation;
- replay resistance for refresh flows;
- no sensitive clinical, financial, tenant-secret, or overbroad authorization data inside JWT payloads;
- backend authorization checks for every sensitive operation.

Rules:

- JWT must carry only minimal identity and authorization context;
- do not store passwords, PII-heavy payloads, financial data, medical data, or raw permission lists in JWT unless absolutely required and reviewed;
- do not trust role, tenant, clinic, patient, file, order, or ownership claims from the client without server-side cross-checking;
- all sensitive endpoints must validate authentication, tenant, ownership, scope, and role;
- implement horizontal and vertical authorization checks explicitly.

If cookie-based auth is used anywhere:

- use `HttpOnly`, `Secure`, and appropriate `SameSite`;
- add CSRF protection for state-changing requests;
- rotate session identifiers on privilege changes;
- invalidate sessions after password change, suspicious activity, or explicit logout.

Login, password-reset-request, and any user-lookup flow must return the same generic response regardless of whether the identifier exists, to prevent account enumeration — the same principle the section below already requires for internal-portal access denial.

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

## Multi-Tenancy, RLS, and Data Isolation

The system must be designed as securely multi-tenant from the beginning.

Required controls:

- tenant or store scoping in every sensitive query;
- ownership checks for customer data and documents;
- store or role-bound checks for pharmacist operations;
- explicit access rules for uploads, downloads, dashboards, reports, orders, prescriptions, and CRM data;
- database RLS where justified for the most sensitive multi-tenant data paths;
- no endpoint may return cross-tenant rows by omission of a filter.

Where PostgreSQL RLS is used:

- define policies explicitly;
- test allow and deny behavior;
- do not rely on application filtering alone for high-risk datasets;
- ensure background jobs also use correct tenant context or privileged audited access.

## Input Validation Rules

Validate all request inputs server-side with strict schemas and business rules:

- types;
- length limits;
- numeric ranges;
- enum allowlists;
- date sanity;
- UUID formats;
- decimal precision;
- nested structure size;
- field normalization;
- duplicate detection where applicable.

Rules:

- reject unknown fields by default for sensitive schemas;
- defend against mass assignment and overposting;
- never rely on the frontend to hide forbidden fields;
- normalize user-facing identifiers before comparison when appropriate;
- revalidate business state transitions in the service layer.

## Injection and Parsing Defenses

The backend must be built to resist at minimum:

- SQL injection;
- NoSQL injection if any NoSQL component is added later;
- command injection;
- template injection;
- path traversal;
- header injection;
- LDAP injection if LDAP is introduced;
- SSRF;
- open redirect;
- reflected, stored, and DOM-assisted XSS in data passed through APIs;
- unsafe markdown or HTML persistence;
- log injection where user input reaches logs.

Rules:

- parameterize all database access;
- never construct SQL with raw string interpolation;
- never pass user input to shell commands;
- if subprocesses are unavoidable, use argument arrays, fixed executables, strict allowlists, and no shell parsing;
- sanitize or reject HTML-rich input unless there is a reviewed need;
- never fetch arbitrary URLs from users without SSRF protections;
- deny internal IP ranges, link-local, loopback, RFC1918, metadata endpoints, and custom schemes for outbound fetches;
- resolve and validate DNS defensively for external fetch features.

## File Upload, Storage, and Download Security

Uploads are high-risk and must be implemented conservatively.

Required controls:

- allowlist of extensions;
- allowlist of real MIME types;
- magic-byte or file-signature validation;
- maximum size per file;
- maximum files per request;
- total quota per user and tenant;
- rejection of double extensions and suspicious filenames;
- rejection or quarantine of SVG, HTML, JS, executables, polyglot files, archive bombs, and unsupported compressed formats unless explicitly approved;
- content scanning hook for antivirus or malware scanning when available;
- server-generated storage names using UUIDs or content hashes;
- tenant-separated storage layout;
- metadata stored separately from file bytes;
- authorization checks on download;
- no direct filesystem path exposure;
- no public predictable URLs for private documents.

Rules:

- never trust client-declared MIME;
- never trust original filename for storage path;
- never store uploads in web-root served directories;
- stream large uploads instead of loading them fully in memory;
- enforce CPU, memory, and storage limits on processing tasks;
- protect OCR, document parsing, and image processing against resource exhaustion.

## Frontend Trust Boundary Rules

Backend code must not trust:

- query string;
- route params;
- URL fragments;
- hidden inputs;
- disabled fields;
- `localStorage`;
- `sessionStorage`;
- optimistic frontend flags;
- values shown on screen but not server-authorized.

Rules:

- all totals, prices, discounts, cashback, permissions, and workflow states must be recalculated or revalidated on the backend;
- the backend must not accept tenant, role, ownership, or privilege changes from normal client payloads;
- the backend must reject fields outside the expected contract.

## Passwords, Secrets, and Credential Hygiene

Passwords must be hashed with Argon2id through `pwdlib[argon2]` or equivalent approved implementation.

Rules:

- use `PasswordHash.recommended()` or an explicit reviewed Argon2id policy;
- enforce minimum password length and block weak password patterns;
- never log passwords, reset tokens, JWTs, API keys, or secrets;
- secrets must come from environment or secret manager, never from source control;
- invalidate refresh tokens and active sessions after password reset or privileged credential changes;
- support credential rotation and secret rotation as first-class operations.

## CSRF, CORS, Headers, and Browser Security

If the API uses cookies or browser session semantics:

- enforce CSRF tokens on state-changing routes;
- validate `Origin` and `Referer` where applicable;
- reject cross-site unsafe requests without valid CSRF proof.

Configure secure CORS:

- explicit allowed origins only;
- no wildcard with credentials;
- explicit methods and headers;
- no overly broad preflight allowances.

Set security headers at the gateway and, where appropriate, in the app:

- `Strict-Transport-Security`;
- `Content-Security-Policy`;
- `X-Frame-Options` or `frame-ancestors` in CSP;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- `Permissions-Policy`;
- disable dangerous caching on sensitive routes.

The existing gateway already owns TLS, host routing, GeoIP, and Fail2ban.
Backend code must complement this edge model instead of duplicating it inconsistently.

## Concurrency, Idempotency, and Race Conditions

All critical write flows must be safe under retries, double clicks, parallel requests, and repeated webhooks.

Required controls for sensitive operations:

- idempotency keys for payments, refunds, checkout finalization, and webhook-style flows;
- database unique constraints;
- transactional locks where needed;
- optimistic or pessimistic concurrency for contested resources;
- state transition validation in the service layer;
- duplicate submission protection.

Must explicitly test:

- duplicated order creation;
- duplicated prescription actions;
- duplicated stock adjustments;
- duplicated payment confirmations;
- duplicated refunds;
- webhook replay;
- concurrent file metadata writes;
- concurrent updates on the same business record.

## Abuse Resistance and Availability

Protect against:

- DDoS;
- brute force;
- credential stuffing;
- request spam;
- abusive pagination;
- oversized payloads;
- expensive query abuse;
- upload abuse;
- memory exhaustion;
- CPU exhaustion;
- storage exhaustion.

Required controls:

- route-level rate limiting;
- stricter rate limits for auth, password reset, uploads, and public endpoints;
- request body size limits;
- pagination caps;
- query complexity limits where relevant;
- connection, read, and upstream timeouts;
- lockout or stepped friction for repeated failed logins;
- per-user and per-IP abuse counters;
- quotas for storage and uploads;
- bounded background job concurrency;
- CAPTCHA (or equivalent human/proof-of-work challenge) on public high-risk forms — signup, password-reset request, anonymous checkout — after repeated suspicious attempts from the same actor or IP;
- MFA required for staff/admin roles and any elevated-privilege operation, using the existing MFA challenge token type in `core/jwt.py` — this makes it a mandatory control, not just available infrastructure.

Account-security notifications (failed-login alerts, password-reset e-mails, lockout notices) must include a standard anti-phishing notice: this company never calls, texts, or e-mails asking for a password, OTP, or full card number.

## Logging, Errors, Audit, and Data Exposure

Rules:

- errors returned to clients must never expose stack traces, SQL, secrets, filesystem paths, or internal topology;
- logs must mask PII, credentials, JWTs, cookies, medical data, and financial secrets;
- create structured audit events for sensitive actions;
- responses must avoid overexposing fields;
- disable debug mode outside local development;
- ensure traces and metrics do not leak sensitive payload bodies by default.

## AI, LLM, OCR, and Prompt Injection

If any AI or LLM workflow is introduced later, treat all document, image, OCR, and user text content as hostile.

Required controls:

- strict separation between system instructions, trusted context, and untrusted content;
- clear delimiting of untrusted input;
- no automatic execution of model output;
- no tool invocation based solely on model output without validation;
- output validation before persistence or side effects;
- no inclusion of secrets, cross-tenant data, or hidden internal instructions in prompts unless necessary and access-checked;
- explicit defenses against prompt injection via free text, markdown, HTML, PDFs, images, OCR text, and metadata.

## Database Integrity Rules

Every important table should include:

- `id`;
- `created_at`;
- `updated_at`.

Add:

- foreign keys;
- unique constraints;
- composite unique constraints where deduplication matters;
- explicit indexes for scoped lookups;
- tenant-scoped uniqueness where required.

Do not:

- rely on application code alone for uniqueness;
- store critical workflow state only in JSON;
- expose internal sequential identifiers publicly if enumeration risk is relevant.

Prefer UUIDs for public identifiers.

## Supply Chain and Dependency Security

Treat supply chain as part of application security.

Required controls:

- exact version pinning in manifest files;
- committed lockfiles;
- reproducible builds;
- base image pinning by digest;
- no `latest` tags;
- no unreviewed post-install scripts;
- no dependencies from unknown registries;
- no curl-pipe-shell install patterns inside CI or Dockerfiles;
- dependency review before adoption;
- vulnerability scanning in CI for Python, OS packages, and container images;
- artifact provenance verification where available;
- separate production and development dependencies;
- minimal container images;
- no build-time secrets baked into images;
- no credentials in Dockerfiles or image layers.

If JavaScript tooling is ever used:

- prefer `npm ci`;
- keep `package-lock.json` committed;
- review `scripts`, `postinstall`, `prepare`, and transitive packages;
- use scoped registries only when justified;
- disable lifecycle scripts in audit contexts;
- block dependency confusion with explicit registry configuration.

If PHP/Composer tooling is touched (`lumosmed/`, a sibling stack in its own nested git repository):

- commit `composer.lock`, install with `composer install --no-dev --no-scripts` outside local development;
- pin exact versions for anything touching auth, crypto, or HTTP clients instead of unconstrained `^`/`~` ranges;
- review a package before requiring it, never install from an unreviewed registry;
- no unreviewed Composer scripts (`post-install-cmd`, `post-update-cmd`).

This file covers `farmaura`/`farmaura-api`/`lumos-gateway` directly. `lumosmed`/`lumos-api` are separate git repositories without their own copy of this file — the full multi-stack version-locking policy (Python, npm, Composer, Docker) lives in `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-supply-chain-multi-stack.md` for manual copy into those repositories.

Gateway-specific supply-chain rules:

- preserve the existing split between `gateway_nginx`, `lumos_gateway_certbot`, and `lumos_gateway_fail2ban`;
- when modifying gateway compose, replace floating image tags like `certbot/certbot:latest` and `crazymax/fail2ban:latest` with reviewed pinned tags or digests;
- keep `/etc/letsencrypt` read-only in Nginx and writable only where certificate issuance requires it;
- never commit TLS private keys, live certificate material, or secret files used by the gateway;
- treat gateway templates, scripts, and mounted configuration files as privileged deployment artifacts subject to review.

## API Design Rules

All APIs must be versioned from day one:

- `/api/v1/...`

Use consistent resource naming:

- plural nouns for collections;
- stable identifiers in paths;
- query parameters for filtering, sorting, and pagination;
- explicit response DTOs for every route.

Examples:

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/catalog/products`
- `GET /api/v1/catalog/products/{product_id}`
- `POST /api/v1/cart/items`
- `POST /api/v1/orders`
- `GET /api/v1/orders/{order_id}`
- `POST /api/v1/prescriptions`
- `PATCH /api/v1/prescriptions/{prescription_id}/status`
- `GET /api/v1/inventory/items`
- `PATCH /api/v1/inventory/items/{item_id}/stock`
- `POST /api/v1/uploads`
- `GET /api/v1/uploads/{file_id}/download`

## Required Initial Domains

Implement the backend by domains, not by screens.

### Phase 1

- health and readiness;
- settings, logging, and secure bootstrap;
- authentication and authorization;
- catalog and categories;
- customers and addresses;
- cart persistence;
- orders and order items;
- prescription upload and validation workflow;
- stores and pickup options;
- inventory;
- pharmacist operations summary;
- audit event model and audit logging baseline.

### Phase 2

- service bookings;
- CRM;
- delivery routing support;
- pharmacist chat threads and messages;
- PDV sales and fiscal records;
- cashback and loyalty;
- AI-assisted document workflows only after explicit security review.

## Service Layer Rules

Every service function must represent a business action.

Good examples:

- `create_order`;
- `approve_prescription`;
- `reject_prescription`;
- `adjust_inventory_stock`;
- `dispatch_ready_orders`;
- `create_pdv_sale`;
- `issue_refresh_token`;
- `store_uploaded_file`.

Bad examples:

- `handle_data`;
- `process_everything`;
- `manage_item`.

Service functions must:

- validate domain invariants;
- enforce authorization and ownership;
- coordinate repositories;
- own transaction boundaries where appropriate;
- return explicit domain results or DTOs.

## Route Layer Rules

Routes must be thin.

Each route should:

- validate request payloads;
- resolve authenticated actor;
- resolve tenant or store scope;
- call a service;
- map domain errors to HTTP responses;
- return a response model.

Do not put branching business logic directly in route handlers.

## Error Handling Standard

Create explicit domain exceptions and map them centrally.

Examples:

- `ResourceNotFoundError`;
- `DomainValidationError`;
- `PermissionDeniedError`;
- `ConflictStateError`;
- `RateLimitExceededError`;
- `UnsafeFileError`.

HTTP mapping should be predictable:

- `400` for business validation errors;
- `401` for unauthenticated;
- `403` for unauthorized;
- `404` for not found;
- `409` for state conflict;
- `413` for oversized payload or file;
- `415` for unsupported media type;
- `422` only for schema validation;
- `429` for rate limits;
- `500` for unexpected failures.

All error payloads should be structured consistently.

## Response Standard

Use a stable response format for non-trivial endpoints:

```json
{
  "data": {},
  "meta": {},
  "errors": []
}
```

Paginated endpoints must include:

- `page`;
- `page_size`;
- `total`;
- `has_next`.

Never return sensitive internal fields by default.

## Settings and Environment

Create typed settings with Pydantic Settings.

At minimum define:

- `APP_NAME`;
- `APP_ENV`;
- `APP_DEBUG`;
- `API_PREFIX`;
- `SECRET_KEY`;
- `JWT_ISSUER`;
- `JWT_AUDIENCE`;
- `JWT_PRIVATE_KEY`;
- `JWT_PUBLIC_KEY`;
- `ACCESS_TOKEN_EXPIRE_MINUTES`;
- `REFRESH_TOKEN_EXPIRE_DAYS`;
- `DATABASE_URL`;
- `VALKEY_URL`;
- `CORS_ORIGINS`;
- `CSRF_SECRET`;
- `MAX_REQUEST_BODY_BYTES`;
- `MAX_UPLOAD_BYTES`;
- `LOG_LEVEL`;
- `TRUSTED_PROXY_CIDRS`.

Provide a complete `.env.example`.

## Migrations and Seed Data

This section describes the eventual production-grade posture for schema changes. It does not apply while this repository is in the development phase — see "Development Environment Policy" above, which currently overrides it: apply schema changes directly to the models and the dev bootstrap scripts, with no migration files.

Once the project moves toward production, all schema changes must be implemented through Alembic migrations.

Also provide:

- deterministic seed data for local development;
- demo customer, pharmacist, and admin users;
- stores, products, sample orders, prescriptions, and inventory;
- no plaintext production secrets in seeds.

## Testing Standard

Minimum required coverage for every implemented domain:

- unit tests for business rules;
- integration tests for repositories and database behavior;
- API tests for route contracts and permission boundaries;
- security tests for abuse cases and invalid input;
- concurrency tests for duplicate-sensitive flows.

Critical flows that must have tests:

- login;
- refresh token rotation;
- logout and refresh invalidation;
- product listing;
- create cart items;
- create order;
- prescription approval and rejection;
- stock adjustment;
- pharmacist access restrictions;
- tenant isolation;
- upload validation;
- download authorization;
- idempotency and duplicate submission handling.

## Quality Gates

Every implementation batch must pass:

- `ruff check`;
- `ruff format --check`;
- `mypy`;
- `pytest`.

Also add, when the project is bootstrapped:

- dependency audit step;
- container image scan step;
- migration verification in CI (once migrations are reintroduced for production, per "Development Environment Policy");
- OpenAPI contract generation check.
- gateway template validation and `nginx -t` verification whenever `lumos-gateway` files are changed.

Do not leave the project in a partially wired insecure state.

## Documentation Requirements

When generating the backend, also maintain:

- `farmaura-api/README.md` with setup, run, test, migrate, seed, security assumptions, and architecture notes;
- route documentation through FastAPI OpenAPI;
- security notes for auth, uploads, tenant isolation, and operational controls;
- example requests for main endpoints.

## Implementation Order

When starting implementation, use this order:

1. bootstrap backend structure and pinned tooling;
2. map integration points with `lumos-gateway`, including upstream naming, health route, and Docker networking;
3. settings, logging, database, schema bootstrap, and security middleware;
4. password hashing, JWT, refresh tokens, session invalidation, and auth dependencies;
5. users, roles, stores, tenant model, and authorization primitives;
6. catalog, categories, and scoped product reads;
7. cart and orders with idempotency and ownership checks;
8. prescriptions and secure uploads;
9. inventory and pharmacist dashboard summary;
10. CRM, delivery, PDV, and remaining operational modules.

## Non-Negotiable Constraints

- keep code explicit and production-oriented;
- use strong typing;
- avoid magic globals;
- avoid hidden framework behavior;
- prefer small composable services over giant managers;
- preserve clear domain boundaries between customer and pharmacist capabilities;
- write complete code, not illustrative fragments;
- treat every client-controlled field as hostile until validated;
- never assume the frontend protects the backend;
- never assume a URL identifier is trustworthy;
- never persist or expose more data than necessary.

## Delivery Behavior

When implementing:

- create complete files;
- wire routes end-to-end;
- apply schema changes directly to the models and dev bootstrap path (no migration files, per "Development Environment Policy");
- add tests for the implemented behavior;
- update documentation in the same change set;
- include security controls in the first implementation of each feature, not later.
