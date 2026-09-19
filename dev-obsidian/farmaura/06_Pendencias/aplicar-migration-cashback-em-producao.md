---
cssclasses: ia-nota
---

# Aplicar migrations `20260903_01`→`20260905_02` (cashback, idade dos filhos, cupons de aniversário) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-04

## Descrição

Três migrations pendentes em sequência (rodar `alembic upgrade head` aplica todas de uma vez):

1. `farmaura-api/alembic/versions/20260903_01_marketplace_cashback.py` — `cashback_percent`
   em `inventory_products` + `tenant_id` (com backfill) em `customer_cashback_wallets` e
   `cashback_transaction_lines`.
2. `farmaura-api/alembic/versions/20260905_01_customer_children_ages.py` — `children_ages` (JSON)
   em `customers`, ver [[../00_Decisoes/2026-09-05-perfil-completo-e-idade-dos-filhos|ADR]].
3. `farmaura-api/alembic/versions/20260905_02_coupon_anniversary_personal.py` —
   `target_customer_id`/`anniversary_kind`/`anniversary_year` em `coupon_campaigns` + índice
   único, ver
   [[../00_Decisoes/2026-09-05-cupons-de-aniversario-nascimento-e-cliente|ADR]].

Todas foram geradas, testadas e **aplicadas em dev local**
(`alembic stamp <revisão confirmada>` + `alembic upgrade head`, mesmo contorno de sempre por causa
da pendência
[[alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]] — que
reincidiu durante esta leva, ver a atualização registrada lá). Confirmado localmente: schema com
as colunas novas, `pg_class.relrowsecurity`/`relforcerowsecurity` = `t`/`t` nas duas tabelas de
cashback após o restart do container (`bootstrap_database.py` reaplica `row_level_security.py`
idempotente a cada start).

**Nenhuma das três foi aplicada em produção** — até isso acontecer: o cashback do marketplace
continua efetivamente desligado lá (o backend depende dessas colunas; sem elas, qualquer checkout
que tente resgatar/ganhar cashback falharia); salvar "idade dos filhos" no perfil falharia com erro
de coluna inexistente; e resgatar um cupom de aniversário falharia do mesmo jeito.

Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

`alembic current` em produção deve mostrar `20260831_02` antes de rodar — produção segue com
`alembic_version` corretamente rastreado desde a adoção do Alembic, então nenhum `stamp` deveria
ser necessário ali (diferente do contorno usado em dev local).

## Contexto

Não aplicada de imediato porque aplicar migration em produção exige confirmação explícita do
usuário (ver a seção "Responsável" da POP linkada acima) — gerada e testada localmente, sem
nenhuma ação contra o banco real durante o desenvolvimento. Ver
[[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|ADR completo da feature]] para o resto do
trabalho (backend, admin, checkout) que depende desta migration.

## Ver também

- [[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|Cashback real no marketplace]]
- [[../00_Decisoes/2026-09-05-perfil-completo-e-idade-dos-filhos|Perfil completo + idade dos filhos]]
- [[../00_Decisoes/2026-09-05-cupons-de-aniversario-nascimento-e-cliente|Cupons de aniversário]]
- [[../04_Seguranca_Riscos/cashback-wallet-vazamento-cross-tenant-via-pdv|Achado crítico corrigido na mesma leva]] — a correção de RLS só é efetiva em produção depois desta migration.