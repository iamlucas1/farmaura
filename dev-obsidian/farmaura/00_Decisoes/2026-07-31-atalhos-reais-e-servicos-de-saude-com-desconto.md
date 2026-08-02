# 2026-07-31 — Atalhos da home com lógica real; Serviços de Saúde ganha CRUD e cupom/promoção próprios

## Contexto

Na sessão anterior (2026-07-30) o menu de categorias do topo da home do marketplace foi
trocado de uma fileira mista (atalhos genéricos + categorias reais) para um menu só de
categorias reais, centralizado. O usuário pediu para "melhorar" trazendo de volta "Mais
buscados", "Produtos salvos", "Ofertas" e "Serviços de saúde" — mas cada um com lógica de
verdade por trás, não só navegação decorativa. Investigação encontrou:

- **"Mais buscados"** não tinha nenhum mecanismo real (nem front nem back) — `mode==='mostsearched'`
  em `shop-screen.jsx` ordenava por `product.reviews`, e a tag `'mais-vendido'` referenciada em
  `home-screen.jsx` nunca era produzida pelo backend (`marketplace_projection.py` só emite `oferta`/
  `receita`).
- **"Produtos salvos"** e **"Ofertas"** já eram reais (favoritos e `PricingPromotion`/`discount_percent`
  respectivamente) — só precisavam do atalho de volta.
- **"Serviços de saúde"** revelou a lacuna mais profunda: `HealthService`/`HealthServiceAppointment`
  já existiam como tabelas reais, com booking funcional (`POST /health/appointments`), mas **sem
  nenhum CRUD administrativo** — só existiam 3 linhas via `scripts/seed.py`. Cupons e promoções
  também nunca tinham como mirar um serviço: `PricingPromotion`/`CouponCampaign` só entendiam
  `scope_type` `all`/`categories`/`products`.

## Alternativas consideradas

