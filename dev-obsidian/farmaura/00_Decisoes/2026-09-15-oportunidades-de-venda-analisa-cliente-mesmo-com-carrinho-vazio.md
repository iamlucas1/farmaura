# 2026-09-15 — "Oportunidades de venda" analisa o cliente identificado mesmo com carrinho vazio

## Contexto

Com carrinho vazio, o painel usava uma lista local, calculada no navegador (mais vendidos gerais do estoque), mesmo quando o cliente já estava identificado — ignorando o histórico dele até o primeiro item entrar no carrinho. Pedido: com carrinho vazio e cliente identificado, já analisar o histórico pessoal dele; sem cliente identificado e carrinho vazio, não inventar uma lista genérica — mostrar um aviso claro pro funcionário de que não há o que analisar ainda.

## Decisão

- `PdvUpsellSuggestionRequest` (`app/schemas/pdv.py`) deixou de exigir `cart_items` não-vazio — agora aceita carrinho vazio desde que `customer_id` esteja preenchido (validado via `@model_validator`: rejeita só a combinação carrinho vazio + sem cliente).
- `PurchaseHistoryService.get_cart_upsell_suggestions`: o corte antecipado que devolvia lista vazia sem `cart_pairs` agora só acontece se também não houver `customer_id`. Com carrinho vazio e cliente identificado, os dois sinais de co-compra (que dependem do carrinho) naturalmente não contribuem nada — a lista vem só do perfil de compra e da recorrência do cliente.
- Frontend (`point-of-sale-screen.jsx`): a lista local (`pdvSuggestions`, cold-start com mais vendidos genéricos) foi **removida por completo** — o painel agora sempre vem do backend. Com carrinho vazio e sem cliente identificado, mostra "Identifique o cliente ou adicione um produto ao carrinho para ver oportunidades de venda." em vez de qualquer lista.
- `pdvFetchUpsellSuggestions` (`internal-app.jsx`): o guard que bloqueava a chamada com carrinho vazio agora permite quando há `customerId`.

## Consequências

- Testado ponta a ponta via Chrome headless: (1) sem cliente + carrinho vazio → mensagem de aviso, nenhuma sugestão; (2) Mariana Souza identificada + carrinho vazio → sugestões baseadas só no histórico dela (Vitamina D3, sua recorrência real, em primeiro lugar); (3) primeiro item adicionado → segue o fluxo já existente (co-compra com o carrinho), sem regressão.
- `pdvSuggestions` (função local) foi removida do arquivo por ficar sem nenhum uso — não havia outro consumidor no repositório (confirmado por busca antes de remover).

## Ver também

- [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv]] — ADR do motor de recomendação (os quatro sinais).
- [[2026-09-15-oportunidades-de-venda-5-inline-mais-modal-com-15]] — ADR do limite de 5 + modal com 15.
