---
cssclasses: ia-nota
---

# 2026-09-20 — Despachar já distribui a parada pelo entregador mais próximo; zoom do mapa parou de resetar sozinho

## Contexto

Dois relatos do usuário na mesma tela ("Entregas & rota"): (1) "Quando eu aproximo no mapa para visualizar, está voltando o zoom automaticamente" — zoom manual sendo desfeito sozinho; (2) "Quando despachei uma nova entrega, não foi atualizado no mapa, no caso sempre que for despachado já deverá ser distribuído entre os entregadores os pedidos, fazendo com que as rotas próximas sejam repassadas para o mesmo entregador, fazendo uma distribuição otimizada entre os motoboys" — pedido explícito de auto-distribuição por proximidade no momento do despacho.

## Achado 1: zoom manual sendo desfeito a cada re-render, não só a cada mudança real

`RouteMap` chamava `map.fitBounds(...)` toda vez que seu `useEffect` principal rodava, e esse efeito reexecuta em qualquer novo array de `routes`/`unplannedStops` — que `DeliveriesScreen` recria (`.map()`/`.filter()`, sem `useMemo`) a cada re-render, inclusive os disparados por poll de posição do entregador a cada 10s sem nenhum dado de rota ter de fato mudado. Cada poll silencioso resetava o zoom/pan que o operador tinha acabado de ajustar manualmente.

**Corrigido**: uma assinatura de conteúdo (`lat,lng` de cada ponto — hub, paradas de rota, pendentes — ordenada e concatenada) guardada num `ref`; `fitBounds`/`setView` só rodam quando essa assinatura muda de verdade, não a cada re-render. Verificado via interceptação das requisições de tile do OpenStreetMap (o `z` na URL é o zoom real do Leaflet): zoom manual 11→16, mantido em 16 depois de esperar um ciclo completo de poll (12s).

## Achado 2: uma entrega só virava parada de rota na *criação* do pedido, nunca no despacho — e sempre na mesma rota "ativa", sem nenhum critério de proximidade

`DeliveryPricingService.attach_route_stop` (compartilhado entre pedido de marketplace e venda PDV) sempre existiu, mas rodava no **momento errado** para pedidos de marketplace: `OrderService._attach_delivery_route_stop` era chamado durante a **criação** do pedido (`status='new'`, antes até da separação começar), não no despacho. E a escolha de rota (`OrderRepository.get_active_delivery_route`) sempre pegava **a única rota "ativa" mais recente** do estoque, sem olhar proximidade nem quantos entregadores estavam de fato trabalhando — resquício de quando só existia uma rota por loja, nunca atualizado durante a reforma multi-entregador de ontem ([[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR]]).

Consequência prática: depois de um "Planejar rotas" (que aposenta rotas antigas e cria N novas), qualquer pedido novo caía sempre na mesma rota (a mais recente), não na mais próxima — o oposto de "distribuição otimizada entre os motoboys".

**Corrigido**:

1. **Gatilho movido para o despacho real**: `OrderService.advance_internal_order`, especificamente na transição `ready → dispatched` de um pedido `fulfillment_type == 'delivery'`, agora chama `_attach_delivery_route_stop` — a parada só existe a partir do momento em que o pedido de fato sai da farmácia com um entregador, não desde que foi feito. Removida a chamada equivalente na criação do pedido.
2. **Seleção por proximidade real**: novo `DeliveryPricingService._select_or_create_route` — entre as rotas ativas da loja **que já têm entregador**, calcula a distância haversine do novo endereço até a parada mais próxima de cada rota (ou até a própria loja, se a rota ainda não tem nenhuma parada real) e escolhe a rota mais próxima. Sem nenhuma rota com entregador disponível, cria uma rota nova sem entregador (o operador atribui pelo dropdown já existente), exatamente como antes.
3. **Idempotência**: novo `OrderRepository.get_undelivered_route_stop_by_order_id` — `attach_route_stop` não faz nada se o pedido já tem uma parada não entregue em algum lugar (ex: já tinha sido anexado manualmente via "Planejar rotas" enquanto ainda pendente, e só agora chega ao despacho) — nunca duplica a parada.
4. **Filtro de visibilidade da rota corrigido**: `DeliveryService.list_active_routes` só mostrava paradas de pedidos com `status` em `new/separating/ready` — como agora a parada só existe a partir de `dispatched`, esse filtro escondia a própria parada que acabou de ser criada. Trocado para: pedido ativo (`is_active`) e ainda não `delivered` — `dispatched` (o estado normal de "saiu para entrega, ainda não chegou") volta a aparecer.
5. **Frontend atualiza sem reload**: `advanceOrder` (usado tanto pelo botão individual quanto por "Despachar entregas prontas") agora rebusca `GET /deliveries/routes` (`refreshDeliveryRoutes`, novo) sempre que a transição é para `dispatched` num pedido de entrega — o mapa/cards de rota refletem a nova parada na mesma sessão da SPA, sem precisar de outra ação ou de recarregar a página.

`app/repositories/order_repository.py` perdeu `get_active_delivery_route` (única chamadora removida) — a plural `list_active_delivery_routes` (de ontem) já cobre tudo.

## Consequências

- Testado direto contra o container: pedido `FA-1120` despachado numa loja com duas rotas ativas (`ROT-101`, `ROT-1002`, mesmo entregador) — a parada nova foi para `ROT-101` por ter uma parada existente a ~1,8 km, contra `ROT-1002` bem mais distante. Confirmado via SQL direto (`delivery_route_stops.route_id`).
- Testado idempotência: pedido planejado manualmente via "Planejar rotas" enquanto `new`, depois avançado até `dispatched` pelas três transições — permanece com uma única linha de parada, mesmo id, mesma rota.
- Testado ponta a ponta via Playwright (UI real, sem atalho de API): despachar um pedido pela modal do pedido, voltar para "Entregas & rota" pela navegação da própria SPA (sem reload) — a rota já aparece com a parada nova, contagem de paradas atualizada, linha real de estrada no mapa.
- Efeito colateral aceito: `route.total_distance_km`/`total_min` gravados incrementalmente em `attach_route_stop` continuam sendo só uma estimativa em cache — `list_active_routes` já recalcula os números reais (Dijkstra + OSRM) a cada leitura, então a imprecisão do valor gravado nunca chega à tela (mesma decisão já registrada em [[2026-09-19-entregas-rota-otimizacao-real-e-correcoes|ADR anterior]]).
- Escopo não coberto: nenhum limite de distância máxima foi aplicado à escolha "rota mais próxima" (sempre escolhe a mais próxima entre as que têm entregador, mesmo que distante) — se isso se mostrar um problema real (ex: forçar um motoboy a atravessar a cidade toda por não haver alternativa mais perto), fica como ajuste futuro, não implementado agora por falta de um critério de corte óbvio sem mais dados de uso real.

## Ver também

- [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR de ontem]] — o sistema multi-rota que este ADR conecta corretamente ao ciclo de vida real do pedido.
- [[2026-09-20-entregas-rota-real-via-osrm-e-mapa-mostra-todos-os-pendentes|ADR anterior de hoje]] — roteirização real via OSRM e exibição de pendentes no mapa, ambos usados pela mesma tela.
- [[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|Pendência original]] — atualizada.
