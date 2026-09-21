---
cssclasses: ia-nota
---

# Módulo Auth

## O que é

Autenticação e RBAC do Farmaura. Boa parte já está coberta pela skill [[../../_Compartilhado/Skills/secure-auth-rbac-jwt|secure-auth-rbac-jwt]] (Argon2id, 4 tipos de JWT, rate limit por IP, bloqueio exponencial por conta + desbloqueio self-service) e pelas decisões [[../00_Decisoes/2026-07-20-politica-de-senha-forte|política de senha forte]] e [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|rate limit e bloqueio exponencial]] — confirmado que o código atual bate com essas notas. Esta nota cobre o que faltava: o fluxo completo de login em todos os estágios, refresh/logout, RBAC concreto por papel, e os dois fluxos de primeiro acesso.

## Fluxo completo de login (`POST /auth/login`)

Devolve um de três shapes, nesta ordem de decisão: 1) conta bloqueada → 429; 2) senha errada → falha genérica (não vaza se foi e-mail inexistente ou senha errada); 3) `_ensure_portal_login_allowed` — **falha fechado se o papel/escopo não bate com o portal solicitado**, mensagem genérica sem detalhar o motivo; 4) se `must_change_password` → `PasswordChangeRequiredResponse` com `challenge_token` tipo `pwd_reset` (fluxo de primeiro acesso do PDV); 5) se `two_factor_enabled` → `TwoFactorChallengeResponse` com `challenge_token` tipo `mfa`; 6) senão, emite par de tokens direto.

