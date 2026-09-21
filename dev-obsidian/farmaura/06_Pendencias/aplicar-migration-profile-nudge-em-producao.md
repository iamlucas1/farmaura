---
cssclasses: ia-nota
---

# Aplicar migration `20260920_04` (customers.profile_nudge_dismissed_at) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

`farmaura-api/alembic/versions/20260920_04_customer_profile_nudge_dismissed_at.py` adiciona `customers.profile_nudge_dismissed_at` (`timestamptz`, nula, sem backfill) — guarda quando o cliente dispensou a modal "completar cadastro" (ver [[../00_Decisoes/2026-09-20-modal-completar-cadastro-estado-no-servidor|ADR]]).

**Não fazer deploy do backend novo em produção antes de aplicá-la.** O modelo `Customer` passou a selecionar a coluna em toda leitura de cliente; sem ela, `GET /customers/me` e todo fluxo que carrega o cliente falham com erro de coluna inexistente.

Encadeia depois de `20260919_01`, `20260920_01` ([[aplicar-migration-user-ui-theme-em-producao|tema por usuário]]), `20260920_02` e `20260920_03` — todas ainda pendentes em produção; `alembic upgrade head` aplica a cadeia inteira. Confirmar com `alembic current` antes. Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

## Contexto

Testada em 2026-09-20 no Postgres de dev (Docker local): `upgrade`, `downgrade -1` e `upgrade` de novo, coluna `timestamptz NULL`, e o fluxo completo de API com o banco real (ver o ADR). Aplicar em produção exige confirmação explícita do usuário; nada foi executado contra o banco de produção.
