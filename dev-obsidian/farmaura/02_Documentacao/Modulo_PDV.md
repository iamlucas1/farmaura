---
cssclasses: ia-nota
---

# Módulo PDV (ponto de venda / balcão)

## O que é

Fluxo de venda presencial no balcão da farmácia, com handoff explícito farmacêutico→caixa via fila — o pedido de balcão em si (`PdvOrder`/`PdvSale`) é um par de tabelas próprio, sem relação com `Order` do pedido online, **exceto** quando o fulfillment é entrega: desde 2026-09-20 uma venda de PDV com "Entregar em casa" também cria um `Order`/`OrderItem`/`OrderFulfillment` de verdade na finalização (`PdvService._create_linked_delivery_order`, `originating_pdv_sale_id` rastreia a origem), para entrar no mesmo pipeline `new → separating → ready → dispatched` do pedido online — ver seção "Entrega de balcão vira Order" abaixo. Reaproveita deliberadamente a mesma lógica de precificação de entrega do marketplace (exceção documentada em [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|excecao-delivery-pricing-cross-service]]) e o mesmo pipeline de emissão fiscal (ver [[Modulo_Fiscal|Módulo Fiscal]]).

## Tabelas / Models

- **`PdvOrder`** — atendimento em balcão **compartilhado** entre farmacêutico e caixa, antes do fechamento fiscal: `order_status` (queued/claimed/completed/cancelled), `pharmacist_user_id`/`cashier_user_id`, snapshots de cliente, `is_reservation`/`reservation_expires_at`/`requested_by_store_id` (reserva cross-loja).
- **`PdvOrderItem`** — linha mutável até a finalização; `source_store_id` permite item vir de loja diferente da loja do pedido (reserva).
- **`PdvSale`**/**`PdvSaleItem`** — venda finalizada e paga (imutável); `sale_code` (`NFCE-XXXXXXXX`), `cashback_applied_amount`/`cashback_earned_amount`. `PdvSaleItem.is_controlled` é **sempre igual ao flag do pedido inteiro** (`order.includes_controlled_items`), não calculado por item.
- **`PdvDraftSession`** — autosave do atendimento em progresso, denormalizado em JSON (`items_snapshot`, `customer_snapshot`, `delivery_snapshot`), propriedade exclusiva de um `pharmacist_user_id` — nem manager nem outro farmacêutico da mesma loja veem o draft de outro.
- **Tenant-scoping duplo**: `tenant_id` **e** `store_id` (diferente de vários domínios que só isolam por tenant). RLS: `pdv_orders`/`pdv_sales` — cashier só vê o que reivindicou (ou ainda não reivindicado, no caso de `pdv_orders`); `pdv_draft_sessions` — só o próprio `pharmacist_user_id` ou admin, nem passa por `can_access_store_row`.

## Endpoints (`ADMIN, MANAGER, PHARMACIST, CASHIER` conforme a rota)

`GET /pdv/products/search|{item_id}/locations`, `GET /pdv/delivery/coverage`, `GET /pdv/queue`, `POST /pdv/discount-limit` (preview sem persistir), `POST /pdv/orders` (farmacêutico envia à fila), `POST /pdv/reservations`, `POST/GET /pdv/prescriptions[/status]`, `POST /pdv/orders/{id}/claim` (caixa/manager/admin), `POST /pdv/orders/{id}/cancel`, `GET/PUT/DELETE /pdv/drafts`, `POST /pdv/recurrence-confirmations`, `POST /pdv/orders/{id}/complete` (caixa/manager/admin), `GET /pdv/sales`. Farmacêutico nunca finaliza venda nem faz claim — só cashier/manager/admin.

## Fluxo de venda no balcão (ponta a ponta)

1. Identificação do paciente (ou "consumidor não identificado"), com recuperação de atendimento salvo.
2. Busca de produto cross-loja; sem estoque local, oferece reserva.
3. Montagem do carrinho com autosave de draft no servidor (debounce 2s).
4. Preview de desconto máximo (recalculado a cada mudança do carrinho). Cupom (novo — ver [[Modulo_CRM|Módulo CRM]]) e desconto manual são mutuamente exclusivos; o cupom aplicado também respeita esse mesmo teto de margem.
5. Gate de receita para item controlado — reforçado no backend (`_enforce_prescription_gate`), não só na UI.
6. **Envio ao caixa** (`POST /pdv/orders`): **é aqui que o estoque é decrementado** (`SELECT FOR UPDATE` + `InventoryMovement` + FEFO), não na finalização — decisão deliberada para que dois farmacêuticos nunca reservem a mesma última unidade simultaneamente.
7. Fila do caixa: reservas expiradas são canceladas lazily ao listar, com devolução de estoque.
8. Claim: caixa assume o pedido (`cashier_user_id` setado).
9. Pagamento (`cash|pix|debit|credit|marketplace_card` — único valor, não há split real além de cashback+resto) e decisão de incluir CPF na nota. `marketplace_card` cobra o cartão salvo do cliente no marketplace via Asaas (`PaymentService.charge_card`, mesmo caminho do checkout online) — exige cliente identificado com `customer_id` e `payment_method_id` de um cartão salvo dele.
10. **Finalização** (`complete_sale`, tudo em um commit): cria `PdvSale`+itens, liquida ledger de cashback, **se `delivery`, cria também `Order`+`OrderItem`s+`OrderFulfillment`** (ver seção abaixo — a parada de rota em si só é anexada no despacho, igual pedido online, não aqui), **enfileira a NFC-e** (`FiscalService.enqueue_pdv_sale`: só grava o snapshot fiscal e um `fiscal_documents` em `DRAFT`, sem rede). A SEFAZ é chamada por um worker **depois do commit**, então falha fiscal nunca desfaz nem duplica a venda paga.

## Entrega de balcão vira Order (desde 2026-09-20)

Uma venda de PDV com "Entregar em casa" deixou de ficar presa ao par `PdvOrder`/`PdvSale` — a
finalização (`complete_sale`) também monta um `Order`/`OrderItem`s/`OrderFulfillment` reais
(`channel='pdv'`, `status=OrderStatus.NEW`, `originating_pdv_sale_id` apontando de volta pra
`PdvSale`), reaproveitando `self.delivery_pricing.repository`/`.store_repository`
(`OrderRepository`/`StoreRepository` já expostos por `DeliveryPricingService`). Isso faz a venda
aparecer em "Pedidos online" e passar pelo mesmo `new → separating → ready → dispatched` que um
pedido do marketplace — inclusive ficando elegível pra roteirização/despacho por proximidade já
existente (`attach_route_stop`, chamado no despacho, não na criação — mesmo ponto do pedido
online). Os `OrderItem` nascem com `picked_for_fulfillment=True`: já foram fisicamente separados
no balcão, então o item pula a separação visualmente mas o pedido ainda passa por todo o resto do
fluxo, como pedido pelo usuário.

`requested_delivery_time_label` (horário desejado de entrega, texto livre) existe tanto em
`PdvDeliveryRequest`/`PdvOrder` quanto em `CheckoutDeliveryRequest`/`OrderFulfillment` — mesmo
campo, mesmo formato, nos dois canais.

Exigiu ampliar RLS: `app_private.can_access_order_row`/`can_access_customer_row` passaram a
incluir `cashier` (antes só admin/manager/pharmacist) — é o caixa quem chama `complete_sale`, e
sem isso o `INSERT` em `orders` (e a leitura de `customers`/`customer_payment_methods` pro
pagamento `marketplace_card`) falha por RLS. Ver
[[../06_Pendencias/aplicar-migration-pdv-delivery-order-integration-em-producao|pendência de deploy em produção]].

## Regras de negócio não óbvias

- **Baixa de estoque no envio à fila, não na finalização** — trade-off explícito contra overselling concorrente; cancelamento devolve o estoque.
- **Reserva cross-loja** decrementa estoque real (mesmo `_prepare_lines` do fluxo normal); o `PdvOrder` nasce com `store_id` = loja **destino** (onde está o estoque), não a loja do farmacêutico solicitante — aparece na fila da outra loja atender. Hold expira em 48h.
- **Teto de desconto por margem média do carrinho** (não por linha) — headroom já reserva o que o cashback disponível também consumiria. Cupom (novo) entra na mesma etapa (`create_queue_order`) e é convertido num percentual efetivo pra passar pelo mesmo teto — um cupom mal configurado não fura a proteção de margem.
- **Cupom no PDV exige cliente identificado** — diferente do resto da venda (que aceita "consumidor não identificado"), porque `per_customer_limit` e as análises de segmento de cliente (`/coupon-analytics`) não fazem sentido sem isso.
- **Cupom tipo `shipping` não funciona no PDV** — a taxa de entrega só é conhecida depois do desconto ser calculado em `create_queue_order` (ordem pré-existente, não alterada), então o cupom de frete sempre resolve desconto zero por esse canal.
- **`usage_count` do cupom incrementa em `complete_sale`, não em `create_queue_order`** — mesma lógica do desconto de estoque: um pedido de fila cancelado antes do fechamento nunca conta como uso.
- **Recorrência independe de qualquer `PdvOrder`**: o farmacêutico pode confirmar e cobrar via cartão salvo (Asaas) enquanto ainda monta o carrinho, antes de qualquer pedido existir.
- **Sem split de pagamento real** além de cashback + método único.
- **Sem integração com hardware fiscal** (impressora/SAT/ECF) — a nota é um documento digital com QR ilustrativo.
- Pendência conhecida (não aprofundada aqui): [[../06_Pendencias/queries-em-loop-checkout-pdv|queries em loop no checkout PDV]] — locks/inserções por item dentro de loop, escalam linearmente com o carrinho.

## Frontend

`point-of-sale-screen.jsx` — visão compartilhada farmacêutico/caixa (alternância reseta o atendimento local). Busca de produto com reserva inline, carrinho com seleção de local de retirada e selo de status de receita, painel de CRM do cliente, `PdvUpsell` (baseado em histórico real de compra), `PdvRecurrenceSuggestions`, `PdvFulfillmentPicker` (retirada/entrega), autosave de draft, desconto limitado dinamicamente pelo teto do backend, campo de cupom (novo — mutuamente exclusivo com o desconto manual, preview local via `resolveMarketplaceCoupon` reaproveitado do carrinho do marketplace), cashback aplicável só na visão do caixa. O servidor é sempre a fonte de verdade — a UI nunca calcula subtotal/desconto/cupom/cashback definitivos.

## Decisões de arquitetura dignas de nota

- Baixa de estoque no momento do envio à fila (não na finalização) — trade-off consciente.
- `DeliveryPricingService`/`PortalService` compostos diretamente por `PdvService` — exceção documentada às camadas padrão.
- RLS de PDV combina isolamento por tenant **e** loja, com regra adicional específica por papel `cashier` — mais granular que a maioria dos domínios.
- Emissão fiscal **assíncrona e desacoplada** da venda (outbox + worker): a venda commita primeiro; a NFC-e sai em segundos e o modal do balcão acompanha o estado real. Venda com taxa de entrega não emite até decisão contábil.

## Ver também

- [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|Exceção delivery pricing cross-service]].
- [[Modulo_Fiscal|Módulo Fiscal]] — NFC-e real do PDV (outbox + worker) vs. documento simulado diferido do marketplace.
- [[Modulo_Estoque|Módulo Estoque]] — FEFO e ledgers de movimento.
- [[Modulo_CRM|Módulo CRM]] — cashback e recorrência.
- [[../06_Pendencias/queries-em-loop-checkout-pdv|queries em loop no checkout PDV]].

## Atualizações

- 2026-09-20: fim da emissão fiscal síncrona/simulada no fechamento da venda — `complete_sale` agora só enfileira o snapshot fiscal e dispara o worker após o commit; o `NotaFiscalModal` mostra o estado real da NFC-e (sem QR fictício nem "trib. aprox. 12%"). Ver [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]] e [[../06_Pendencias/nfce-pdv-troco-taxa-entrega-cashback-e-card|pendência de troco/entrega/cashback]].
- 2026-09-20: venda de PDV com "Entregar em casa" passou a criar também um `Order`/`OrderItem`s/`OrderFulfillment` real na finalização, entrando no mesmo pipeline `new → separating → ready → dispatched` de um pedido online (antes ficava presa a `PdvOrder`/`PdvSale`, invisível pro board e pra rota); novo método de pagamento `marketplace_card` (cobra cartão salvo do cliente via Asaas); novo campo `requested_delivery_time_label` (horário desejado, texto livre) no PDV e no checkout do marketplace. Exigiu ampliar RLS de `orders`/`customers` pra incluir `cashier`. Ver seção "Entrega de balcão vira Order" acima e [[../06_Pendencias/aplicar-migration-pdv-delivery-order-integration-em-producao|pendência de deploy]].
- 2026-09-17: pagamento no caixa (Pix/débito/crédito) passou a integrar de verdade com a maquininha Itaú via `farmaura-pdv-bridge` (agente local, USB) — driver ainda simulado, aguardando SDK da Itaú. Sale ganhou `payment_terminal_reference` (NSU/authCode). Ver [[../00_Decisoes/2026-09-17-integracao-maquininha-itau-via-agente-usb-local|ADR]] e [[../06_Pendencias/sdk-itau-maquininha-pendente|pendência do SDK real]].
- 2026-07-30: PDV passou a suportar cupom (antes só tinha desconto manual) — mutuamente exclusivo com o desconto manual, exige cliente identificado, respeita o mesmo teto de margem, `usage_count` incrementa só em `complete_sale`. Ver [[Modulo_CRM|Módulo CRM]] e [[../00_Decisoes/2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR]].
- 2026-07-25: nota criada — documentação do estado atual do módulo.