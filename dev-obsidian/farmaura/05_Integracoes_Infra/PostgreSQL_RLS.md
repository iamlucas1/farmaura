# PostgreSQL + Row-Level Security

**Tipo:** Banco de dados

## Propósito

Fonte de verdade de todo o domínio de negócio Farmaura, com isolamento multi-tenant reforçado no próprio banco (defesa em profundidade além da aplicação).

## Contrato

- PostgreSQL 17.10 (`docker-compose.yml`), acessado via SQLAlchemy async (`app/core/database.py`, `SessionFactory`).
- 43 arquivos de model em `app/models/` (~2.938 linhas).
- **RLS**: `app/core/row_level_security.py` aplica, de forma idempotente a cada start, `ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY` em ~25+ tabelas (users, stores, customers, orders, fiscal_documents, file_assets, prescriptions, chat_threads, products, inventory_items, marketplace_listings, pdv_orders, pdv_sales, cart_items e tabelas filhas) — esse mecanismo é idempotente por natureza (`IF NOT EXISTS`) e continua rodando assim mesmo com o schema de tabelas agora versionado por Alembic.
- Políticas usam GUCs de sessão setados por `app/core/tenant_context.py`: `app.current_tenant_id`, `app.current_user_role`, `app.current_user_id`, `app.current_store_id`, mais exceções estreitas para login/primeiro acesso (`current_login_email`, `current_first_access_email`), webhook de pagamento (`current_webhook_payment_id`, escopado a um único pedido) e job de sistema (`is_system_job()`, usado pelo `fiscal_scheduler.py`).
- Farmaura está em produção desde 2026-07-22 — mudanças de schema (tabelas/colunas) agora passam por migrations Alembic (`alembic revision --autogenerate` + revisão + `alembic upgrade head`), não mais direto no ORM + bootstrap. Ver Política de Ambiente de Desenvolvimento no `claude.md`.
- Histórico Alembic recomeçado do zero em 2026-07-23 (`alembic/versions/`): `20260723_01_baseline_full_schema.py` (schema completo pré-existente, `down_revision=None`) + `20260723_02_add_purchase_quotes.py` (tabelas do módulo [[../02_Documentacao/Modulo_Orcamentos|Orçamentos]], primeira feature a nascer já via migration) — ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]]. `alembic/env.py` corrigido para usar a role elevada (`database_bootstrap_url`, não `database_url`) e `alembic/script.py.mako` criado (faltava, sem ele `alembic revision` não gerava arquivo).

## Dependências

- Schema de tabelas agora é versionado por Alembic; o script de bootstrap (`scripts/bootstrap_database.py`) segue responsável só pela aplicação idempotente da RLS e pelo seed inicial, não mais por reconciliar schema.
- Migration pendente de aplicação em produção: ver [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]].

## Ver também

- [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`) — receita genérica extraída desta implementação e da do `lumos-api`.
- [[Banco_Dados]] — implementação independente do mesmo padrão no domínio LumosMed.
- [[resetar-e-re-semear-dados-locais]] — POP que reaplica RLS a cada bootstrap.
- [[excecao-fiscal-scheduler-sessao-propria]] — exceção nomeada de contexto cross-tenant (job de sistema) sobre esta RLS.
- [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] — POP de deploy de migration.

## Atualizações

- 2026-07-23: histórico Alembic recomeçado do zero (baseline + primeira migration real, módulo Orçamentos); `env.py` e `script.py.mako` corrigidos/criados; migration verificada em Postgres isolado mas ainda não aplicada em produção. Ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]].
- 2026-07-23: Farmaura foi para produção — mudanças de schema passam a exigir migrations Alembic; RLS continua idempotente por start, agora independente do bootstrap de schema. Ver `claude.md`/`agent.md`.
- 2026-07-19: nota criada.
