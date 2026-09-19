---
cssclasses: ia-nota
---

# Aplicar migration `20260919_01` (pick_locations em order_items) em produção

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-19

## Descrição

`farmaura-api/alembic/versions/20260919_01_order_item_pick_locations.py` adiciona
`order_items.pick_locations` (JSON, default `[]`) — necessária para a Separação de
Pedidos Online mostrar só locais com estoque real do item e permitir dividir a
conferência entre dois locais diferentes com quantidade cada (ver
[[../00_Decisoes/2026-09-19-separacao-filtra-por-estoque-real-e-permite-split-entre-locais|ADR]]).

Aplicada e confirmada em dev local (`alembic stamp 20260918_02` + `alembic upgrade head` —
mesmo contorno de sempre por causa de
[[alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]], que
reincidiu de novo nesta leva; causa raiz agora identificada, ver a atualização registrada lá).
Coluna confirmada via `\d order_items` no Postgres local.

**Não aplicada em produção** — até isso acontecer, o endpoint
`POST /orders/{order_id}/items/{item_id}/location` em produção rejeita o novo formato de payload
(`{"locations": [...]}`) porque o schema `OrderItemLocationUpdateRequest` mudou de um
`location_code` único para uma lista — ou seja, **este deploy quebra a atualização de local de
separação em produção até a migration ser aplicada**, não é só uma feature nova ficando invisível.
Não fazer deploy do backend novo em produção antes de aplicar esta migration.

Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

## Contexto

Não aplicada de imediato porque aplicar migration em produção exige confirmação explícita do
usuário — gerada e testada localmente, sem nenhuma ação contra o banco real durante o
desenvolvimento.

## Ver também

- [[../00_Decisoes/2026-09-19-separacao-filtra-por-estoque-real-e-permite-split-entre-locais|Separação filtra por estoque real e permite split entre locais]]
