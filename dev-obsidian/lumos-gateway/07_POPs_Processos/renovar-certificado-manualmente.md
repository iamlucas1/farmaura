# Renovar certificado TLS manualmente

## Quando usar

Quando a renovação automática do Certbot não rodou (verificação preventiva) ou quando um certificado precisa ser forçado a renovar antes do vencimento (ex.: mudança de domínio, troca de configuração ACME).

## Passos

1. `docker compose exec lumos_gateway_certbot /renew_and_reload.sh` — roda a renovação e recarrega o Nginx automaticamente se algum certificado foi renovado.
2. Se um domínio específico falhar no lote (ex.: DNS quebrado do domínio, já visto acontecer com LumosNeon em `lumos-dev`, ver [[../05_Integracoes_Infra/Certbot_TLS|Certbot_TLS]]), emitir separadamente: `docker exec ... /issue.sh <domínio> <domínio>`, sem depender do restante do lote.
3. Confirmar o resultado com o POP [[verificar-certificados|verificar-certificados]].

## Responsável

Quem administra a infraestrutura do gateway (o mesmo perfil que já gerencia `lumos-prd`/`lumos-dev` via `ssh`).

## Riscos se pulado

Certificado expirado derruba HTTPS para o(s) domínio(s) afetado(s) — navegadores bloqueiam o acesso com aviso de certificado inválido/expirado, para todo tráfego daquele tenant.

## Atualizações

- 2026-08-19: nota criada, a partir dos comandos já documentados em `README.md`.
