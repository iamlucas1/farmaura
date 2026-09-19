---
cssclasses: ia-nota
---

# 2026-09-13 — RLS bloqueava conclusão do primeiro acesso (e 2FA login) por contexto aplicado tarde demais

## Contexto

Testando o fluxo real de primeiro acesso via PDV (ver [[2026-09-12-cadastro-pdv-provisiona-acesso-marketplace|ADR anterior]]) — cadastro → e-mail com senha temporária → login → tela "Defina sua nova senha" (`LoginScreen`/`account-screen.jsx`, `stage: 'password_change'`) — o passo final (`POST /auth/complete-first-access`) sempre devolvia `401 Invalid credentials`, mesmo com a senha temporária correta recém-recebida por e-mail e o `challenge_token` genuíno emitido pelo próprio `/auth/login` segundos antes.

## Causa raiz

`AuthService.complete_password_reset()` (e, do mesmo jeito, `AuthService.verify_two_factor()`) faziam, nessa ordem:

1. Decodificar o challenge token (JWT já assinado e verificado nesse ponto).
2. `UserRepository.get_by_id(challenge_payload["sub"])` — **sem nenhum contexto de RLS aplicado antes**.
3. Só depois de já ter o `user` em mãos (ou seja, depois do passo que falhava), chamar `apply_authenticated_context(...)`.

A política de RLS de `users` (`app/core/row_level_security.py`, `users_access_policy`) só libera leitura por três vias: e-mail bater com `current_login_email()`, e-mail bater com `current_first_access_email()`, ou `tenant_id = current_tenant_id() AND id = current_user_id()` — nenhuma delas cobre "busca por id sem nenhum GUC setado". Confirmado direto no Postgres, conectando como o role de runtime restrito (`farmaura_app`, `rolbypassrls=false`) sem GUC nenhum:

```sql
SELECT id, email FROM users WHERE id = '<id real, existente>';
-- 0 rows
```

Ou seja: o `get_by_id()` sempre devolvia `None` — não porque a senha estivesse errada, mas porque a *linha inteira ficava invisível* para essa consulta. O código então levantava `AuthenticationError()` (mensagem padrão "Invalid credentials"), indistinguível de uma senha realmente incorreta.

**Isso não é um bug introduzido agora** — o código de `verify_two_factor`/`complete_password_reset` já existia antes desta sessão. `verify_two_factor` nunca chamou `apply_authenticated_context` em lugar nenhum do método. Ou seja, **login com 2FA provavelmente já estava quebrado da mesma forma, incluindo em produção**, para qualquer conta com `two_factor_enabled=true` — só não tinha sido percebido/relatado ainda.

## Decisão

Mover a aplicação do contexto de RLS para **antes** da consulta, usando os claims `tenant_id`/`sub` que já vêm dentro do próprio challenge token (JWT já verificado por assinatura nesse ponto — os claims são confiáveis):

```python
challenge_payload = decode_password_reset_challenge_token(token=payload.challenge_token, settings=self.settings)
await apply_authenticated_context(self.session, tenant_id=str(challenge_payload["tenant_id"]), user_id=str(challenge_payload["sub"]))
user = await self.user_repository.get_by_id(str(challenge_payload["sub"]))
```

Mesma correção aplicada em `verify_two_factor` (que não tinha nenhuma chamada de contexto antes). A chamada duplicada de `apply_authenticated_context` que existia mais abaixo em `complete_password_reset` foi removida (redundante, já aplicado no início).

## Consequências

- **Ação recomendada, não executada por mim**: se alguma conta real em produção tem 2FA ativo (`two_factor_enabled=true`), o login dela está quebrado até este fix ser implantado — vale considerar prioridade de deploy. Não apliquei nenhuma mudança em produção nesta sessão (só local), por política — ver `claude.md`/`dev-obsidian/CLAUDE.md` § Regras de deploy.
- Risco registrado em [[../04_Seguranca_Riscos/rls-bloqueava-2fa-login-e-primeiro-acesso|rls-bloqueava-2fa-login-e-primeiro-acesso]].
- Testado localmente ponta a ponta após a correção: `POST /auth/login` (senha temporária) → `password_change_required` → `POST /auth/complete-first-access` → `200 { stage: "authenticated", token_pair: {...} }`. Confirmado no banco: `must_change_password` virou `false` para a conta de teste.
- Nenhuma mudança de schema, política de RLS ou contrato de API — só a ordem de duas chamadas já existentes.

## Ver também

- [[2026-09-12-cadastro-pdv-provisiona-acesso-marketplace]] — fluxo que expôs o bug.
- [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]] — mecanismo de RLS e GUCs envolvidos.
- [[../04_Seguranca_Riscos/rls-bloqueava-2fa-login-e-primeiro-acesso|rls-bloqueava-2fa-login-e-primeiro-acesso]] — registro do risco/impacto.
- `_Compartilhado/Padroes_Politicas/padrao-rls-multitenant-via-session-guc.md` — padrão genérico de RLS via GUC que este bug violava na ordem de aplicação.