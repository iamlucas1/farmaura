---
cssclasses: ia-nota
---

# Módulo Carrinho e Pedidos

## O que é

Domínio do fluxo de compra online do marketplace: carrinho persistido do cliente, checkout (que recalcula preço/estoque/frete sempre server-side), o board operacional de separação/despacho para a equipe interna, e a integração de pagamento (Asaas — Pix e cartão tokenizado). Não cobre PDV/balcão (ver [[Modulo_PDV|Módulo PDV]]) nem emissão fiscal em si (ver [[Modulo_Fiscal|Módulo Fiscal]]), embora ambos sejam disparados a partir daqui.

**Achado estrutural**: `api/v1/cart.py` + `schemas/cart.py` são um scaffold morto (sempre devolve zeros). O carrinho real vive sob `/customers/me/cart` (`api/v1/customers.py`), atendido por `CustomerService`.

## Tabelas / Models

- **`orders`** (`app/models/order.py`) — `store_id` (FK RESTRICT), `customer_id` (FK SET NULL), `order_code`, `status` (string livre, ver máquina de estados abaixo), `fulfillment_type` (pickup/delivery/shipping), `payment_status` (pending/approved/overdue/refunded), `gateway_payment_id` (indexado — chave de correlação do webhook Asaas), snapshots imutáveis do cliente (nome/documento/telefone/e-mail), valores financeiros com `CheckConstraint ≥0`, `requires_prescription_review`/`prescription_status`. RLS: `tenant_id = current_tenant_id() AND can_access_order_row(customer_id)` **OU** `gateway_payment_id = current_webhook_payment_id()` **OU** `is_system_job()` — o segundo OR é o carve-out que permite o webhook (autenticado por shared-secret, sem JWT) tocar exatamente 1 pedido sem tenant context.
- **`order_items`** — FK `order_id` CASCADE, `inventory_item_id`/`marketplace_listing_id` SET NULL, snapshots de produto, `requires_prescription_upload`/`prescription_status` por linha, `picked_for_fulfillment`. Uma linha por **lote alocado**, não por produto agrupado — um item de carrinho pode virar N `OrderItem`s se o produto agrupado tiver estoque disperso.
- **`order_fulfillments`** — 1:1 com `orders`; pickup/delivery/shipping convivem na mesma tabela (campos não usados ficam vazios, decisão deliberada contra tabelas paralelas). `pickup_code` nunca é exposto ao board interno (só o cliente vê).
- **`order_status_events`** — ledger append-only com RLS configurada, mas **nenhum código grava linhas nessa tabela** — infraestrutura pronta e não conectada.
- **`cart_items`** (`app/models/cart_item.py`) — uma linha por `(customer_id, product_ref)`; `product_ref` é o id de produto **agrupado** do marketplace, não FK de inventário. Preço nunca é armazenado no carrinho (sempre recalculado no checkout). `is_subscription` (flag de recorrência, −15% aplicado só no client).
- **`payment_webhook_events`** — `UniqueConstraint(source, event_name, external_id)`, chave de idempotência; sem `tenant_id` (webhook chega antes de qualquer contexto de tenant).
- **`customer_payment_methods`** — só metadados tokenizados (token Asaas, bandeira, últimos 4 dígitos), nunca PAN/CVV.

## Fluxo Carrinho → Pedido

1. **Carrinho**: anônimo vive só em `localStorage`; ao logar, `GET /customers/me/cart` sobrescreve o estado. Toda mutação autenticada valida disponibilidade via `_require_marketplace_product` (mesma função `build_marketplace_catalog_groups` do catálogo) — produto escondido do marketplace nunca entra no carrinho mesmo com snapshot de client desatualizado.
2. **Checkout** (`OrderService.create_marketplace_order`, transação única): resolve `Customer` + valida CPF → resolve loja atendente (pickup: informada/primária; delivery/shipping: `DeliveryPricingService.resolve_order_store` por geocoding, força `shipping` se fora do raio de motoboy) → recarrega inventário e recalcula preço/estoque **sempre server-side** → aplica a melhor `PricingPromotion` por linha (mesmo motor do catálogo, ver [[Modulo_Catalogo|Módulo Catálogo]]) → calcula frete (Melhor Envio para shipping, área/distância para delivery) → resolve e precifica cupom via `CouponService` (ver [[Modulo_CRM|Módulo CRM]]) → cria `Order` → aloca estoque item a item com lock pessimista (`FOR UPDATE`) + FEFO por lote, criando 1 `OrderItem` por alocação → cria `OrderFulfillment` → se `delivery`, anexa parada na rota ativa → se item exige receita, cria `Prescription`+checklist fixo → aciona `PaymentService` (Pix/cartão) → incrementa `usage_count` do cupom se houver → atualiza `orders_count`/`total_spent`/`average_ticket`/`is_recurring`/`loyalty_tier` do cliente (`record_customer_purchase`) → commit único → invalida cache de catálogo.
3. **Emissão fiscal é deliberadamente adiada** — scheduler emite 7 dias após `payment_confirmed_at` (ver [[Modulo_Fiscal|Módulo Fiscal]]).

