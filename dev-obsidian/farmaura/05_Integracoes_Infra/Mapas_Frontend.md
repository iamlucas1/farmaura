# Mapas no frontend — Leaflet

**Tipo:** API de terceiro

## Propósito

Exibir o "mapa real da loja" e funcionalidades relacionadas a localização no console interno.

## Contrato

- `farmaura/react/shared/leaflet.js` — carrega Leaflet via CDN unpkg, **sem API key**. Provedor de mapa do produto, consistente com o geocoding via Nominatim (também sem key) — ver [[Geocoding_Nominatim]] e [[2026-07-12-precificacao-entrega-por-distancia]].

## Histórico

Havia também um loader `google-maps.js` (API JS do Google Maps) no mesmo diretório. Confirmado com o usuário em 2026-07-18 que era resquício não utilizado — nenhum outro arquivo importava esse módulo nem referenciava a env var da key. Removido nessa data.

## Atualizações

- 2026-07-19: nota criada.
