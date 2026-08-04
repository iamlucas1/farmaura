# 2026-08-03 — "Ofertas do dia": curadoria manual no console + motor de sugestões (mais vendidos, margem, promoção, desconto, cupom)

## Contexto

A seção "Produtos com até 95% de desconto" na home do marketplace era um filtro puramente
client-side (`products.filter(p => p.discount > 0).slice(0, 10)`) — sem curadoria, sem
persistência. O usuário pediu uma página nova no console interno para escolher manualmente os
produtos dessa seção (renomeada "Ofertas do dia"), com a lista permanecendo **exatamente como
configurada até ele mesmo trocar** — e que o console sugerisse candidatos reais: mais vendidos,
melhores margens, produtos com promoção ativa, desconto ativo e cupom ativo. Para o visual, foram
apresentadas 4 opções de layout (protótipo HTML com dados reais da seção atual); escolhida a
**Direção D** — faixa vinho com contador regressivo até a meia-noite + grade compacta de 5 cards com
badge âmbar.

## Descoberta de escopo (antes de implementar)

Nenhuma das 5 fontes de sugestão existia pronta:

- **Mais vendidos** e **melhores margens** tinham os dados brutos (`InventoryItem.sale_price`/
  `.acquisition_cost`, `PurchaseAnalyticsRepository.monthly_sales_by_product` já usado pelo painel
  ABC/XYZ) mas nenhum ranking pronto para consumo do admin.
- **Promoção ativa**, **desconto ativo** e **cupom ativo** só verificavam "esse produto específico
  bate com essa campanha" na hora da compra (`pricing_promotion_service._matches_scope`,
  `coupon_service.resolve_coupon`) — nunca em lista ("quais produtos essa campanha atinge").

Confirmado nas outras funcionalidades de "ponta a ponta configurável no console" (`home_banner`,
`home_brands`) que a resolução de referência para dado real pode ser **inteiramente client-side**: o
backend só precisa guardar uma lista ordenada de refs, e o marketplace já carrega o catálogo
completo no cliente. Usada a mesma convenção de ref já usada por favoritos/assinaturas
(`"inv-<InventoryItem.id>"`, `PortalService._saved_product_ref`).

## Decisão

### Setting persistido (mesmo padrão de `home_brands`)

- Novo `PortalDealOfTheDayResponse` (`mode: off|on`, `product_refs: list[str]`, máx 30) em
  `schemas/portal.py`, inserido nas 3 respostas de bootstrap. `SETTING_KEY_DEAL_OF_THE_DAY =
  'deal_of_the_day'` em `portal_service.py`, com `_resolve_deal_of_the_day`/`update_deal_of_the_day`
  — cópia literal do par de `home_brands`, **sem** nenhuma lógica de resolução de produto no
  backend (só guarda/devolve a lista de refs).
- `PUT /portal/internal/deal-of-the-day` — **ADMIN only** (mais restrito que `home_banner`/
  `home_brands`, escolha do usuário — é uma decisão de merchandising com peso de negócio).

### Motor de sugestões (`app/services/deal_suggestion_service.py`, novo)

5 endpoints `GET /portal/internal/deal-suggestions/<fonte>`, todos ADMIN only, cada um devolvendo
`{ ref: "inv-<id>", name, brand, price, stock, metric_label }`:

- **`bestsellers`** — soma `monthly_sales_by_product` (online+PDV) por `InventoryProduct.id` no
  período, resolvido de volta pra um `InventoryItem` concreto via novo
  `PurchaseAnalyticsRepository.representative_inventory_item_by_product`.
- **`margins`** — cálculo novo (não existia): `(sale_price - acquisition_cost) / sale_price` sobre
  todo item ativo/visível no marketplace, ordenado desc.
