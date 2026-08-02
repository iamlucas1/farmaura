# Módulo CRM (clientes, cashback, cupons, assinaturas)

## O que é

Projeção 360° do cliente (`crm.py`/`CrmService`, majoritariamente leitura), mais três mecânicas de retenção que na verdade vivem em routers/services diferentes: cashback (calculado só no PDV), cupons (CRUD em Portal), e assinaturas/recorrência (dois motores distintos, um self-service e um confirmado no PDV com cobrança imediata). "CRM" no código é mais estreito que o domínio de negócio "CRM" — quem for consultar deve saber que cupons e assinaturas ficam em `portal_service.py`, não em `crm_service.py`.

## Tabelas / Models

- **`customers`** — perfil + muitos campos JSON de personalização (`top_products_snapshot`, `category_mix_snapshot`, `monthly_orders_snapshot`, `interest_tags`, `favorite_items`) que **só são populados pelo seed de demo**, nunca pela aplicação real — clientes reais nascem com esses campos vazios. RLS dedicada (`can_access_customer_row`).
- **`customer_addresses`**, **`customer_payment_methods`** (só metadados tokenizados, nunca PAN/CVV) — RLS via subquery em `customers`.
- **`customer_cashback_wallets`** — `available_balance`/`pending_balance`/`redeemed_total`/`expired_total`/`lifetime_earned_total`. **Sem `tenant_id` e sem RLS própria** — gap de defesa em profundidade.
- **`cashback_rules`** — por loja, opcionalmente por item; `release_after_delivery`/`validity_days` existem no schema mas **não são usados** (ver regras abaixo).
- **`cashback_transactions`**/**`cashback_transaction_lines`** — ledger auditável (earn/redeem); a segunda tabela também **sem `tenant_id`/RLS**.
- **`coupon_campaigns`** — `discount_type` (percent/fixed/shipping), `scope_type` (`all`/`categories`/`products`/**`services`**, desde 2026-07-31 — ver [[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]]) + `target_services_json`, `usage_limit`/`usage_count`/`per_customer_limit`, `audience`, `channel_scope` (`all`/`online`/`pdv` — novo, restringe o cupom a um canal), `stackable`. **Fora de todo o sistema de RLS** (nem lista genérica nem policy dedicada) — inconsistente com o resto do domínio (ver [[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|risco documentado]]).
- **`orders.coupon_code`** / **`pdv_orders.coupon_code`** / **`pdv_sales.coupon_code`** / **`health_service_appointments.coupon_code`** (desde 2026-07-31) — snapshot do código efetivamente resgatado em cada pedido/venda/agendamento; é a base tanto de `per_customer_limit` (contado somando os canais — `CouponService._count_customer_coupon_uses`) quanto do endpoint `/coupon-analytics`. `orders.coupon_code` também é exposto ao próprio cliente via `MarketplaceOrderResponse.coupon_code` (histórico de pedidos, `GET /orders`) — usado pelo preview client-side do carrinho pra contar quantos pedidos passados do cliente já usaram um código específico.
- **`subscriptions`** — `subscription_status`, `frequency_days`, `discount_percent` (default 15%). RLS dedicada via `can_access_customer_row`.

## Endpoints

- `GET/POST /crm/customers` (cadastro walk-in do PDV), `GET /crm/customers/{id}/payment-methods|addresses`, `POST /crm/customers/{id}/addresses`, `GET /crm/customers/{id}/purchase-insights` — roles `ADMIN, MANAGER, PHARMACIST` (+ `CASHIER` em alguns).
- Self-service do cliente (`api/v1/customers.py`): perfil, endereços, cartões (`POST /me/payment-methods/tokenize-card` via Asaas), carrinho, alertas de disponibilidade — **nenhum endpoint de cashback/cupom/assinatura aqui**.
- Cupons e assinaturas vivem em `api/v1/portal.py`: `GET/POST/PUT/DELETE /portal/internal/coupons[/{id}]`, `GET/POST/PUT/DELETE /portal/marketplace/subscriptions[/{product_ref}]`.
- Analytics de cupom (novo): `GET /coupon-analytics` (`app/api/v1/coupon_analytics.py`, roles `ADMIN, MANAGER`) — agrega `Order`+`PdvSale` por `coupon_code`, mesma arquitetura de `purchase_analytics` (router fino → service → repository).
- PDV: `POST /pdv/recurrence-confirmations` (confirma recorrência + cobra na hora).

## Mecânica de cashback

**Só existe no canal PDV** — pedidos online nunca tocam `CashbackTransaction`/wallet. Resolução de regra prioriza item específico, senão cai para regra "fallback" da loja. Cálculo por linha (`line_total * percent`, capado por `maximum_cashback_amount`), resgate limitado a `min(pedido, saldo disponível, total do pedido)`. **Cashback ganho é imediatamente "disponível"** — apesar de `pending_balance`/`expired_total`/`validity_days`/`release_after_delivery` existirem no schema, nenhum código os usa; não há job de expiração.

## Mecânica de cupons

Tipos: percent/fixed/shipping (com submodo full/percent/fixed). CRUD só no console interno, código
normalizado e único por tenant.

**Validação e precificação são 100% server-side**, via `app/services/coupon_service.py`
(`CouponService.resolve_coupon`), único dono da regra, chamado tanto pelo checkout online
(`OrderService.create_marketplace_order`) quanto pelo PDV (`PdvService.create_queue_order`). O
cliente manda só o `coupon_code` — o servidor busca `CouponCampaign` (`with_for_update`), revalida
vigência, `usage_limit`, escopo por categoria/produto, público-alvo, `channel_scope`, valor mínimo e
teto de desconto, e só então calcula o valor final. `usage_count` incrementa atomicamente no commit
final de cada canal (nunca antes — um pedido/venda cancelado no meio do caminho não conta).

**Elegibilidade por cliente cruza os dois canais**: tanto a contagem de "pedidos anteriores"
(`first_purchase_only`/`new_customers`/`recurring`) quanto `per_customer_limit` somam `Order` +
`PdvSale` do mesmo cliente — trocar de canal não contorna o limite nem finge ser "cliente novo".

**No PDV**, cupom e desconto manual são mutuamente exclusivos, o desconto do cupom respeita o mesmo
teto de margem média do carrinho que já protegia o desconto manual, e cupom **exige cliente
identificado** (o PDV permite venda "consumidor não identificado", mas isso quebraria
`per_customer_limit` e as análises de segmento). Ver [[Modulo_PDV|Módulo PDV]] para o fluxo completo.

**`channel_scope`** (`all`/`online`/`pdv`) restringe um cupom a um canal só — ex.: recompensa de
fidelidade resgatável só no balcão.

Ver [[../00_Decisoes/2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR completo]]
para o racional da mudança e o que ficou de fora (cupom tipo `shipping` não funciona no PDV hoje —
ordem de cálculo pré-existente resolve a taxa de entrega **depois** do desconto).

**Preview client-side no marketplace (`resolveMarketplaceCoupon`, `cart-screen.jsx`) cobre hoje as
mesmas regras que o servidor** — canal (`channelScope`), status granular (pausado/agendado/
expirado/esgotado, cada um com mensagem própria em vez de um "não está ativo" genérico), público-alvo
(`new_customers`/`recurring`/`prescription` — este último checando se algum item do carrinho exige
receita) e `per_customer_limit` (contando quantos pedidos passados do próprio cliente já usaram
aquele código — só possível porque `MarketplaceOrderResponse.coupon_code` passou a expor isso). Isso é
**só UX** — feedback imediato sem round-trip — e segue o princípio em
[[../04_Seguranca_Riscos/backend-e-fonte-unica-de-verdade-nunca-confiar-no-client|backend é sempre a
fonte única de verdade]]: o servidor mantém mensagens genéricas nas rejeições "sensíveis" (não
confirma pra um client hostil qual regra exata barrou o cupom), o preview pode ser específico porque
o client já tem acesso legítimo à lista completa de cupons via bootstrap.

## Assinaturas (dois motores distintos sobre o mesmo model)

1. **Self-service** (cliente, via `/marketplace/subscriptions`): não fixa preço real (`unit_price_snapshot=0`), `discount_percent` fixo em 15%; reativa registro existente em vez de duplicar.
2. **Confirmação no PDV** (`confirm_recurrence`): farmacêutico detecta padrão de recompra (via `PurchaseHistoryService`) e **cobra o cartão salvo imediatamente** via Asaas, com desconto de 15%, só então grava `Subscription` com preço real. **Não há job de cobrança recorrente/cron** — comentário explícito no código diz que a cobrança mensal automática é fase futura; a `Subscription` existe só como registro durável do acordo.

`PurchaseHistoryService` cruza pedidos online + vendas PDV (por chave de produto normalizada) para achar top produtos (top 5) e candidatos a recorrência (≥3 meses-calendário consecutivos), excluindo produtos já com assinatura ativa.

## Regras de negócio não óbvias

- **Cashback só no PDV**, nunca no marketplace — divergência de canal relevante para qualquer análise de dado.
- **Sem expiração de cashback implementada**, apesar do schema estar pronto para isso.
- **Cupom no PDV exige cliente identificado** — única diferença de regra entre os canais, porque o PDV permite venda avulsa e o marketplace não.
- **`create_customer` do PDV é idempotente por CPF/e-mail** — retorna o existente em vez de duplicar.
- **Endereço/cartão primário é exclusivo** — setar um como primário sempre limpa o flag dos demais.
- **Campos de personalização do `Customer` são só de demo** — na tela real de CRM, "produtos mais comprados"/"mix de compras"/gráfico mensal ficam vazios para clientes reais, mesmo com `purchase-insights` (dados reais) disponível em endpoint separado.

## Frontend

- **`crm-screen.jsx`** — visão 360° somente leitura: lista+busca de clientes, 6 stats (gasto total, pedidos, ticket médio, cashback, última compra, tempo de casa), produtos mais comprados, gráfico de pedidos/12 meses, mix de compras (donut), recorrências ativas, favoritos, interesses.
- **`coupons-screen.jsx`** — duas subtelas por aba (`.ph-seg`, mesmo padrão de Estoque/Comparar Cotações): "Gestão da tabela" (filtros — status completo, público, escopo, canal — e tabela full-width) e "Análises" (KPIs e detalhamento por cupom vindos de `/coupon-analytics`: pagamento, canal, entrega/retirada, segmento de cliente). Status da tabela de gestão continua calculado no client (`getCouponStatusKey`, feedback instantâneo ao editar); a aba Análises usa o cálculo do backend, que tem os dados agregados de uso real. Modal de criação/edição com seletor de escopo (`CouponTargetPicker`) e seletor de canal (`channel_scope`).

## Decisões de arquitetura dignas de nota

- **`coupon_campaigns`, `cashback_transaction_lines` e `customer_cashback_wallets` fora da malha de RLS** — inconsistente com o resto do domínio (`customers`, `subscriptions`, `cashback_rules`/`cashback_transactions` estão protegidas). Vale confirmar se é intencional.
- **Cupons/Assinaturas vivem em `portal_service.py`** (um "catch-all" de portal que também acumula settings, promoções, reviews, favoritos), separado do router/service CRM enxuto e focado — mas a *validação* de cupom foi extraída para `coupon_service.py`, fora do catch-all, justamente para ser compartilhável entre `order_service.py` e `pdv_service.py` sem depender de Portal.
- **Dois motores de "assinatura" com semânticas de preço/cobrança bem diferentes** compartilhando o mesmo model.
- **Cashback e cupom agora compõem de forma parcialmente auditável no PDV**: o desconto do cupom passa pelo mesmo teto de margem média que o desconto manual (`_discount_ceiling`, que já reservava headroom do cashback disponível). No checkout online, cupom e cashback continuam sem essa reconciliação — o marketplace não tem cashback (ver acima).

## Ver também

- [[Modulo_PDV|Módulo PDV]] — canal onde cashback é ganho/resgatado, recorrência é confirmada com cobrança real, e agora também onde cupom convive com desconto manual e teto de margem.
- [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — checkout online, cupom validado server-side.
- [[Modulo_Portal|Módulo Portal]] — dono real do CRUD de cupons e settings.
- [[../00_Decisoes/2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR: cupom validado no servidor]].

## Atualizações

- 2026-07-31: cupom ganhou `scope_type="services"` + `target_services_json`, redimível em agendamentos de serviço de saúde (`allow_service_scope` em `resolve_coupon` — nunca aceita um cupom de escopo produto/categoria/all num booking, nem o contrário). Corrigido bug real onde `_count_customer_coupon_uses` não contava bookings, permitindo reuso indevido de cupom de uso único. Ver [[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]].
- 2026-07-30 (2): preview client-side do cupom no marketplace passou a cobrir `channel_scope`, público-alvo (`audience`) e `per_customer_limit`, com mensagens específicas por status em vez de um "não está ativo" genérico — exigiu expor `MarketplaceOrderResponse.coupon_code`. Continua sendo só UX, nunca fonte de verdade; ver [[../04_Seguranca_Riscos/backend-e-fonte-unica-de-verdade-nunca-confiar-no-client|princípio formalizado]].
- 2026-07-30: cupom deixou de ser client-trusted — validação e precificação movidas para `coupon_service.py`, compartilhado entre marketplace e PDV; cupom passou a existir também no PDV; novo `channel_scope`; novo endpoint `/coupon-analytics`. Ver ADR linkado acima.
- 2026-07-25: nota criada — documentação do estado atual do módulo.
