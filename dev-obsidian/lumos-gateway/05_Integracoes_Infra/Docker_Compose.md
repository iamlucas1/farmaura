---
cssclasses: ia-nota
---

# Docker / docker-compose (lumos-gateway)

**Tipo:** Infraestrutura

## Propósito

Empacotamento e orquestração do gateway e seus serviços de apoio (TLS, banimento de IP).

## Contrato

- `Dockerfile`: build sobre `debian:bookworm-slim` (sem pin de digest), instala via `apt-get` (sem versão fixada): `curl`, `ca-certificates`, `gettext-base` (para `envsubst`), `inotify-tools`, `openssl`, `nginx`, `libnginx-mod-http-geoip2`. Cria um usuário `lumos-gateway` (GID 999) que não chega a ser usado — o Nginx roda como `www-data` via diretiva própria (`user www-data;`).
- `docker-compose.yml`: serviço `gateway_nginx` (hardened — `cap_drop: ALL` + capabilities mínimas, `no-new-privileges:true`, sem `docker.sock`, sem `privileged`, `healthcheck` presente), `lumos_gateway_certbot` (`certbot/certbot:latest`), fail2ban (`crazymax/fail2ban:latest`, `network_mode: host`, `cap_add: NET_ADMIN, NET_RAW`).
- `entrypoint.sh`: renderiza os templates Nginx via `envsubst` com whitelist explícita de variáveis (`$VARS`); ajusta permissões de arquivo de runtime (`fix_nginx_runtime_fs()`, conservador — `0644` para logs, `0755` para diretórios).
- `ssl-reload.sh`: reload do Nginx após renovação de certificado.
- Aplicações-tenant (Farmaura, LumosMed, etc.) ficam em stacks Docker Compose **separadas**, cada uma com sua própria rede privada interna — só o serviço web exposto de cada uma entra na rede externa compartilhada `lumos_gateway`.

## Dependências

- Rede externa `lumos_gateway` — compartilhada com todos os tenants; ver documentação de cada produto (`dev-obsidian/farmaura/05_Integracoes_Infra/Lumos_Gateway.md` para o caso do Farmaura).
- `vol_gateway_certs` (volume Docker externo) — armazena certificados fora do controle de versão, desde a correção de 2026-05.

## Atualizações

- 2026-08-19: nota criada.