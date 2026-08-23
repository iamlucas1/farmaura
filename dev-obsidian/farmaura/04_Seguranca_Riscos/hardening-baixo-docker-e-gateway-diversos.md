# Hardening de baixa severidade — Docker, gateway e superfície de API (achados diversos)

**Tipo:** Vulnerabilidade/hardening (múltiplos achados de severidade BAIXA, agrupados por afinidade)
**Status:** CONFIRMADO (todos os itens abaixo)
**Severidade:** BAIXO
**Sistema afetado:** infraestrutura (`farmaura-api`, `docker/`, `lumos-gateway`)
**Categoria:** Hardening de imagem / headers / rate limit
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

Nota consolidada — cada item é de severidade baixa isoladamente, mas vale registrar todos para acompanhamento futuro sem criar uma nota separada por item.

## 1. `farmaura-api/Dockerfile` não é multi-stage — ferramentas de build permanecem na imagem final

**Localização:** `farmaura-api/Dockerfile:3-27`. `build-essential` é instalado via `apt-get` e nunca removido nem separado de um estágio final.
**Cenário de risco:** um RCE hipotético na aplicação dá ao atacante acesso a um toolchain de compilação dentro do container, facilitando construção de payloads/exploits locais.
**Correção sugerida:** separar estágio de build (`uv sync`) de um estágio runtime `slim` que só copie `/app/.venv` e o código-fonte, sem `build-essential`. (`docker/web/Dockerfile`, em contraste, já é corretamente multi-stage.)

## 2. `.dockerignore` raiz não exclui `.env` explicitamente

**Localização:** `.dockerignore` (raiz do repo). Exclui `.git`, `node_modules`, caches, mas não lista `.env`/`.env.*`.
**Cenário de risco:** hoje `farmaura/` não tem `.env` (sem exposição real), mas se um `.env` de build do Vite for adicionado no futuro, seria copiado para o contexto de build (`docker/web/Dockerfile: COPY ["farmaura", "./"]`) e potencialmente compilado no bundle JS servido publicamente.
**Correção sugerida:** adicionar `.env`, `.env.*` ao `.dockerignore` raiz e ao de `farmaura-api/`, como defesa em profundidade preventiva.

## 3. `HEALTHCHECK` só definido no compose, não na diretiva Dockerfile

**Localização:** nenhum dos dois Dockerfiles define `HEALTHCHECK`; `farmaura-api/docker-compose.yml` define equivalente no nível do compose para ambos os serviços — cobre o caso real de uso (sempre via compose).
**Impacto:** se a imagem for rodada fora deste `docker-compose.yml` (outro orquestrador, `docker run` isolado), perde o healthcheck.
**Correção sugerida:** opcional — duplicar o healthcheck no Dockerfile para portabilidade.

## 4. `/docs`, `/redoc`, `/openapi.json` do FastAPI não desabilitados explicitamente

**Localização:** `app/main.py` — `FastAPI(...)` sem `docs_url`/`redoc_url`/`openapi_url` sobrescritos.
**Por que não é explorável hoje:** `docker/web/nginx.conf` só faz `proxy_pass` para `/api/v1/`/`/static/`; qualquer outro caminho cai no fallback SPA e nunca chega ao backend. A proteção existe, mas é **incidental** (efeito colateral do roteamento do nginx), não uma decisão explícita no FastAPI.
**Cenário de risco:** se o roteamento nginx (interno ou do gateway) ganhar uma rota "catch-all" que proxy tudo para o backend, ou o backend for exposto por outro caminho, o schema completo da API ficaria público.
**Correção sugerida:** desabilitar explicitamente em produção (`docs_url=None, redoc_url=None, openapi_url=None` quando `settings.environment == "production"`), em vez de depender só do roteamento do nginx.

## 5. ~~`Strict-Transport-Security` (HSTS) ausente~~ — CORRIGIDO: falso positivo, HSTS está presente

**Achado retratado em 2026-08-19.** A rodada inicial desta auditoria (2026-08-17) concluiu erroneamente que HSTS estava ausente, baseada numa busca incompleta no template do `lumos-gateway`. Uma auditoria posterior, dedicada e mais completa do `lumos-gateway` (ver [[../../lumos-gateway/04_Seguranca_Riscos/auditoria-2026-08-19-resumo-consolidado|resumo da auditoria do lumos-gateway]]), confirmou por leitura direta que **todos os 10 templates de vhost HTTPS** (incluindo `90-farmaura.conf.template:13`) já declaram `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;`. Verificado manualmente via `grep` antes de corrigir esta nota. Não há achado ativo aqui — mantido só para registro de que o item foi levantado e depois corrigido, não silenciosamente removido.

## 6. `GET /orders/delivery-coverage` (autenticado) sem rate limit, ao contrário do gêmeo `/delivery-coverage/public`

**Localização:** `app/api/v1/orders.py:74-86` (sem `Depends(rate_limit(...))`) vs. linha 89 (variante pública, com `PUBLIC_RATE_LIMIT`).
**Descrição:** ambas as rotas chamam geocodificação via Nominatim, protegido por um throttle global de módulo (`~1 req/s`, lock compartilhado por todos os usuários simultâneos do processo). A rota pública tem rate limit por IP; a autenticada, não.
**Cenário de risco:** um cliente autenticado pode enviar muitos endereços distintos em sequência, cada chamada segurando o lock global por até ~1s — degradando a latência de geocodificação/checkout para **todos** os outros clientes simultâneos (auto-DoS de baixo custo sobre a própria funcionalidade). Não há violação da política de uso do Nominatim em si, graças ao throttle global.
**Correção sugerida:** aplicar a mesma política de rate limit também em `check_delivery_coverage` (linha 74-86).

Observação complementar: o cache de geocodificação (`_CACHE` em `geocoding_client.py`) é um `dict` em memória de processo, sem limite de tamanho nem TTL — cresce indefinidamente com endereços únicos ao longo da vida do processo. Risco de memória baixo/gradual, vale nota para quem for endurecer esse serviço.

## Referências

- [[csp-ausente-nas-paginas-html-de-producao]] — mesmo template de gateway, achado de severidade maior (MÉDIO).
- [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]] — mesma família de lacuna (item 6).
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: nota criada, consolidando 6 achados de baixa severidade da auditoria completa de segurança.
