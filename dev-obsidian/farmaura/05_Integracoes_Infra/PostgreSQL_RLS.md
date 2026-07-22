# PostgreSQL + Row-Level Security

**Tipo:** Banco de dados

## Propósito

Fonte de verdade de todo o domínio de negócio Farmaura, com isolamento multi-tenant reforçado no próprio banco (defesa em profundidade além da aplicação).

## Contrato

- PostgreSQL 17.10 (`docker-compose.yml`), acessado via SQLAlchemy async (`app/core/database.py`, `SessionFactory`).
- 43 arquivos de model em `app/models/` (~2.938 linhas).
- **RLS**: `app/core/row_level_security.py` aplica, de forma idempotente a cada start (sem Alembic, conforme a Política de Ambiente de Desenvolvimento do `claude.md`), `ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY` em ~25+ tabelas (users, stores, customers, orders, fiscal_documents, file_assets, prescriptions, chat_threads, products, inventory_items, marketplace_listings, pdv_orders, pdv_sales, cart_items e tabelas filhas).
- Políticas usam GUCs de sessão setados por `app/core/tenant_context.py`: `app.current_tenant_id`, `app.current_user_role`, `app.current_user_id`, `app.current_store_id`, mais exceções estreitas para login/primeiro acesso (`current_login_email`, `current_first_access_email`), webhook de pagamento (`current_webhook_payment_id`, escopado a um único pedido) e job de sistema (`is_system_job()`, usado pelo `fiscal_scheduler.py`).
- Sem migrations Alembic durante esta fase de desenvolvimento — mudança de schema é direto no ORM + bootstrap.

## Dependências

- Sem migrations formais, a RLS e o schema dependem do script de bootstrap (`scripts/bootstrap_database.py`) rodar de forma consistente em todo ambiente — risco a reavaliar quando o projeto for para produção (ver Política de Ambiente de Desenvolvimento no `claude.md`).

## Ver também

- [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`) — receita genérica extraída desta implementação e da do `lumos-api`.
- [[Banco_Dados]] — implementação independente do mesmo padrão no domínio LumosMed.
- [[resetar-e-re-semear-dados-locais]] — POP que reaplica RLS a cada bootstrap.
- [[excecao-fiscal-scheduler-sessao-propria]] — exceção nomeada de contexto cross-tenant (job de sistema) sobre esta RLS.

## Atualizações

- 2026-07-19: nota criada.
