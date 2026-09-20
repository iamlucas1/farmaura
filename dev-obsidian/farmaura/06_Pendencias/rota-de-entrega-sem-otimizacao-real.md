---
cssclasses: ia-nota
---

# Rota de entrega sem otimização/roteirização real, apesar da UI sugerir

**Status:** Majoritariamente resolvido — reordenação/distância real corrigidas em 2026-09-19; mesmo dia, ordenação evoluiu para Dijkstra bidirecional sobre grafo de proximidade + planejamento multi-entregador/multi-loja; em 2026-09-20, o traçado exibido no mapa passou a seguir ruas reais via OSRM e o próprio anexo de parada passou a ser por proximidade real no momento do despacho, não mais "sempre a mesma rota" na criação do pedido (ver atualizações); um achado relacionado segue aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-25

## Descrição

O frontend do console interno (`deliveries-screen.jsx`) exibe linguagem de produto como "Melhor rota planejada" e "Rota otimizada economiza ~X km", mas o backend nunca calculava uma rota otimizada de fato: `DeliveryPricingService.attach_route_stop` só fazia `append` de cada novo pedido na sequência da rota, na ordem em que ficavam prontos para despacho — sem TSP, sem reordenação por distância. Os campos `saved_distance_km`/`estimated_duration_minutes` de `DeliveryRoute` nunca eram escritos em lugar nenhum do backend (só existiam como valor fixo no seed), então o "~X km economizados" mostrado na tela era sempre o mesmo número hardcoded, nunca um cálculo real.

**Corrigido em 2026-09-19** (ver [[../00_Decisoes/2026-09-19-entregas-rota-otimizacao-real-e-correcoes|ADR]]): agora existe reordenação real por nearest-neighbor (`app/domain/geo.py`) e distância/tempo/economia calculados de verdade — mas a decisão de arquitetura foi computar isso **na leitura**, não persistir em `DeliveryRoute.saved_distance_km`/`estimated_duration_minutes` (essas colunas continuam sem uso real — o cálculo roda no cliente, sobre a lista de paradas que a tela já exibe, para não depender de qual `DeliveryRoute` específica o backend escolher). `route_polyline`/`vehicle_label` continuam sem uso.

**Atualizado em 2026-09-19** (ver [[../00_Decisoes/2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR]]): a ordenação nearest-neighbor euclidiana foi substituída por busca de Dijkstra bidirecional sobre um grafo de proximidade k-vizinhos (`app/domain/geo.py`), e o sistema passou a suportar planejar N rotas simultâneas (uma por entregador, via `POST /deliveries/routes/plan`) com divisão geográfica por sweep clustering (fatias angulares a partir da loja) — cada entregador vinculado à sua própria loja (`User.store_id`), rejeitando planejamento/atribuição cross-loja. `route_status` agora **transiciona de fato** (`"planned"` → `"superseded"` ao replanejar), resolvendo parcialmente o primeiro achado abaixo.

**Atualizado em 2026-09-20** (ver [[../00_Decisoes/2026-09-20-entregas-rota-real-via-osrm-e-mapa-mostra-todos-os-pendentes|ADR]]): o traçado desenhado no mapa deixou de ser sempre uma linha reta entre paradas — `DeliveryService.list_active_routes` agora pede a geometria real de condução ao OSRM (`app/services/routing_client.py`, ver [[../05_Integracoes_Infra/Roteirizacao_OSRM|Roteirizacao_OSRM]]) para a ordem de visita já decidida pelo grafo de proximidade, e usa a distância/duração reais de estrada quando o OSRM responde (cai de volta para a aproximação haversine quando não responde). A busca de *ordem* em si continua sobre o grafo haversine (sem dado de rua real) — só o traçado final exibido passou a ser real.

**Atualizado em 2026-09-20 (2)** (ver [[../00_Decisoes/2026-09-20-despacho-anexa-parada-por-proximidade-e-zoom-do-mapa-nao-reseta|ADR]]): `DeliveryPricingService.attach_route_stop` — a peça que faltava desde o início desta pendência — deixou de anexar a parada na *criação* do pedido sempre na mesma rota "ativa" mais recente (resquício de antes do multi-entregador) e passou a anexar no *despacho* (`ready → dispatched`), escolhendo a rota ativa geograficamente mais próxima entre as que já têm entregador. Também corrigido: `list_active_routes` escondia a própria parada recém-criada (filtrava por status do pedido em vez de status da parada) e o frontend não rebuscava as rotas depois de despachar, deixando o mapa desatualizado até outra ação ou reload.

Achado relacionado, **ainda aberto**:
- `navigation_url` de `DeliveryRouteStop` nunca é populado — o frontend sempre cai no fallback de deep-link do Google Maps (que funciona, com coordenadas reais, mas não é o campo dedicado).

## Contexto

Encontrado ao documentar [[../02_Documentacao/Modulo_Entrega|Modulo_Entrega]]. Não é uma decisão registrada em nenhum ADR — parece lacuna de implementação (feature de produto sinalizada na UI, sem o motor correspondente no backend), não uma limitação aceita conscientemente. Prioridade baixa porque não impede a operação (entregas continuam funcionando, só sem otimização real de sequência).