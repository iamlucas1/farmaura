---
cssclasses: ia-nota
---

# Auditoria de segurança dos servidores `lumos-prd` e `lumos-dev` 2026-09-18 — resumo consolidado

**Tipo:** Índice / visão consolidada de auditoria (não é, em si, um achado)
**Status:** Concluída (observacional — nenhuma correção aplicada)
**Data:** 2026-09-18
**Executada via:** [[../../farmaura/08_Skills_Agentes_Prompts/auditoria-completa-seguranca|prompt de auditoria completa de segurança]] (seções 14–17 — infraestrutura, rede interna, TLS, rate limit/DoS — aplicadas ao nível de host/servidor, a pedido explícito do usuário), acesso via `ssh lumos-prd`/`ssh lumos-dev` (método de acesso já documentado e autorizado)

## O que foi feito

Auditoria **read-only e observacional** dos dois servidores reais que hospedam todo o ecossistema (Farmaura, LumosMed, lumos-api, Thamara, Michele, LumosNeon, Horizon, ADCRDF): portas abertas, firewall de host, regras do Docker, fail2ban (containerizado e nativo do host), GeoIP, TLS/certificados, versões de kernel/Docker/Nginx/imagens de banco/cache, hardening de SSH, containers privilegiados, e arquivos de configuração esquecidos em disco.

Esta rodada complementa a auditoria de 2026-08-19 ([[auditoria-2026-08-19-resumo-consolidado]]), que cobriu só o **repositório** `lumos-gateway` (arquivos de configuração no Git) e deixou explicitamente registrado que faltava auditar os **servidores reais** — esta é essa auditoria.

**Importante sobre escopo:** parte dos achados abaixo (SSH, kernel, firewall de host, segredos esquecidos em `/opt`) não é específica do software `lumos-gateway` — é do host (SO) de `lumos-prd`/`lumos-dev`, que hospeda todos os produtos. Documentado aqui por ser o projeto do cofre mais próximo da infraestrutura compartilhada desses dois servidores (não há, hoje, uma chave de projeto própria para "os servidores" em si).

**Não realizado, por decisão explícita:** exploração ativa/ofensiva contra os servidores (brute force real, payloads de exploração, port scan agressivo contra os IPs públicos). O usuário pediu, em dois momentos desta rodada, uma varredura mais agressiva; foi recusada nas duas por contrariar tanto o prompt de auditoria (estritamente observacional) quanto a política do próprio cofre ([[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]]: nunca testar/varrer porta contra produção real) — `lumos-prd` está em produção real, servindo usuários reais. Em vez disso, o aprofundamento pedido foi feito por duas vias seguras: (a) leitura adicional via SSH nos dois servidores (versão real por trás de imagens `:latest`, serviços fora do Docker, scripts administrativos, cron) e (b) checagens passivas nos domínios públicos — requisições HTTP normais (as mesmas que qualquer navegador faz) e consultas DNS públicas, sem nenhum payload ou tentativa de exploração.

## Achados mais críticos — priorizar primeiro

1. **[[ssh-root-login-por-senha-exposto-nos-dois-servidores]] (CRÍTICO)** — SSH permite login de `root` por senha, exposto a `0.0.0.0`/`0.0.0.0::` nos dois servidores; `root` tem senha ativa nos dois; 170–184 tentativas de brute force por semana já observadas.
2. **[[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]] (CRÍTICO)** — backend `lumos-api` (domínio LumosMed + identity) publicado direto na porta `8000` de `lumos-dev`, sem TLS, sem GeoIP, sem fail2ban, sem rate limit — contornando completamente o `lumos-gateway`.

## Segundo achado mais sério

**[[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]] (ALTO)** — dezenas de arquivos `.env`/`.env_old` de produtos/deploys descontinuados (WhatsApp, portal antigo, gateway antigo, Thamara antigo, etc.) nunca higienizados, presentes em `/opt/old/` (`lumos-prd`) e `/opt/sites_antigos/` (`lumos-dev`).

