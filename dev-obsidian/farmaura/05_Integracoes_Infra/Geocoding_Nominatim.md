# Geocoding — Nominatim/OpenStreetMap

**Tipo:** API de terceiro

## Propósito

Geocodifica endereços para calcular distância real (haversine) entre loja e cliente, usada pela precificação de entrega por distância — ver [[2026-07-12-precificacao-entrega-por-distancia]].

## Contrato

- Cliente: `farmaura-api/app/services/geocoding_client.py`.
- Base URL: `geocoding_base_url` em `app/core/config.py`, padrão `https://nominatim.openstreetmap.org`.
- Sem API key (serviço público). Rate-limitado a ~1 req/s no próprio cliente (auto-imposto, não é limite contratado) e com cache local em processo.
- User-agent customizado exigido pela política de uso do Nominatim.
- Consumido por `app/services/delivery_pricing_service.py`.

## Dependências

- Sem SLA contratado — é um serviço público gratuito; indisponibilidade do Nominatim afeta diretamente o cálculo de frete.
- Ver também [[Mapas_Frontend]] para os loaders de mapa no frontend (Leaflet usa a mesma filosofia "sem API key").
- Consumido por [[excecao-delivery-pricing-cross-service]] (`delivery_pricing_service.py`).

## Atualizações

- 2026-07-19: nota criada.
