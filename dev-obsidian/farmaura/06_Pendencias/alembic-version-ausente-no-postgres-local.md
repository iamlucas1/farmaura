---
cssclasses: ia-nota
---

# Postgres de dev local nunca teve `alembic_version` — schema só existe via `create_all`

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-31

## Descrição

Ao gerar a migration da PDP v2 (ver
[[../00_Decisoes/2026-08-31-bula-dosagens-parcelamento-configuravel-na-pdp|ADR]]), `alembic
current`/`alembic revision --autogenerate` falharam contra o Postgres de dev local com "Target
database is not up to date" — a tabela `alembic_version` **não existia** nesse banco. O schema
inteiro só existia porque `scripts/bootstrap_database.py` roda `Base.metadata.create_all`
incondicionalmente a cada start (gap já conhecido, ver
[[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão de adoção do Alembic]]) —
`create_all` cria tabelas que faltam, mas nunca faz `ALTER TABLE` numa tabela que já existe, então
esse banco especificamente nunca recebeu nenhuma coluna adicionada via migration ao longo do
histórico, só as que já nasceram junto com uma tabela nova.

Contornado nesta sessão com `alembic stamp 20260830_01` (amostragem confirmou que o schema local
batia com esse head — colunas/tabelas do último migration já existiam) antes de aplicar a
migration nova. Depois, um reset completo (`docker compose down -v && up`) recriou o banco do
zero via `create_all` com o schema já atual, o que também reescreve `alembic_version` para o head
real automaticamente? — **não confirmado**: só testado que o schema resultante bate; não
verificado se `bootstrap_database.py` estampa `alembic_version` num banco novo ou se o gap persiste
mesmo após um reset completo.

**Reincidência (2026-09-05):** `alembic_version` tinha sido criada e apontava para `20260905_01`
(schema com `children_ages` confirmado por `\d customers`) mais cedo na mesma sessão, mas ao gerar
a migration seguinte (`20260905_02_coupon_anniversary_personal`, cupons de aniversário) `alembic
upgrade head` falhou tentando recriar `audit_events` do zero — sinal de estar rodando a partir de
uma revisão bem anterior, não de `20260905_01`. Checado direto no Postgres: `alembic_version` **não
existia mais** (`relation "alembic_version" does not exist`), embora todas as colunas de
`20260903_01`/`20260905_01` continuassem no schema — ou seja, o dado sobreviveu, só o bookkeeping
da tabela de controle sumiu, sem nenhuma ação deliberada (nenhum `DROP`, reset do volume do
Postgres ou `docker compose down -v` nesse meio-tempo). Causa raiz **não identificada** ainda —
contornado de novo com `alembic stamp 20260905_01` (amostragem confirmou que o schema batia) +
`alembic upgrade head`. Reforça a suspeita já registrada abaixo de que algo no ciclo de vida deste
Postgres local especificamente não retém `alembic_version` de forma confiável. Se reincidir uma
terceira vez, vale investigar a fundo (checar se algum script/teste roda contra o mesmo banco e faz
algo tipo `Base.metadata.drop_all`, ou algum teste de integração abre uma transação que acaba
revertendo o `stamp`) em vez de só contornar de novo.

**Reincidência (2026-09-19) e causa raiz identificada**: ao gerar `20260919_01_order_item_pick_locations`, `alembic_version` de novo não existia (`relation "alembic_version" does not exist"`) — mas desta vez sem nenhum `stamp` anterior nesta sessão para "sumir": o container `farmaura_postgres` estava de pé havia só ~30 min (reinício/seed recente do stack local), e nada nesta sessão rodou `alembic stamp`/`upgrade` antes disso. Ou seja, a causa não é algo revertendo um `stamp` já feito — é que **`bootstrap_database.py` nunca estampa `alembic_version` depois do `Base.metadata.create_all` num volume novo**: o `create_all` monta o schema inteiro direto dos models atuais (que já refletem todas as migrations até aquele ponto), mas ninguém nunca chama `alembic stamp head` depois, então a tabela de controle simplesmente nunca chega a existir num Postgres local recém-criado — não é a tabela sendo apagada, é ela nunca tendo sido criada. Contornado de novo com `stamp 20260918_02` (revisão anterior à nova, schema conferido batendo) + `upgrade head`. Correção definitiva ficaria em `bootstrap_database.py`: depois do `create_all`, se `alembic_version` não existir, estampar para o head real do repositório — só em ambiente não-produção (produção sempre aplica migration de verdade, nunca via `create_all`).

