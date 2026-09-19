---
cssclasses: ia-nota
---

# Auditoria de segurança do lumos-gateway 2026-08-19 — resumo consolidado

**Tipo:** Índice / visão consolidada de auditoria (não é, em si, um achado)
**Status:** Concluída (observacional — nenhuma correção aplicada)
**Data:** 2026-08-19
**Executada via:** [[../../farmaura/08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa de segurança]] (extensão para o gateway compartilhado, a pedido do usuário, depois da rodada inicial que cobriu só `farmaura`/`farmaura-api`)

## O que foi feito

Auditoria read-only e observacional do repositório `lumos-gateway` (gateway Nginx compartilhado que serve Farmaura, LumosMed, lumos-api, LumosAnalytics, Michele, Thamara, LumosNeon, Horizon, ADCRDF) — histórico Git completo (159 commits, branches `master`/`desenv`), todos os 11 templates de vhost Nginx, fail2ban, Certbot, GeoIP, Docker Compose/Dockerfile, scripts administrativos. `lumosmed`/`lumos-api` (produtos consumidores, repositórios próprios) ficaram deliberadamente fora do escopo desta rodada, por pedido explícito do usuário — só a infraestrutura do gateway em si foi auditada.

## Achado mais crítico — priorizar primeiro

**[[chaves-privadas-tls-expostas-no-historico-git]] (CRÍTICO)** — chaves privadas TLS reais de `lumosmed.com.br`, `portal.lumosanalytics.com.br`, `whatsapp.lumosanalytics.com.br`, `adcrdf.com.br`, `api.lumosanalytics.com.br` e vários subdomínios `dev.*`, mais chaves de conta ACME (Let's Encrypt), foram commitadas **duas vezes** (2025-08-10 e 2026-03-28) — a segunda vez só foi possível porque alguém deletou a proteção de `.gitignore` dois meses antes. Ambas as exposições estão em `origin/master` (GitHub), recuperáveis do histórico mesmo removidas do HEAD atual. Verificado manualmente via `git log`/`git show --stat`, nenhum valor de chave foi reproduzido em nenhum momento.

## Segundo achado mais sério

**[[logs-com-token-whatsapp-e-csrf-tokens-no-historico]] (ALTO)** — no mesmo primeiro commit que expôs as chaves TLS, `logs/access.log`/`error.log` também foram commitados, contendo o `verify_token` real do webhook WhatsApp Business API e tokens CSRF de sessões reais de usuário. Removido na mesma limpeza das chaves TLS, não re-exposto no segundo incidente, mas igualmente recuperável do histórico.

## Todos os achados desta rodada, por severidade

### CRÍTICO
- [[chaves-privadas-tls-expostas-no-historico-git]] — chaves privadas TLS + contas ACME expostas duas vezes.

### ALTO
- [[logs-com-token-whatsapp-e-csrf-tokens-no-historico]] — token de webhook WhatsApp + CSRF tokens reais em log commitado.

### MÉDIO
- [[rate-limit-burst-baixo-em-sete-tenants]] — o mesmo `burst=10` que já causou incidente real no Farmaura ainda não foi corrigido em 7 dos 8 outros tenants; agravado por zona de rate-limit compartilhada entre tenants e por interação com banimento do fail2ban.
- [[csp-ausente-em-todos-os-vhosts]] — nenhum dos 10 vhosts declara CSP (HSTS, ao contrário do que uma rodada anterior concluiu erroneamente, está presente e correto em todos).
- [[fail2ban-regras-diversas]] — regex incompleta no filtro `nginx-codigo`; filtro `nginx-fake-searchbots` pode banir crawlers legítimos por 24h.
- [[supply-chain-e-hardening-diversos]] — `certbot/certbot:latest` e `crazymax/fail2ban:latest` sem pin (o segundo com privilégios elevados: `network_mode: host` + `NET_ADMIN`/`NET_RAW`); base image/pacotes apt sem pin; `.mmdb` do GeoIP commitado apesar de infraestrutura de download nunca implementada; inconsistências menores entre vhosts.

### BAIXO
- [[env-commitado-lumos-gateway]] — `.env` rastreado no Git apesar do `.gitignore`; conteúdo atual é só domínios + e-mail de contato, sem credencial real.

## Confirmado já corrigido (não é achado ativo)

Bug de continuação de linha em `scripts/domain_context.sh::get_ssl_conf_bindings()` (documentado como achado real em 2026-08-04 do lado Farmaura) — verificado em 2026-08-19 que já está corrigido no HEAD atual (commit `5496ead`). Permanece em aberto apenas a questão de se `lumos-prd` (servidor real) tem o mesmo problema, o que está fora do alcance de uma auditoria observacional local.

## O que foi verificado e está correto (negativo — vale registrar)

- Bypass de bloqueio geoip para `robots.txt`/`sitemap.xml`/`llms.txt` está corretamente escopado — não vaza para rotas sensíveis.
- `envsubst` usa whitelist explícita de variáveis ao renderizar templates — não vaza env vars não relacionadas para dentro da config gerada.
- Container `gateway_nginx` (o que recebe tráfego público direto) já segue boas práticas de hardening (`cap_drop: ALL`, `no-new-privileges`, sem `docker.sock`, sem `privileged`).
- Nenhum comando shell perigoso (eval sobre input externo, concatenação insegura de domínio) encontrado em `certbot/`/`scripts/`.
- Nenhum outro tipo de segredo (chave AWS, GitHub PAT, Slack token, chave SSH, connection string com credencial) encontrado no restante do histórico, além dos já documentados (chaves TLS, logs com token WhatsApp).

## Como usar esta documentação

Mesmo formato usado em `dev-obsidian/farmaura/04_Seguranca_Riscos/`: Status (CONFIRMADO/PROVÁVEL/POSSÍVEL/INFORMATIVO), Severidade, Descrição, Evidência, Cenário de risco, Impacto, Causa raiz, Correção sugerida (não implementada). Nenhuma correção foi aplicada como parte desta auditoria.

## Referências

- [[../../farmaura/04_Seguranca_Riscos/auditoria-2026-08-17-resumo-consolidado|resumo consolidado da auditoria do Farmaura]] — auditoria irmã, escopo original.

## Atualizações

- 2026-08-19: auditoria concluída, 7 notas de achado + este índice criados em `04_Seguranca_Riscos/`.