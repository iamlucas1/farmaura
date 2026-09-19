---
cssclasses: ia-nota
---

# 2026-08-22 — Fallback para `users` na resolução de tenant público quando não há inventário (estado pré-lançamento)

## Contexto

Usuário relatou: alterou a data do modo lançamento em produção (console interno) de 05/09 para 19/09, mas o marketplace público continuou mostrando a contagem regressiva para 05/09. Pedido: investigar diretamente no servidor de produção, corrigir localmente, subir para o git, depois `lumos-dev`, depois produção.

Investigação em produção (via `ssh lumos-prd`, leitura apenas): confirmado que `portal_settings` tinha a linha correta e recém-atualizada (`launch_at=2026-09-19T12:00:00Z`, `updated_at` de hoje) sob o tenant real (`4a399031-6934-5260-b65c-c2691de70982`). O bootstrap público (`GET /portal/marketplace/public-bootstrap`), porém, retornava o fallback hardcoded (`2026-09-05T12:00:00Z`). Rastreado até `app_private.resolve_public_marketplace_tenant_id()` (`app/core/row_level_security.py`) retornando `NULL` — a função resolve o tenant público pelo primeiro `inventory_item` ativo/precificado, e produção está genuinamente em estado pré-lançamento: 0 linhas em `inventory_items` e em `stores`. Ver achado completo: [[../04_Seguranca_Riscos/resolucao-tenant-publico-quebra-com-catalogo-vazio-pre-lancamento|resolucao-tenant-publico-quebra-com-catalogo-vazio-pre-lancamento]].

## Alternativas consideradas

- **Criar uma tabela `tenants` própria como registro canônico.** Rejeitada por escopo — exigiria migration Alembic e uma mudança de modelo de dados maior só para resolver um caso de fallback; o projeto já assume "single-tenant" e não tem essa tabela hoje (confirmado: `relation "tenants" does not exist`).
- **Popular inventário/lojas de demonstração em produção só para destravar a resolução de tenant.** Rejeitada — usaria dado falso em produção real só para contornar um bug de resolução, e ainda exigiria decidir manualmente quando "desligar" esse dado de novo no lançamento real; resolve o sintoma, não a causa.
- **Fallback para a tabela `users`.** Adotada — `users` é populada desde o bootstrap inicial do tenant (conta de admin/equipe sempre existe antes de qualquer produto), independente do estado do catálogo. Mantém a função de resolução como fonte única (usada por `catalog_service.py`, `order_service.py` e `portal_service.py`), sem introduzir tabela nova nem exigir dado fictício em produção.

## Decisão

`app_private.resolve_public_marketplace_tenant_id()` passou de uma única query para `COALESCE` de duas: a query original por `inventory_items` (prioridade — comportamento inalterado assim que o catálogo real for populado) e, se vazia, uma segunda por `tenant_id` do usuário mais antigo (`users`, `created_at ASC`). Reaplicada via `CREATE OR REPLACE FUNCTION` — já fazia parte de `RLS_STATEMENTS`, reexecutada idempotentemente por `bootstrap_database.py` a cada boot do container (`docker/entrypoint.sh`), sem exigir migration Alembic (é definição de função, não schema de tabela).

## Consequências

- Sem migration, sem mudança de schema — só redeploy (rebuild + restart de `farmaura-api`) para produção e `lumos-dev` aplicar o fix.
- Corrige não só `launch_mode`, mas qualquer outra configuração pública resolvida pelo mesmo caminho (`home_banner`, `home_brands`, `deal_of_the_day`, `health_services`, `coupons`) durante o período em que o catálogo real ainda não está populado.
- Assim que o inventário real for populado antes do lançamento em 19/09, a função volta a resolver pelo caminho original (`inventory_items`) normalmente — o fallback por `users` só importa nesta janela pré-lançamento.
- Verificado localmente: comportamento normal inalterado (mesmo tenant resolvido com inventário presente) e fallback confirmado correto num cenário pré-lançamento simulado em transação revertida (sem alterar dado real).

## Ver também

- [[../04_Seguranca_Riscos/resolucao-tenant-publico-quebra-com-catalogo-vazio-pre-lancamento|Achado completo]]
- [[../04_Seguranca_Riscos/2026-07-20-revisao-acesso-anonimo|ADR/achado original que introduziu esta função]]