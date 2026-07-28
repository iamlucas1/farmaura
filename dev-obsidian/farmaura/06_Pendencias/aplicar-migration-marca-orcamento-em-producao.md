# Aplicar migration `20260727_01` (brand_id em purchase_quote_items) em produção

**Status:** Resolvido em 2026-07-28
**Prioridade:** Alta
**Registrado em:** 2026-07-27

## Descrição

A migration `20260727_01_add_purchase_quote_item_brand_id` (`farmaura-api/alembic/versions/`) adiciona
`purchase_quote_items.brand_id` (FK opcional para `brands.id`, `ON DELETE SET NULL`, com índice) —
suporta o vínculo obrigatório de marca por item na conferência do import por IA (ver
[[../02_Documentacao/Modulo_Orcamentos|Modulo Orçamentos]], seção "Marca vinculada ao catálogo").
Gerada e testada de ponta a ponta localmente (`uv run alembic upgrade head` contra o Postgres de dev,
`\d purchase_quote_items` conferido, fluxo real de criação/confirmação de orçamento com marca
vinculada testado via API) — falta aplicar em produção.

Seguir [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:

```
cd /opt/farmaura/farmaura-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build farmaura-api farmaura
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic current
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --entrypoint '' farmaura-api uv run alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps farmaura-api farmaura
```

Nota: usar só `-f docker-compose.yml -f docker-compose.prod.yml` (sem `docker-compose.gateway.yml`)
— esse terceiro overlay ficou obsoleto depois que a integração real do gateway com farmaura passou a
ser invertida (gateway_nginx entra na rede `farmaura_private`, não o contrário); ver
[[../05_Integracoes_Infra/Lumos_Gateway|Lumos_Gateway]].

`alembic current` em produção deve mostrar `20260723_04` antes de rodar — nenhum `stamp` deveria ser
necessário (produção já tem `alembic_version` corretamente rastreado desde a migration baseline).

## Contexto

Não aplicada de imediato porque aplicar uma migration em produção exige confirmação explícita do
usuário (ver a seção "Responsável" da POP linkada acima) — a IA gera e testa a migration localmente,
mas não roda contra o banco real sem esse aval.

## Resolução

Aplicada em 2026-07-28, com confirmação explícita do usuário, exatamente pelos passos descritos
acima (sem `docker-compose.gateway.yml`). `alembic current` confirmou `20260723_04` antes de rodar
— nenhum `stamp` foi necessário. `alembic upgrade head` rodou limpo (`20260723_04 -> 20260727_01`);
`alembic current` depois confirmou `20260727_01 (head)`, e `\d purchase_quote_items` mostrou a
coluna `brand_id` (uuid, nullable) com a FK `fk_purchase_quote_items_brand_id_brands` e o índice
`ix_purchase_quote_items_brand_id`. Containers `farmaura-api`/`farmaura` recriados no mesmo deploy
(junto com o fix de extração de IA do commit `0ce8f28` — mesmo arquivo, mesma janela de deploy).
Verificado depois: ambos os containers saudáveis, logs mostrando tráfego real (`/orders/internal-
board/changes`, `/deliveries/routes/live`) respondendo 200 sem erro, e `GET /api/v1/purchase-
quotes`/`GET /api/v1/brands` pelo domínio real respondendo 401 (não 500) sem autenticação —
confirma que as rotas que agora tocam a coluna nova estão funcionando, só exigindo login.
