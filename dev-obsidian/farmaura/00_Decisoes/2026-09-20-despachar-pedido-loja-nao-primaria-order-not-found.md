---
cssclasses: ia-nota
---

# 2026-09-20 — "Order not found" ao despachar pedido de uma loja não-primária: override de loja do admin nunca chegava às escritas de pedido

## Contexto

Relato do usuário: "Tentei despachar um pedido para entrega para testar mais de uma [rota] e me gerou este erro Order not found." — testando o trabalho de ontem (múltiplas rotas simultâneas, multi-loja, ver [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR]]), o que exige ter pedidos pendentes em mais de uma loja ao mesmo tempo.

## Causa raiz

`OrderService._get_store_id(subject, *, requested_store_id="", allow_all_stores=False)` resolve a loja ativa nesta ordem: override explícito do admin (`requested_store_id`) → loja fixa do usuário (`subject.store_id`, o caso normal de gerente/farmacêutico/caixa) → (se `allow_all_stores`) todas as lojas sem filtro → **loja primária do tenant**, como último recurso. Um ADMIN não tem `subject.store_id` próprio (não está fixado a nenhuma loja) — então, sem `requested_store_id`, cai sempre no último recurso: a loja primária do tenant, **mesmo que o admin tenha selecionado outra loja no seletor da barra lateral**.

Dos oito usos de `_get_store_id` em `order_service.py`, só a listagem principal (`list_internal_board`, usada por `GET /orders/internal-board`) já repassava `requested_store_id` (e aceitava `allow_all_stores=True`). Os outros seis — `get_internal_board_changes` (polling da tela), `update_internal_order_item_location`, `update_internal_order_item_pick`, `confirm_internal_pickup`, `dispatch_shipping_order` e `advance_internal_order` (usado por "Despachar entregas prontas" e pelo avanço individual de status) — chamavam `_get_store_id(subject)` sem nenhum argumento. Resultado: um admin com "Farmaura Águas Claras" selecionada via pedidos listados corretamente (a listagem via `store_id` na URL funcionava), mas ao tentar **agir** sobre um desses pedidos (avançar status, confirmar retirada, despachar envio, gravar localização/picking de item), o backend resolvia a loja para "Farmaura Ponte Alta Norte" (primária) por baixo dos panos — `OrderRepository.get_by_id(..., store_id=<loja errada>)` não encontrava o pedido (que pertence à outra loja) e devolvia 404 "Order not found.".

Reproduzido diretamente contra o container: `POST /orders/{id}/advance` sem `store_id` → 404; o mesmo request com `?store_id=<loja real do pedido>` → 200.

## Correção

Repassar o `requested_store_id` até `_get_store_id` nos seis pontos que faltavam (mesmo padrão já usado em `list_internal_board`, e o mesmo padrão já usado em `DeliveryService._resolve_store_id`, ver [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR]]):

- `app/services/order_service.py`: `get_internal_board_changes`, `update_internal_order_item_location`, `update_internal_order_item_pick`, `confirm_internal_pickup`, `dispatch_shipping_order`, `advance_internal_order` — todos ganharam um parâmetro `requested_store_id: str = ""` e passaram a repassá-lo a `_get_store_id`. `get_internal_board_changes` também ganhou `allow_all_stores=True` (é leitura/polling, como sua irmã `list_internal_board` — não precisa resolver para uma loja concreta).
- `app/api/v1/orders.py`: os seis endpoints correspondentes ganharam `store_id: str = Query(default="", max_length=36)` e passaram a repassá-lo ao serviço.
- `farmaura/react/internal/core/internal-app.jsx`: as seis chamadas de frontend correspondentes (`advanceOrder`, `updateOrderItemLocation`, `toggleOrderItemPicked`, `confirmPickupCode`, `dispatchShippingOrder`, e o polling `pollBoardChanges`) passaram a usar `withStoreParam(...)` — o helper já existente que anexa `?store_id=` quando o admin tem uma loja específica selecionada — em vez de montar a URL sem esse parâmetro.

## Consequências

- Verificado ponta a ponta via Playwright contra o Docker local: login como admin, loja "Farmaura Águas Claras" selecionada explicitamente, abrir um pedido dessa loja em "Pronto" e clicar em despachar → `200 POST /orders/{id}/advance?store_id=<id da loja>`, toast de sucesso, status avança para "Despachado". Sem a correção, o mesmo fluxo reproduzia o 404 relatado.
- Gerente/farmacêutico/caixa nunca foram afetados por este bug — eles têm `subject.store_id` fixo (a própria loja), então `_get_store_id` já resolvia certo para eles independente de `requested_store_id`. O bug era exclusivo de sessões `ADMIN` olhando uma loja não-primária.
- Falha sempre fechada (404 "não encontrado"), nunca um vazamento cross-loja — o pedido de uma loja nunca era escrito/exposto para a loja errada, só ficava inacessível para a ação.
- **Escopo não coberto por esta correção**: não foi feita uma varredura dos outros serviços do backend (`inventory_service.py`, `pdv_service.py`, `crm_service.py`, etc.) atrás do mesmo padrão (`_get_store_id`/`_resolve_store_id` sem repassar override do admin numa escrita de registro único) — só `order_service.py` foi auditado, por ser onde o bug relatado ocorreu. Registrado como pendência para uma varredura dedicada.

## Ver também

- [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR de ontem]] — o trabalho multi-loja que tornou este bug visível pela primeira vez (antes, quase todo teste acontecia só na loja primária).
- [[../06_Pendencias/auditar-override-de-loja-do-admin-em-escritas-de-registro-unico|Pendência: auditar o mesmo padrão em outros serviços]].
