---
cssclasses: ia-nota
---

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
- Produção está em `20260731_01 (head)` desde 2026-08-02 (seis migrations de `20260729_01` a `20260731_01`, módulos de cupom/promoção/serviços de saúde) — sem migration pendente no momento.

## Ver também

- [[padrao-rls-multitenant-via-session-guc]] (`_Compartilhado/Padroes_Politicas/`) — receita genérica extraída desta implementação e da do `lumos-api`.
- [[Banco_Dados]] — implementação independente do mesmo padrão no domínio LumosMed.
- [[resetar-e-re-semear-dados-locais]] — POP que reaplica RLS a cada bootstrap.
- [[excecao-fiscal-scheduler-sessao-propria]] — exceção nomeada de contexto cross-tenant (job de sistema) sobre esta RLS.
- [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] — POP de deploy de migration.
- [[../04_Seguranca_Riscos/rls-bloqueava-2fa-login-e-primeiro-acesso|rls-bloqueava-2fa-login-e-primeiro-acesso]] — achado de 2026-09-13: dois fluxos de auth (`verify_two_factor`, `complete_password_reset`) buscavam o usuário por id *antes* de aplicar `apply_authenticated_context`, então a RLS de `users` sempre devolvia zero linhas — lição: o contexto tem que ser aplicado antes da query que ele protege, nunca depois.
- [[../00_Decisoes/2026-09-18-bloqueio-de-quantidade-por-estoque-com-reserva-cruzada|2026-09-18-bloqueio-de-quantidade-por-estoque-com-reserva-cruzada]] — achado de 2026-09-18: `can_access_store_row()` bloqueava silenciosamente a reserva de produto entre lojas para farmacêutico/gerente (só `admin` escapava, o que escondeu o bug em testes anteriores feitos com conta admin) — corrigido com policies adicionais estreitas por comando, não afrouxando a policy original.
- [[../00_Decisoes/2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita|2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita]] — achado no mesmo dia, ao testar a "Tela do caixa" pela primeira vez com uma conta `cashier` de verdade: `inventory_items`/`inventory_stock_lots`/`inventory_locations`/`inventory_products`/`prescriptions`/`prescription_items` nunca incluíam `cashier` na lista de papéis, nem para a própria loja — quebrando busca de produto, dropdown de local e status de receita inteiros para esse papel. Seis policies aditivas `*_cashier_read_policy` novas.

## Atualizações

- 2026-09-18: seis novas policies aditivas `FOR SELECT` só para o papel `cashier`, em `inventory_items`, `inventory_stock_lots`, `inventory_locations`, `inventory_products`, `prescriptions` e `prescription_items` — nenhuma das seis jamais incluía `cashier` na lista de papéis (só `admin`/`manager`/`pharmacist`, ou `customer` em alguns casos), então qualquer leitura de estoque/local/receita feita por uma conta `cashier` real sempre voltava vazia, mesmo para a própria loja. Como as duas tabelas de receita usam uma função compartilhada (`can_access_prescription_row`) entre `USING` e `WITH CHECK`, editá-la teria dado a `cashier` permissão de escrita também — por isso as duas ali são policies novas e separadas, não uma ampliação da função. Ver [[../00_Decisoes/2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita|ADR]].
- 2026-09-18: introduzido o primeiro uso de policies **específicas por comando** (`FOR SELECT` / `FOR INSERT` / `FOR UPDATE`) neste arquivo — até então toda policy daqui cobria todos os comandos de uma vez (`USING` + `WITH CHECK` idênticos, sem `FOR`). Motivo: `can_access_store_row()` bloqueava farmacêutico/gerente de ver/reservar estoque de outra loja mesmo em fluxos que já foram desenhados de propósito para isso (reserva entre lojas, `PdvService.create_reservation`/`_prepare_lines`). Como policies permissivas do mesmo comando se combinam com OR, a correção foi **aditiva**: uma policy nova e mais estreita ao lado da original (nunca editando/afrouxando a original), concedendo só o comando específico que faltava (`SELECT` para busca cross-loja, `UPDATE` para o `SELECT...FOR UPDATE` que trava a linha antes de decrementar, `INSERT`+`SELECT` companion para o pedido de reserva em si — toda escrita do ORM é seguida de `session.refresh()`, que é um SELECT e também precisa de policy). Padrão a reaproveitar: quando uma tabela precisa de acesso mais amplo só para UM comando específico, preferir uma policy nova `FOR <comando>` a reescrever a policy `ALL` existente. Ver [[../00_Decisoes/2026-09-18-bloqueio-de-quantidade-por-estoque-com-reserva-cruzada|ADR]] para a lista completa das 10 policies novas (7 tabelas).
- 2026-09-13: achado (e corrigido localmente) um caso de contexto de RLS aplicado tarde demais — `apply_authenticated_context` era chamado só depois da consulta que ele deveria proteger, em dois fluxos de autenticação (2FA e conclusão de primeiro acesso). Ver [[../04_Seguranca_Riscos/rls-bloqueava-2fa-login-e-primeiro-acesso|risco]] e [[../00_Decisoes/2026-09-13-rls-bloqueava-2fa-e-conclusao-do-primeiro-acesso|ADR]].
- 2026-08-02: seis migrations aplicadas em produção (`20260729_01_coupon_checkout_integrity` até
  `20260731_01_service_scope_and_booking_discount`) no mesmo deploy que levou cupom/promoção
  server-side, banner/marcas configuráveis e o modo de lançamento para produção — ver
  [[../00_Decisoes/2026-08-01-modo-de-lancamento-contador-sem-bypass|ADR do modo de lançamento]].
  `alembic current` confirmou `20260731_01 (head)` antes e depois do deploy dos containers.
- 2026-07-23: histórico Alembic recomeçado do zero (baseline + primeira migration real, módulo Orçamentos); `env.py` e `script.py.mako` corrigidos/criados; migration verificada em Postgres isolado mas ainda não aplicada em produção. Ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]].
- 2026-07-23: Farmaura foi para produção — mudanças de schema passam a exigir migrations Alembic; RLS continua idempotente por start, agora independente do bootstrap de schema. Ver `claude.md`/`agent.md`.
- 2026-07-19: nota criada.