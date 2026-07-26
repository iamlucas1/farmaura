# lumos-gateway (integração)

**Tipo:** Infraestrutura / integração interna

## Propósito

Farmaura-api roda atrás do gateway Nginx compartilhado `lumos-gateway`, que também serve o ecossistema Lumos. O backend nunca é exposto diretamente ao público.

## Contrato

- `farmaura-api/docker-compose.gateway.yml` (overlay) conecta apenas o serviço `farmaura-api` à rede Docker externa `lumos_gateway`.
- `app/main.py`, `api/middleware/security_headers.py` e `api/middleware/body_limits.py` documentam explicitamente a suposição de rodar atrás do gateway (headers e limites de corpo alinhados, não duplicados).
- Histórico do próprio `lumos-gateway` confirma a extensão recente: commit `8a4d85c` ("adjustment to start farmaura development") — o gateway passou a também rotear para `farmaura-api`.

## Dependências

- Nunca publicar a porta do `farmaura-api` diretamente no host além da rede do gateway, salvo debug local documentado — ver skill [[secure-service-communication]].
- Config de roteamento do Farmaura no `lumos-gateway`: `nginx/conf.d/90-farmaura.conf.template`
  (server block HTTPS, `FARMAURA_UPSTREAM=farmaura`, `FARMAURA_DOMAINS`/`FARMAURA_PRIMARY_DOMAIN`
  via `.env`).
- **Drift real encontrado em 2026-07-24**: no servidor (`lumos-prd`, `/opt/lumos-gateway`), o arquivo
  `90-farmaura.conf.template` está **não versionado** (`??` no `git status`) e `docker-compose.yml`
  tem edições locais não commitadas — a integração inteira do Farmaura no gateway foi feita direto
  no servidor, fora do fluxo git. O branch que o servidor rastreia é `master`; todo o histórico de
  commits do Farmaura no gateway (`5496ead`, `aac5082`, etc.) só existe em `desenv`/`origin/desenv`,
  nunca mergeado em `master`. Ou seja: git e servidor divergem tanto no conteúdo quanto no branch —
  sempre `cat` o arquivo real do servidor antes de sobrescrever (ver [[secure-service-communication]]
  e a diretriz geral de nunca sobrescrever sem diff prévio).
- **Bug real encontrado e corrigido em 2026-07-24**: `gateway_nginx` não tinha a rede
  `farmaura_private` declarada em `docker-compose.yml` — a conectividade existia só por um
  `docker network connect farmaura_private lumos_gateway_nginx` manual, nunca persistido. Um
  `docker restart` simples preserva conexões de rede manuais, mas qualquer `docker compose up`/
  recreate do `gateway_nginx` (recriação de container, não apenas restart) as descarta — nesse caso
  toda requisição para `drogariafarmaura.com.br` cai no upstream inexistente, o `farmaura_origin`
  responde 502/503, e o `location @fallback` redireciona (302) para `lumosmed.com.br` (o
  `$fallback_domain` default). Corrigido declarando `farmaura_private` como rede externa no
  `docker-compose.yml` (serviço `gateway_nginx` + bloco `networks:` top-level) — agora sobrevive a
  qualquer recreate futuro do gateway.
- `client_max_body_size` do vhost do Farmaura era o default global (10m) — `farmaura-api` passou a
  aceitar uploads de até ~20MB (catálogos de fornecedor com imagens), então o vhost ganhou
  `client_max_body_size 25m;` explícito para não virar o novo teto.
- **Bug real encontrado em 2026-07-24 (mesmo dia, logo após o deploy acima)**: telas do console
  interno que disparam várias chamadas em paralelo no carregamento (ex.: "Cotações" — 12 GETs
  simultâneos: therapeutic-classes, stores, inventory/dashboard, inventory/lots, portal bootstrap,
  orders/internal-board, prescriptions/review-queue, crm/customers, chat/threads, pdv/queue,
  pdv/sales, deliveries/routes/live) estouravam o `limit_req zone=req_limit burst=10 nodelay;` do
  bloco `location /` — as chamadas além do burst (inclusive `favicon.ico`) voltavam 429 direto do
  gateway, sem nem chegar no backend. `req_limit` é uma zona **compartilhada por IP entre todos os
  tenants** (`limit_req_zone $binary_remote_addr zone=req_limit:20m rate=5r/s;` em
  `nginx.conf.template`), mas o `burst` é declarado por vhost/location — deu para corrigir só o
  Farmaura sem tocar nos outros tenants. Subido de `burst=10`/`burst=20` (location/server) para
  `burst=40` nos dois níveis do vhost Farmaura; validado disparando 15 requisições em paralelo
  contra o domínio real e confirmando que nenhuma voltou 429.

## Ver também

- [[Lumos_Gateway_Roteamento]] — mesmo gateway, documentado do lado LumosMed (roteamento detalhado por template Nginx).
- [[chaves-privadas-tls-expostas-no-historico-git]] — vulnerabilidade crítica encontrada neste mesmo repositório de gateway, relevante para ambos os produtos.
- [[Docker_Compose]] — overlay que conecta o `farmaura-api` a esta rede.

## Atualizações

- 2026-07-25: vhost Farmaura subiu de novo — `client_max_body_size` 25m → 600m,
  `proxy_read_timeout`/`proxy_send_timeout` 300s/60s → 1800s/1800s — para suportar importação de
  orçamento em lote (múltiplos arquivos, até ~500MB e vários minutos de processamento sequencial
  de IA). Ver [[../02_Documentacao/Modulo_Orcamentos|Módulo Orçamentos]].
- 2026-07-24: corrigido timeout na importação de orçamento por IA — a extração de um documento
  real leva legitimamente mais de um minuto (observado 105s e 151.8s ponta a ponta em produção;
  `ai_request_timeout_seconds=90` por chamada, e um documento que aciona divisão-e-repetição faz
  várias chamadas em sequência). Duas camadas de proxy tinham timeout menor que isso e cortavam a
  conexão antes do backend terminar (que respondia 200 de qualquer forma, tarde demais): o nginx
  **dentro** do container `farmaura` (`docker/web/nginx.conf`, sem timeout explícito → default de
  60s do próprio nginx) e o `proxy_read_timeout 120;` do vhost no `lumos-gateway`. Subidos os dois
  para 300s. Validado com uma importação real de ponta a ponta pelo domínio (200 OK em 2min28s).
- 2026-07-24: corrigido 429 no console interno — telas com muitas chamadas paralelas no load
  (ex.: Cotações, 12 GETs simultâneos) estouravam `limit_req burst=10` do vhost Farmaura; subido
  para `burst=40` (server e location).
- 2026-07-24: corrigido bug real de produção (rede `farmaura_private` não declarada no
  `docker-compose.yml` do gateway — sobrevivia só por conexão manual, quebraria em qualquer
  recreate futuro) e subido `client_max_body_size` do vhost Farmaura (10m → 25m). Documentado o
  drift real entre servidor e git (arquivo de rota do Farmaura não versionado no servidor,
  histórico do Farmaura só em `desenv`, servidor rastreia `master`).
- 2026-07-19: nota criada.
