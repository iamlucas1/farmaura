---
name: secure-service-communication
description: Use when wiring or reviewing any network call between two parts of this repository — farmaura (React) to farmaura-api, lumosmed (Laravel) to lumos-api, any service to another service, or any of them through lumos-gateway. Covers transport security, CORS, token transport/storage, CSRF, service-to-service request signing, and gateway wiring integrity.
---

# Secure Service Communication

Use this skill whenever code is added or changed that makes an HTTP call from one stack in this
repository to another: `farmaura/react/shared/api-client.js` calling `farmaura-api`, `lumosmed`
calling `lumos-api`, any backend calling another backend, or any change to `lumos-gateway` routing.

This repo already contains a strong reference implementation of internal service-to-service auth:
`lumosmed/app/Services/LumosApi/InternalRequestTokenFactory.php` (signs an RS256 JWT bound to
method + path + query hash + body hash) verified by `lumos-api/security/internal_requests.py`
(issuer/audience/subject/exp/nbf checks, request-binding match, Redis-backed replay protection).
**Reuse this pattern** for any new internal service call; do not invent a weaker one.

## Checklist for any new or changed cross-stack call

1. **Transport**
   - The call must be HTTPS in any non-local environment. If the client library has an "allow
     insecure transport" escape hatch, it must default to `false` and only flip to `true` when
     `APP_ENV`/`environment` is explicitly `local`/`development`/`testing`
     (see `lumosmed/app/Services/LumosApi/LumosApiClient.php` `resolveBaseUrlAndTls()` for the
     pattern to copy).
   - Do not assume the network path is HTTPS just because `lumos-gateway` terminates TLS at the
     edge — internal hops (app → app, app → gateway upstream) are frequently plain HTTP by design
     inside the private Docker network, so treat cross-container calls as "trusted network, not
     trusted transport": still require request signing/JWT auth on top, per point 3.
   - If the receiving app can be reached directly (not only through the gateway), add
     defense-in-depth: check `X-Forwarded-Proto`, and set `Strict-Transport-Security` from the app
     itself rather than assuming the gateway always fronts every deployment of that service.

2. **Base URL / endpoint configuration**
   - Never hardcode a target host, port, or protocol as a fallback default (e.g.
     `http://127.0.0.1:8080`). If configuration is missing, fail loudly (raise/throw) instead of
     silently falling back to a guessed plain-HTTP origin — a hardcoded fallback is exactly how a
     production build can end up silently talking over HTTP.
   - Source the target origin from environment/settings only: `LUMOS_API_INTERNAL_BASE_URL` /
     `VITE_*` / Pydantic `Settings` field. Keep `.env.example` in every stack current with every
     variable actually read in code.

3. **Authentication between the two sides**
   - End-user-facing calls (browser → API): bearer JWT in the `Authorization` header, short-lived
     access token, rotating refresh token — see `secure-auth-rbac-jwt`. Do not additionally invent
     a bespoke scheme for this leg.
   - Service-to-service calls (backend → backend, portal → internal API) that carry elevated
     internal privilege: add a signed internal-request token bound to method + path + body hash,
     short TTL, verified server-side with replay protection — mirror
     `InternalRequestTokenFactory.php` / `internal_requests.py`. Do not rely on a bare shared
     secret or a long-lived static API key for this leg.
   - Every internal/privileged route must require the signed-request check — do not leave any
     route (including login/auth-adjacent routes) reachable without it unless it is genuinely meant
     to be the public entry point, and document why it's the exception.

4. **Token storage on the client**
   - Browser bearer tokens kept in `localStorage`/`sessionStorage` are readable by any successful
     XSS; if you can, prefer an `HttpOnly` + `Secure` + `SameSite` cookie for the refresh token and
     keep only the short-lived access token in memory. If Web Storage is kept for pragmatic reasons,
     compensate with strict CSP (already present in `farmaura-api`'s security headers middleware)
     and keep access-token TTL short.
   - If cookies are used for auth on any leg, add CSRF protection on state-changing requests for
     that leg (`core/csrf.py` per the standard layout) — do not skip this because "the JWT skill
     covers auth"; CSRF is a separate control tied to cookie-based sessions specifically.

5. **CORS**
   - Explicit origin allowlist only, sourced from settings/env, never `*` combined with
     credentials. Reject the request rather than reflecting `Origin` unconditionally.

6. **Gateway wiring integrity**
   - When a service defines an upstream name, port, or TLS listener for `lumos-gateway` to route
     to, verify the target service actually exposes that name/port/listener. A mismatch (gateway
     expects `service-tls:8443`, service only listens on plain `:8000`) silently breaks routing or
     — worse — gets "fixed" by bypassing the gateway.
   - Never publish a backend's port directly to the host (`ports: ["8000:8000"]`) in addition to
     joining the gateway network unless there is a specific, documented reason (e.g. local-only
     debugging) — a directly published port lets every request skip the gateway's TLS, HSTS,
     GeoIP, Fail2ban, and rate-limiting entirely, including hitting any route that assumes gateway-
     level protection is always in front of it.

## Anti-Patterns

- A hardcoded `http://` fallback base URL anywhere in client code.
- A client that "just works" identically over HTTP and HTTPS with no visible difference in
  behavior (no insecure-transport guard, no environment gate).
- A privileged/internal route reachable with only a generic bearer token when sibling routes in
  the same module require a signed internal-request token.
- A backend container that both joins the gateway network and publishes its port to the host.
- Auth tokens with no CSRF story when cookies are in play, or a CSRF module added for a stack that
  uses bearer-only auth (unnecessary complexity — CSRF is meaningless without ambient cookie auth).
- Gateway upstream definitions that reference a service name/port the target compose file does not
  actually expose.

## Testing Minimum

For any new or changed cross-stack call, add or update tests covering:

- request rejected when the internal-request signature/JWT is missing, expired, or replayed (for
  service-to-service legs);
- request rejected when `Origin` is not in the allowlist;
- insecure-transport fallback stays disabled outside local/dev/test environments;
- gateway/service integration smoke check (upstream name and port actually match) whenever gateway
  routing config changes.
