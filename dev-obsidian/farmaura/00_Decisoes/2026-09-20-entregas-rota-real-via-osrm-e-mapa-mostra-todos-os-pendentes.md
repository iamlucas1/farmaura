---
cssclasses: ia-nota
---

# 2026-09-20 — Entregas & Rota: linha real via OSRM, mapa mostra os 9 pendentes (não só 1), modal não fica mais atrás do mapa

## Contexto

Dois relatos do usuário na mesma tela, com print de tela do segundo: (1) a modal de preferências (tema/notificações) renderizava atrás do mapa Leaflet; (2) a rota no mapa era sempre uma linha reta entre a loja e a parada, "em vez de seguir o caminho de fato das ruas ou estradas", e o mapa mostrava só 1 entrega apesar do cabeçalho dizer "9 entregas pendentes".

## Achado 1: modal atrás do mapa — z-index do Leaflet escapando do card

O `<div>` que hospeda o mapa (`elementRef`, em `RouteMap`, `deliveries-screen.jsx`) usava só `className="card"`, sem `position` nem `z-index` próprios. O Leaflet aplica `position: relative` ao seu container mas não define `z-index` nele — como esse ancestral não cria um contexto de empilhamento próprio, os elementos internos do Leaflet (`.leaflet-top`/`.leaflet-bottom`, controles de zoom, `z-index: 1000` no CSS padrão da lib) comparavam diretamente contra `.modal-overlay` (`z-index: 100`) na raiz da página — e venciam.

**Corrigido**: nova classe `.route-map-card` (`internal.css`) com `position: relative; isolation: isolate;`, aplicada ao mesmo `<div>` do mapa. `isolation: isolate` cria um contexto de empilhamento novo sem precisar escolher um valor de `z-index` arbitrário — confina todo o z-index interno do Leaflet dentro do próprio card.

## Achado 2: rota sempre em linha reta — nunca existiu integração de roteirização real

Já era um limite conhecido e documentado (`app/domain/geo.py`, seção "Observations": *"none of this models real streets... edge weights are still straight-line haversine distances"*) — o Dijkstra bidirecional sobre o grafo de proximidade (ver [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR de ontem]]) decide **a ordem** de visita usando distância haversine, não decide **o traçado real** — nunca existiu chamada a um provedor de roteirização de verdade.

**Corrigido**: novo cliente `app/services/routing_client.py` (`RoutingClient`), consumindo a API pública do OSRM (`router.project-osrm.org/route/v1/driving/...`) — mesma postura já aceita para geocodificação (sem API key, serviço público OpenStreetMap, sem SLA contratado; ver [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]]). Chamado de `DeliveryService.list_active_routes` (`await asyncio.to_thread(RoutingClient().route, ...)`, mesmo padrão já usado para `GeocodingClient`) **depois** que a ordem de visita já foi decidida pelo grafo — o OSRM não resolve ordem, só pega a sequência já pronta e devolve geometria/distância/duração reais de estrada. Falha fechado: se o OSRM não responder, mantém o comportamento anterior (linha reta, distância haversine) sem quebrar a tela.

Testado direto contra o container (rota real do seed, 1 parada): distância haversine reportava `0.82 km`; a distância real de estrada via OSRM veio `1.75 km`, com `18` pontos de geometria (não 2) — confirma que o traçado agora segue ruas de verdade, não a linha direta.

Schema novo: `DeliveryRouteResponse.geometry` (lista de `{lat, lng}`) — vazio quando o OSRM não respondeu, e nesse caso o frontend cai de volta pro traçado reto ponto-a-ponto exatamente como antes. `total_km`/`total_min` de cada rota passam a refletir a distância/duração real de condução quando o OSRM responde, em vez da estimativa haversine + "22 km/h + 5 min/parada".

## Achado 3: só 1 entrega no mapa — dois bugs empilhados, não um só

### 3a. O mapa nunca desenhava as entregas "aguardando planejamento"

`RouteMap` só recebia `routes` (rotas já planejadas) — as 8 dos 9 pedidos pendentes que ainda não entraram em nenhuma rota (lista "Aguardando planejamento" na barra lateral) nunca tinham marcador nenhum no mapa, só apareciam como linha na lista.

**Corrigido**: novo prop `unplannedStops` em `RouteMap`, populado com `unplannedOrders` (que a tela já calculava para a lista lateral). Marcador novo, neutro, sem número (`createUnplannedIcon` — ponto cinza simples, sem linha conectando), para diferenciar visualmente de uma parada já roteirizada.

### 3b. `unplannedOrders` comparava um UUID contra um código de pedido — nunca excluía nada de verdade

Ao ligar o prop novo, a verificação (`docker compose exec` + Playwright real) mostrou 9 marcadores em vez dos 8 esperados (1 rota + 8 não planejados) — a mesma parada aparecia duas vezes. Causa raiz: `stop.orderId` (de `DeliveryRouteStop.order_id`) é o **UUID** real do pedido; `order.id` (de `normalizeOrdersPayload`) é o **código** do pedido (`FA-1005`) — o UUID de verdade vem em `order.recordId`. `plannedOrderIds.has(order.id)` comparava tipos de identificador diferentes e nunca batia com nada, então **nenhum** pedido já roteirizado era excluído da lista "aguardando planejamento" — bug preexistente (de antes desta sessão), só nunca visível porque o mapa não desenhava essa lista até o achado 3a acima.

O mesmo bug, mesma causa, apareceu em mais dois pontos do `RouteCard` (`orders.find((o) => o.id === stop.orderId)`): o ícone de prioridade/badge de status de cada parada da rota nunca resolvia o pedido correspondente (sempre `null`), e o botão de chat de uma parada de rota nunca aparecia (`onChat` sempre `undefined`) — o clique para abrir o pedido também nunca funcionava (`openOrder(stop.orderId)` passava um UUID para uma função que espera o código).

**Corrigido**: as três comparações passaram a usar `order.recordId === stop.orderId` (o par de UUIDs de verdade), e `openOrder` passou a receber `order.id` (o código) quando o pedido é encontrado.

## Consequências

- Verificado ponta a ponta via Playwright contra o Docker local: "9 entregas pendentes" agora bate exatamente com "1 parada numerada + 8 pontos cinza" no mapa — nenhum a mais, nenhum a menos.
- Efeito colateral positivo: o card de cada rota agora mostra corretamente prioridade/status/botão de chat por parada, o que estava quebrado silenciosamente desde que essas colunas foram adicionadas.
- `route_provider` de uma rota antiga do seed (`"seed-routing"`) não reflete o novo provedor real — só rotas recalculadas por `list_active_routes`/`plan_routes` depois desta mudança carregam geometria real; o campo `provider` da resposta continua sendo o que foi gravado em `DeliveryRoute.route_provider` na criação da rota, não indica se a *leitura atual* teve sucesso no OSRM.
- Sem migration — mudança de schema de resposta (campo novo com default vazio) e lógica de aplicação, sem nova coluna de banco.

## Ver também

- [[2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR de ontem]] — o grafo de proximidade e o Dijkstra bidirecional que decidem a ordem de visita continuam exatamente como estavam; esta mudança só adiciona o traçado real por cima da ordem já decidida.
- [[../06_Pendencias/rota-de-entrega-sem-otimizacao-real|Pendência original]] — atualizada: a limitação "não modela ruas reais" deixa de ser válida para o traçado exibido (ainda vale para a busca de *ordem*, que segue sobre o grafo haversine).
- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]] — mesmo padrão de API pública sem chave, agora replicado para roteirização.
