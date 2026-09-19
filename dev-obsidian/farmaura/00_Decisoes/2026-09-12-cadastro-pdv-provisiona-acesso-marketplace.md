---
cssclasses: ia-nota
---

# 2026-09-12 — Cadastro de cliente pelo PDV passa a provisionar acesso ao marketplace

## Contexto

O formulário "Cadastrar cliente" do Balcão (PDV, usado tanto pela visão do farmacêutico quanto
pela do caixa) só criava um registro de CRM (`Customer`) — nome, CPF, telefone, e-mail opcional.
Nenhuma conta de login (`User`) era criada, então um cliente cadastrado presencialmente na loja
nunca ganhava acesso à própria conta no marketplace, mesmo informando e-mail.

O usuário pediu que esse cadastro passasse a: exigir e-mail, enviar um e-mail avisando que a conta
foi cadastrada, e levar o cliente a uma tela onde ele define uma senha (ou vincula com Google) —
"para que o cliente possa ter acesso a conta dele". Pediu também para eu checar a postura de
segurança já documentada no cofre antes de implementar.

## Descoberta: o mecanismo já existia, só não era usado pelo PDV

Antes de escrever qualquer código novo, encontrei que o backend **já tinha um fluxo de "primeiro
acesso" completo e já testado**, com a docstring do próprio endpoint público dizendo literalmente
"Provision or renew first-access credentials for a **PDV-registered customer**":

- `POST /portal/marketplace/first-access` (`PortalService.request_marketplace_first_access`) — dado
  um e-mail, cria (ou renova, se ainda pendente) um `User` de papel `customer` com senha temporária
  de 12 caracteres (~71 bits de entropia, ver [[2026-07-20-politica-de-senha-forte]]) e
  `must_change_password=True`, envia e-mail via `NotificationService.send_first_access_email`, e
  sempre devolve a mesma resposta genérica (nunca revela se o e-mail existe).
- Login normal com a senha temporária devolve um `challenge_token` (por causa de
  `must_change_password`); `POST /auth/complete-first-access` troca esse token + uma senha nova
  (validada por `is_strong_password()`) por uma sessão de verdade.
- Ambos os endpoints já são protegidos por rate limit (`PASSWORD_RESET_RATE_LIMIT`/
  `AUTH_RATE_LIMIT`) — ver [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]].

Ou seja: a "tela onde ele preenche uma senha" pedida já existe (é a mesma tela de primeiro acesso
do marketplace) — só faltava o PDV disparar esse provisionamento no momento do cadastro.

## Decisão

1. **E-mail passa a ser obrigatório** em `CrmCustomerCreateRequest` (schema) e no formulário
   `RegisterCustomerModal` (frontend) — sem e-mail não há como entregar o acesso, então deixou de
   fazer sentido como campo opcional nesse formulário específico.
2. **Extraída a lógica de provisionamento** de `PortalService.request_marketplace_first_access`
   para uma função compartilhada, `app/services/customer_access_service.provision_first_access(
   session, *, tenant_id, email, full_name)` — cria/renova o `User` e dispara o e-mail, sem
   fazer commit (cada chamador é dono da própria transação, mesmo padrão já usado em todo o
   resto do backend). `PortalService` foi refatorado para chamar essa função em vez de duplicar
   a lógica inline.
3. **`CrmService.create_customer` (PDV) passa a chamar essa mesma função** logo após criar (ou
   encontrar) o cliente — nos três caminhos: cliente novo, cliente já existente por CPF, cliente
   já existente por e-mail. Isso é seguro porque `provision_first_access` já é
   **idempotente/anti-spam por design**: se o `User` já existe e já completou o primeiro acesso
   (`must_change_password=False`), a função não faz nada — não reenvia e-mail nem gera senha nova
   para uma conta já ativa.
4. **Vínculo com Google (OAuth) — decidido NÃO implementar nesta rodada.** Não existe nenhuma
   infraestrutura de OAuth no projeto hoje (nenhum client ID/secret, nenhuma biblioteca de
   verificação de token, nenhuma tela de callback) — construir isso do zero exige credenciais reais
   do Google Cloud Console que só o usuário pode provisionar, e é uma superfície de segurança
   grande o suficiente (validação de `state` contra CSRF, verificação de audience do token,
   vínculo de conta por e-mail não verificado é um vetor clássico de account takeover) para merecer
   sua própria decisão dedicada, não um adendo a este cadastro. Fica registrado como trabalho futuro
   quando o usuário tiver as credenciais do Google Cloud/Workspace prontas — ver "Pendências"
   abaixo.

## Segurança verificada antes de implementar

Conferido contra `_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md`
e a política de senha forte:

- **Sem exposição de segredo**: senha temporária nunca aparece em log, resposta de API ou nesta
  documentação — só é enviada por e-mail.
- **Senha forte na definição, não na temporária**: a senha *escolhida pelo cliente* em
  `/auth/complete-first-access` passa por `is_strong_password()`; a senha temporária gerada pelo
  sistema já é isenta dessa regra por ter mais entropia que qualquer senha memorizável — ver
  [[2026-07-20-politica-de-senha-forte]] (decisão já existente, não alterada aqui).
- **Nenhum "modo admin" novo**: `provision_first_access` não contorna RLS nem cria um caminho de
  acesso cross-tenant — o `User` é criado no mesmo `tenant_id` já resolvido pela sessão autenticada
  do farmacêutico/caixa (mesmo padrão já usado por `TeamService.create_member` para criar contas
  de equipe).
- **Mensagem de erro genérica preservada** no endpoint público (`request_marketplace_first_access`)
  — o refactor não mudou esse comportamento, só moveu a lógica interna para a função compartilhada.

## Pendências abertas (não resolvidas nesta rodada)

- **`POST /crm/customers` não tem rate limit** — ver
  [[../06_Pendencias/rate-limit-ausente-cadastro-pdv-com-envio-de-email|rate-limit-ausente-cadastro-pdv-com-envio-de-email]].
  Rota autenticada (só farmacêutico/caixa), mas agora dispara e-mail real — abuso (sessão
  comprometida, script com bug em retry) poderia gerar spam de e-mail para o mesmo cliente.
- **Login com Google** — ver acima; nenhuma ação até o usuário ter credenciais do Google
  Cloud/Workspace.

## Ver também

- [[2026-07-20-politica-de-senha-forte]]
- [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]]
- [[../06_Pendencias/rate-limit-ausente-cadastro-pdv-com-envio-de-email|rate-limit-ausente-cadastro-pdv-com-envio-de-email]]
- [[2026-09-13-rls-bloqueava-2fa-e-conclusao-do-primeiro-acesso]] — bug crítico encontrado ao testar este mesmo fluxo ponta a ponta: a conclusão do primeiro acesso (e, do mesmo jeito, o login com 2FA) sempre falhava com "Invalid credentials" por um problema de ordem de aplicação de contexto de RLS, não relacionado ao e-mail/senha em si.
- [[../05_Integracoes_Infra/SMTP|SMTP]] — template HTML compartilhado (logo via CID, modo escuro) usado pelo e-mail de primeiro acesso disparado aqui.
- `_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md`