- **"Mais buscados" usando a letra XYZ diretamente como ordenação.** Pedido inicial do usuário
  ("classificação XYZ do sistema interno"), mas XYZ mede variabilidade de demanda
  (coeficiente de variação mês a mês), não volume — um produto vendido 1x/mês por 3 meses seguidos
  é trivialmente "X" (estável), empatando com um best-seller real de alto volume. Decisão: ranquear
  por `total_quantity` (demanda real, mesma agregação usada pelo ABC/XYZ) e expor `xyz_class` como
  metadado por item, não como critério de ordenação — mantém a promessa ("usa a classificação do
  sistema interno") sem produzir um ranking sem sentido.
- **Reaproveitar `PurchaseAnalyticsRepository.monthly_sales_by_product` (RLS de admin) direto para
  o público.** Rejeitada — essa query roda sob role `admin`/`manager`, que enxerga todos os pedidos
  do tenant; um visitante anônimo/`customer` não pode, e não deve, ler pedidos de outros clientes só
  para montar um ranking agregado. Criada uma função SQL `SECURITY DEFINER` dedicada
  (`app_private.public_monthly_product_sales`), que devolve só `product_id`/`month`/`quantity`/
  `revenue` agregados — nunca `customer_id`/`order_id` — mesmo padrão de bypass estreito já usado por
  `resolve_public_marketplace_tenant_id`.
- **Desconto de serviço aplicado só como capacidade de cadastro (sem afetar o preço cobrado).**
  Perguntado ao usuário; recusou explicitamente — quis o desconto valendo de verdade no agendamento,
  mesmo padrão de "backend como fonte única de verdade" já estabelecido para produtos em
  2026-07-30.
- **`scope_type="all"` (ou `"categories"`/`"products"`) também descontando serviços automaticamente.**
  Rejeitada — um admin que criou uma campanha genérica de catálogo não tem serviços de saúde em
  mente; deixar isso vazar para bookings seria uma mudança de comportamento silenciosa no dia do
  deploy. `scope_type="services"` é um eixo deliberadamente isolado, tanto em `PricingPromotion`
  quanto em `CouponCampaign` — só aplica a booking quando explicitamente configurado.

## Decisão

1. **Home do marketplace**: nova fileira `ShortcutsRow` (Mais buscados/Produtos salvos/Ofertas/
   Serviços de saúde), centralizada, acima do menu de categorias reais — as duas fileiras
   reutilizam as mesmas classes CSS (`fa-quickcats`/`fa-quickcat-tile`, já reestilizadas em rosé/vinho
   em 2026-07-30 para diferenciar de concorrentes).
2. **`catalog_service.py::list_most_searched_products`** (novo, público, `GET /catalog/most-searched`)
   — ranking por `total_quantity` num período configurável (padrão 3 meses), usando a nova função
   SQL `SECURITY DEFINER`. `shop-screen.jsx` (`mode==='mostsearched'`) passa a ordenar por esse
   ranking real primeiro, com fallback por `reviews` para produtos sem histórico de venda.
3. **`HealthService` ganha CRUD administrativo completo**: `GET/POST/PUT
   /portal/internal/health-services[/{id}]`, nova tela `health-services-screen.jsx` em
   Catálogo → Serviços de saúde (pedido explícito do usuário — "dentro do Catálogo do sistema
   interno"), visível para `ADMIN`/`MANAGER`/`PHARMACIST`.
4. **`PricingPromotion.target_services`** e **`CouponCampaign.target_services_json`** (novas colunas,
   migration `20260731_01`) — `scope_type="services"` em ambos os modelos, com matching isolado:
   `pricing_promotion_service.py::find_best_service_promotion`/`apply_promotion_to_health_service`
   (paralelo a `find_best_promotion`, nunca cruza com produtos) e
   `coupon_service.py::resolve_coupon` ganha `allow_service_scope` — rejeita explicitamente qualquer
   coupon não-`services` numa booking, e vice-versa.
5. **`PortalService.create_health_appointment`** agora aplica a melhor promoção de serviço ativa
   automaticamente (mesma função usada pelo preview) e aceita `coupon_code` opcional, empilhado sobre
   o preço já promocionado — mesma ordem produto→promoção→cupom já usada no checkout. Preço original
   e código do cupom ficam auditáveis em `HealthServiceAppointment.original_price_amount`/
   `.coupon_code` (novas colunas).
6. **Telas de Promoções e Cupons** ganham "Serviços de saúde" como opção de escopo, reaproveitando
   `CouponTargetPicker` com uma nova `buildCouponServiceOptions`.

## Consequências

- Nova migration (`20260731_01_service_scope_and_booking_discount`): `pricing_promotions.
  target_services`, `coupon_campaigns.target_services_json`, `health_service_appointments.
  original_price_amount`/`.coupon_code`.
- Nova função SQL `app_private.public_monthly_product_sales` (idempotente via
  `row_level_security.py`, reaplicada a cada boot do container, mesmo mecanismo do resto do domínio).
- **Bug real encontrado e corrigido durante o teste end-to-end**: `CouponService.
  _count_customer_coupon_uses` não contava `HealthServiceAppointment.coupon_code` — um
  `per_customer_limit=1` era ignorado silenciosamente em bookings repetidos com o mesmo cupom
  (confirmado com 4 agendamentos usando o mesmo cupom antes do fix). Corrigido antes do deploy desta
  feature; nenhuma exploração real ocorreu (achado em teste local).
- **Segundo bug encontrado durante o teste**: `PortalService.create_health_appointment` não
  reaplicava `apply_tenant_context` depois do `commit()`, lendo o histórico do cliente sob
  contexto de RLS já limpo pela transação — retornava lista vazia mesmo com o agendamento persistido
  corretamente. Mesma classe de bug de "RLS limpo após commit" já conhecida neste projeto (commit()
  limpa o contexto transaction-local; toda leitura depois precisa reaplicar `apply_tenant_context`);
  corrigido replicando o padrão já usado por `create_coupon_campaign`.
- **`_count_previous_purchases`** (usado para segmentação `new_customers`/`recurring` de cupom)
  **deliberadamente não conta bookings de serviço** — decisão consciente para não expandir o escopo
  desta sessão; registrado como pendência.
- Nenhum equivalente a `kind="product_discount"` existe para serviços (só campanha segmentável) —
  registrado como pendência, não é um caso de uso pedido ainda.

## Ver também

- [[2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR do cupom]] e
  [[2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR da promoção]] — mesma classe de
  correção (backend como fonte única de verdade), agora estendida a um domínio novo (serviços).
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — CRUD de health services vive em
  `portal_service.py`, junto de cupons/promoções.
- [[../02_Documentacao/Modulo_Catalogo|Módulo Catálogo]] e [[../02_Documentacao/Modulo_CRM|Módulo CRM]]
  — `scope_type` agora documentado com o eixo `services`.
- [[../06_Pendencias/product-discount-equivalente-para-servicos|pendência: sem "desconto direto" para
  serviços]] e [[../06_Pendencias/bookings-nao-contam-para-segmentacao-novo-recorrente|pendência:
  bookings fora da segmentação novo/recorrente]].
