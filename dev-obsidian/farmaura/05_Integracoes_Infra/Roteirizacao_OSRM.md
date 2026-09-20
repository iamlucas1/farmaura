---
cssclasses: ia-nota
---

# Roteirização — OSRM (Open Source Routing Machine)

**Tipo:** API de terceiro

## Propósito

Resolve o traçado real de condução (geometria seguindo ruas/estradas) e a distância/duração reais para uma sequência de paradas de entrega já ordenada — usado pela tela "Entregas & rota" do console interno para desenhar a rota de verdade no mapa, em vez de uma linha reta entre pontos. Ver [[../00_Decisoes/2026-09-20-entregas-rota-real-via-osrm-e-mapa-mostra-todos-os-pendentes|ADR de introdução]].

## Contrato

- Cliente: `farmaura-api/app/services/routing_client.py` (`RoutingClient`).
- Base URL: `routing_base_url` em `app/core/config.py`, padrão `https://router.project-osrm.org`.
- Sem API key (serviço público, demo server do projeto OSRM) — mesma postura já aceita para geocodificação, ver [[Geocoding_Nominatim|Geocoding_Nominatim]].
- Endpoint usado: `GET /route/v1/driving/{lng1},{lat1};{lng2},{lat2};...?overview=full&geometries=geojson`.
- Consumido por `app/services/delivery_service.py` (`DeliveryService.list_active_routes`), depois que a ordem de visita já foi decidida por `app/domain/geo.py` (grafo de proximidade + Dijkstra bidirecional, distância haversine) — o OSRM **não** decide ordem, só recebe a sequência pronta e devolve o traçado real de estrada para ela.
- Chamada síncrona (`urllib`) despachada via `await asyncio.to_thread(...)`, mesmo padrão de `GeocodingClient`.

## Comportamento de falha

Falha fechado: se o OSRM não responder (timeout, erro HTTP, payload malformado), `RoutingClient.route()` retorna `None` e o chamador mantém o comportamento anterior — linha reta ponto-a-ponto no mapa, distância haversine, ETA estimado por velocidade média (`AVG_CITY_SPEED_KMH` em `delivery_service.py`). Nenhuma exceção sobe até o endpoint; a tela nunca quebra por causa do OSRM estar fora do ar, só perde a precisão do traçado/distância naquela leitura.

## Dependências

- Sem SLA contratado — é um serviço público gratuito (demo server do OSRM), não pensado para tráfego de produção pesado; indisponibilidade afeta só a precisão do traçado exibido, não a operação (a rota continua utilizável com a aproximação haversine).
- Consumido só na leitura (`GET /deliveries/routes`, chamada no carregamento da tela e depois de planejar/atribuir rota) — **não** é chamado pelo polling de posição ao vivo (`GET /deliveries/routes/live`, a cada 10s), que é um payload deliberadamente leve sem geometria.
- Ver [[Geocoding_Nominatim|Geocoding_Nominatim]] para o mesmo tipo de dependência (Nominatim/OpenStreetMap) e [[Mapas_Frontend|Mapas_Frontend]] para os loaders de mapa no frontend.

## Atualizações

- 2026-09-20: nota criada, junto com a integração inicial.
