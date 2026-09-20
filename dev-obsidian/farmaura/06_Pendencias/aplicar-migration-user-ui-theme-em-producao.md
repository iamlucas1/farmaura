---
cssclasses: ia-nota
---

# Aplicar migration `20260920_01` (users.ui_theme) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

`farmaura-api/alembic/versions/20260920_01_user_ui_theme.py` adiciona `users.ui_theme` (`VARCHAR(16) NOT NULL`, check `ck_users_users_ui_theme_allowed`, linhas existentes viram `auto`) — suporta a escolha de tema claro/escuro por usuário no console interno (ver [[../00_Decisoes/2026-09-20-tema-claro-escuro-preferencia-por-usuario|ADR]]).

**Não fazer deploy do backend novo em produção antes de aplicar esta migration.** O modelo `User` passou a selecionar `ui_theme` em toda consulta à tabela `users`; sem a coluna, o login (de funcionários **e** de clientes do marketplace) e `GET /auth/session` falham com erro de coluna inexistente — não é só a feature nova ficando invisível.

Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

Encadeia depois de `20260919_01` ([[aplicar-migration-order-item-pick-locations-em-producao|também pendente]]) — `upgrade head` aplica as duas, mais qualquer outra ainda não aplicada; confirmar com `alembic current` antes.

## Contexto

Gerada à mão seguindo o padrão das migrations anteriores (o ambiente onde foi escrita não tinha Docker/Postgres para `alembic revision --autogenerate`). **Testada em 2026-09-20 contra o Postgres de dev (Docker local):** `upgrade head` aplicou `20260920_01` → `_02` → `_03`, `downgrade 20260919_01` e novo `upgrade head` funcionaram, a constraint `ck_users_users_ui_theme_allowed` saiu com o nome e a definição esperados (`auto|light|dark`), `ui_theme` ficou `varchar(16) NOT NULL` sem default e os 12 usuários existentes receberam `auto`. Fluxo de API conferido com o banco real: `PATCH /auth/preferences` grava, `GET /auth/session` devolve o valor, uma sessão nova mantém o tema; valor inválido e campos extras → 422, sem token → 401, cliente do marketplace → 403. Falta só aplicar em produção, o que exige confirmação explícita do usuário.
