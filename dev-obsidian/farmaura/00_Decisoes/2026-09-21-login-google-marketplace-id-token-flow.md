---
cssclasses: ia-nota
---

# 2026-09-21 — Login com Google no marketplace: fluxo de ID token (não o redirect com secret do LumosMed)

## Contexto

Pedido do usuário: login/cadastro via Google **só no marketplace** (nunca no console interno), cobrindo três casos — criar conta nova via Google, entrar via Google numa conta já existente, e um cliente já logado por e-mail/senha poder vincular a própria conta Google em Configurações → Segurança para passar a entrar pelas duas formas. A tela de login já tinha um aviso reservado para isso ("Login social, incluindo Google, permanece desativado"), nunca implementado.

O produto irmão LumosMed já integra "Entrar com Google", mas via fluxo **server-side redirect com client secret** (`lumos-api/domains/identity/services/google_identity.py` + `lumosmed/app/Http/Controllers/Auth/PortalGoogleController.php`) — possível porque o LumosMed tem um BFF Laravel entre o navegador e a API Python, que guarda o secret e nunca expõe token nenhum ao Blade/JS. O marketplace Farmaura é uma SPA React pura, sem BFF — fala direto com `farmaura-api` via bearer token no navegador (`shared/api-client.js`).

## Alternativas consideradas

- **Espelhar o fluxo do LumosMed (redirect + client secret)** — descartada: exigiria inventar um BFF só para guardar o secret (nenhum existe hoje na SPA), infraestrutura nova desproporcional ao pedido.
- **`google-auth` (biblioteca Python oficial), como o `lumos-api` usa** — tentada primeiro, revertida: o transport HTTP dela (`google.auth.transport.requests`) exige a lib `requests`, que este backend deliberadamente não tem como dependência (todo outro cliente externo aqui usa `httpx` ou `urllib` — ver `claude.md`). Adicionar `requests` só para um transport shim quebraria essa convenção sem necessidade.
- **PyJWT + `PyJWKClient` contra o JWKS público do Google** (escolhida) — `PyJWT` já é dependência (usado nos tokens próprios); `PyJWKClient` busca e cacheia as chaves de assinatura do Google sozinho, usando só stdlib por baixo. Zero dependências novas.

## Decisão

- **Fluxo Google Identity Services (GIS) com ID token**: botão "Entrar com Google" no navegador (`react/shared/google-identity.js`, `google.accounts.id`) devolve um ID token assinado direto ao clique — sem redirect, sem código de autorização, sem client secret. O Client ID (`APP_GOOGLE_OAUTH_CLIENT_ID`) não é segredo (fica visível no navegador de qualquer forma) e é servido ao front via `GET /portal/marketplace/public-bootstrap`/bootstrap autenticado (mesmo padrão de feature flag de `ai_enabled`/`asaas_enabled`), não hardcoded no HTML.
- **Verificação no backend** (`app/core/google_identity.py::verify_google_id_token`): `PyJWKClient` busca a chave pública do Google pelo `kid` do token, `jwt.decode` valida assinatura RS256 + `aud` (contra o Client ID configurado) + claims obrigatórias; `iss` é conferido manualmente contra `accounts.google.com`/`https://accounts.google.com` depois do decode (checagem exposta como lista falhava o `mypy strict` do projeto ao passar por `jwt.decode(issuer=...)`).
- **Resolução de conta** (`PortalService.resolve_or_link_marketplace_account_via_google`): (1) usuário já linkado por `google_sub` → devolve direto; (2) e-mail já existe como conta por senha e o Google confirma `email_verified=true` → vincula automaticamente (é exatamente o "entrar pelas duas formas" pedido) — mas só depois de confirmar `can_access_portal(..., MARKETPLACE)`, para nunca gravar `google_sub` numa conta de staff antes da checagem de portal rejeitar; (3) nenhum dos dois → cria `Customer`+`User` novos, com senha aleatória inutilizável (Argon2 de um valor gerado no servidor) e `has_password=false`.
- **`users.has_password`** (nova coluna) marca contas sem senha real. Desvincular o Google fica bloqueado (`409`) enquanto `has_password=false`, para não trancar a própria conta — não existe hoje nenhum fluxo de "definir senha depois" para essas contas (ver pendência).
- **RLS**: novo GUC `app.current_login_google_sub` + função `app_private.current_login_google_sub()`, e a `users_access_policy` ganhou `OR (google_sub IS NOT NULL AND google_sub = app_private.current_login_google_sub())` — mesmo carve-out estreito que já existe para `current_login_email()`, só leitura (o `WITH CHECK` não precisou mudar: toda escrita reaproveita `apply_authenticated_context`/`apply_first_access_context` já existentes, igual ao `register_marketplace_account`).
- **`AuthService.login()` refatorado**: a parte depois da verificação de senha (checagem de portal, `must_change_password`, MFA, emissão de tokens) virou `continue_login()`, reutilizada tanto pelo login por senha quanto pelo login via Google — zero duplicação de branch.
- **Console interno intocado**: `google-identity.js` só é importado em `marketplace-entry.js`, nunca em `internal-entry.js`; as rotas novas (`/auth/login/google`, `/auth/google/link`, `/auth/google/unlink`) usam `require_marketplace_subject()`/checagem de portal `MARKETPLACE` — uma conta de staff nunca consegue linkar nem logar por aqui.