### Status e transições

`new → separating → ready → dispatched` (mapa fixo de transições, 422 se fora da ordem esperada). Bloqueios: não avança de `new`/`separating` com receita pendente; não avança a `ready` com item não conferido (`picked_for_fulfillment`). `dispatched` tem **3 caminhos mutuamente exclusivos** por `fulfillment_type` (pickup via confirmação de código, shipping via compra de etiqueta Melhor Envio, delivery via avanço normal — os outros dois são bloqueados na transição genérica). `delivered` só é setado quando o motorista marca a parada como entregue. **`cancelled` só é atingível por rejeição de receita** (`PrescriptionService`, que credita o estoque de volta via replay dos ledgers) — não existe endpoint de cancelamento de pedido para cliente nem para operador interno. Valores `draft`, `submitted`, `paid`, `fulfilled` do enum não são usados em nenhum lugar do código atual (resíduo).

## Endpoints

- Cliente: `GET/PUT/DELETE /customers/me/cart[/{product_ref}]`, `GET/POST /orders`, `GET /orders/delivery-coverage`, `GET /orders/changes?since=` (sync incremental), `GET /customers/me/cashback` (saldo/ledger/teto de resgate, desde 2026-09-04).
- Interno (`ADMIN, MANAGER, PHARMACIST`): `GET /orders/internal-board[/changes]`, `POST /orders/{id}/items/{item_id}/location|pick`, `POST /orders/{id}/pickup/confirm`, `POST /orders/{id}/shipping/dispatch`, `POST /orders/{id}/advance`.
- Pagamento: `POST /payments/asaas/webhook` — único endpoint sem JWT (autenticado por header `Asaas-Access-Token` + allowlist de IP, ambos fail-closed).

## Integração de pagamento (Asaas)

`AsaasClient` (cliente `urllib` síncrono, chamado via `asyncio.to_thread`). `charge_pix` retorna QR/copia-e-cola (não persistidos no `Order`); `charge_card` usa token já salvo. Checkout e webhook rodam em transações separadas — se o Asaas falhar no checkout, a exceção propaga e desfaz a baixa de estoque já feita (rollback). Webhook: dedup por `payment_webhook_events` → aplica em `order.payment_status` (approved/overdue/refunded) **sem nunca tocar `order.status` operacional** — um reembolso não cancela automaticamente o pedido no board.

## Regras de negócio não óbvias

- **Reserva de estoque = débito imediato**, não hold temporário — não existe timeout de carrinho; o checkout é tudo atômico num único POST.
- **Cupom validado e precificado no servidor** via `CouponService` (`coupon_service.py`), compartilhado com o PDV — o client manda só `coupon_code`; o servidor busca `CouponCampaign`, revalida tudo e calcula o desconto. Detalhe completo em [[Modulo_CRM|Módulo CRM]].
- **Promoção dinâmica por perfil também é reaplicada no checkout desde 2026-07-30** — `create_marketplace_order` chama a mesma `apply_promotion_to_catalog_item` que o catálogo usa para exibição, resolvendo o perfil do cliente (idade/região/dispositivo/estado civil/filhos/segmento/selo) e sobrepondo o preço por linha antes do subtotal. Antes disso havia uma discrepância real: o desconto mostrado na vitrine nunca era cobrado de fato no checkout. Ver [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR]] e [[../04_Seguranca_Riscos/promocao-nao-reaplicada-no-checkout|risco mitigado]].
- **Grupo de produto (marketplace) ≠ item de inventário 1:1** — é a peça central que explica por que 1 linha de carrinho pode virar múltiplos `OrderItem`s, e por que toda mudança em `build_marketplace_catalog_groups` afeta catálogo, carrinho, checkout e pedido simultaneamente.
- **Sem cancelamento genérico de pedido** (nem cliente nem operador) e **`order_status_events` morto** (RLS pronta, nunca escrita) — dois gaps de maturidade a considerar.
- **Cashback resgatado no checkout abate o valor real cobrado no Asaas, desde 2026-09-04** — `CashbackService.apply_on_order`, chamado dentro de `create_marketplace_order` antes de cobrar, calcula `charge_amount = total - cashback_aplicado`; ganho do pedido fica `pending` até `release_pending_for_order` (entrega/retirada). Detalhe completo em [[Modulo_CRM|Módulo CRM]] e [[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|ADR]].
- **Pickup code nunca trafega para a tela do operador** — desenho anti-fraude interna deliberado (cliente informa verbalmente, backend só valida).
- **Região/geo sempre calculado a partir da loja que vai atender o pedido**, nunca de um hub fixo — decisão de arquitetura multi-loja.

