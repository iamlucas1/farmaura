# Skill: secure-auth-rbac-jwt

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/secure-auth-rbac-jwt/SKILL.md`

## Propósito

Padrão para autenticação, JWT/refresh, RBAC, ownership e isolamento de tenant em backend Python.

## Quando usar

Login, refresh, logout, papéis/permissões, checagem de ownership, isolamento de tenant e fluxos de senha.

## Regras principais

- Access token de vida curta.
- Refresh token rotativo e revogável no servidor.
- Payload do JWT minimal.
- Autorização checada no backend para toda ação sensível — role check sozinho não basta, sempre reforçar ownership e escopo de tenant também.
- Fluxos de auth compatíveis com requisições vindas através do `lumos-gateway` (proto/host encaminhados).
- Identidade de cliente do marketplace nunca pode montar a casca do portal interno — negar no limite de login interno com mensagem genérica e limpar sessão restaurada.

## Controles obrigatórios

Argon2id via `pwdlib[argon2]`; validação explícita de `iss`/`aud`/`sub`/`exp`/`nbf`/`iat`; algoritmos permitidos explícitos; invalidação de família de refresh token; invalidação no logout; invalidação de sessão após reset de senha ou mudança de privilégio; testes de autorização horizontal e vertical.

Desde 2026-07-20, também obrigatório:

- **Política de força de senha** em todo campo onde um humano escolhe a própria senha (cadastro, reset) — mínimo de tamanho + letra minúscula + letra maiúscula + número + caractere especial. Nunca aplicar a senhas temporárias geradas pelo sistema (já têm entropia muito maior que qualquer senha memorizável).
- **Rate limit por IP** (janela fixa, Redis) em todo endpoint público de auth (login, register, verify-2fa, refresh, pedido de primeiro acesso/reset). Deve falhar aberto (deixar passar) se o Redis estiver indisponível — autenticação não pode depender da saúde do limitador.
- **Bloqueio exponencial por conta** no login, independente de IP: conta tentativas falhas consecutivas por identificador (e-mail), bloqueia a conta ao cruzar um limiar, e dobra a janela de bloqueio a cada nova falha enquanto bloqueada (tentativas feitas durante o bloqueio não contam como nova falha). Reseta o contador e o bloqueio no próximo login bem-sucedido.
- **Desbloqueio self-service por e-mail**: ao aplicar um bloqueio novo (não a cada tentativa rejeitada), gerar um token de desbloqueio de uso único com TTL, enviar por e-mail um link para uma página dedicada, e só desbloquear mediante ação explícita do usuário (clique em botão) — nunca automaticamente ao carregar a página ou num GET simples, porque scanners de segurança de e-mail fazem prefetch de links e queimariam o token antes do dono real clicar.

## Padrão de construção

1. Helper de hashing de senha.
2. Validador de força de senha (checagem de classes de caractere), aplicado em todo schema onde um humano escolhe a própria senha.
3. Helper de encode/decode de JWT com validação estrita.
4. Model de persistência de refresh token.
5. Rate limiter de janela fixa com Redis, como dependency de rota em todo endpoint público de auth; falha aberto em erro de Redis.
6. Guard de login por conta (contador de falhas + bloqueio exponencial, chaveado por e-mail): checar não-bloqueado antes de verificar a senha, registrar falha após senha errada, limpar no sucesso.
7. Auth service com login, refresh, logout, revoke.
8. Dependências de role e ownership.
9. Testes de API: login sucesso/falha, token expirado, refresh revogado, negação cross-tenant, negação cross-user, senha fraca rejeitada no cadastro/reset, conta bloqueada após o limiar e desbloqueada após a janela.

## Referência real no repositório

- `farmaura-api/app/core/jwt.py` implementa o padrão de token com 4 tipos (acesso, refresh, desafio MFA, desafio de reset de senha) — ver [[../../farmaura/02_Documentacao/Visao_Geral|Visão Geral]].
- `farmaura-api/app/domain/validators.py` (`is_strong_password`) — validador de força de senha, aplicado em `CompletePasswordResetRequest.new_password` e `PortalRegisterRequest.password`.
- `farmaura-api/app/core/rate_limit.py` — políticas (`AUTH_RATE_LIMIT` 10/60s, `PASSWORD_RESET_RATE_LIMIT` 5/300s, `PUBLIC_RATE_LIMIT` 120/60s, `UPLOAD_RATE_LIMIT`) e dependency `rate_limit(policy)`, aplicada em `/auth/login`, `/auth/register`, `/auth/verify-2fa`, `/auth/complete-first-access`, `/auth/refresh`, `/catalog/public`, `/portal/marketplace/public-bootstrap`, `/portal/marketplace/first-access`, `/portal/products/{ref}/reviews`.
- `farmaura-api/app/core/login_guard.py` — bloqueio exponencial por conta (limiar de 5 falhas, base de 30s dobrando a cada falha adicional até 24h) + emissão de token de desbloqueio de uso único (`GETDEL` atômico no Redis), chamado em `AuthService.login`/`AuthService.unlock_account`.
- `farmaura-api/app/services/notification_service.py` (`send_account_locked_email`) + `POST /auth/unlock-account` + página `UnlockAccountScreen` em `farmaura/react/marketplace/screens/account-screen.jsx` (rota `/marketplace/unlock-account?token=...`) — fluxo completo de notificação e autodesbloqueio. Ver decisão [[../../farmaura/00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|2026-07-20 Rate limit e bloqueio exponencial]].

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
