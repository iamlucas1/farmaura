---
name: secure-python-backend
description: Use when creating or refactoring a Python backend for Farmaura or similar systems that require FastAPI, strict version pinning, secure defaults, tenant isolation, JWT auth, file upload protections, abuse controls, and supply-chain-safe dependency management.
---

# Secure Python Backend

Use this skill when building backend foundations, new domains, or backend refactors that must already comply with the repository security baseline.

This repository already contains `lumos-gateway/` and that gateway must be preserved as the canonical public edge.

## Goals

- produce production-ready FastAPI backend code;
- apply the repository's required pinned stack and architecture;
- enforce authorization, input validation, abuse limits, and safe file handling from the first version;
- keep dependency and container choices supply-chain-safe;
- integrate the backend cleanly with the existing `lumos-gateway`.

## Workflow

1. Read [references/versions-and-supply-chain.md](references/versions-and-supply-chain.md) before creating manifests, Dockerfiles, or CI steps.
2. Read [references/security-baseline.md](references/security-baseline.md) before creating routes, models, services, file handling, or auth flows.
3. Map integration with `lumos-gateway`:
   - stable upstream service name;
   - shared external Docker network `lumos_gateway`;
   - private backend-only network for database, Redis, and workers;
   - health route suitable for gateway and orchestrator checks;
   - no direct public backend port exposure for normal operation.
4. Scaffold code using layered structure:
   - `api`, `core`, `domain`, `models`, `repositories`, `services`, `schemas`, `tests`.
5. For every new route or service:
   - define request and response schemas;
   - validate actor, tenant, role, and ownership;
   - reject unknown or unsafe input;
   - add tests for valid flow and at least one abuse case.
6. For every persistence change:
   - create migration;
   - add constraints and indexes;
   - verify deduplication, ownership, and scoped uniqueness.
7. For every external dependency or integration:
   - pin exact version;
   - justify why it is needed;
   - avoid lifecycle-script-driven or untrusted install paths.
8. If gateway files change:
   - keep TLS, redirect, GeoIP, and Fail2ban responsibilities in `lumos-gateway`;
   - validate templates and run `nginx -t` in the gateway context.

## Mandatory Checks

- never trust frontend state;
- never trust URL IDs without backend cross-check;
- never put business logic in route handlers;
- never introduce unbounded pagination or file uploads;
- never accept arbitrary HTML, shell input, or external URLs without explicit controls;
- never use `latest` image tags or floating dependency ranges;
- never expose database or Redis on the shared edge network;
- never bypass `lumos-gateway` for production routing.

## Implementation Notes

- Prefer UUID public identifiers.
- Use Argon2id through `pwdlib[argon2]`.
- Keep JWT minimal and rotate refresh tokens.
- Add idempotency for critical writes.
- Add rate limits for auth, uploads, and public endpoints.
- Add audit events for sensitive operations.
- Keep the backend web service reachable by `lumos-gateway` but keep internal services private.
- Keep backend security headers compatible with gateway-managed edge headers.
- Preserve strict portal segregation so marketplace customer sessions never mount internal console UI and receive only generic denial feedback when they try.

## Test Expectations

Every completed backend slice should include:

- unit tests;
- integration tests;
- API tests;
- at least one security or abuse test.
