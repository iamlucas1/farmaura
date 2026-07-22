---
name: project-test-orientation
description: Use before testing any feature that spans multiple stacks in this repository — tells you which docker-compose file, container, port, and health-check endpoint each stack uses, so you don't guess or hit the wrong target.
---

# Project Test Orientation

Reference, not a checklist — read this before deciding what to start or hit while testing.

## Stacks and How to Reach Them

| Stack | Compose file | Key containers | Local port | Health check |
|---|---|---|---|---|
| `farmaura` (frontend) | `farmaura-api/docker-compose.yml` | `farmaura` | `127.0.0.1:3000` | `GET /healthz` |
| `farmaura-api` (backend) | `farmaura-api/docker-compose.yml` | `farmaura_api` | `127.0.0.1:8080` | `GET /api/v1/health` |
| `farmaura-postgres` / `farmaura-valkey` | `farmaura-api/docker-compose.yml` | `farmaura_postgres`, `farmaura_valkey` | internal only (`farmaura_private` network), no public port | — |
| `lumos-api` | `lumos-api/docker-compose.yml` | `lumos-api` | `${API_PORT:-8000}` | `GET /health` |
| `lumos-api-postgres` / `lumos-api-redis` | `lumos-api/docker-compose.yml` | `lumos-api-postgres`, `lumos-api-redis` | internal only (`api_internal` network) | — |
| `lumos-gateway` | `lumos-gateway/docker-compose.yml` | `lumos_gateway_nginx`, `lumos_gateway_certbot`, `lumos_gateway_fail2ban` | `80`/`443` — real public edge, treat as sensitive | — |
| `lumosmed` | no `docker-compose.yml` found in this repository | — | unknown — check `lumosmed/README.md` before assuming how to start it | — |

## Rules

- always test each backend directly on its own local port (`farmaura-api` on `8080`, `lumos-api` on `8000`), not through the gateway's public port, unless the thing under test is gateway routing itself;
- the gateway fronts real domains — never run aggressive scans or fuzzing against it, never touch certificate material as part of a test;
- database/cache containers have no public port by design — reach them only from inside their own compose network, never by exposing a port to test against.

## Complements, Doesn't Replace

General-purpose "run the app" or "verify the change works" workflows drive a single app end-to-end; use this table to tell them which stack/port/container is the right target instead of guessing. Vulnerability testing and QA functional review both assume this table for "where do I point the test".
