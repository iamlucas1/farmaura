# Aplicar migration Alembic do módulo Orçamentos em produção

**Status:** Resolvido em 2026-07-23
**Prioridade:** Alta
**Registrado em:** 2026-07-23

## Descrição

As tabelas `purchase_quotes`, `purchase_quote_items` e `purchase_quote_payment_terms` (módulo [[../02_Documentacao/Modulo_Orcamentos|Orçamentos]]) existem nos models e no código do backend, mas **não existem ainda no banco de produção**. A migration já foi gerada e verificada — falta só rodar em produção:

```
alembic stamp 20260723_01
alembic upgrade head
```

Nessa ordem — ver [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] para o passo a passo completo e por que a ordem importa (rodar `upgrade head` direto, sem o `stamp` antes, falha tentando recriar tabelas que já existem).

## Contexto

Farmaura foi para produção em 2026-07-22, e a política de schema mudou para exigir migrations Alembic (ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]]) — o próprio módulo de Orçamentos foi o gatilho dessa mudança, por ter sido construído (Fase 1) do jeito antigo, direto no ORM/bootstrap, antes da política mudar. A migration foi gerada, dividida (baseline + Orçamentos) e testada de ponta a ponta em Postgres isolado, mas a aplicação real em produção ficou para o usuário decidir quando rodar — nenhuma ação foi tomada contra o banco real durante o desenvolvimento.

Até esta migration ser aplicada, o módulo de Orçamentos (telas "Cotações", "Comparar fornecedores" e "Painel de Compras" no console interno) não funciona em produção — as rotas de API vão falhar por falta das tabelas.

## Resolução

Aplicada em 2026-07-23, no mesmo deploy que publicou o restante do módulo de Orçamentos (incluindo
os refinamentos de UI da mesma data — tabela de comparação, "Confirmar Compra", etc.). Passos
executados em `lumos-prd`, dentro de `/opt/farmaura/farmaura-api`, dessa forma (para não deixar o
`entrypoint.sh` padrão rodar `bootstrap_database.py`/`create_all` antes da migration real):

```
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.gateway.yml build farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.gateway.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.gateway.yml run --rm --entrypoint '' farmaura-api uv run alembic stamp 20260723_01
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.gateway.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.gateway.yml up -d farmaura-api farmaura
```

`alembic current` confirmou `20260723_02 (head)` e as 3 tabelas (`purchase_quotes`,
`purchase_quote_items`, `purchase_quote_payment_terms`) existem no banco. Verificado depois:
`farmaura_api` e `farmaura` saudáveis, site (`/`, `/miaura`, `/api/v1/health`) respondendo 200, e
`GET /api/v1/purchase-quotes` respondendo 401 (não 500) sem autenticação — confirma que a rota está
registrada e funcionando, só exigindo login, não quebrando por tabela ausente.

**Nota para o próximo deploy**: `bootstrap_database.py` ainda roda `Base.metadata.create_all`
incondicionalmente a cada start (gap conhecido, ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão de adoção do Alembic]]) — por isso a migration real precisa ser
aplicada **antes** de subir o container novo com `up`/`up --build`, não depois, e sempre via
`run --rm --entrypoint ''` para não disparar o entrypoint padrão no meio do processo.
