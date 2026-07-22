# SMTP (e-mail transacional)

**Tipo:** Infraestrutura

## Propósito

Envio de e-mails transacionais: documentos fiscais emitidos e senha temporária de primeiro acesso.

## Contrato

- Configuração em `app/core/config.py`: `smtp_enabled`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_use_tls`.
- Consumido por `app/services/notification_service.py`.

## Dependências

- Credenciais vêm de variáveis de ambiente — nunca documentar valores reais aqui, só a existência das chaves (já coberto em `.env.example`, não duplicar).

## Ver também

- [[secure-python-backend]] (`_Compartilhado/Skills/`) — baseline geral de segurança de backend do qual esta integração faz parte.

## Atualizações

- 2026-07-19: nota criada.
