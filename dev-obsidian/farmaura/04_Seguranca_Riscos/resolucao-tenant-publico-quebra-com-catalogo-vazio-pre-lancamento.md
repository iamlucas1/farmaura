# Resolução de tenant público falha com catálogo vazio (pré-lançamento) — mascarava mudanças de admin em `launch_mode`/`home_banner`/`home_brands`/etc.

**Tipo:** Vulnerabilidade funcional + Runbook de incidente
**Severidade:** Alta (funcional — configuração real do admin fica invisível para todo visitante anônimo, sem erro visível)
**Status:** Resolvido
**Data de identificação:** 2026-08-22

## Descrição

`app_private.resolve_public_marketplace_tenant_id()` (`app/core/row_level_security.py`) resolve o tenant para qualquer chamada **anônima** (`GET /catalog/public`, `GET /portal/marketplace/public-bootstrap`, `POST /auth/register`, `POST /portal/marketplace/first-access`) escolhendo o tenant do primeiro `inventory_item` `is_active=true AND sale_price > 0`, por `created_at ASC`.

Em produção, `farmaura-api/scripts/populate_demo_content.py`/inventário real ainda não foram populados (estado pré-lançamento genuíno — 0 linhas em `inventory_items` e em `stores`) — então a função sempre retornava `NULL`. Toda leitura pública que depende de `tenant_id` (`PortalService._resolve_launch_mode`, `_resolve_home_banner`, `_resolve_home_brands`, `_resolve_deal_of_the_day`, etc.) trata `tenant_id` vazio como "sem tenant conhecido" e cai no fallback hardcoded (`_default_launch_mode()`: `enabled=True`, `launch_at=2026-09-05T12:00:00Z`) — **mesmo depois de o admin salvar um valor real e correto** através do console interno.

Confirmado o mecanismo em produção nesta sessão: `portal_settings` tinha a linha correta (`tenant_id=4a399031-6934-5260-b65c-c2691de70982`, `launch_at=2026-09-19T12:00:00Z`, `updated_at` de hoje), mas `SELECT app_private.resolve_public_marketplace_tenant_id()` retornava vazio porque `inventory_items`/`stores` estavam com 0 linhas — o valor salvo nunca era alcançado pelo caminho público, só pelo autenticado (admin no console via `subject.tenant_id`, que não passa por essa função).

## Impacto

- Visitante anônimo (o único público real de um marketplace pré-lançamento) via a contagem regressiva de `launch_mode` sempre travada em 05/09, mesmo com o admin tendo alterado corretamente para 19/09 pelo console — sem nenhum erro visível, silencioso.
- Mesmo mecanismo afeta **qualquer outra configuração pública** resolvida por `_resolve_public_tenant_id()`: `home_banner`, `home_brands`, `deal_of_the_day`, `health_services`, `coupons`, `marketplace_meta` — todas silenciosamente voltam ao default/vazio para visitante anônimo enquanto o catálogo estiver vazio, apesar de o admin ver e conseguir salvar valores reais no console (que lê pelo caminho autenticado, `subject.tenant_id`, imune a este bug).
- Efeito colateral pré-existente, não causado por este bug: `/catalog/public` de fato deveria estar vazio agora (não há produto real ainda) — isso é esperado e correto, não parte do problema.

## Mitigação / Tratamento

`app_private.resolve_public_marketplace_tenant_id()` (`farmaura-api/app/core/row_level_security.py`) passou a usar `COALESCE`: mantém a prioridade por `inventory_items` (comportamento inalterado assim que o catálogo real for populado), com fallback para o tenant do usuário mais antigo (`users`, `created_at ASC`) — tabela sempre populada desde o bootstrap inicial do tenant, independente do estado do catálogo/lojas.

Testado localmente: (1) comportamento normal inalterado (mesmo `tenant_id` resolvido com inventário presente); (2) cenário pré-lançamento simulado em transação revertida (`UPDATE inventory_items SET is_active=false` + `ROLLBACK`, sem alterar dado real) confirmando que o fallback resolve o mesmo tenant real via `users`; (3) rebuild completo do container local (`docker compose up -d --build farmaura-api`) confirmando que `bootstrap_database.py`/`apply_row_level_security` reaplica a função (`CREATE OR REPLACE`, idempotente) no boot, sem exigir migration Alembic — é definição de função, não schema de tabela.

Correção aplicada apenas em ambiente local nesta sessão — aplicar em `lumos-dev` e depois em produção via deploy normal (rebuild + restart de `farmaura-api`, que reaplica a função no próximo boot) é o próximo passo, não uma migration.

## Referências

Decisão registrada: [[../00_Decisoes/2026-08-22-fallback-resolucao-tenant-publico-sem-inventario|2026-08-22-fallback-resolucao-tenant-publico-sem-inventario]]. Ver também a revisão original de acesso anônimo que introduziu esta função: [[2026-07-20-revisao-acesso-anonimo|2026-07-20-revisao-acesso-anonimo]].

## Atualizações

- 2026-08-22: nota criada — achado e correção na mesma sessão.
