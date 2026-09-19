---
cssclasses: ia-nota
---

# SMTP (e-mail transacional)

**Tipo:** Infraestrutura

## Propósito

Envio de e-mails transacionais: documentos fiscais emitidos, senha temporária de primeiro acesso, bloqueio de conta e produto disponível novamente.

## Contrato

- Configuração em `app/core/config.py`: `smtp_enabled`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_use_tls`, `smtp_from_email`, `smtp_from_name` — prefixo `APP_SMTP_*` nas variáveis de ambiente reais.
- Também depende de `marketplace_base_url` (`APP_MARKETPLACE_BASE_URL`) para montar links absolutos (ex.: link de desbloqueio de conta) — **não** é usada para a logo do e-mail (ver abaixo).
- Toda a construção de e-mail vive em `app/services/notification_service.py`: um shell HTML compartilhado (`_wrap_email_html`) que toda mensagem usa, com helpers de conteúdo (`_eyebrow`, `_heading`, `_paragraph`, `_code_block`, `_button`) — nenhum dos 4 e-mails monta HTML solto por conta própria.
- **Logo embutida via CID, não por URL**: `app/assets/email/logo.png` (cópia própria do backend, independente do build do frontend) é anexada a cada mensagem como parte MIME relacionada (`Content-ID`) e referenciada no HTML via `<img src="cid:...">`. Escolhido deliberadamente no lugar de uma URL hospedada — não depende de nenhum deploy do frontend para renderizar, e não é bloqueada pelo "exibir imagens externas?" que a maioria dos clientes de e-mail aplica a imagens remotas.
- **Suporte real a modo escuro**: `<meta name="color-scheme" content="light dark">` + `<meta name="supported-color-schemes" content="light dark">` no `<head>` — isso desativa a inversão automática de cor que Gmail/Outlook.com aplicam por padrão (e que antes deixava a logo com fundo transparente aparecendo com cor errada) e deixa a paleta escura própria (`_DARK_*` em `notification_service.py`) assumir via `@media (prefers-color-scheme: dark)`. A faixa onde a logo fica (fundo bege) **nunca** escurece de propósito — garante que a logo sempre pousa num fundo claro previsível, em qualquer tema.

## Ambientes

- **Local/dev**: `docker-compose.yml` inclui o serviço `farmaura-mailhog` (`mailhog/mailhog:v1.0.1`), portas `127.0.0.1:1025` (SMTP, é o que `APP_SMTP_HOST=host.docker.internal`/`APP_SMTP_PORT=1025` no `.env` local espera) e `127.0.0.1:8025` (UI web pra inspecionar os e-mails capturados, sem enviar nada de verdade). Pode ser trocado para o Gmail real (ver abaixo) quando se quer testar entrega de ponta a ponta — nesse caso os e-mails de teste saem de verdade, não ficam só no Mailhog.
- **Produção**: Gmail Workspace via `smtp.gmail.com:587`, autenticando como `marketplace@drogariafarmaura.com.br` com uma **Senha de app** do Google (não a senha normal da conta — o Google recusa login SMTP com ela). Remetente (`APP_SMTP_FROM_EMAIL`) é o alias `naoresponda@drogariafarmaura.com.br` — para o Gmail aceitar e preservar esse remetente (em vez de reescrevê-lo pro endereço autenticado), o alias precisa estar cadastrado em **Gmail → Configurações → Contas e importação → Enviar mensagens como**, na própria caixa `marketplace@...`.
- Gerar a senha de app exige Verificação em Duas Etapas ativa na conta Google (`myaccount.google.com/apppasswords`); em contas Workspace mais novas essa opção pode não aparecer se o admin não permitiu — nesse caso, checar Admin Console → Segurança → Autenticação → Verificação em duas etapas → "Permitir que os usuários usem senhas de app" para a unidade organizacional da conta.

## Dependências

- Credenciais vêm de variáveis de ambiente — nunca documentar valores reais aqui, só a existência das chaves (já coberto em `.env.example`, não duplicar).

## Ver também

- [[secure-python-backend]] (`_Compartilhado/Skills/`) — baseline geral de segurança de backend do qual esta integração faz parte.
- [[../00_Decisoes/2026-09-12-cadastro-pdv-provisiona-acesso-marketplace|Cadastro PDV provisiona acesso ao marketplace]] — decisão que introduziu o e-mail de primeiro acesso disparado pelo PDV.

## Atualizações

- 2026-09-13: template HTML compartilhado com identidade visual (logo via CID, paleta da marca, suporte a modo claro/escuro) substituiu o HTML solto que cada e-mail montava por conta própria; Mailhog adicionado ao `docker-compose.yml` para inspeção local de e-mails de teste sem envio real.
- 2026-07-19: nota criada.