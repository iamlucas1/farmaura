# Conectar Valkey ao rate limiting e à idempotência

**Status:** Parcialmente resolvido — 2026-07-20
**Prioridade:** Alta
**Registrado em:** 2026-07-18

## Descrição

Valkey (migrado de Redis em 2026-07-20 — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]]) já está provisionado na infra ([[../05_Integracoes_Infra/Valkey|Valkey]]) mas inicialmente não era usado por nenhum código de aplicação. `app/core/rate_limit.py` e `app/core/idempotency.py` precisavam de um backend de persistência para de fato aplicar suas políticas — ver [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]] e [[../04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotencia-sem-persistencia]].

## Contexto

Identificado durante levantamento de arquitetura em 2026-07-18. Ficava mais urgente porque pagamento real via Asaas já está em produção — duplicidade de cobrança/pedido não tem proteção real além de constraints de banco pontuais.

## Progresso

**2026-07-20:** metade resolvida. `app/core/redis_client.py` (novo, depois renomeado `valkey_client.py` na migração para Valkey) conecta o Redis/Valkey pela primeira vez a código de aplicação; `app/core/rate_limit.py` passou a ter enforcement real; `app/core/login_guard.py` (novo) usa o mesmo backend para bloqueio exponencial de conta. Ver [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|decisão]].

**2026-07-20 (mesmo dia, depois):** infra migrada de Redis para Valkey de ponta a ponta (imagem, client Python, env vars, nomes de arquivo) — sem mudança de comportamento em rate limit/login guard, só troca de tecnologia. Um terceiro consumidor real apareceu no mesmo trabalho: cache de listagem de catálogo (`app/core/cache.py`), não relacionado a esta pendência mas sobre o mesmo Valkey — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].

**Ainda em aberto:** `app/core/idempotency.py` continua sem backend — duplicidade de cobrança/pedido via Asaas segue sem proteção real além das constraints pontuais de banco. `UPLOAD_RATE_LIMIT` também segue sem aplicação em `/uploads`.