## Todos os achados desta rodada, por severidade

### CRÍTICO
- [[ssh-root-login-por-senha-exposto-nos-dois-servidores]] — login de root por senha, exposto publicamente, nos dois servidores.
- [[lumos-api-exposto-diretamente-sem-gateway-em-lumos-dev]] — API do LumosMed exposta sem TLS/gateway em `lumos-dev`.

### ALTO
- [[segredos-de-stacks-antigas-abandonados-em-disco-nos-dois-servidores]] — segredos de stacks antigas nunca limpos em `/opt/old`/`/opt/sites_antigos`.

### MÉDIO
- [[sem-firewall-de-host-alem-do-docker-e-fail2ban]] — nenhuma camada de firewall de host real, só Docker (que abre o que for publicado) + fail2ban reativo.
- [[kernel-desatualizado-reboot-pendente-ha-varias-versoes]] — kernel em execução dezenas de versões atrás do já instalado em disco, reboot nunca aplicado.
- [[coturn-dev-sem-confirmacao-de-autenticacao-e-sem-tls]] — servidor TURN de telemedicina exposto sem TLS/DTLS, mecanismo de autenticação não confirmado.
- [[spf-ausente-e-dmarc-sem-enforcement-nos-dominios-publicos]] — `drogariafarmaura.com.br` sem SPF/DMARC nenhum; `lumosmed.com.br` com DMARC em modo monitoramento (`p=none`) — domínios vulneráveis a spoofing de e-mail/phishing.

### BAIXO / INFORMATIVO
- [[achados-baixos-e-informativos-auditoria-servidores-2026-09-18]] — 8 itens agrupados: patch de Nginx defasado em dev vs. prd, agente de segurança ausente em dev, drift Redis/Valkey no LumosMed entre ambientes, Postgres nativo não documentado em dev, ausência de TURN em produção, jail `nginx-codigo` reconfirmado incompleto, versões reais por trás das imagens `:latest` (certbot/fail2ban/coturn, até ~4 meses sem recriar), e software nativo esquecido em `lumos-dev` (certbot 2.9.0 + PHP de PPA de terceiros).

## O que foi verificado e está correto (negativo — vale registrar)

- Nenhum container `privileged` nem com `docker.sock` montado em nenhum dos ~30 containers dos dois servidores.
- TLS restrito a `TLSv1.2`/`TLSv1.3` com cipher suite moderna, nos dois servidores.
- Certificados válidos nos dois servidores, sem expiração iminente.
- GeoIP allowlist ativo e coerente, confirmado ao vivo (mesma lista de países nos dois ambientes).
- fail2ban (containerizado para Nginx, e nativo do host para SSH) ativo e efetivamente banindo IPs reais nos dois servidores.
- Nenhuma credencial ou segredo real foi copiado para esta documentação — arquivos `.env` encontrados foram listados por nome/caminho, nunca lidos.

## Como usar esta documentação

Mesmo formato usado em `lumos-gateway/04_Seguranca_Riscos/` desde a auditoria de 2026-08-19: Status (CONFIRMADO/PROVÁVEL/POSSÍVEL/INFORMATIVO), Severidade, Descrição, Evidência, Cenário de risco, Impacto, Causa raiz, Correção sugerida (não implementada). Nenhuma correção foi aplicada como parte desta auditoria.

## Referências

- [[auditoria-2026-08-19-resumo-consolidado]] — auditoria irmã, escopo original (repositório, não servidor real).
- [[../../farmaura/04_Seguranca_Riscos/auditoria-2026-08-17-resumo-consolidado|resumo consolidado da auditoria do Farmaura]] — auditoria de código/aplicação, escopo diferente (não servidor).
- [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — limite que impediu a exploração ativa solicitada nesta rodada.

## Atualizações

- 2026-09-18: auditoria concluída, 6 notas de achado + este índice criados em `04_Seguranca_Riscos/`.
