# Security Baseline

Apply these controls by default when generating backend code.

This repository uses `lumos-gateway/` as the public edge. Backend security controls must complement that gateway instead of replacing it.

## Gateway Boundary

- Keep `lumos-gateway` as the only public ingress.
- Keep TLS termination, redirect logic, host routing, GeoIP, and Fail2ban at the gateway layer.
- Place only the backend web service on the shared external Docker network `lumos_gateway`.
- Keep PostgreSQL, Redis, workers, and internal-only services on private backend networks.
- Expose health endpoints that work for gateway and orchestrator checks.
- Do not bind backend ports publicly for normal production traffic.

## Trust Boundaries

- Treat body, query, path params, headers, cookies, URL fragment, `localStorage`, `sessionStorage`, hidden inputs, and frontend state as untrusted.
- Recompute or revalidate prices, totals, discounts, workflow states, permissions, ownership, and tenant scope in the backend.

## Authentication and Authorization

- Use short-lived access JWTs and rotating refresh tokens.
- Validate `iss`, `aud`, `sub`, `exp`, `nbf`, and `iat`.
- Use an explicit allowed algorithm list.
- Do not store sensitive medical, financial, or permission-heavy payloads in tokens.
- Enforce role, scope, tenant, store, and ownership checks server-side.
- Invalidate refresh tokens on logout, password reset, or token family compromise.

## Input Validation

- Validate type, size, format, enum, numeric range, and nested payload size.
- Reject unknown fields where sensitive.
- Block mass assignment and overposting.
- Never depend on frontend validation alone.

## Injection Defenses

- Parameterize SQL.
- Do not interpolate user input into shell commands.
- Reject or sanitize risky HTML and markdown content.
- Protect outbound fetches against SSRF and internal network access.
- Avoid template rendering of raw user input.
- If outbound HTTP is added, ensure gateway or network rules do not accidentally allow access to internal metadata endpoints or internal upstream-only hosts.

## Upload Security

- Validate extension, MIME, and magic bytes.
- Enforce size caps, count caps, and quotas.
- Use generated names and tenant-separated storage.
- Never trust original filename or client MIME.
- Protect downloads with authorization checks.
- Never store private uploads in public web roots.

## Availability and Abuse

- Rate limit auth, uploads, and public routes.
- Cap pagination and body size.
- Add timeouts and concurrency limits.
- Protect against brute force, credential stuffing, request spam, and resource exhaustion.
- Keep backend limits compatible with gateway limits to avoid contradictory behavior or bypass through mismatched ceilings.

## Concurrency

- Add idempotency keys for critical writes.
- Use transactions and unique constraints.
- Test duplicate submit and replay scenarios.

## Exposure Control

- Avoid leaking stack traces, SQL, secrets, paths, and internal topology.
- Mask PII, credentials, JWTs, cookies, and financial or clinical data in logs.
- Keep responses minimal.
- Do not expose internal Docker service names, private network topology, or gateway upstream naming in public errors.

## AI and Prompt Injection

- Treat all user content and document content as hostile.
- Separate instructions from untrusted content.
- Never execute model outputs directly.
- Validate model-driven actions before side effects.
