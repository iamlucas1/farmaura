---
cssclasses: ia-nota
---

# 2026-09-20 — Nominatim auto-hospedado substitui a instância pública, sem chave de API

## Contexto

Usuário perguntou como conseguir uma API key para o Nominatim. Não existe — a instância pública (`nominatim.openstreetmap.org`) não usa autenticação, só uma política de uso (identificação por User-Agent, ~1 req/s, proibido uso pesado, atribuição obrigatória) — é exatamente o que o `GeocodingClient` já respeitava. Perguntado se queria trocar para um provedor com chave real (LocationIQ/Geoapify) ou auto-hospedar, o usuário perguntou primeiro se dava pra usar "OpenStreetMap puro, sem ser via Nominatim" — esclarecido que OSM é só o dado bruto, alguma camada de geocodificação sempre é necessária para busca por texto livre (Nominatim, Photon, Pelias, ou um índice próprio) — e escolheu **auto-hospedar o próprio Nominatim**.

## Decisão

Novo serviço `farmaura-nominatim` no `docker-compose.yml`, imagem `mediagis/nominatim:5.3.2` (all-in-one: Postgres+PostGIS+Nominatim+Apache/PHP-FPM num container só, não compartilha banco com `farmaura-postgres`). Importa o extrato OSM do **Centro-Oeste** (Distrito Federal + Goiás + Mato Grosso + Mato Grosso do Sul — cobre a área real de entrega da Farmaura com folga, ~200MB via Geofabrik) no primeiro boot, em vez do Brasil inteiro (bem maior, sem necessidade real dado o alcance atual do negócio).

- `FREEZE: "true"` — importa uma vez, não fica atualizando com diffs de replicação continuamente. Ruas/CEPs não mudam com frequência suficiente para justificar um job de sincronização permanente; para atualizar mais tarde, é só apagar o volume `farmaura_nominatim_data` e deixar reimportar.
- `farmaura-api` **não** tem `depends_on: farmaura-nominatim` — a primeira importação pode levar bastante tempo (extrato + índices), e `GeocodingClient` já falha fechado (sem coordenada) quando o serviço não responde, exatamente como qualquer outra indisponibilidade de geocodificação — não faz sentido travar a API inteira esperando isso.
- `APP_GEOCODING_BASE_URL` no `docker-compose.yml` (ambiente local) passou de `https://nominatim.openstreetmap.org` para `http://farmaura-nominatim:8080` (nome do serviço na rede privada). `.env.example` **não foi alterado** — continua apontando pra instância pública, é o caminho de quem roda a API fora do Docker (`uv run fastapi dev`) sem esse serviço disponível.
- Novo campo de configuração `APP_GEOCODING_MIN_INTERVAL_SECONDS` (`geocoding_client.py`) — o throttle de ~1 req/s existia especificamente por causa da política de uso da instância pública; contra um servidor próprio isso não se aplica (só a capacidade real do seu próprio servidor importa), então o `docker-compose.yml` já configura `0.2` (5 req/s) para o ambiente local. Valor antigo (`1.05`) continua sendo o padrão do código quando a variável não é definida, preservando o comportamento de quem ainda usa a instância pública.

## Por que Centro-Oeste e não Brasil inteiro

Geofabrik só distribui o Brasil cortado em 5 macrorregiões (não por estado) — não existe um extrato "só Distrito Federal". Centro-Oeste (~200MB) já cobre a operação real hoje; Brasil inteiro seria bem mais pesado (import mais longo, mais disco) sem necessidade correspondente no momento. Se a operação expandir geograficamente pra fora do Centro-Oeste, trocar `PBF_URL` para `brazil-latest.osm.pbf` e reimportar (apagando o volume) resolve, sem mudança de código nenhuma.

## Consequências

- Ambiente de desenvolvimento local deixa de depender de um serviço público de terceiros pra geocodificação — sem risco de indisponibilidade/limite de terceiro, sem termos de uso de terceiro a respeitar.
- **Não aplicado em produção/staging** — os arquivos `docker-compose.prod.yml`/`docker-compose.staging.yml` não sobrescrevem `APP_GEOCODING_BASE_URL`, então herdam o valor do `docker-compose.yml` base (agora `http://farmaura-nominatim:8080`) — isso significa que um deploy do backend novo em produção **sem** também subir o serviço `farmaura-nominatim` lá quebraria a geocodificação em produção (falha fechada, sem crash — mas sem coordenada nenhuma até corrigir). Ver [[../06_Pendencias/subir-nominatim-auto-hospedado-em-producao|pendência]].
- Primeira subida local leva alguns minutos (download do extrato + import + índices) — acompanhável via `docker compose logs -f farmaura-nominatim`, confirmação em `http://127.0.0.1:9090/status.php`.

## Ver também

- [[../05_Integracoes_Infra/Geocoding_Nominatim|Geocoding_Nominatim]] — nota de integração atualizada com o novo padrão auto-hospedado.
- [[../06_Pendencias/subir-nominatim-auto-hospedado-em-producao|Pendência: subir em produção/staging]].