## Frontend

- **Marketplace**: `cart-screen.jsx` (cálculo client-side de frete estimado, resolução/validação de cupom, barra de frete grátis, assinatura/recorrência por item com modal de confirmação ao remover/desativar, CTA "Enviar receita" por item, recomendações via `ScrollRail`+`ProductCard`, bloqueio de checkout se item indisponível), `checkout-screen.jsx` (monta o payload e trata resposta Pix/cartão; desde 2026-09-04 também o bloco "Usar meu cashback" na etapa Pagamento, teto calculado client-side só para preview — servidor sempre recalcula). Desde 2026-08-31, carrinho (fase 1) e checkout (fases 2-3, `checkoutVariant === 'A'`) formam uma jornada visual de 3 fases só (Revisão/Entrega/Pagamento — `CheckoutPhaseBar`, `core/marketplace-components.jsx`), ver [[../00_Decisoes/2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR]]. `marketplace-app.jsx` (estado global do carrinho, sync com backend, polling incremental via `/orders/changes`; desde 2026-09-04 também busca/expõe `cashbackWallet`). `screens/account-health-screen.jsx::MyOrders` (aba "Meus pedidos") redesenhada em 2026-09-04 conforme o demo "Padrão farmácia" — cards de pedido colapsáveis (`OrderCard`, `account-shared.jsx`), faixa de cashback+recorrência, prompt de avaliação, paginação client-side — ver ADR.
- **Interno**: `orders-screen.jsx` (kanban por status, `OrderDrawer` com checklist de picking, bloqueio por receita pendente, confirmação de retirada, despacho de transportadora — reflete 1:1 as regras de transição do backend), `sales-screen.jsx` (histórico unificado orders+PDV, somente leitura).

## Decisões de arquitetura dignas de nota

- **Server-authoritative pricing/estoque/cupom/promoção** em todo o fluxo — cupom e promoção dinâmica passaram a seguir a mesma regra em 2026-07-30 (eram client-trusted/só-vitrine antes disso).
- **Snapshot-heavy design**: `Order`/`OrderItem`/`OrderFulfillment` duplicam dados de `Customer`/`InventoryItem` deliberadamente, por estabilidade histórica.
- **Webhook fora do modelo de tenant padrão**, com contexto RLS próprio (`current_webhook_payment_id`).

## Ver também

- [[Modulo_Estoque|Módulo Estoque]] — FEFO, lock pessimista e ledgers de movimento usados no checkout.
- [[Modulo_Fiscal|Módulo Fiscal]] — emissão da NFC-e diferida 7 dias após pagamento aprovado.
- [[Modulo_Prescricoes|Módulo Prescrições]] — único caminho hoje para cancelar um pedido.
- [[Modulo_Entrega|Módulo Entrega]] — precificação por distância e Melhor Envio, usados no checkout.
- [[../06_Pendencias/queries-em-loop-checkout-pdv|queries em loop no checkout/PDV]].

## Atualizações

- 2026-09-04: cashback real no marketplace — checkout resgata e abate o pagamento real, ganho fica
  pendente até entrega/retirada, novo endpoint `GET /customers/me/cashback`, e "Meus pedidos"
  redesenhada conforme o demo "Padrão farmácia". Ver
  [[../00_Decisoes/2026-09-04-cashback-real-no-marketplace|ADR]].