## Consequências

- **Migration obrigatória antes do deploy** (`20260921_01_users_google_link`: `users.google_sub` + `users.has_password`) — ver [[../06_Pendencias/aplicar-migration-google-oauth-em-producao|pendência]].
- **Verificado**: build do frontend limpo; suíte de testes do backend completa (257+ passando, só as 14 falhas pré-existentes e não relacionadas — ver nota abaixo); 14 testes novos (guard clauses de `google_identity.py`, vínculo/desvínculo com repositório stubado); migration aplicada e testada em Postgres local (Docker); `POST /auth/login/google` testado contra token inválido (401 genérico) e contra um JWT estruturalmente válido com `kid` desconhecido (confirma que o fetch real ao JWKS do Google acontece, ~460ms de round-trip); telas de login/cadastro/Configurações→Segurança conferidas visualmente via Playwright headless (botão do Google aparece nos dois modos, divisor "ou continue com e-mail", linha "Conta Google" nas Configurações); console interno confirmado sem nenhum elemento/script do Google.
- **Publicado em staging** (`lumos-dev`, `https://dev.drogariafarmaura.com.br`) no mesmo dia — ver [[../06_Pendencias/alembic-version-ausente-no-postgres-local|reincidência do gap de alembic_version encontrada nesse deploy]]: `farmaura_api` subiu unhealthy por schema desatualizado (não relacionado à migration nova), resolvido com reset do volume Postgres do próprio Farmaura (dado 100% seed, outros tenants do host confirmados intocados). No domínio real de staging, o botão do Google carregou **sem nenhum erro de origem** (diferente do teste local em `127.0.0.1:3000`, que precisa da origem cadastrada à parte no Console) — sinal de que essa origem já estava autorizada. Tela de login, cadastro e o console interno (sem nenhum elemento do Google) conferidos visualmente na URL real.
- **Ainda não verificado**: um login real via Google de ponta a ponta (precisa de consentimento humano num navegador de verdade, não automatizável) — a infraestrutura toda (botão carregando, backend validando contra o JWKS real do Google, fail closed testado) está pronta para esse teste em `https://dev.drogariafarmaura.com.br`.
- **Achado à parte, não corrigido aqui**: o botão "Alterar senha" em Configurações → Segurança (`account-profile-screen.jsx`) é hoje decorativo (só troca estado local, nenhuma chamada à API) — pré-existente, fora do escopo deste pedido, mas relevante porque uma conta 100% Google não tem hoje nenhum caminho funcional para ganhar uma senha própria. Ver [[../06_Pendencias/sem-fluxo-definir-senha-conta-google-only|pendência]].
- Doze testes pré-existentes falhando na suíte (não tocados nem causados por esta mudança): `test_auth_required.py` espera o shape de erro antigo `{"detail": ...}` sem o campo `category` (adicionado em 2026-09-13, teste nunca atualizado) e dois testes de `is_discarded` em `test_brand_service.py`/`test_product_service.py` — confirmado que ambos já falhavam numa base sem estas mudanças (mesmo erro, mesmo arquivo intocado).

## Ver também

- [[../02_Documentacao/Modulo_Auth|Modulo_Auth]] — fluxo de login completo, atualizado com os três estágios novos.
- [[../05_Integracoes_Infra/Google_SignIn|Google_SignIn]] — contrato da integração.
- [[../06_Pendencias/aplicar-migration-google-oauth-em-producao|Migration pendente em produção]].
- [[../06_Pendencias/sem-fluxo-definir-senha-conta-google-only|Sem fluxo de definir senha para conta 100% Google]].
- `lumos-api/domains/identity/services/google_identity.py` / `lumosmed/app/Http/Controllers/Auth/PortalGoogleController.php` — fluxo irmão (redirect + secret), documentado em [[../../lumosmed/05_Integracoes_Infra/Google_SignIn|lumosmed/Google_SignIn]], não replicado aqui pelos motivos acima.
