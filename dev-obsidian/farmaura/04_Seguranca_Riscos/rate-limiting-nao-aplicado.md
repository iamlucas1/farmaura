# Rate limiting definido mas não aplicado

**Tipo:** Risco identificado
**Severidade:** Alta
**Status:** Mitigado (parcial) — 2026-07-20
**Data de identificação:** 2026-07-18

## Descrição

`app/core/rate_limit.py` definia apenas objetos de política (`AUTH_RATE_LIMIT`, `UPLOAD_RATE_LIMIT`, `PUBLIC_RATE_LIMIT`) — não existia middleware que de fato os aplicasse nas rotas.

## Impacto

Rotas de autenticação, upload e públicas ficavam sem proteção efetiva contra força bruta, spam de requisições e abuso de upload, apesar da política estar "definida" no código — risco de falso senso de segurança para quem lê `rate_limit.py` sem checar se está de fato conectado a alguma rota.

## Mitigação / Tratamento

**Resolvido em 2026-07-20 para auth + navegação pública**, a pedido explícito do usuário após uma revisão de acesso anônimo: `rate_limit(policy)` agora é uma dependency real (Valkey, janela fixa, fail-open se o Valkey cair), aplicada em `/auth/login`, `/auth/register`, `/auth/verify-2fa`, `/auth/complete-first-access`, `/auth/refresh`, `/portal/marketplace/first-access`, `/catalog/public`, `/portal/marketplace/public-bootstrap`, `/portal/products/{ref}/reviews`. Login também ganhou bloqueio exponencial por conta, além do rate limit por IP — ver [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|decisão]]. Backend migrado de Redis para Valkey no mesmo dia, sem mudança de comportamento — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].

**Ainda em aberto:** `UPLOAD_RATE_LIMIT` continua não conectado a `/uploads` — não fazia parte do pedido desta rodada. Manter [[conectar-valkey-a-rate-limit-e-idempotencia]] aberto até isso e a idempotência via Valkey serem resolvidos.

## Referências

Ver [[../05_Integracoes_Infra/Valkey|Valkey]]. Skill [[secure-api-endpoint]] (`_Compartilhado/Skills/`) exige controles de abuso em rotas públicas/auth/upload. Skill [[secure-auth-rbac-jwt]] atualizada com os controles de rate limit/bloqueio como obrigatórios.

## Ver também

- [[idempotencia-sem-persistencia]] — mesmo gap raiz (Valkey provisionado, parcialmente consumido agora).
- [[conectar-valkey-a-rate-limit-e-idempotencia]] — pendência remanescente (upload + idempotência).
- [[2026-07-20-revisao-acesso-anonimo]] — revisão que motivou esta mitigação.

## Atualizações

- 2026-07-20: infra renomeada de Redis para Valkey (sem mudança de comportamento neste controle) — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].
- 2026-07-20: nota criada.