- **`POST /auth/complete-first-access`**: consome o `challenge_token pwd_reset`, revalida `session_version` (invalida challenges antigos se a sessão mudou entre emissão e uso) e `_ensure_portal_login_allowed`, seta nova senha (forte) + `must_change_password=False`. É o mesmo endpoint tanto para "primeiro acesso" (cliente PDV) quanto para qualquer usuário com `must_change_password=True` — não há endpoint separado de troca voluntária de senha.
- **`POST /auth/verify-2fa`**: mesma revalidação de `session_version`/portal, valida TOTP, emite tokens.
- **Setup de 2FA** (`/auth/2fa/setup|enable|disable`): `begin_two_factor_setup` gera secret mas **não habilita** até `enable_two_factor` confirmar um código válido — evita lockout por secret nunca confirmado. `disable_two_factor` também exige TOTP válido.
- **`POST /auth/register`**: rota fina que delega para `PortalService.register_marketplace_account` (não `AuthService`) e emite tokens — cria `Customer`+`User` (`role=CUSTOMER`, `access_scope=MARKETPLACE`), sem `must_change_password`.
- **`POST /auth/login/google`** (marketplace só): verifica o ID token do Google (`app/core/google_identity.py`), resolve/cria a conta (`PortalService.resolve_or_link_marketplace_account_via_google`) e segue o mesmo `continue_login()` do login por senha (checagem de portal, `must_change_password`, MFA). **`POST /auth/google/link`**/**`POST /auth/google/unlink`** (autenticadas, `require_marketplace_subject()`) vinculam/desvinculam a conta Google já logada — ver [[../05_Integracoes_Infra/Google_SignIn|Google_SignIn]] e o [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]].
- **Refresh com rotação e detecção de reuso**: cada refresh gera nova família (`family_id`)+`jti`; se o hash apresentado não bater com o persistido, ou o registro já estiver revogado, **a família inteira é revogada** (`refresh_token_reuse_detected`) — mitigação contra roubo de refresh token. `refresh_tokens` guarda `token_hash` (nunca em claro), IP, user-agent, `replaced_by_token_id`, `revoked_reason`.
- **`POST /auth/logout` vs `/auth/logout-all`**: logout revoga só o token apresentado; `logout-all` incrementa `user.session_version` (invalida *todos* os access tokens já emitidos) e revoga todos os refresh tokens — usado após reset de senha/mudança de privilégio.
- **`GET /auth/session`**: devolve `TokenSubject` decodificado + dados do banco + `allowed_portals`/`allowed_modules` calculados por `domain/permissions.py` — usado para "hidratar" a UI pós-refresh de página.

## RBAC concreto (achado principal — não estava em nenhuma nota)

- **Roles**: `admin, customer, manager, pharmacist, cashier, driver`.
- **Access scopes**: `marketplace` (só customer), `internal` (staff), `hybrid` (só admin — permite logar também no marketplace com o mesmo login).
- **Portais**: `can_access_portal(role, access_scope, portal)` — `marketplace` só para `CUSTOMER+MARKETPLACE`; `internal` para os 5 papéis de staff com `access_scope ∈ {INTERNAL, HYBRID}`. Checado em **todo** estágio do login (senha, MFA, reset), não só no primeiro passo.
- **Módulos por papel** (`INTERNAL_MODULES_BY_ROLE`, mapa fixo hardcoded — o RBAC de verdade do console interno): `ADMIN` tem tudo, incluindo `sales`; **`MANAGER` e `PHARMACIST` têm exatamente os mesmos módulos entre si** (dashboard, pdv, orders, deliveries, prescriptions, chat, crm, analytics, inventory, pricing — sem `sales`); `CASHIER` só `dashboard, pdv, sales`; `DRIVER` só `driver_route`; `CUSTOMER` nenhum módulo interno. Servido via `GET /auth/session.allowed_modules` e **duplicado no frontend** (`shared/access-control.js`, `window.FA_ACCESS`) sem verificação de sincronização entre os dois mapas — risco de drift.

## Dois fluxos de primeiro acesso

1. **Cliente registrado via PDV** (nunca logou): `POST /portal/marketplace/first-access` gera senha temporária de 12 caracteres, cria/atualiza `User`, envia e-mail; no próximo login, `must_change_password=True` força o challenge `pwd_reset`.
2. **Auto-registro marketplace** (`POST /auth/register`): sem senha temporária, sem `must_change_password` — o usuário já escolhe a senha final (validada como forte).

## Convite/provisionamento de equipe interna — divergência de processo

`POST /team/members` (ADMIN only): o admin informa a senha do novo funcionário **em texto claro no request**, o backend só faz hash — **não há convite por e-mail, senha temporária, nem `must_change_password=True`** setado na criação, diferente do fluxo de cliente PDV. O funcionário novo recebe a senha definida pelo admin sem ser forçado a trocá-la no primeiro login, e não há endpoint de reset de senha por admin para um membro existente. Ver detalhe de RBAC de equipe em [[Modulo_Lojas_Fornecedores_Equipe|Módulo Lojas, Fornecedores e Equipe]].

## Tabelas envolvidas

- **`users`** — `role`/`access_scope` (CHECKs), `two_factor_enabled/secret`, `must_change_password`, `session_version` (int — usado tanto para logout-all quanto para invalidar challenges emitidos antes de uma mudança de sessão), `store_id` (FK `stores.id` SET NULL), `ui_theme` (`auto|light|dark`, check `ck_users_users_ui_theme_allowed`) — tema do console interno escolhido pela própria pessoa; devolvido em `GET /auth/session` e gravado por `PATCH /auth/preferences` (só portal interno, sempre na conta do próprio token, corpo estrito `{ui_theme}`). Ver [[../00_Decisoes/2026-09-20-tema-claro-escuro-preferencia-por-usuario|ADR]]. `google_sub` (nullable, único) + `has_password` (default `true`, `false` só para contas 100% Google) — ver [[../05_Integracoes_Infra/Google_SignIn|Google_SignIn]].
- **`refresh_tokens`** — ver rotação/detecção de reuso acima.
- **`customers`** — ligado a `users` por e-mail (não FK direta); todo cliente marketplace tem ambos os registros.

## Frontend

- **Marketplace** (`account-screen.jsx`): `LoginScreen` único com 3 modos (login/register/first-access) e 3 estágios internos (credentials/two_factor/password_change); `UnlockAccountScreen` exige clique explícito (não desbloqueia em GET). Validação de força de senha replicada no client para feedback antes do 422. Botão "Continuar com o Google"/"Inscrever-se no Google" (`shared/google-identity.js`, GIS) nos modos login/register, só quando `google_oauth_client_id` vem preenchido no bootstrap; vínculo/desvínculo em Configurações → Segurança (`account-profile-screen.jsx`, `AccountSettings`). Nada disso existe no console interno.
- **Interno** (`internal-shell.jsx`): `PharmLogin` — login-only, sem tabs de registro (times internos não se auto-cadastram).
- **Cliente HTTP compartilhado** (`shared/api-client.js`): duas instâncias de namespace (marketplace/internal) nunca compartilham token storage; `authenticatedFetch` faz retry automático após 401 via refresh; `logout()` sempre limpa storage local mesmo se a revogação no servidor falhar.

## Ver também

- [[../../_Compartilhado/Skills/secure-auth-rbac-jwt|Skill: secure-auth-rbac-jwt]].
- [[../00_Decisoes/2026-07-20-politica-de-senha-forte|Política de senha forte]].
- [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|Rate limit e bloqueio exponencial]].
- [[Modulo_Lojas_Fornecedores_Equipe|Módulo Lojas, Fornecedores e Equipe]] — provisionamento de conta de funcionário.
- [[Modulo_Portal|Módulo Portal]] — `register_marketplace_account`/`request_marketplace_first_access` vivem fisicamente em `portal_service.py`.
- [[../05_Integracoes_Infra/Google_SignIn|Google_SignIn]] e [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]] — login/cadastro/vínculo via Google, marketplace só.
- [[Visao_Geral|Visão Geral]].

## Atualizações

- 2026-09-21: login/cadastro via Google (marketplace só) + vínculo/desvínculo em Configurações → Segurança — `POST /auth/login/google`, `POST /auth/google/link`, `POST /auth/google/unlink`, colunas `users.google_sub`/`users.has_password`. Ver [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]] e [[../06_Pendencias/aplicar-migration-google-oauth-em-producao|migration pendente em produção]].
- 2026-09-20: `users.ui_theme` + `PATCH /auth/preferences` + campo `ui_theme` em `GET /auth/session` (tema claro/escuro/automático por usuário no console interno; seletor na aba Preferências de "Minha conta") — ver [[../00_Decisoes/2026-09-20-tema-claro-escuro-preferencia-por-usuario|ADR]] e [[../06_Pendencias/aplicar-migration-user-ui-theme-em-producao|migration pendente em produção]].
- 2026-07-25: nota criada — documentação do estado atual do módulo.