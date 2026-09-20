---
cssclasses: ia-nota
---

# Geocoding — Nominatim/OpenStreetMap

**Tipo:** Auto-hospedado em dev (desde 2026-09-20) — API de terceiro só onde o serviço próprio não estiver disponível

## Propósito

Geocodifica endereços para calcular distância real (haversine) entre loja e cliente, usada pela precificação de entrega por distância — ver [[../00_Decisoes/2026-07-12-precificacao-entrega-por-distancia|2026-07-12-precificacao-entrega-por-distancia]].

## Contrato

- Cliente: `farmaura-api/app/services/geocoding_client.py`. Nunca exige API key, em nenhum dos dois modos — Nominatim (público ou auto-hospedado) não usa autenticação por chave, só política de uso/identificação por User-Agent.
- Base URL: `geocoding_base_url` em `app/core/config.py`.
  - **Docker local** (`docker-compose.yml`): `http://farmaura-nominatim:8080` — serviço próprio, auto-hospedado, container `mediagis/nominatim:5.3.2`, importa o extrato OSM do Centro-Oeste (DF + GO + MT + MS) no primeiro boot. Ver [[../00_Decisoes/2026-09-20-nominatim-auto-hospedado-substitui-instancia-publica|ADR]].
  - **Fora do Docker** (`.env.example`, ex. `uv run fastapi dev` direto): `https://nominatim.openstreetmap.org` — instância pública, mantida como padrão de quem não tem o serviço auto-hospedado disponível.
  - **Staging/produção**: ainda não têm `farmaura-nominatim` subido — ver [[../06_Pendencias/subir-nominatim-auto-hospedado-em-producao|pendência]] antes de deployar o backend que já assume esse serviço.
- Rate-limitado no próprio cliente via `geocoding_min_interval_seconds` (`APP_GEOCODING_MIN_INTERVAL_SECONDS`) — `1.05`s por padrão (política de uso da instância pública), `0.2`s no Docker local (auto-hospedado, sem política de terceiro a respeitar, só a capacidade do próprio servidor). Cache local em processo por texto normalizado.
- User-agent customizado sempre enviado (`geocoding_user_agent`) — convenção do Nominatim, não é uma chave, mas identifica quem está chamando.
- Consumido por `app/services/delivery_pricing_service.py` e (desde 2026-09-20) pelo endpoint de busca do marketplace, ver Atualizações.

## Dependências

- **Auto-hospedado (dev)**: sem SLA de terceiro — a disponibilidade agora depende só do próprio ambiente Docker local, sem risco de limite/indisponibilidade de um serviço público compartilhado com o mundo inteiro.
- **Instância pública (fallback fora do Docker, e ainda em staging/produção)**: sem SLA contratado — indisponibilidade afeta diretamente o cálculo de frete.
- Ver também [[Mapas_Frontend]] para os loaders de mapa no frontend (Leaflet usa a mesma filosofia "sem API key").
- Consumido por [[../03_Padroes_Politicas/excecao-delivery-pricing-cross-service|excecao-delivery-pricing-cross-service]] (`delivery_pricing_service.py`).

## Atualizações

- 2026-09-20 (2): ambiente Docker local passou a usar Nominatim **auto-hospedado** (`farmaura-nominatim`, extrato Centro-Oeste) em vez da instância pública — usuário perguntou como conseguir uma API key (não existe para Nominatim) e, esclarecido que OSM cru não é buscável sem algum motor de geocodificação por cima, escolheu auto-hospedar. Ver [[../00_Decisoes/2026-09-20-nominatim-auto-hospedado-substitui-instancia-publica|ADR]] e a pendência de levar isso pra staging/produção.
- 2026-09-20: `GeocodingClient.search()` ganhou um segundo consumidor além do portal interno — `GET /customers/me/addresses/search`, autenticado como cliente do marketplace, alimenta o novo picker de mapa no cadastro/edição de endereço (ver [[../00_Decisoes/2026-09-20-endereco-marketplace-ganha-picker-de-mapa-com-coordenada-real|ADR]]). Mesmo cliente, mesmo auto-throttle de ~1 req/s por processo — agora compartilhado entre uso interno (PDV/portal) e uso de cliente final, o que aumenta a superfície que sente uma eventual lentidão/indisponibilidade do Nominatim.
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