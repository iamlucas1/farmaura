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
- tests for horizontal and vertical authorization failures.

## Build Pattern

1. Create password hashing helper.
2. Create JWT encode and decode helper with strict validation.
3. Create refresh token persistence model.
4. Create auth service with login, refresh, logout, revoke.
5. Create role and ownership dependencies.
6. Add API tests for:
   - login success;
   - login failure;
   - expired token;
   - revoked refresh token;
   - cross-tenant access denial;
   - cross-user access denial.
