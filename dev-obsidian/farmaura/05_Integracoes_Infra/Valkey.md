# Valkey

**Tipo:** Infraestrutura (cache/fila)

## Propósito

Cache e coordenação de estado de curta duração para a API. Migrado de Redis em 2026-07-20 (fork open-source, mesmo protocolo RESP, troca drop-in) — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]]. Hoje é consumido de fato por três mecanismos:

- **Rate limiting** (`app/core/rate_limit.py`): janelas fixas por IP, fail-open se o Valkey cair.
- **Bloqueio de login** (`app/core/login_guard.py`): bloqueio exponencial por conta (e-mail) e token de desbloqueio de uso único.
- **Cache de catálogo** (`app/core/cache.py`): listagem de catálogo (público e autenticado), invalidação por contador de geração, TTL de 20s como rede de segurança.

`app/core/idempotency.py` **ainda não** usa Valkey como backend de persistência — segue sem proteção real contra replay. Ver [[../06_Pendencias/conectar-valkey-a-rate-limit-e-idempotencia|conectar-valkey-a-rate-limit-e-idempotencia]].

## Contrato

- Valkey `9.1-trixie` com AOF persistence, serviço `farmaura-valkey` em [[Docker_Compose]].
- `valkey_url` configurado em `app/core/config.py` (env `APP_VALKEY_URL`, formato `valkey://host:6379/0`).
- Client: `valkey==6.1.1` (`valkey.asyncio.Valkey`), cacheado em `app/core/valkey_client.py::get_valkey()`.
- Todo consumo é best-effort/fail-open: uma falha de conexão nunca derruba autenticação, navegação pública ou o cache de catálogo (cai para leitura direta no Postgres). Ver [[../04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]].
- O cache de catálogo nunca é fonte de verdade para checkout: preço e estoque usados para efetivar uma venda (marketplace ou PDV) sempre vêm de leitura travada no Postgres (`get_item_by_id_for_update`), nunca do Valkey — isso é o que impede overselling, independente de qualquer staleness do cache.

## Dependências

- `app/core/rate_limit.py`, `app/core/login_guard.py`, `app/core/cache.py` — consumidores atuais.
- `app/core/idempotency.py` — ainda não conectado, ver pendência acima.

## Ver também

- [[Docker_Compose]] — serviço `farmaura-valkey` orquestrado aqui.
- [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|Migração Redis → Valkey + cache de catálogo]].
- [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|Rate limit e bloqueio exponencial]].
- [[../04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotencia-sem-persistencia]] — gap ainda aberto, mesmo backend.

## Atualizações

- 2026-07-20: nota migrada de "Redis" (nota antiga, removida — Redis 8.2.6 → Valkey 9.1-trixie) — infra renomeada de ponta a ponta (imagem, client Python, env var, service name). Passa a documentar também o novo cache de catálogo, terceiro consumidor real além de rate limit e login guard.
- 2026-07-19: nota original criada como "Redis".
