---
cssclasses: ia-nota
---

# Aplicar migration `20260921_01` (vínculo Google) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-21

## Descrição

`farmaura-api/alembic/versions/20260921_01_users_google_link.py`: adiciona `users.google_sub` (nullable, único, indexado) e `users.has_password` (`NOT NULL`, backfill `true` para todas as contas existentes). O modelo `User` passa a selecionar as duas colunas em toda leitura — **sem a migration, todo login (inclusive por e-mail/senha) falha**, não só o login via Google.

Testada em Postgres local (Docker): `alembic stamp 20260920_05` (head anterior) + `alembic upgrade head` — o Postgres de dev local reincide no gap conhecido de nunca ter `alembic_version` estampada num volume criado via `create_all` (ver [[alembic-version-ausente-no-postgres-local|pendência relacionada]]), então o `stamp` no revision anterior foi necessário antes do `upgrade`. Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] antes do deploy real.

## Contexto

Registrada ao implementar login/cadastro/vínculo via Google no marketplace. Ver o [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]]. Aplicar em produção exige confirmação explícita do usuário.
