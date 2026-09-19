---
cssclasses: ia-nota
---

# Verificar certificados TLS ativos

## Quando usar

Depois de uma renovação manual, ao investigar um erro de TLS relatado por um usuário, ou como checagem periódica preventiva.

## Passos

1. `docker compose exec gateway_nginx /usr/local/bin/check_certs.sh` — valida os certificados atualmente montados/servidos pelo Nginx.
2. Se o script reportar binding ausente para um domínio que deveria existir, verificar `scripts/domain_context.sh::get_ssl_conf_bindings()` — já teve um bug real de barra de continuação de linha faltando (corrigido em `5496ead`; confirmado corrigido no HEAD atual em 2026-08-19, mas vale reconferir se algo mudou desde então).
3. Validar a config renderizada com um container descartável de `nginx -t` **antes** de recriar a instância real do gateway — nunca pular essa etapa num gateway que serve outros tenants ao vivo (prática já registrada como lição aprendida em `dev-obsidian/farmaura/05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev.md`).

## Responsável

Quem administra a infraestrutura do gateway.

## Riscos se pulado

Um certificado ausente/expirado não detectado a tempo derruba HTTPS para o domínio afetado; recriar o `gateway_nginx` sem validar a config antes pode quebrar **todos** os tenants simultaneamente (não só o domínio sendo alterado).

## Atualizações

- 2026-08-19: nota criada, a partir dos comandos já documentados em `README.md` e do incidente real já registrado do lado Farmaura.