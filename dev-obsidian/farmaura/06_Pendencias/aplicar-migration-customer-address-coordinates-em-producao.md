---
cssclasses: ia-nota
---

# Aplicar migration `20260920_02` (latitude/longitude em customer_addresses) em produção

**Status:** Aberto
**Prioridade:** Alta — quebra fluxo existente, não só uma feature nova ficando invisível
**Registrado em:** 2026-09-20

## Descrição

`farmaura-api/alembic/versions/20260920_02_customer_address_coordinates.py` adiciona
`customer_addresses.latitude`/`longitude` (`Numeric(10,7)`, nullable) — guarda a coordenada que o
cliente confirmou no novo picker de mapa do marketplace, além do endereço digitado (ver
[[../00_Decisoes/2026-09-20-endereco-marketplace-ganha-picker-de-mapa-com-coordenada-real|ADR]]).

Aplicada e confirmada em dev local via reset completo do volume (`docker compose down -v && up`,
não via `alembic upgrade head` — mesmo contorno já documentado em
[[alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]]). Colunas
confirmadas via `\d customer_addresses` no Postgres local.

**Não aplicada em produção — isso quebra `POST`/`PUT /customers/me/addresses` inteiros, não só a
feature nova.** `CustomerService.create_address`/`update_address` (código já alterado nesta mesma
leva) sempre atribuem `address.latitude`/`address.longitude` no objeto ORM antes de persistir,
mesmo quando o payload não manda coordenada nenhuma (o valor vira `None`, que é válido — a coluna
é nullable). Mas se a coluna em si não existe ainda na tabela real, o INSERT/UPDATE gerado pelo
SQLAlchemy referencia uma coluna inexistente e falha — **qualquer cliente tentando cadastrar ou
editar um endereço no marketplace em produção pararia de conseguir fazer isso**, mesmo sem nunca
ter usado o mapa. Não fazer deploy do backend novo em produção antes de aplicar esta migration.

## Dependências

Nenhuma migration anterior pendente conhecida além desta — `20260920_01` (tema do console interno)
já tem sua própria pendência registrada em
[[aplicar-migration-user-ui-theme-em-producao|aplicar-migration-user-ui-theme-em-producao]] e deve
ser aplicada antes desta, na ordem da cadeia (`20260919_01` → `20260920_01` → `20260920_02`).

## Como aplicar

Passo a passo já documentado em
[[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] —
`alembic upgrade head` no servidor, mediante pedido explícito do usuário (nunca por iniciativa
própria da IA, ver `dev-obsidian/CLAUDE.md` → "Regras de deploy").
