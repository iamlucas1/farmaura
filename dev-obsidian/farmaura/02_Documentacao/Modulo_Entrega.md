# Módulo Entrega

## O que é

Duas famílias de "entrega" com semânticas distintas: **entrega própria/motoboy** (raio ≤15km, precificação por área/distância, roteirização manual) e **envio por transportadora** (Melhor Envio, `fulfillment_type="shipping"`) — o mesmo pedido nunca tem as duas, decidido pela distância até a loja mais próxima no checkout. A precificação por distância já está detalhada em [[../00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|precificação de entrega por distância]] e a exceção de camadas em [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|excecao-delivery-pricing-cross-service]]; esta nota resume e foca no que falta: models, endpoints, Melhor Envio, zonas/roteirização e as lacunas encontradas.

## Tabelas / Models

- **`delivery_routes`** — `route_status` default `"planned"` (nunca visto sendo alterado no código — ver regras abaixo), `saved_distance_km`/`estimated_duration_minutes`/`route_polyline` nunca escritos. RLS: customer vê tudo do tenant; admin/manager/pharmacist só a própria loja; driver só as próprias rotas.
- **`delivery_route_stops`** — `order_id` **xor** `pdv_sale_id` (CHECK garante exatamente uma origem). `navigation_url` nunca populado pelo backend. RLS via `EXISTS` contra `delivery_routes`.
- **`driver_locations`** — upsert single-row por motorista (unique em `driver_user_id`, **sem histórico** de posições).
- **`order_fulfillments`** — carrega TODO o detalhe de execução (pickup/delivery/shipping na mesma tabela); `driver_phone` nunca é preenchido (`User` não tem coluna de telefone).
- **`portal_settings`** (config de `delivery_pricing`/`delivery_areas`) — **sem RLS de banco**, isolamento só por filtro `tenant_id` em Python, inconsistente com o resto do domínio.

## Endpoints

- `PATCH /deliveries/routes/{id}/driver`, `GET /deliveries/routes/live` (polling 10s no frontend), `GET /deliveries/my-route` (polling 8s, role driver), `POST /deliveries/my-route/location` (ping GPS), `POST /deliveries/my-route/stops/{id}/deliver`.
- `GET /orders/delivery-coverage` — preview de cobertura para o cliente no checkout.
- `GET/PUT /portal/internal/delivery-pricing`, `GET/PUT /portal/internal/delivery-areas`, `GET /portal/internal/address-search` (Nominatim).

## Precificação por distância (resumo)

`delivery_pricing_service.py` resolve tiers globais por distância ou área/loja (bairro com prioridade sobre raio). Distância sempre calculada contra a **loja real** que atenderá o pedido (não um hub fixo). `MAX_MOTOBOY_DISTANCE_KM = 15.00` decide `requires_shipping` (motoboy vs. Melhor Envio) — detalhe completo em [[../00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|precificação de entrega por distância]].

## Melhor Envio

**Integração real e funcional, mas desligada por padrão** (`melhor_envio_enabled=False`, `base_url` default aponta para sandbox). Endpoints implementados: cotação, compra/checkout de frete, geração/impressão de etiqueta, rastreio. Consumida em dois pontos do checkout/despacho (`order_service.py`). Peso/dimensão do pacote são **fixos** (constantes) porque `InventoryItem` não tem campos de peso/dimensão por produto.

## Zonas de entrega e roteirização

- **`delivery-zones-screen.jsx`**: bairros/cidades (busca por CEP ou nome) e raios em km, cada um com regra de preço própria (fixo/grátis/por combustível), frete grátis acima de subtotal, variações normal/express.
- **`driver-route-screen.jsx`**: motorista compartilha localização (`navigator.geolocation.watchPosition`, ping throttlado a 1×/10s), lista de paradas, botão "Entregue".
- **`deliveries-screen.jsx`**: painel operacional com mapa Leaflet/OSM real, atribuição de motorista, tracking ao vivo, "Despachar rota".

## Regras de negócio não óbvias

- **Não existe roteirização/otimização real**, apesar da UI sugerir "rota otimizada economiza ~X km": `attach_route_stop` só faz `append` na sequência, na ordem em que os pedidos ficam prontos — sem TSP nem reordenação por distância. O card "economiza" é sempre 0 na prática.
- **`route_status` nunca transiciona** de `"planned"` — o botão "Despachar rota" no frontend não chama endpoint de rota nenhum, apenas avança pedidos individualmente.
- **`navigation_url` nunca é populado** — frontend sempre cai no fallback de deep-link do Google Maps.
- **`get_route_stop_by_id` é deliberadamente não tenant/rota-scoped** — `mark_stop_delivered` busca o stop e só depois valida posse da rota, devolvendo 404 genérico (não 403) para não vazar existência do stop a outro motorista.
- **`check_coverage` ignora configuração de área** quando a loja mais próxima está além de 15km — nesse caso já retorna `requires_shipping=True` direto.

## Frontend

Ver seção "Zonas de entrega e roteirização" acima para as 3 telas do console interno.

## Decisões de arquitetura dignas de nota

- **Ausência de motor de roteirização real**, apesar da linguagem de produto sugerir otimização — lacuna de implementação relevante o suficiente para virar pendência própria.
- **`portal_settings` fora do escopo de RLS do banco** enquanto todo o resto do domínio Entrega tem RLS — inconsistência de padrão de segurança.
- **Melhor Envio é integração real, mas desligada por padrão** e sem nota própria em `05_Integracoes_Infra/` ainda.

## Ver também

- [[../00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|Precificação de entrega por distância]].
- [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|Exceção delivery pricing cross-service]].
- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding Nominatim]].
- [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — resolução de loja atendente no checkout.
- [[Modulo_PDV|Módulo PDV]] — reaproveita este service para entrega de balcão.

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
