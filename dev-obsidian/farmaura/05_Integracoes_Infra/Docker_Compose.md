# Docker / docker-compose (farmaura)

**Tipo:** Infraestrutura

## Propósito

Empacotamento e orquestração local/deploy dos serviços do produto Farmaura.

## Contrato

- `docker/web/Dockerfile`: build multi-stage — Node 22.17.1-alpine builda o frontend Vite (`npm ci && npm run build`), depois copia `dist/` + `docker/web/nginx.conf` para runtime `nginx:1.29.1-alpine`. Só assets compilados vão para produção.
- `docker/web/nginx.conf`: serve `/marketplace` e `/internal` (SPA fallback via `try_files` para `marketplace.html`/`internal.html`), proxy reverso de `/api/v1/` para `http://farmaura_api:8080/api/v1/`, `/healthz` para healthcheck do container.
- `farmaura-api/docker-compose.yml` (projeto `backend`): rede privada `farmaura_private` com 4 serviços — `farmaura` (web/nginx, porta 3000), `farmaura-api` (porta 8080, healthcheck em `/api/v1/health`), `farmaura-postgres` (Postgres 17.10), `farmaura-valkey` (Valkey `9.1-trixie`, migrado de Redis 8.2.6 em 2026-07-20).
- `farmaura-api/docker-compose.gateway.yml`: overlay que conecta só `farmaura-api` à rede externa `lumos_gateway` (ver [[Lumos_Gateway]]).
- `farmaura-api/Dockerfile`: Python 3.13.13-slim-bookworm, dependências via `uv sync --no-dev`, entrypoint customizado `docker/entrypoint.sh`.

## Dependências

- Postgres e Valkey ficam apenas na rede privada `farmaura_private`, nunca na rede compartilhada do gateway — consistente com a regra de isolamento de rede do `claude.md`.

## Ver também

- [[PostgreSQL_RLS]] e [[Valkey]] — serviços orquestrados por este compose.
- [[resetar-e-re-semear-dados-locais]] — POP que depende deste compose para reset de dados locais.

## Atualizações

- 2026-07-20: serviço `farmaura-redis` renomeado para `farmaura-valkey`, imagem `redis:8.2.6-bookworm` → `valkey/valkey:9.1-trixie` — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].
- 2026-07-19: nota criada.
