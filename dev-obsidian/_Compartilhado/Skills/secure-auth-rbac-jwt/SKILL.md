---
name: secure-auth-rbac-jwt
description: Use when implementing or refactoring authentication, JWT, refresh tokens, RBAC, ownership checks, tenant isolation, CSRF-sensitive session flows, or password hashing in a Python backend.
---

# Secure Auth RBAC JWT

Use this skill for login, refresh, logout, roles, permissions, ownership checks, tenant isolation, and password flows.

## Core Rules

- Access tokens must be short-lived.
- Refresh tokens must rotate and be revocable server-side.
- JWT payloads must be minimal.
- Authorization must be checked in the backend for every sensitive action.
- Role checks are not enough; enforce ownership and tenant scope too.
- Auth flows must remain compatible with requests arriving through `lumos-gateway`, including forwarded proto and host handling where relevant.
- Marketplace customer identities must never mount the internal portal shell; deny them at the internal login boundary with a generic message and clear any restored session.

## Required Controls

- Argon2id via `pwdlib[argon2]`;
- explicit validation of `iss`, `aud`, `sub`, `exp`, `nbf`, `iat`;
- explicit allowed algorithms only;
- refresh token family invalidation;
- logout invalidation;
- session invalidation after password reset or privilege changes;
- tests for horizontal and vertical authorization failures;
- password strength policy at every human-chosen password (register, reset,
  change): minimum length plus lowercase, uppercase, digit, and special
  character — never applied to system-generated temporary passwords, which
  already carry more entropy than a human-memorable string;
- per-IP rate limiting on every public auth endpoint (login, register,
  verify-2fa, refresh, password-reset/first-access request), fixed-window,
  fail-open if the limiter store is unreachable — availability of auth must
  not depend on the limiter's own health;
- per-account brute-force lockout on login, independent of IP: count
  consecutive failed attempts per identifier (e-mail), lock the account once
  a threshold is crossed, and grow the lockout window exponentially with
  each further failure while locked-out attempts don't consume more of the
  counter. Reset the counter and lockout on the next successful login.
- self-service unlock for that lockout: when a fresh lock is applied (not on
  every rejected attempt while already locked), issue a single-use,
  time-bound unlock token and e-mail it to the account owner as a link to a
  dedicated unlock page. The unlock endpoint must require an explicit user
  action (button click), never auto-trigger on page load or on a bare GET,
  so e-mail-security link scanners that prefetch URLs cannot burn the token
  before the real owner clicks it.

## Build Pattern

1. Create password hashing helper.
2. Create a password-strength validator (character-class checks) and apply it
   to every schema field where a human chooses their own password.
3. Create JWT encode and decode helper with strict validation.
4. Create refresh token persistence model.
5. Create a Redis-backed fixed-window rate limiter and apply it as a route
   dependency on every public auth endpoint; make it fail open on Redis
   errors.
6. Create a Redis-backed per-account login guard (failed-attempt counter +
   exponential lockout, keyed by e-mail) and call it around the credential
   check in the login flow: check-not-locked before verifying the password,
   register a failure after a bad password, clear on success.
7. Create auth service with login, refresh, logout, revoke.
8. Create role and ownership dependencies.
9. Add API tests for:
   - login success;
   - login failure;
   - expired token;
   - revoked refresh token;
   - cross-tenant access denial;
   - cross-user access denial;
   - weak password rejected at registration/reset;
   - account locked after the failure threshold, unlocked after the window.
