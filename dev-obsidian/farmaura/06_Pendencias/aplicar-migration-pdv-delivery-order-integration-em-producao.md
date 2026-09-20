---
cssclasses: ia-nota
---

# Aplicar migration `20260920_03` (PDV entrega → Order real) em produção

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

`farmaura-api/alembic/versions/20260920_03_pdv_delivery_order_integration.py` é a peça de
schema de uma mudança maior: uma venda de PDV ("Balcão") com "Entregar em casa" agora também
cria um `Order`/`OrderItem`/`OrderFulfillment` de verdade (ver
`PdvService._create_linked_delivery_order` em `farmaura-api/app/services/pdv_service.py`), para
entrar no mesmo fluxo `new → separating → ready → dispatched` de um pedido online — aparece em
"Pedidos online", vira elegível para roteirização/despacho. Antes disso, a entrega de PDV virava
só um `PdvSale`, terminal e invisível para o board e para rotas.

A migration adiciona:

- `orders.originating_pdv_sale_id` — rastreio de volta à venda de PDV que criou o pedido.
- `order_fulfillments.requested_delivery_time_label` e `pdv_orders.requested_delivery_time_label`
  — horário desejado de entrega, texto livre, novo tanto no PDV quanto no checkout do marketplace.

Aplicada e confirmada em dev local via reset completo (`docker compose down -v && up --build`,
não `alembic upgrade head` — motivo de sempre, ver
[[alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]]). Colunas
confirmadas via `\d orders` / `\d order_fulfillments` / `\d pdv_orders`. Fluxo completo testado
via curl de ponta a ponta: venda de PDV com entrega → `Order` criado com `status=new` →
avançado até `dispatched` → `DeliveryRouteStop` anexado automaticamente na rota mais próxima
(mesma lógica de proximidade já existente para pedidos online).

**Não aplicada em produção** — sem ela, o deploy do backend novo quebra a criação de venda de
PDV com entrega (o `INSERT` em `orders`/`order_fulfillments` falha por coluna inexistente) e o
checkout do marketplace com `requested_delivery_time_label` no corpo também falha. Não fazer
deploy do backend novo em produção antes de aplicar esta migration.

## Mudança de RLS junto (não é a migration, mas anda junto)

Além da migration, `farmaura-api/app/core/row_level_security.py` teve duas funções alteradas —
`app_private.can_access_order_row` e `app_private.can_access_customer_row` passaram a incluir
`'cashier'` no conjunto de papéis liberados (antes só `admin`, `manager`, `pharmacist`). Sem
isso, a finalização de uma venda de PDV com entrega pelo caixa falha com
`InsufficientPrivilege: new row violates row-level security policy for table "orders"` — e, para
pagamento com cartão salvo do marketplace, o mesmo erro em `customers`/`customer_payment_methods`
(o caixa precisa ler o `Customer` e o cartão salvo dele para cobrar via Asaas). Descoberto e
corrigido durante o teste de ponta a ponta local desta feature.

Isso **não é um passo manual à parte** — `scripts/bootstrap_database.py` reaplica
`row_level_security.py` de forma idempotente a cada start do container (ver
[[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]],
passo 5), então o deploy normal do backend novo (que já reinicia o container) já cobre isso.
Mencionado aqui só porque é uma mudança de permissão de banco que vale revisar: caixa passou a
poder inserir em `orders`/`order_fulfillments`/`order_items` e ler `customers`/
`customer_payment_methods` — escopo ainda restrito a essas tabelas (a API HTTP continua exigindo
`admin`/`manager`/`pharmacist` para o board interno de pedidos; o caixa só ganhou o que a
finalização de venda de PDV com entrega precisa de verdade).

Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

## Contexto

Não aplicada de imediato porque aplicar migration em produção exige confirmação explícita do
usuário — gerada e testada localmente, sem nenhuma ação contra o banco real durante o
desenvolvimento.

## Ver também

- [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]
- [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]]
