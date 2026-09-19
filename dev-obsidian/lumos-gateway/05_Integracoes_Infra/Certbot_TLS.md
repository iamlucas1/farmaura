---
cssclasses: ia-nota
---

# Certbot — emissão e renovação de certificados TLS (Let's Encrypt)

**Tipo:** Infraestrutura (TLS)

## Propósito

Emissão e renovação automática de certificados TLS para todos os domínios roteados pelo gateway, via Let's Encrypt.

## Contrato

- Serviço `lumos_gateway_certbot` (`docker-compose.yml`), imagem oficial `certbot/certbot` (hoje `:latest`, sem pin — ver [[../04_Seguranca_Riscos/supply-chain-e-hardening-diversos|achado de supply chain]]).
- Desafio ACME via webroot: `/.well-known/acme-challenge/`, servido pelo próprio `gateway_nginx`.
- Scripts em `certbot/` (`issue.sh`, `issue-all.sh`, `renew.sh`) — nenhum comando perigoso encontrado (sem `eval` sobre input externo, sem concatenação de domínio vindo de fonte não confiável; domínios sempre vêm de `scripts/domain_context.sh`/`.env`, nunca de request HTTP).
- Certificados/chaves são geridos via volume Docker externo (`vol_gateway_certs`) — desde a limpeza de 2026-05, **nunca mais versionados no Git** (ver [[../04_Seguranca_Riscos/chaves-privadas-tls-expostas-no-historico-git|histórico de exposição já corrigido, mas recuperável]]).
- Renovação manual: `docker compose exec lumos_gateway_certbot /renew_and_reload.sh` — ver POP [[../07_POPs_Processos/renovar-certificado-manualmente|renovar-certificado-manualmente]].
- Verificação: `docker compose exec gateway_nginx /usr/local/bin/check_certs.sh` — ver POP [[../07_POPs_Processos/verificar-certificados|verificar-certificados]].

## Dependências

- `certbot/issue-all.sh` roda com `set -eu` e itera todos os projetos em sequência — um domínio com DNS quebrado (achado já documentado do lado Farmaura, ver `dev-obsidian/farmaura/05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev.md`, "LumosNeon com DNS quebrado em `lumos-dev`") pode abortar o lote inteiro por causa do `set -e`, antes de chegar nos itens seguintes — contorno conhecido: emitir o certificado do domínio afetado direto via `/issue.sh <domínio> <domínio>`, sem depender do lote.
- `scripts/domain_context.sh::get_ssl_conf_bindings()` monta a lista de bindings SSL/domínio para o `check_certs.sh` — já teve um bug real de barra de continuação de linha faltando (corrigido em `5496ead`, confirmado ainda corrigido em 2026-08-19).

## Atualizações

- 2026-08-19: nota criada.