# Cupom não pode ser aplicado direto na página do produto (só no carrinho/checkout)

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-31

## Descrição

O demo de referência ("Padrão farmácia") tem uma caixa de cupom (input + "Aplicar") na própria
página do produto, ao lado do contador de quantidade. Ao portar o novo visual da PDP para
`screens/product-screen.jsx` (ver
[[../00_Decisoes/2026-08-31-pagina-de-produto-redesenhada-conforme-demo|ADR]]), esse elemento
foi deliberadamente **omitido**, não fabricado: cupom hoje só é validado de verdade no servidor
via `CouponService`, chamado no carrinho/checkout — não existe (nem seria trivial adicionar sem
mudar o fluxo de preço) uma forma de "aplicar" um cupom isolado num único item antes dele estar
no carrinho. Um campo que aceitasse o clique e não fizesse nada real seria simular uma feature
que não existe, o que o `PRODUCT.md` proíbe.

## Contexto

Se o produto quiser esse atalho de verdade, o caminho mais barato é o mesmo já usado em
`cart-screen.jsx` (`resolveMarketplaceCoupon`): um **preview client-side** contra a lista real de
cupons já presente no bootstrap do marketplace (nunca fonte de verdade — a aplicação real
continua exigindo `CouponService` no carrinho/checkout, ver
[[../04_Seguranca_Riscos/cupom-validado-so-no-client|princípio já estabelecido]]). Isso decidiria
"esse cupom parece aplicável a este produto" sem cobrar nada — decisão de produto sobre se vale a
pena, não foi pedida nesta leva.
