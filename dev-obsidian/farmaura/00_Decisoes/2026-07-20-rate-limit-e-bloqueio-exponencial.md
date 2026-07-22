# 2026-07-20 — Rate limit por IP e bloqueio exponencial por conta no login

## Contexto

Uma revisão de segurança do acesso anônimo (cliente não logado, marketplace exposto à internet) encontrou que os endpoints públicos de autenticação (`/auth/login`, `/auth/register`, `/auth/verify-2fa`, `/auth/refresh`, `/auth/complete-first-access`, `/portal/marketplace/first-access`) e de navegação pública (`/catalog/public`, `/portal/marketplace/public-bootstrap`, `/portal/products/{ref}/reviews`) não tinham nenhum limite de requisição — o próprio `app/services/auth_service.py` já trazia a observação "account lockout and Redis-backed throttling can be added incrementally". Havia inclusive um scaffold não usado em `app/core/rate_limit.py` (`RateLimitPolicy`, `AUTH_RATE_LIMIT` etc.) que nunca tinha sido ligado a nenhuma rota.

O pedido do usuário foi específico: rate limit geral contra ataques, e para força bruta de senha, bloqueio **exponencial por usuário** (não só por IP) — para inviabilizar quebra de senha por tentativa e erro mesmo que o atacante rotacione IPs.

## Alternativas consideradas

- **Só rate limit por IP** — descartado como única defesa; um atacante com múltiplos IPs (proxy, botnet) contornaria facilmente, e o pedido explícito do usuário era bloqueio por conta.
- **Bloqueio permanente após N falhas (exigindo ação manual de suporte)** — descartado; gera um vetor de negação de serviço trivial (bloquear a conta de qualquer pessoa só sabendo o e-mail dela) e o usuário pediu bloqueio temporário crescente, não permanente.
- **Contador em Postgres (coluna na tabela `users`)** — descartado; exigiria `ALTER TABLE` manual na política atual de "sem migração" da fase de dev, e não dá TTL nativo (teria que expirar bloqueio manualmente). Redis já está provisionado no `docker-compose.yml` e como dependência (`redis==8.0.0`) mas nunca tinha sido usado por nenhum código — SET com `EX` resolve TTL de graça.

## Decisão

1. **Rate limit por IP, janela fixa, via Redis**, com fail-open se o Redis cair (autenticação não pode depender da saúde do cache): `AUTH_RATE_LIMIT` (10 req/60s) em login/register/verify-2fa/complete-first-access/refresh; `PASSWORD_RESET_RATE_LIMIT` (5 req/300s) no pedido de primeiro acesso; `PUBLIC_RATE_LIMIT` (120 req/60s) em catálogo público, bootstrap público e reviews públicas. IP resolvido via `X-Forwarded-For` (compatível com `lumos-gateway`), com fallback ao IP direto da conexão.
2. **Bloqueio exponencial por conta, chaveado por e-mail, também via Redis**, independente do IP: 5 falhas consecutivas destrava o bloqueio; a partir daí, cada nova falha dobra a janela (30s, 60s, 120s, 240s...) até um teto de 24h. Tentativas feitas *durante* o bloqueio são rejeitadas antes mesmo de checar a senha e não contam como nova falha (não alimentam o próprio bloqueio). Um login correto zera contador e bloqueio.
3. Sem alteração de schema — todo o estado de rate limit/bloqueio vive em Redis com TTL, nada em Postgres.

## Atualização — desbloqueio self-service (mesmo dia)

Pedido seguinte do usuário: em caso de bloqueio, enviar e-mail explicando o motivo e permitir que o próprio dono da conta se desbloqueie, sem esperar a janela expirar nem precisar de suporte.

- `register_failed_attempt()` (em `login_guard.py`) agora, ao aplicar um bloqueio novo, gera também um **token de desbloqueio de uso único** (`secrets.token_urlsafe(32)`, TTL igual ao do bloqueio) e o devolve para quem chamou — só nesse instante, não a cada tentativa rejeitada durante o bloqueio (evita spam de e-mail).
- `AuthService.login()` dispara `NotificationService.send_account_locked_email()` com um link `https://.../marketplace/unlock-account?token=...` sempre que uma conta **real** (e-mail existente) é bloqueada.
- Novo endpoint público `POST /auth/unlock-account` (`UnlockAccountRequest{token}` → `UnlockAccountResponse{detail}`), rate-limitado como os demais: resolve e consome o token (`GETDEL` no Redis, atômico e de uso único) e limpa o bloqueio.
- Novo `marketplace_base_url` em `config.py`/`docker-compose.yml` (`APP_MARKETPLACE_BASE_URL`) para montar o link absoluto do e-mail — a API não conhece o domínio do frontend por padrão.
- Nova página `UnlockAccountScreen` em `farmaura/react/marketplace/screens/account-screen.jsx`, rota `unlock-account` (`/marketplace/unlock-account?token=...`) — pede confirmação por clique (não desbloqueia automaticamente ao carregar, para não ser "queimada" por scanners de link de e-mail que fazem prefetch). `shared/api-client.js` ganhou `authClient.unlockAccount(payload)`.
- Aproveitado para alinhar a validação de senha do frontend (`account-screen.jsx`, cadastro e troca de senha no primeiro acesso) com a política de força já exigida pelo backend — antes só checava `length < 8`, agora usa o mesmo critério de minúscula+maiúscula+número+especial antes de submeter.
- Testado ponta a ponta real: 5 tentativas erradas → bloqueio + token no Redis; `POST /auth/unlock-account` com o token → `200` e limpa o bloqueio; reuso do mesmo token → `400` (uso único confirmado); página servida corretamente em `/marketplace/unlock-account?token=...` via nginx (fallback de SPA já cobria, sem mudança de infra); chamada real via nginx→API confirmada com `wget` de dentro do container `farmaura`.

## Consequências

- `app/core/rate_limit.py` deixou de ser scaffold morto: agora tem `enforce_rate_limit`/`rate_limit(policy)` real, usado via `dependencies=[Depends(rate_limit(POLICY))]` nas rotas.
- Novo `app/core/redis_client.py` (client `redis.asyncio` cacheado) e `app/core/login_guard.py` (bloqueio exponencial). Primeira vez que o Redis do `docker-compose.yml` é efetivamente usado pelo código.
- Novo requisito de senha forte (minúscula + maiúscula + número + caractere especial) em todo fluxo onde um humano escolhe a própria senha — ver [[2026-07-20-politica-de-senha-forte]].
- Skill `secure-auth-rbac-jwt` atualizada (fonte operacional em `_Compartilhado/Skills/secure-auth-rbac-jwt/SKILL.md` e nota humana em `_Compartilhado/Skills/secure-auth-rbac-jwt.md`) para exigir esses três controles em qualquer stack nova que reaproveite a skill, não só no Farmaura.
- Testado manualmente: 5 tentativas erradas de login travam a conta com `429` + header `Retry-After`; o rate limit por IP em `/auth/login` também disparou sozinho durante o próprio teste (prova de que as duas camadas funcionam de forma independente); login correto após liberar a janela volta a `200` e limpa as chaves no Redis.

## Ver também

- [[2026-07-20-politica-de-senha-forte]] — decisão irmã, mesma revisão de segurança.
- [[../04_Seguranca_Riscos/2026-07-20-revisao-acesso-anonimo|Revisão de acesso anônimo (2026-07-20)]] — achados que motivaram esta e a decisão de senha forte.
- [[../../_Compartilhado/Skills/secure-auth-rbac-jwt]] — skill atualizada com estes controles como obrigatórios.