- 2026-09-02 (7): checkout de receita física passou a exigir e mostrar um cartão salvo (mesmo
  picker `CardMethodDetail` já usado por cartão de crédito/débito online), preselecionando o
  cartão primário do cliente — a cobrança real só acontece depois, na retirada. Ver
  [[Modulo_Prescricoes|Módulo Prescrições]] e
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Oitava rodada)]].
- 2026-09-02 (6): formulário de cadastro/edição de endereço no checkout virou uma modal de verdade
  (antes ficava inline na página), com validação própria — "Salvar" fica desabilitado enquanto
  faltar campo obrigatório, com hint do que falta. Botão "Continuar" do step de Entrega agora exige
  endereço completo (ou loja escolhida, na retirada) antes de avançar. Ver
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Sexta rodada)]].
- 2026-09-02 (5): modal "Escolher endereço de entrega" ganhou um ícone de editar por linha —
  abre o mesmo `AddressForm`, pré-preenchido, salvando via `PUT` (não cria duplicado). Ver
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Quinta rodada)]].
- 2026-09-02 (3): nome/telefone de quem recebe a entrega agora é parte do cadastro do endereço
  (`recipient_name`/`recipient_phone`, colunas que já existiam no backend mas nunca tinham campo
  no formulário) — seletor "Eu mesmo" (puxa do perfil) / "Outra pessoa" no `AddressForm`, removidos
  os campos soltos de nome/telefone do checkout. Card "Entregar para" some ao cadastrar um endereço
  novo, substituído por atalho para escolher um já salvo. Ver
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Quarta rodada)]].
- 2026-09-02 (2): novo método de pagamento `pickup_cash` — pré-pedido sem cobrança online,
  usado quando a receita é física (retirada obrigatória, cobrança presencial no balcão). Ver
  [[Modulo_Prescricoes|Módulo Prescrições]] e
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR (Segunda rodada)]].
- 2026-09-02: etapa de pagamento do checkout (`3 Pagamento`) fica bloqueada quando há item de
  receita no carrinho e a prescrição ainda não foi aprovada pelo farmacêutico — ver
  [[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR]] e
  [[Modulo_Prescricoes|Módulo Prescrições]].
- 2026-09-01 (4): `/checkout` agora tem guarda de autenticação na própria rota — antes só o
  clique em "Finalizar compra" passava por `requireAuth`; acesso direto pela URL sem login
  chegava no formulário de entrega/pagamento. Ver
  [[../00_Decisoes/2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR (Sétima rodada)]].
- 2026-09-01 (3): "Resumo do pedido" do checkout (`checkout-screen.jsx`) ganhou thumbnail/badge de
  quantidade reais (antes vazios/cortados), lista paginada de 5 itens com setas, e passou a
  concentrar a etapa de entrega: endereço reduzido com apelido + modal de troca/cadastro (reusa
  `AddressForm` de `account-profile-screen.jsx`), e o seletor de método de entrega (transportadora
  só aparece sem cobertura). Ver
  [[../00_Decisoes/2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR (Sexta rodada)]].
- 2026-09-01 (2): lista de itens do carrinho (`cart-screen.jsx`) agora sempre renderiza em ordem
  alfabética fixa por nome de produto (`sortedItems`, derivado de `items` a cada render, nunca
  mutado) — antes seguia a ordem crua devolvida pelo backend (inserção, `created_at.asc()`), que
  mudava de posição percebida pelo usuário ao ativar recorrência (a resposta do `PUT` de item único
  reordena a lista completa sob o capô mesmo sem o backend ter mudado a ordem real das linhas).
  Puramente visual, não mexeu no array `items`/estado nem em nenhum endpoint.
- 2026-09-01: corrigido bug real no carrinho — itens adicionados como visitante nunca eram
  persistidos no servidor ao logar (só mesclados localmente), então a primeira mutação de item
  único (ex: ativar recorrência) sobrescrevia o carrinho inteiro com a versão do servidor,
  incompleta, e os outros itens "sumiam". Ver
  [[../00_Decisoes/2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR (Quinta rodada)]].
- 2026-08-31: carrinho e checkout redesenhados conforme o demo "padrão farmácia" e unificados numa
  jornada visual de 3 fases (Revisão → Entrega → Pagamento) — ver
  [[../00_Decisoes/2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR]]. Nenhuma
  mudança de schema/endpoint.
- 2026-07-30 (2): checkout passou a reaplicar `PricingPromotion` (antes só valia na vitrine) e a
  atualizar `orders_count`/`total_spent`/`loyalty_tier` do cliente a cada pedido — ver
  [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR]].
- 2026-07-30: cupom deixou de ser client-trusted — checkout agora valida e precifica via `CouponService` compartilhado com o PDV; detalhe completo em [[Modulo_CRM|Módulo CRM]].
- 2026-07-25: nota criada — documentação do estado atual do módulo.