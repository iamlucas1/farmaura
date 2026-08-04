# Módulo Catálogo (produtos, marcas, categorias, classes terapêuticas, precificação e promoções)

## O que é

Domínio dono da **identidade do produto** (o que existe, como se chama, a quem pertence) e do **motor de precificação/promoção** exibido no marketplace — distinto do domínio [[Modulo_Estoque|Estoque]], que cuida de quantidade/preço/local *por loja*. Cobre 4 taxonomias (Produtos, Marcas, Categorias, Classes Terapêuticas), o catálogo agrupado exposto ao cliente, o Precificador (margem por item) e as Promoções automáticas segmentadas por perfil de cliente. Cupons (`coupon_campaigns`) e o motor de cálculo em si vivem tecnicamente no domínio [[Modulo_CRM|CRM]]/Portal — aqui documentamos só como o catálogo consome promoções.

## Tabelas / Models

- **`inventory_products`** (`app/models/inventory_product.py`) — identidade global do produto, tenant-scoped (sem `store_id`): `sku`, `ean_code` (índice único parcial por tenant, ignora vazio), `name`, `brand_id`/`category_id`/`therapeutic_class_id` (FKs `SET NULL`), `is_controlled`/`controlled_category`, `is_generic`, `cnae_code`, `marketplace_image_url`/`marketplace_gallery_urls` (JSON), `is_active`/`is_discarded` (flags **independentes** — desativar nunca descarta, descartar nunca reativa). Properties proxy (`brand_name`, `category_name`, `medication_class_name`) fazem fallback para "Geral"/"Medicamentos" quando a classe/categoria vinculada está inativa, para não vazar filtro morto no marketplace. RLS dedicada (`inventory_products_access_policy`): tenant + role `customer` (leitura) ou `admin/manager/pharmacist` (escrita).
- **`brands`**, **`categories`**, **`therapeutic_classes`** (`app/models/{brand,category,therapeutic_class}.py`) — tenant-scoped, nome único por tenant, soft-delete via `is_active`/`is_discarded` (produtos referenciam a marca/categoria, nunca hard-delete). Classe terapêutica pertence a no máximo uma categoria (`category_id` opcional) — regra de domínio que mantém o filtro "Tipo" do marketplace coerente. **Nenhuma das três tem política RLS própria nem está na lista genérica** — isolamento depende só do filtro `tenant_id` em Python (gap de defesa em profundidade, junto com `brand_suppliers` e `product_reviews`).
- **`brand_suppliers`** — associação N:N marca↔fornecedor, hard-deletada no unlink (diferente de lotes de estoque, que preservam `supplier_id` como histórico).
- **`pricing_promotions`** (`app/models/pricing_promotion.py`) — promoções automáticas server-side, avaliadas por perfil (sem cupom): `kind` (`campaign`/`product_discount` — ver nota de 2026-07-30 abaixo), `discount_type` (percent/fixed) + `max_discount_value`, `scope_type` (all/categories/products/**services**, desde 2026-07-31) + `target_categories`/`target_products`/`target_services` (JSON) — `services` é isolado dos demais por design: nunca desconta produto, só serviços de saúde explicitamente marcados, ver [[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]] e [[Modulo_Portal|Módulo Portal]], janela `starts_at`/`ends_at` + janela diária + `days_of_week`, segmentação (`min/max_age`, `regions`, `device_types`, `marital_statuses`, `min/max_children`, `customer_segment`, `target_loyalty_tiers` — só aplicável a `kind="campaign"`, validado no backend), `priority` (desempate), `guest_visible` (visível a visitante deslogado — só permitido sem nenhum filtro de audiência) e `highlight_style` (`standard`/`superpromo`, controla o badge no marketplace). Muitos `CheckConstraint`s de coerência de range no banco. RLS via `tenant_isolation_policy` genérico. **É hoje o único mecanismo de desconto de produto no sistema** — `InventoryItem.promotional_discount_percent` foi removido (ver Atualizações).
- **`marketplace_listings`** (`app/models/marketplace_listing.py`) — **store-scoped**, 1:1 com `InventoryItem`: `published_price`, `acquisition_cost`, `reference_market_price`, `promotional_discount_percent` (campo morto — nunca lido em nenhuma lógica de preço, distinto do campo homônimo que existia em `InventoryItem` e foi removido em 2026-07-30; não confundir os dois, ver Atualizações), `commission_percent`/`payment_fee_percent`/`fixed_fee`/`target_margin_percent`, `is_published`/`is_visible`. RLS dedicada.
- **`product_reviews`**, **`saved_products`** (wishlist, RLS dedicada), **`product_availability_alerts`** ("avise-me quando chegar" — `product_ref` é o id agrupado do marketplace, não FK direta; `notified_at` nunca re-dispara uma vez setado; RLS dedicada).

## Endpoints

- `GET /catalog` — catálogo agrupado autenticado, com promoções personalizadas aplicadas (`require_marketplace_subject()`).
- `GET /catalog/public` — catálogo público sem auth, rate-limited, campos reduzidos (sem SKU/EAN/inventory_ids).
- `GET/POST/PUT/PATCH /products`, `/brands`, `/categories`, `/therapeutic-classes` — CRUD análogo nos 4 (roles `ADMIN, MANAGER, PHARMACIST`); `products` tem ainda `GET/POST /products/{id}/stores` (vínculo produto↔loja, cria `InventoryItem` zerado) e `PATCH /products/{id}/discard`.
- Promoções: **não em catalog.py** — `GET/POST/PUT/DELETE /portal/internal/promotions[/{id}]` + `POST /portal/internal/promotions/estimate-audience` (`api/v1/portal.py`), implementadas em `PortalService`. Leitura permite `CASHIER` além dos 3 roles; escrita não.

## Regras de negócio não óbvias

- **Merge por EAN nunca é automático na tela de admin**: criar produto manualmente rejeita SKU/EAN duplicado (409); só a importação de nota fiscal (`find_or_create_by_ean`) faz merge silencioso por EAN.
- **Vínculo produto↔loja sempre nasce zerado** — preço/quantidade reais são preenchidos depois em Estoque, na primeira contagem.
- **Imagem de marketplace proibida por categoria controlada** (RDC 96/2008 Anvisa): categorias `prescription`, `prescription_retention`, `special_control`, `black_stripe` não podem ter imagem/galeria customizada — validado no backend (422) e bloqueado preventivamente no frontend.
- **Classe terapêutica deve pertencer à mesma categoria do produto** — 422 se divergir; frontend já filtra as opções por categoria.
- **Agrupamento do catálogo ignora loja e soma estoque**: produtos de lojas diferentes com mesmo nome+marca (ou EAN) formam um único "produto de vitrine"; qual loja atende o pedido só é resolvido no checkout. Item oculto (`is_marketplace_visible=False`) continua no grupo mas contribui zero estoque — nunca some do catálogo, vira "indisponível". Se qualquer componente do grupo exige receita, o grupo inteiro herda o placeholder de imagem regulatório.
- **Todo desconto de produto vem de uma `PricingPromotion`** — não existe mais desconto manual independente por item (`InventoryItem.promotional_discount_percent` foi removido em 2026-07-30). Preço nunca é lido do request do cliente, sempre resolvido server-side a partir do perfil real + endereço + user-agent, via `apply_promotion_to_catalog_item` — mesma função chamada tanto na listagem quanto no checkout (`OrderService.create_marketplace_order`) — ver [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR: promoção reaplicada no checkout]], [[../00_Decisoes/2026-07-30-remover-desconto-manual-precificador-kind-promocao|ADR: kind campanha/desconto de produto]] e [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]].
- **`kind` segrega campanha de desconto direto de produto**: `campaign` pode segmentar por qualquer eixo de audiência; `product_discount` é sempre `scope_type="products"` com pelo menos um produto e **nunca pode ter filtro de audiência** (validado em `portal_service.py`, reaproveitando `promotion_has_audience_restrictions`) — por definição, se precisa de público, é campanha. `product_discount` também é **sempre `guest_visible=True`, forçado no backend** — sem filtro de audiência possível, não há razão pra esconder um preço cortado de visitante deslogado; o toggle "visível deslogado" da tela admin só é editável de verdade para `kind="campaign"`. A importação de nota fiscal (`inventory_invoice_service.py::_upsert_product_discount_promotion`) cria/atualiza automaticamente uma `product_discount` quando a linha confirmada tem desconto sugerido pelo OCR — ver ADR.
- **Motor de matching de promoção é "opt-in" por eixo**: lista/valor vazio em qualquer eixo de segmentação (idade, região, dispositivo, estado civil, filhos, segmento, selo de fidelidade) significa "não restringe". Desempate por `(priority, discount_percent)`. Desconto fixo é convertido para percentual e capado pelo próprio preço base (nunca gera preço negativo). `regions` casa contra UF, cidade, bairro **e** prefixo de CEP (5 dígitos) do endereço principal do cliente — mesmo campo livre, mais eixos aceitos. `device_types` distingue `ios`/`android`/`tablet`/`desktop`/`outro` via User-Agent (não existe app nativo — não há eixo real de "web vs aplicativo"). `target_loyalty_tiers` casa contra `Customer.loyalty_tier`, agora recalculado de verdade a cada pedido (Novo/Bronze/Prata/Ouro/Diamante/Platina por nº de pedidos concluídos — ver ADR).
- **`resolve_public_marketplace_tenant_id` roda via função SQL `SECURITY DEFINER`** — único ponto genuinamente cross-tenant do sistema (visitante anônimo sem tenant context), retorna só o `tenant_id`, nunca dados de produto.
- **Cache do catálogo nunca decide uma venda**: `core/cache.py` é read-through com invalidação por geração (INCR por tenant a cada escrita, coarse — não por chave), mas preço/estoque usados numa compra real sempre vêm de leitura live com row lock. Documentado também em [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão de cache]] e [[../05_Integracoes_Infra/Valkey|Valkey]].
- **Precificador (frontend) embute uma tabela do Simples Nacional Anexo I inteira no cliente** para calcular margem líquida (repasse − comissão − taxa de pagamento − tarifa fixa − custo − imposto efetivo, líquido de ICMS-ST se aplicável) — não há endpoint backend equivalente que recalcule/valide essa margem antes de persistir preço.
- **Duplicação de promoção é 100% client-side** — não existe endpoint dedicado; o frontend reenvia o mesmo `POST` com nome sufixado e `active:false`.

## Frontend

- **Interno**: `products-screen.jsx` (CRUD completo + galeria com bloqueio automático para categoria restrita + painel de lojas vinculadas), `brands-screen.jsx`, `categories-screen.jsx`, `therapeutic-classes-screen.jsx` (mesmo padrão CRUD + KPIs + descarte/recuperação). `pricing-screen.jsx` — Precificador: tabela com margem líquida ao vivo, `PriceDrawer` (por preço ou por margem-alvo), `BulkMarginModal` (reajuste em massa com preview e arredondamento ".90"), `PricingSettingsDrawer` (taxas globais da vitrine, regras de Pix/parcelamento, margem mínima para desconto no PDV) — desde 2026-07-30 **não gerencia mais desconto**, só preço/custo/margem; um atalho "Criar desconto" na linha da tabela abre o modal de Promoções pré-preenchido (`kind: 'product_discount'`, produto já selecionado). `promotions-screen.jsx` — administração de campanhas e descontos de produto (`kind`), com contador de alcance estimado ao vivo (debounce 400ms contra `estimate-audience`, só para `kind="campaign"`).
- **Marketplace**: `shop-screen.jsx` (listagem/busca/filtros/ordenação), `product-screen.jsx` (página de produto, dois layouts, breakdown de Pix/parcelamento, aviso de retenção de receita, "avise-me quando chegar"), `home-screen.jsx`.

## Decisões de arquitetura dignas de nota

- **RLS inconsistente dentro do próprio domínio**: `inventory_products` e `pricing_promotions` têm RLS real; `brands`, `categories`, `therapeutic_classes`, `brand_suppliers`, `coupon_campaigns`, `product_reviews` não têm nenhuma política — isolamento só por filtro de aplicação. Vale confirmar com o time se é intencional.
- **`pricing_promotion_service.py` é puramente funcional** (sem I/O de CRUD), reusado tanto para aplicar desconto real no catálogo quanto para estimar alcance de público no admin — decisão deliberada para que preview e enforcement nunca divirjam.
- **Separação Identidade (Catálogo) vs. Operação (Estoque)** é a espinha dorsal do domínio: `InventoryProduct` nunca carrega preço/quantidade; isso vive em `InventoryItem`/`MarketplaceListing`.

## Ver também

- [[Modulo_Estoque|Módulo Estoque]] — onde preço, quantidade e visibilidade por loja realmente vivem.
- [[Modulo_CRM|Módulo CRM]] — cupons (`coupon_campaigns`) e o restante de Portal/config.
- [[Visao_Geral|Visão Geral]] — arquitetura geral do backend.
- [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|Migração Redis→Valkey e cache de catálogo]].

## Atualizações

- 2026-08-03: `PublicCatalogItem` (schema de `GET /catalog/public`, servido a visitante anônimo)
  ganhou `aliases`/`inventory_ids` — só o `CatalogItem` autenticado (`GET /catalog`) tinha esses
  campos até então. Achado ao implementar "ofertas do dia" (`Modulo_Portal`): a home pública
  precisa casar refs `inv-<id>` contra o catálogo já carregado no cliente, e o schema público não
  carregava os dados pra isso. `home_brands` nunca expôs esse gap por casar só por `brand` (string
  já presente nos dois schemas). Sem risco de exposição — são ids internos opacos, mesmo nível do
  `id` (`mkt-<slug>`) já público. Ver ADR
  [[../00_Decisoes/2026-08-03-ofertas-do-dia-curadoria-manual-e-motor-de-sugestoes|2026-08-03]].
- 2026-07-31: `PricingPromotion` ganhou `scope_type="services"` + `target_services` — promoções agora podem mirar serviços de saúde (Módulo Portal), isolado dos eixos `all`/`categories`/`products` por design. Ver [[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]].
- 2026-07-30 (2): `InventoryItem.promotional_discount_percent` (desconto manual do Precificador) foi
  removido — todo desconto de produto agora é uma `PricingPromotion`. Novo campo `kind`
  (`campaign`/`product_discount`) segrega campanha segmentada de desconto direto de produto (nunca
  segmentado). Importação de nota fiscal passou a criar/atualizar uma `product_discount`
  automaticamente em vez de gravar no campo removido. Ver
  [[../00_Decisoes/2026-07-30-remover-desconto-manual-precificador-kind-promocao|ADR]]. O campo
  homônimo em `marketplace_listings` é outro, sempre foi morto, e **não** foi tocado nesta mudança.
- 2026-07-30: `pricing_promotions` ganhou `target_loyalty_tiers`, `guest_visible` e `highlight_style`;
  `regions` passou a casar bairro/CEP além de UF/cidade; `device_types` trocou `mobile` por `ios`/`android`
  distintos; motor de aplicação de preço passou a ser compartilhado entre catálogo e checkout — ver
  [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR]].
- 2026-07-25: nota criada — documentação do estado atual do módulo.
