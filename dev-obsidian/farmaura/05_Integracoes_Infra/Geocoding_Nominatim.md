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

- 2026-09-14: confirmado na prática um risco já implícito na seção Dependências:
  `StoreService.update_store` (`app/services/store_service.py`) re-geocodifica automaticamente
  (`_resolve_coordinates`) sempre que `address_line`/`district`/`city`/`state_code` mudam via
  `PATCH /api/v1/stores/{id}`, e cai silenciosamente para `latitude`/`longitude` = `0.0000000` se o
  Nominatim não responder — **sem erro, sem aviso**. Neste ambiente de desenvolvimento local (sem
  acesso real à internet a partir do container), um `PATCH` de endereço zerou as coordenadas reais
  de uma loja em produção-espelhada (`farmaura` local), quebrando silenciosamente o cálculo de
  frete por distância para aquela loja até a correção manual (coordenadas restauradas direto no
  Postgres). Em produção real (com internet), o mesmo fluxo deve re-geocodificar corretamente — o
  risco é específico deste tipo de ambiente sandboxed/sem internet, mas vale checar
  `latitude`/`longitude` após qualquer edição de endereço de loja, em qualquer ambiente, já que a
  falha do Nominatim não aparece na resposta da API.
- 2026-07-19: nota criada.
