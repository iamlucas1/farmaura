---
cssclasses: ia-nota
---

# Supply chain e hardening diversos — imagens sem pin, GeoIP mmdb commitado, inconsistências menores

**Tipo:** Vulnerabilidade/hardening (múltiplos achados de severidade baixa/média, agrupados por afinidade)
**Status:** CONFIRMADO (todos os itens)
**Severidade:** BAIXO a MÉDIO (ver cada item)
**Sistema afetado:** `lumos-gateway`
**Categoria:** Supply chain / hardening de container / higiene de repositório
**Data de identificação:** 2026-08-19

## 1. `certbot/certbot:latest` e `crazymax/fail2ban:latest` sem pin de versão — o segundo com privilégios elevados

**Severidade:** MÉDIO
**Localização:** `docker-compose.yml:90` (`certbot/certbot:latest`), `:113` (`crazymax/fail2ban:latest`), `:116-119` (`network_mode: host`, `cap_add: [NET_ADMIN, NET_RAW]`).
**Descrição:** ambos os containers de suporte usam `:latest`, sem pin de versão nem digest — cada `docker compose pull`/recreate pode trazer uma versão nova silenciosamente. O caso do fail2ban é mais sensível: além de `:latest`, é imagem de terceiro não-oficial (`crazymax/`), rodando com `network_mode: host` (compartilha a stack de rede do host) e `cap_add: NET_ADMIN + NET_RAW` (permite manipular roteamento/firewall do host). Se essa imagem for comprometida via supply chain, o atacante herda acesso à rede do host e capacidade de manipular `iptables`.
**Contraste:** o container `gateway_nginx` (que recebe tráfego público diretamente) já segue boas práticas — `cap_drop: ALL` + `cap_add` mínimo, `no-new-privileges:true`, sem `docker.sock`, sem `privileged`. O padrão não foi replicado nos containers de suporte.
**Correção sugerida:** pinar `certbot/certbot` e `crazymax/fail2ban` em tag de versão específica (ou digest), com processo de atualização deliberado em vez de `:latest` implícito.

## 2. Base image (`debian:bookworm-slim`) e pacotes `apt-get` sem pin de versão

**Severidade:** BAIXO
**Localização:** `Dockerfile:1` (sem digest, nunca teve pin em todo o histórico), `Dockerfile:3-6` (`apt-get install curl ca-certificates gettext-base inotify-tools openssl nginx libnginx-mod-http-geoip2`, sem versão fixada).
**Descrição:** cada build pode instalar uma versão diferente de `nginx`/`openssl` dependendo de quando rodar — troca reprodutibilidade por atualização automática de patch, sem isso ser uma decisão documentada.
**Correção sugerida:** se builds reprodutíveis forem importantes, pinar `FROM debian:bookworm-slim@sha256:...` e `apt-get install nginx=<versão>`; caso contrário, documentar a atualização automática como intencional.

## 3. `geoip/GeoLite2-Country.mmdb` (9,4 MB) commitado apesar do `.gitignore` — infraestrutura de download em runtime nunca foi implementada

**Severidade:** BAIXO (licenciamento + higiene de repositório, não segredo)
**Localização:** `geoip/GeoLite2-Country.mmdb` (rastreado), `.gitignore` (regra `geoip/*.mmdb` com comentário "baixado em runtime"), `docker-compose.yml` (`GEOIP_LICENSE_KEY_FILE`/secret `geoip_license_key`), `entrypoint.sh:26` (lê o secret).
**Descrição:** o `docker-compose.yml`/`entrypoint.sh` têm toda a infraestrutura para ler uma licença MaxMind e baixar o `.mmdb` em runtime — mas `GEOIP_LICENSE_KEY` é lido e **nunca usado** em lugar nenhum do código (confirmado por grep em todo o repositório). Alguém commitou o binário direto como solução alternativa, contrariando o próprio comentário do `.gitignore`. Redistribuir o binário GeoLite2 dentro de um repositório de terceiros pode não estar de acordo com os termos de licença da MaxMind (que exige licença própria por usuário/organização).
**Correção sugerida:** implementar de fato o download em runtime usando `GEOIP_LICENSE_KEY` (tornando a infraestrutura de secret já existente útil) e destrackear o `.mmdb` do Git; ou, se o download em runtime não for mais desejado, remover a infraestrutura morta e atualizar o comentário do `.gitignore` para refletir a realidade.

## 4. Inconsistências menores de configuração entre vhosts

**Severidade:** BAIXO/INFORMATIVO
- **Timeout ADCRDF**: `proxy_connect_timeout 30;` (`70-adcrdf.conf.template:50`) vs. `5` em todos os outros 6 vhosts comparáveis — se o upstream do ADCRDF cair/ficar lento, cada requisição prende um worker/conexão por até 30s antes de falhar, 6x mais que os outros. Confirmar se é intencional ou herança de cópia não revisada.
- **`/healthz` com exposição inconsistente**: público (só gated por país) em `10-http-redirect`/`15-https-default`, mas restrito a IP interno em todos os vhosts de aplicação. Baixo risco real (endpoint só devolve "ok"), mas quebra o padrão "todo `/healthz` é interno" adotado nos demais.
- **Variáveis `$lumos_forwarded_client_*` (dead code em `05-geoip.conf.template`)**: definidas para aceitar `X-Lumos-Client-IP`/`X-Lumos-Client-Country`/etc. vindos do próprio cliente, mas **nunca referenciadas** em nenhuma decisão real (confirmado — não alimentam `$deny_country` nem `geoip2` nem headers de proxy). Sem uso ativo hoje, mas se algum dia alguém "simplificar" o código trocando `$remote_addr`/`$geoip2_data_country_name` por essas variáveis já prontas, qualquer cliente externo passaria a poder se autodeclarar de um país permitido ou falsificar IP de origem — não há `set_real_ip_from` limitando de onde esses headers seriam aceitos. Correção sugerida: remover se não há plano de uso, ou documentar a finalidade e condicionar a aceitação a uma checagem de IP de origem confiável.
- **Usuário `lumos-gateway` criado no Dockerfile mas nunca usado**: código morto, sem impacto — o nginx roda corretamente como `www-data`.

## 5. Bug de continuação de linha em `domain_context.sh` — CONFIRMADO JÁ CORRIGIDO (não é achado ativo)

Já documentado em `dev-obsidian/farmaura/05_Integracoes_Infra/Lumos_Gateway.md` como um bug real encontrado em 2026-08-04. Verificado nesta rodada, via `cat -A` em `scripts/domain_context.sh:178-185`, que todos os itens de `get_ssl_conf_bindings()` terminam corretamente com `\` de continuação — o bug foi corrigido no commit `5496ead` ("Add farmaura tenant"), que adicionou a barra faltante junto com o item `90-farmaura`. **Não é um achado ativo neste repositório** — a nota anterior registrava incerteza sobre se `lumos-prd` (servidor real) teria o mesmo problema; isso permanece em aberto (fora do alcance de uma auditoria observacional local), mas o código-fonte (HEAD/histórico) está correto.

## Referências

- [[chaves-privadas-tls-expostas-no-historico-git]] — achado principal desta auditoria do lumos-gateway.
- [[rate-limit-burst-baixo-em-sete-tenants]], [[fail2ban-regras-diversas]] — outros achados desta rodada.

## Atualizações

- 2026-08-19: nota criada, consolidando 5 achados/observações de baixa-média severidade.