**Reincidência (2026-09-20), Postgres novo no Windows:** o volume `farmaura_postgres_data` desta máquina também nasceu via `create_all` — `alembic_version` não existia (`relation "alembic_version" does not exist`), embora o schema estivesse exatamente na `20260919_01` (conferido por amostragem das colunas de `20260918_02`/`20260919_01` e pela ausência das de `20260920_*`). Contornado pelo mesmo caminho: `alembic stamp 20260919_01` + `alembic upgrade head`, com `docker compose run --rm --no-deps --entrypoint '' farmaura-api uv run alembic ...` (para o `bootstrap_database.py` não rodar `create_all` no meio). Confirma a causa raiz de 2026-09-19: `bootstrap_database.py` nunca estampa `alembic_version` num volume novo. Continua sem correção em `bootstrap_database.py`.

**Reincidência (2026-09-21), primeira vez fora de uma máquina de dev — servidor `lumos-dev` (staging):** ao publicar a migration `20260921_01` (login via Google, ver [[../00_Decisoes/2026-09-21-login-google-marketplace-id-token-flow|ADR]]), `docker compose up -d --build` subiu com `farmaura_api` unhealthy: `psycopg.errors.UndefinedColumn: column "tenant_id" does not exist` dentro do loop genérico de `tenant_isolation_policy` do bootstrap de RLS — não no `google_sub` da migration nova, mas numa tabela mais antiga sem essa coluna. `alembic current` confirmou `alembic_version` ausente também neste volume (`farmaura_postgres_data` de `lumos-dev`), e o gap era grande demais para um `stamp` pontual (uma tabela sem `tenant_id` sugere migrations de meses atrás nunca de fato aplicadas ali, só o que `create_all` foi conseguindo empilhar em cima do schema já existente). Diferente das reincidências anteriores (sempre resolvidas com `stamp`+`upgrade`), aqui optou-se por resetar o volume inteiro (`docker compose down -v` + `up -d --build`, escopado só aos volumes do próprio Farmaura — `farmaura_postgres_data`/`farmaura_valkey_data`/`farmaura_nominatim_data`/`farmaura_storage_*`, nenhum compartilhado com os outros tenants do host) — aceitável neste ambiente porque o dado é 100% seed/demo (ver [[../05_Integracoes_Infra/Ambiente_Staging_Lumos_Dev|Ambiente_Staging_Lumos_Dev]]), e mais simples/seguro do que tentar reconstruir manualmente uma cadeia de `stamp` de várias migrations sem saber ao certo onde o schema realmente parou. Stack subiu saudável, seed rodou de novo, outros tenants do gateway confirmados intocados. Reforça que este gap não é exclusivo de máquina de dev local — qualquer Postgres deste projeto que já existia antes da adoção do Alembic (ou que nasceu via `create_all` num container antigo) carrega o mesmo risco, incluindo servidores remotos.

## Contexto

Não é um problema desta mudança específica — é um gap de infraestrutura de dev que só ficou visível
porque esta foi a primeira migration gerada nesta sessão contra este Postgres local específico.
Produção não tem esse problema (segue a POP de aplicar migration com `stamp`+`upgrade` desde a
adoção do Alembic). Vale confirmar, numa próxima sessão que mexer em schema: rodar `alembic
current` logo no início contra o Postgres de dev antes de gerar uma migration nova, em vez de
assumir que está em dia — e, se `bootstrap_database.py` de fato nunca estampa `alembic_version`
num `create_all` de banco novo, considerar adicionar isso a ele (stampar pro head real após o
`create_all`, só em ambiente não-produção) para este gap parar de se repetir a cada nova migration.