- **`promotions`**/**`discounts`** — mesma tabela `PricingPromotion` (`kind="campaign"` vs
  `"product_discount"`), casando contra o inventário via novo
  `pricing_promotion_service.list_matching_inventory_items(promotion, inventory_items, now=...)` —
  reverso de `find_best_promotion`, reaproveitando os mesmos predicados (`_matches_schedule`/
  `_matches_scope`) já usados pra precificar, nunca uma segunda noção de "o que essa promoção
  cobre".
- **`coupons`** — mesma ideia sobre `CouponCampaign`, novo
  `coupon_service.list_matching_inventory_items(campaign, inventory_items, now=...)`, reverso do
  matching já usado em `resolve_coupon`.

### Frontend marketplace

- `normalizeDealOfTheDay` em `marketplace-app.jsx` (mesmo formato de `normalizeHomeBrands`).
  `home-screen.jsx::resolveDealOfTheDayProducts` casa cada ref contra `product.id` **ou**
  `product.aliases.includes(ref)` no catálogo já carregado — sem endpoint novo de resolução.
  `DealOfTheDayStrip` (faixa vinho + `DealCountdown` até meia-noite local + grade reaproveitando o
  `ProductCard` real, badge reskinado pra `--fa-warn` via CSS escopado) substitui a antiga seção
  automática; some da home quando `mode !== 'on'` ou lista vazia (mesmo contrato null-safe de
  `HomeBanner`/`BrandCircles`) — **muda o comportamento**: a seção não aparece mais até o admin
  curar algo.

### Console interno

Nova tela `deal-of-the-day-screen.jsx` ("Marketplace → Ofertas do dia", só ADMIN): 6 abas (5 fontes
de sugestão + busca manual sobre `ctx.inventory`, reaproveitando a mecânica de filtro de
`CouponTargetPicker`), painel de selecionados com setas ▲▼/Remover (mesmo padrão de
`home-brands-screen.jsx`), "Sem ofertas do dia" preserva a lista (mesmo contrato). Adicionar/mover/
remover é só estado local — precisa clicar "Salvar" pra persistir (diferente do upload de imagem
em `home_brands`, que salva na hora; aqui não há operação cara o suficiente pra justificar
autosave por clique).

## Bug real encontrado e corrigido durante o teste

Ao testar a home pública (visitante anônimo), a faixa "Ofertas do dia" não aparecia mesmo com
`mode="on"` e refs válidas persistidas. Causa: `PublicCatalogItem` (schema usado por
`GET /catalog/public`, servido a visitantes anônimos) **nunca teve os campos `aliases`/
`inventory_ids`** — só o `CatalogItem` autenticado (`GET /catalog`) os expõe
(`catalog_service.py:118-119`). `home_brands` nunca expôs esse gap porque casa por `brand` (string
simples, presente nos dois schemas); "ofertas do dia" foi a primeira feature a depender de
`aliases` também no caminho público. Corrigido adicionando os dois campos a `PublicCatalogItem`
(`schemas/catalog.py`) e populando-os em `CatalogService.list_public_products`
(`catalog_service.py`) — mesmos dados já calculados em `build_marketplace_catalog_groups`, só não
propagados pra esse schema específico. Sem risco de exposição: são apenas ids internos opacos
(`inv-<uuid>`), mesmo nível de sensibilidade do `id` (`mkt-<slug>`) já público.

## Consequências

- Nova migration: nenhuma — `deal_of_the_day` reaproveita `portal_settings`; `PublicCatalogItem`
  ganhou 2 campos de schema, sem mudança de banco.
- Verificado de ponta a ponta no stack de dev: sugestões testadas contra dados reais do tenant (ver
  números reais em [[../02_Documentacao/Modulo_Portal|Módulo Portal]]), curadoria/reordenação/salvar
  testados via Playwright, home do marketplace (visitante anônimo) confirmada mostrando a faixa com
  a ordem escolhida e contador regressivo funcionando. Seleção de teste revertida para
  `mode="off"`/lista vazia ao final — nenhuma oferta de teste ficou configurada.
- Pendência conhecida, não tratada agora: sugestões de "melhores margens"/"desconto ativo"/"cupom
  ativo" listam por `InventoryItem` (por loja), não deduplicado por produto — um item com estoque em
  duas lojas aparece duas vezes nas sugestões (mesmo comportamento já aceito em
  `CouponTargetPicker`/`buildCouponProductOptions`, não uma regressão nova).

## Ver também

- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — settings documentados.
- [[../02_Documentacao/Modulo_Catalogo|Módulo Catálogo]] — paridade de campos entre `CatalogItem`/
  `PublicCatalogItem`.
- [[2026-08-02-marcas-em-destaque-datalist-carrossel-e-layout-ponta-a-ponta|ADR de marcas em
  destaque]] — mesmo padrão de setting + resolução client-side, precedente direto desta feature.
