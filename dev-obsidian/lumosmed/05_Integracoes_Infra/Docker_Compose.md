---
cssclasses: ia-nota
---

# Docker / docker-compose (lumosmed)

**Tipo:** Infraestrutura

## Propósito

Empacotamento e orquestração dos serviços do site/portal LumosMed (Laravel).

## Contrato

- `lumosmed/compose.yaml` (projeto `lumosmed`): 5 serviços — `app` (worker PHP-FPM/artisan), `web` (Nginx, upstream público), `queue` (worker de fila Laravel), `scheduler` (cron do Laravel), `redis` (sessão + fila, `redis:7.4-alpine`).
- Build compartilhado: os serviços `app`/`queue`/`scheduler` usam o alvo `app-runtime`, e `web` o alvo `web-runtime`, ambos do **mesmo Dockerfile multi-stage compartilhado** `../infra/laravel/Dockerfile.base` (fora deste repositório git `dev` — vive num repositório/diretório irmão usado por vários sites Laravel do ecossistema: `lumosneon`, `michele`, `thamara`, `adcrdf`, `horizon`). `additional_contexts: laravel_infra: ../infra/laravel` injeta esse contexto extra no build. Args: `NODE_VERSION` (default 22), `PHP_VERSION` fixo `8.4`, `NGINX_VERSION` (default `1.27-alpine`).
- Segredos via Docker secrets (arquivo, não env-var direto): `laravel_app_key`, `google_client_id`, `google_client_secret`, `lumos_api_private_key` — montados em `/run/secrets/*`, lidos pela aplicação via as variáveis `*_FILE` (`GOOGLE_CLIENT_ID_FILE` etc.).
- Redes: `private` (nome real `lumosmed_internal`) — `app`, `queue`, `scheduler`, `redis`; `gateway` (externa, `lumos_gateway`) — só o serviço `web`, com alias `lumosmed-web` (é o nome que `lumos-gateway` usa como upstream, ver [[Lumos_Gateway_Roteamento]]). Mesmo padrão de segregação usado em `farmaura` e `lumos-api`: só o container que serve tráfego público entra na rede compartilhada do gateway.
- `redis` tem healthcheck (`redis-cli ping`) e as demais dependem dele via `condition: service_healthy`.
- O Dockerfile compartilhado (`../infra/laravel/Dockerfile.base`) e seu `compose.base.yaml` **não vivem neste repositório** (`dev`) — não verificados/documentados em detalhe aqui; qualquer achado sobre eles deve ser registrado onde esse código realmente mora (provavelmente `lumos-obsidian`, ver nota em `dev-obsidian/CLAUDE.md` sobre `lumosmed/` ser deliberadamente enxuto aqui).

## Dependências

- Depende da rede externa `lumos_gateway` já existir (criada pelo `lumos-gateway`) antes de subir `web`.
- `redis` local é só para sessão/fila do Laravel — dado de domínio clínico vive no Postgres do `lumos-api`, não aqui (ver [[Banco_Dados]]).
- Consome `lumos-api` (serviço separado, container/rede próprios) via `internal_base_url` — ver [[Lumos_Api_Cliente_Interno]] e [[../../docker/05_Integracoes_Infra/Docker_Compose_Lumos_Api|docker/Docker_Compose_Lumos_Api]] para o empacotamento Docker do `lumos-api` em si.

## Ver também

- [[Lumos_Gateway_Roteamento]] — integração de rede com o gateway compartilhado.
- [[Banco_Dados]] — por que o Postgres do domínio não é gerenciado por este compose.
- [[../../docker/Hub|docker/Hub]] — visão cruzada de todas as engines/redes Docker do ecossistema.

## Atualizações

- 2026-09-18: nota criada — cobertura de Docker existia para `farmaura`/`lumos-gateway`, faltava para `lumosmed`.
