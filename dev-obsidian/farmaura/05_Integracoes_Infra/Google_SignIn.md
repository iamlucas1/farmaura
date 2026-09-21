---
cssclasses: ia-nota
---

# Google Sign-In (marketplace)

**Tipo:** API de terceiro

## Propósito

Login/cadastro via conta Google no marketplace do Farmaura, alternativa a e-mail/senha, com vínculo/desvínculo self-service em Configurações → Segurança. **Só o marketplace** — o console interno (`internal.html`/`PharmLogin`) nunca carrega nada relacionado ao Google. Ver [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]] para o racional completo (por que ID token via GIS, não o redirect com secret do LumosMed).

## Contrato

- **Frontend**: `farmaura/react/shared/google-identity.js` (`window.FA_GOOGLE_IDENTITY.renderGoogleButton`) carrega o script `https://accounts.google.com/gsi/client` (`marketplace.html`) e renderiza o botão oficial do Google via `google.accounts.id`. Só importado em `src/marketplace-entry.js`, nunca em `internal-entry.js`. Devolve um ID token (JWT assinado pelo Google) ao backend — nunca um client secret, que não existe neste fluxo.
- **Backend**: `app/core/google_identity.py::verify_google_id_token` — verifica assinatura RS256 via JWKS público do Google (`PyJWT` + `PyJWKClient`, sem a lib `google-auth`/`requests`), `aud` contra `google_oauth_client_id` (`app/core/config.py`, env `APP_GOOGLE_OAUTH_CLIENT_ID`) e `iss` contra `accounts.google.com`/`https://accounts.google.com`.
- **Client ID não é segredo** (fica visível no navegador de qualquer app que o use) — configurado só no backend e exposto ao front via `google_oauth_client_id` no bootstrap público/autenticado do marketplace (`PortalMarketplacePublicBootstrapResponse`/`PortalMarketplaceBootstrapResponse`), vazio = feature desligada. **Não existe client secret neste fluxo** (ID token, não redirect/código de autorização).
- **Rotas**: `POST /auth/login/google` (cria conta nova ou loga numa existente, auto-vínculo por e-mail verificado, `_ensure_portal_login_allowed(MARKETPLACE)` — fail closed para conta de staff), `POST /auth/google/link`/`POST /auth/google/unlink` (autenticadas, `require_marketplace_subject()`).
- **Resolução de conta**: `app/services/portal_service.py::resolve_or_link_marketplace_account_via_google` — por `google_sub` (usuário já vinculado) → por e-mail verificado (auto-vínculo) → cria conta nova (`users.has_password=false`, senha aleatória inutilizável).
- **RLS**: GUC `app.current_login_google_sub` (`app/core/tenant_context.py::apply_google_login_context`) + carve-out em `users_access_policy` (`app/core/row_level_security.py`), mesmo padrão de `current_login_email`.
- Configuração necessária no Google Cloud Console: projeto + tela de consentimento OAuth (Externo) + credencial "ID do cliente OAuth" tipo "Aplicativo da Web", com as origens JavaScript de cada ambiente autorizadas (dev local, `dev.drogariafarmaura.com.br`, `drogariafarmaura.com.br`) — **nenhum URI de redirecionamento é necessário** (fluxo de token, não de redirect).

## Dependências

- [[Modulo_Auth|Modulo_Auth]] (`02_Documentacao/`) — fluxo de login completo, RBAC.
- `PyJWT==2.13.0` (já dependência, reaproveitada — nenhuma lib nova adicionada).

## Ver também

- [[../../lumosmed/05_Integracoes_Infra/Google_SignIn|lumosmed/Google_SignIn]] — integração irmã, fluxo diferente (redirect + client secret, via BFF Laravel).
- [[../06_Pendencias/aplicar-migration-google-oauth-em-producao|Migration pendente em produção]].
- [[../06_Pendencias/sem-fluxo-definir-senha-conta-google-only|Sem fluxo de definir senha para conta 100% Google]].

## Atualizações

- 2026-09-21: nota criada, junto com a implementação do login/cadastro/vínculo via Google no marketplace.
