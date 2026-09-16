# 2026-08-27 — Correção: ranking real de "Mais buscados/procurados" nunca batia com nenhum produto

## Contexto

Ao trazer a faixa "Mais procurados" da Home para usar o sinal real de demanda (`GET /catalog/most-searched`, ver [[2026-08-26-adocao-composicao-visual-padrao-farmacia-do-demo|adoção da composição visual]]) em vez da tag `mais-vendido` (nunca setada em lugar nenhum do backend — filtro morto), descoberto que o próprio endpoint `/catalog/most-searched` também nunca batia com nada: seu `product_id` é `InventoryItem.product_id` (a `InventoryProduct` compartilhada entre lotes/lojas do mesmo produto — `app_private.public_monthly_product_sales`), enquanto o catálogo público do marketplace (`PublicCatalogItem.id`/`.aliases`) só carregava `"inv-<InventoryItem.id>"` (o lote específico, não o produto). Nenhum dos dois é comparável a `product.id` (o slug `mkt-<nome>-<marca>`) nem entre si.

Isso significa que **"Mais buscados" (atalho da Home, tela `discover`) já estava quebrado desde que foi implementado** — silenciosamente: `ShopScreen` mode `mostsearched` tinha um fallback (ordena por reviews, que também são sempre 0 no seed atual) que mascarava o problema mostrando o catálogo inteiro em vez de dar erro ou ficar vazio.

## Alternativas consideradas

- **Mudar `/catalog/most-searched` para devolver o id público `mkt-<slug>` diretamente** — exigiria acesso à função de projeção (`marketplace_projection.py`) dentro do serviço de analytics, acoplando dois domínios que hoje são independentes (analytics de compra vs. projeção de catálogo). Mais invasivo que o necessário.
- **Resolver a ambiguidade no frontend comparando por nome+marca** — frágil (dois produtos podem colidir por nome) e não é o padrão já usado em `resolveDealOfTheDayProducts` pro mesmo tipo de problema.

## Decisão

Seguido o mesmo princípio de normalização de refs já usado pra "Ofertas do dia" (`aliases` com prefixo): `marketplace_projection.py` passou a incluir também `"prod-<InventoryItem.product_id>"` na lista `aliases` de cada produto agrupado (junto do já existente `"inv-<InventoryItem.id>"`). O frontend (`resolveMostSearchedProducts`, novo helper compartilhado em `core/marketplace-components.jsx`) monta `"prod-" + product_id` a partir da resposta de `/catalog/most-searched` e casa contra `product.aliases` — mesma técnica, terceiro prefixo. Usado agora em dois lugares: a faixa "Mais procurados" da Home e o modo `mostsearched` do `ShopScreen` (que ganhou a correção de graça, já que usava a mesma lógica quebrada).

Cache do catálogo (Valkey) precisou ser limpo manualmente (`FLUSHALL`) pra essa mudança de `aliases` aparecer sem esperar o TTL — relevante saber pra próxima vez que `marketplace_projection.py` mudar o formato de um campo cacheado.

## Consequências

- "Mais buscados" (atalho da Home) e "Mais procurados" (faixa nova) agora mostram produtos reais, ordenados por volume real de venda (online + PDV) — verificado localmente após popular pedidos/vendas via seed.
- `aliases` cresce em mais uma entrada por produto — sem impacto de schema (é uma lista JSON já existente), só mais um valor.
- Nenhuma migration necessária.
