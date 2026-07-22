# 2026-07-12 — Precificação de entrega configurável por distância + mapa real da loja

## Contexto

A precificação de entrega e a localização das lojas precisavam refletir distância real (não uma taxa fixa ou zona arbitrária), tanto para o checkout do marketplace quanto para o PDV (balcão), que reaproveita a mesma lógica de entrega.

## Alternativas consideradas

- **Taxa de entrega fixa** — descartado; não escala para lojas em regiões/distâncias muito diferentes.
- **Google Maps como único provedor de mapa/geocoding** — parcialmente descartado: o loader `google-maps.js` continua no repositório, mas o serviço de geocoding (`geocoding_client.py`) usa Nominatim/OpenStreetMap (sem necessidade de API key), e o "mapa real da loja" usa o loader `leaflet.js`. Google Maps parece ter ficado como opção alternativa/remanescente, não a escolha principal.

## Decisão

`farmaura-api/app/services/delivery_pricing_service.py` calcula frete por faixa de distância (haversine) e por área/bairro configurável, usando geocoding via Nominatim (`geocoding_client.py`, rate-limitado a ~1 req/s, cache local). A lógica foi extrada de `OrderService` para ser reaproveitada também pelo PDV. Commit `5d02d89`.

## Consequências

- `delivery_pricing_service.py` compõe `PortalService` e acessa repositórios diretamente — quebra a camada estrita de "serviço chama só repositório", uma exceção deliberada documentada no próprio serviço para permitir reuso entre marketplace e PDV.
- Dependência de disponibilidade do Nominatim público; o rate limit de ~1 req/s é auto-imposto para não abusar do serviço gratuito — não há SLA contratado.
- Configuração de área/bairro e faixas de distância vive em `schemas/portal.py` / `models/portal_setting.py` — ver [[Geocoding_Nominatim]].

## Ver também

- [[excecao-delivery-pricing-cross-service]] — exceção arquitetural documentada a partir desta decisão.
- [[Geocoding_Nominatim]] — contrato do provedor de geocoding usado aqui.
- [[Mapas_Frontend]] — loader de mapa (Leaflet) com a mesma filosofia "sem API key".
