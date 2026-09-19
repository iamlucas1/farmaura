---
cssclasses: ia-nota
---

# 2026-09-19 — "Oferecer" no caixa sem tarjados: card liberado + RLS que deixava o caixa cego pra sugestões

## Contexto

Pedido do usuário: "Faça aparecer o Oferecer também para a tela do caixa mas sem os produtos que sejam tarjados" — o card "Oportunidades de venda" (upsell, botão "Oferecer") só aparecia na visão do farmacêutico; o caixa nunca via nenhuma sugestão de venda.

## Parte 1 — liberar o card no caixa, sem tarja

Três mudanças pequenas, direto ao ponto:

1. **Backend passou a marcar cada sugestão como controlada ou não**: `UpsellSuggestion` (`purchase_history_service.py`) ganhou `is_controlled: bool`, preenchido a partir de `InventoryItem.is_controlled` (que já delega pra `product.is_controlled`) — não precisou de query nova, o dado já vinha resolvido. `PdvUpsellSuggestionItemResponse` (`schemas/pdv.py`) e `pdv_service.get_upsell_suggestions` repassam o campo.
2. **Frontend mapeou o campo** em `pdvFetchUpsellSuggestions` (`internal-app.jsx`) como `controlled`, e `point-of-sale-screen.jsx` trocou a renderização condicional do `PdvUpsell` (antes só `operator === "pharm"`) por incondicional, com filtro `operator === "caixa" ? upsellSuggestions.filter(it => !it.controlled) : upsellSuggestions`. `PdvRecurrenceSuggestions` (bloco de recorrência/assinatura) ficou de fora de propósito — não foi pedido e é uma decisão de farmacêutico, não de caixa.
3. **Achado no meio do caminho, mesmo bug de sempre**: `POST /pdv/upsell-suggestions` estava restrito a `admin/manager/pharmacist` — cashier tomava 403 (mesmo padrão já visto em [[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa]] e nas policies de RLS abaixo). Adicionado `UserRole.CASHIER` ao decorator da rota.

## Parte 2 — o achado real: RLS deixava a sugestão sempre vazia pro caixa

Depois do fix acima, a rota respondia `200 {"items": []}` pro caixa mesmo pra clientes com histórico de compra real e óbvio (confirmado comparando: a mesma cliente mostrava 4 sugestões reais na tela do farmacêutico segundos antes, e nada na tela do caixa depois de assumir o mesmo pedido). Não era sobre carrinho, nem sobre o filtro de tarja — era antes disso, na camada de RLS do Postgres.

**Causa raiz**: as policies de `pdv_sales`/`pdv_sale_items` só deixam um `cashier` enxergar vendas que ELE MESMO processou (`cashier_user_id = current_user_id()`); e as policies de `orders`/`order_items` (pedidos do marketplace) excluem `cashier` inteiramente — só `admin/manager/pharmacist` (via `can_access_order_row`/`can_access_customer_row`). `get_customer_purchase_summary` e `get_cart_upsell_suggestions` (`purchase_history_service.py`) leem exatamente essas tabelas pra montar os sinais de "produtos mais comprados", recorrência e co-compra — pro caixa, o RLS filtrava essas linhas antes mesmo do algoritmo rodar, então o sinal chegava zerado quase sempre (só funcionava se o próprio caixa logado tivesse processado pessoalmente toda a história daquele cliente, o que numa farmácia com vários operadores é raro). Confirmado no banco: a única venda da cliente-teste (Lucas Andrade) tinha sido processada por outro caixa (Caio Martins), não pela conta usada no teste (Alice Ferraz) — daí o vazio.

Mesmo problema também já afetava `GET /crm/customers/{id}/purchase-insights` (`crm_service.get_purchase_insights`, que chama o mesmo `get_customer_purchase_summary`), rota que já permite `cashier` — só não tinha sido notado ainda porque não há tela de caixa que chame esse endpoint hoje.

### Decisão

Perguntei ao usuário como tratar (widening de RLS por policy vs. deixar como está vs. consulta elevada só pra esse cálculo) — escolheu **consulta elevada, restrita a essa leitura agregada**, sem tocar nas policies gerais de RLS que protegem o caixa de navegar vendas/pedidos crus de outros operadores.

Implementado como `PurchaseHistoryService._elevated_for_cashier()` (novo, `purchase_history_service.py`): context manager que, só quando o role atual da sessão é `cashier`, troca `app.current_user_role` pra `pharmacist` (`set_config(..., true)`, transaction-local) só ao redor das leituras de histórico — `get_customer_purchase_summary` (order_items, sale_items, active_subscriptions) e `get_cart_upsell_suggestions` (co-compra global, co-compra pessoal, favoritos/desejados/visualizações) — restaurando o role original logo depois, em `finally`. Pra qualquer outro role (admin/manager/pharmacist) é no-op — não altera o comportamento de ninguém que já tinha acesso, evita especificamente o risco de "rebaixar" um admin (sem `store_id` fixo) pra regras de pharmacist (que exige `store_id` igual ao da sessão) e quebrar o próprio fluxo do admin.

O resultado nunca expõe a linha crua de pedido/venda/cliente pro caixa — só o nome do produto já resolvido contra o estoque real da própria loja (`PdvUpsellSuggestionItemResponse`), o mesmo formato que já ia pro farmacêutico.

## Consequências

- Testado ponta a ponta como Alice (cashier): chamada direta em `POST /pdv/upsell-suggestions` com a cliente Lucas Andrade passou de `{"items": []}` pra 4 sugestões reais (Paracetamol, Amoxicilina, Dipirona, Simeticona) — idêntico ao que o farmacêutico via.
- Confirmado também na UI real: caixa assume pedido da fila (Larissa Barbosa), card "Oportunidades de venda" aparece com sugestão real e botão "Oferecer".
- Build do frontend OK; `farmaura-api` reconstruído e validado.
- Não foi testado ao vivo o filtro de tarja com um item controlado de verdade na sugestão (não havia, no momento do teste, nenhuma venda real na loja de teste com item controlado) — a correção do campo `is_controlled`/`controlled` foi verificada por leitura de código (schema, mapeamento, filtro) e por consulta direta ao banco confirmando que a coluna `is_controlled` é populada corretamente (ex.: Clonazepam = true, Dipirona = false), não por reprodução visual do caso "sugestão tarjada some no caixa".

## Ver também

- [[2026-09-18-recusa-de-receita-nao-fazia-nada-para-caixa]] — mesmo padrão de bug (rota excluindo `cashier`) encontrado antes, na tela de receitas.
- [[2026-09-19-erro-failed-to-fetch-na-maquininha-traduzido]] — outro fix da mesma sessão, tela do caixa.
- [[2026-09-19-seletor-farmaceutico-caixa-so-para-admin-gerente]] — trava do seletor de visão farmacêutico/caixa, mesma sessão.
