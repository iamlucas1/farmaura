# Visão Geral: lumos-gateway

## Missão

Único ponto de entrada público (HTTP 80 → HTTPS 443) para todos os produtos hospedados em `lumos-prd`/`lumos-dev`: Farmaura, LumosMed, LumosAnalytics (site + API `lumos-api`), Michele, Thamara, LumosNeon, Horizon, ADCRDF. O gateway faz **somente roteamento** — nenhuma lógica de negócio, nenhuma credencial de banco de dados. Cada aplicação mantém sua própria rede Docker privada; só o serviço web exposto de cada uma entra na rede externa compartilhada `lumos_gateway`.

## Arquitetura

- **Nginx** (`nginx/nginx.conf.template` + `nginx/conf.d/*.conf.template`): um template de vhost por tenant, renderizado em runtime via `envsubst` (`entrypoint.sh`) a partir de variáveis de ambiente (`.env`). Templates confirmados: `00-upstreams` (hoje vazio — roteamento não usa mais bloco `upstream{}` centralizado, ver seção "Resolução de upstream" abaixo), `05-geoip`, `10-http-redirect`, `15-https-default`, `20-lumosanalytics-site`, `21-lumos-api`, `30-lumosmed`, `40-lumosneon`, `50-michele`, `60-thamara`, `70-adcrdf`, `80-horizon`, `90-farmaura`.
- **Certbot**: emissão/renovação de certificados Let's Encrypt via desafio ACME por webroot (`/.well-known/acme-challenge/`) — ver [[../05_Integracoes_Infra/Certbot_TLS|Certbot_TLS]].
- **fail2ban**: banimento automático de IP por comportamento abusivo, 5 jails ativos — ver [[../05_Integracoes_Infra/Fail2ban|Fail2ban]].
- **GeoIP**: allowlist de países via base MaxMind GeoLite2 — ver [[../05_Integracoes_Infra/GeoIP|GeoIP]].
- **Docker Compose**: 4 serviços (`gateway_nginx`, `lumos_gateway_certbot`, fail2ban, e o build da imagem base) — ver [[../05_Integracoes_Infra/Docker_Compose|Docker_Compose]].

## Resolução de upstream

O roteamento não usa mais blocos `upstream{}` Nginx clássicos (esse padrão foi removido em `cc5b52c`, "Removendo arquivo de upstream", 2026-03-17) — cada vhost declara sua própria variável (`set $farmaura_origin http://${FARMAURA_UPSTREAM}:80;`, por exemplo) resolvida via `resolver 127.0.0.11` (DNS interno do Docker), forçando reresolução a cada requisição em vez de fixar o IP do container na inicialização do Nginx — importante porque containers de aplicação são recriados com frequência (deploy) e teriam IP diferente a cada vez. **Exceção**: `lumosmed_upstream` (`30-lumosmed.conf.template`) ainda usa um bloco `upstream{}` clássico, resolvido estaticamente no boot do gateway — ver pendência [[../06_Pendencias/lumosmed-upstream-resolucao-estatica|lumosmed-upstream-resolucao-estatica]].

## Rate limiting

Zona global `req_limit` (`limit_req_zone $binary_remote_addr zone=req_limit:20m rate=5r/s;`, `nginx.conf.template`) compartilhada por **todos** os vhosts — a chave é só o IP do cliente, sem diferenciação por tenant. `burst` é configurável por vhost/location; hoje só o Farmaura recebeu ajuste reativo (`burst=40`, após incidente real de 429) — os outros 7 tenants seguem com o valor default `burst=10`, ver achado [[../04_Seguranca_Riscos/rate-limit-burst-baixo-em-sete-tenants|rate-limit-burst-baixo-em-sete-tenants]].

## Segurança (arquitetura, não achados — achados ficam em `04_Seguranca_Riscos/`)

- Headers de segurança padrão em todos os vhosts HTTPS: `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`, `X-Permitted-Cross-Domain-Policies`. `Content-Security-Policy` **não** está presente em nenhum vhost — ver [[../04_Seguranca_Riscos/csp-ausente-em-todos-os-vhosts|csp-ausente-em-todos-os-vhosts]].
- Container `gateway_nginx` segue hardening real: `cap_drop: ALL` + `cap_add` mínimo (`NET_BIND_SERVICE`, `SETUID`, `SETGID`, `CHOWN`), `security_opt: no-new-privileges:true`, sem acesso a `docker.sock`, sem `privileged`.
- `chain = DOCKER-USER` no fail2ban é o ponto de inserção correto para que o banimento afete tráfego chegando via portas publicadas/DNAT (que não passa pela chain `INPUT` normal).
- `envsubst` usa whitelist explícita de variáveis (`$VARS` em `entrypoint.sh`) ao renderizar os templates — evita vazar env vars não relacionadas (ex.: `GEOIP_LICENSE_KEY`) para dentro dos arquivos de config gerados.

## Stack

- Nginx sobre `debian:bookworm-slim` (build próprio via `Dockerfile`, não imagem `nginx:` oficial) — inclui `libnginx-mod-http-geoip2` para o módulo de geolocalização.
- Certbot: imagem oficial `certbot/certbot` (hoje `:latest`, sem pin — ver achado de supply chain).
- fail2ban: imagem de terceiro `crazymax/fail2ban` (hoje `:latest`, sem pin — ver achado de supply chain), com `network_mode: host` + `cap_add: NET_ADMIN, NET_RAW`.

## Este projeto não vive sozinho no repositório

Repositório git próprio (`git@github.com:iamlucas1/lumos-gateway.git`), presente fisicamente dentro da árvore de trabalho do repositório `dev` (mesmo padrão de `lumosmed/`/`lumos-api/`, listado no `.gitignore` da raiz). É infraestrutura compartilhada — não pertence a nenhum produto específico, serve a todos os tenants listados acima.

## Onde cada coisa deveria estar registrada

- Decisão de arquitetura/trade-off → `../00_Decisoes/`
- Padrão, política ou premissa não coberta em documentação estática do próprio repositório → `../03_Padroes_Politicas/`
- Achado de segurança, vulnerabilidade ou risco → `../04_Seguranca_Riscos/`
- API, integração ou peça de infra → `../05_Integracoes_Infra/`
- Pendência ou débito técnico → `../06_Pendencias/`
- POP ou processo → `../07_POPs_Processos/`
- Contexto de negócio definido pelo usuário → `../01_Contexto_Usuario/` (só o usuário escreve aqui)

## Atualizações

- 2026-08-19: nota criada, a partir da auditoria completa de segurança que também cobriu este repositório (arquitetura documentada por leitura direta do código, não por decisão de sessão registrada).
