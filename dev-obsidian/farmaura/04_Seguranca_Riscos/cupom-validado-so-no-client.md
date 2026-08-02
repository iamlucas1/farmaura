# Cupom de desconto validado só no client, sem revalidação server-side no checkout

**Tipo:** Risco identificado
**Severidade:** Alta
**Status:** Mitigado
**Data de identificação:** 2026-07-25

## Descrição

No checkout do marketplace (`OrderService.create_marketplace_order`), o cliente já chega com o cupom resolvido: o frontend (`cart-screen.jsx`/`coupons-screen.jsx`) calcula elegibilidade (código válido, vigência, escopo por categoria/produto, público-alvo — primeira compra/recorrente, valor mínimo, empilhamento) e o valor do desconto, enviando `coupon_type`/`coupon_percent`/`coupon_amount` já prontos no payload de `POST /orders`. O backend **nunca busca `CouponCampaign` no banco nem revalida nenhuma dessas regras** — apenas reaplica a fórmula (percent/fixed/shipping) sobre o subtotal e frete calculados server-side. `coupon_campaigns.usage_count` também nunca é incrementado em lugar nenhum do backend.

Achado durante o levantamento para [[../02_Documentacao/Modulo_Carrinho_Pedidos|Modulo_Carrinho_Pedidos]] e [[../02_Documentacao/Modulo_CRM|Modulo_CRM]] (dono do cadastro de cupons).

## Impacto

Um cliente que manipule o payload de checkout diretamente (sem passar pela UI) pode, em teoria, enviar qualquer `coupon_percent`/`coupon_amount`/`coupon_type` sem que exista um cupom real, ativo, dentro da vigência ou aplicável àquele carrinho — o servidor aplica o desconto informado sem checar a origem. Também não há enforcement de `usage_limit`/`per_customer_limit`, então mesmo um cupom legítimo pode ser reutilizado além do limite configurado sem que o backend perceba.

## Mitigação / Tratamento

Implementado em 2026-07-30. `app/services/coupon_service.py` (novo) passou a ser a única fonte de
verdade: busca `CouponCampaign` pelo `coupon_code`, trava a linha (`with_for_update`) e revalida
tudo server-side — vigência, `usage_limit`, escopo por categoria/produto, público-alvo (agora somando
histórico de `Order` **e** `PdvSale` por cliente), teto de desconto e valor mínimo — antes de calcular
o desconto a partir da campanha persistida. O cliente manda só `coupon_code`; os campos
`coupon_percent`/`coupon_amount`/`coupon_type` foram removidos de `CheckoutOrderRequest`.
`coupon_campaigns.usage_count` agora incrementa atomicamente no commit final do pedido (marketplace)
ou da venda (PDV, ver abaixo), nunca antes disso — um pedido cancelado antes de fechar nunca infla o
contador. `per_customer_limit` também passou a somar as duas origens de pedido, então trocar de canal
não contorna o limite.

De quebra do mesmo trabalho, cupom passou a existir também no PDV (não existia antes — só desconto
manual em percentual), com `channel_scope` permitindo restringir um cupom a um canal só. Ver
[[../00_Decisoes/2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR completo]].

## Referências

`farmaura-api/app/services/coupon_service.py` (validação/precificação, dono único da regra),
`farmaura-api/app/services/order_service.py` (canal online), `farmaura-api/app/services/pdv_service.py`
(canal PDV — `create_queue_order`/`complete_sale`), `farmaura-api/app/services/portal_service.py` (CRUD
de `coupon_campaigns`), `farmaura/react/marketplace/screens/cart-screen.jsx` (`resolveMarketplaceCoupon`,
mantido como preview client-side, não mais fonte de verdade).

## Atualizações

- 2026-07-30 (2): princípio geral por trás desta correção formalizado em [[backend-e-fonte-unica-de-verdade-nunca-confiar-no-client]] — este caso é o exemplo concreto referenciado lá.
- 2026-07-30: risco mitigado — validação e precificação de cupom movidas para o servidor
  (`CouponService`, compartilhado entre marketplace e PDV); ver ADR linkado acima para o detalhe
  completo da mudança.
- 2026-07-25: nota criada, a partir do levantamento feito para documentar os módulos Carrinho/Pedidos e CRM.
