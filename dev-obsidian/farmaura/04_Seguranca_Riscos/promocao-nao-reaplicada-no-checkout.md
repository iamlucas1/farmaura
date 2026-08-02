# Promoção dinâmica por perfil só valia na vitrine, nunca era reaplicada no checkout

**Tipo:** Risco identificado
**Severidade:** Alta
**Status:** Mitigado
**Data de identificação:** 2026-07-30

## Descrição

`catalog_service.py::_apply_personalized_promotions` já resolvia a melhor `PricingPromotion` para
cada cliente autenticado e sobrepunha `price`/`old_price`/`discount_percent` **só na listagem do
catálogo** (`GET /catalog`). `order_service.py::create_marketplace_order` montava os itens do
checkout a partir de `build_marketplace_catalog_groups(inventory_items)` diretamente sobre o
inventário — sem nunca consultar `pricing_promotion_service`. O preço com desconto que o cliente via
navegando no marketplace podia divergir do total efetivamente cobrado no checkout: uma promoção
configurada no admin simplesmente não valia na hora de pagar.

Achado durante o levantamento para a feature de segmentação avançada de promoções pedida pelo
usuário (selo de fidelidade, visibilidade deslogada, modo superpromoção etc.) — o pedido de "fazer o
precificador já levar isso em conta no momento do cálculo do valor do produto" expôs a lacuna.

## Impacto

Cliente via um preço promocional na vitrine e era cobrado o preço cheio (ou um desconto diferente,
manual, se configurado) no checkout — quebra de confiança/experiência, e possível questionamento
comercial ("o app mostrou um preço e cobrou outro"). Diferente do caso análogo de cupom
([[cupom-validado-so-no-client]]), aqui não havia vetor de manipulação pelo cliente a favor dele —
o problema era o inverso: a promoção configurada pelo lojista simplesmente não surtia efeito real.

## Mitigação / Tratamento

Implementado em 2026-07-30. A lógica de "resolver perfil do cliente → achar melhor promoção → aplicar
preço, nunca abaixo do desconto manual já configurado" foi extraída para
`pricing_promotion_service.py::apply_promotion_to_catalog_item`, e passou a ser chamada nos dois
pontos — `catalog_service.py` (listagem) **e** `order_service.py::create_marketplace_order`
(checkout, via novo método `_apply_pricing_promotions`) — sobre a mesma estrutura de item agrupado.
Uma única função, um único resultado possível: o preço que o cliente vê é sempre o preço cobrado. Ver
[[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR completo]].

## Referências

`farmaura-api/app/services/pricing_promotion_service.py` (`apply_promotion_to_catalog_item`, dono
único da regra), `farmaura-api/app/services/catalog_service.py` (listagem),
`farmaura-api/app/services/order_service.py` (`_apply_pricing_promotions`, checkout).

## Atualizações

- 2026-07-30: risco identificado e mitigado na mesma sessão — ver ADR linkado acima para o detalhe
  completo da correção.
