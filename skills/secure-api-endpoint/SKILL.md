---
name: secure-api-endpoint
description: Use when adding or changing FastAPI endpoints that must enforce strict input validation, ownership checks, tenant scope, abuse limits, idempotency, response minimization, and consistent error handling.
---

# Secure API Endpoint

Use this skill for new or changed route handlers.

## Route Checklist

For each endpoint:

1. Define strict request schema.
2. Define explicit response schema.
3. Validate authenticated actor.
4. Resolve tenant, store, or ownership scope.
5. Reject unknown or forbidden fields.
6. Call a service, not inline business logic.
7. Map domain errors consistently.
8. Add abuse controls if the route is public, auth-related, or upload-related.
9. Confirm the route behaves correctly behind `lumos-gateway`, including forwarded headers, HTTPS assumptions, and health-check expectations when relevant.

## Sensitive Patterns

Use extra care for:

- create or update routes;
- money, stock, prescriptions, and file flows;
- routes that accept IDs from path or query;
- routes that list tenant-scoped data;
- routes callable by both customer and staff roles.
- endpoints reused by both marketplace and internal portals, which must not leak internal access decisions to customer-facing flows.

## Anti-Patterns

- trusting IDs from the URL without backend cross-check;
- trusting totals or states from the frontend;
- exposing internal fields in responses;
- missing pagination caps;
- using route handlers as service layers;
- returning debug details to clients;
- assuming the endpoint will be called directly instead of through the existing gateway.

## Testing Minimum

Every endpoint change should add:

- happy path test;
- unauthorized test;
- forbidden or cross-tenant test;
- invalid input test;
- abuse or duplicate-submit test when relevant.
