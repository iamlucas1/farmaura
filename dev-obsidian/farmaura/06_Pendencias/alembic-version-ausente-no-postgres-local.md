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

## Contexto

Não é um problema desta mudança específica — é um gap de infraestrutura de dev que só ficou visível
porque esta foi a primeira migration gerada nesta sessão contra este Postgres local específico.
Produção não tem esse problema (segue a POP de aplicar migration com `stamp`+`upgrade` desde a
adoção do Alembic). Vale confirmar, numa próxima sessão que mexer em schema: rodar `alembic
current` logo no início contra o Postgres de dev antes de gerar uma migration nova, em vez de
assumir que está em dia — e, se `bootstrap_database.py` de fato nunca estampa `alembic_version`
num `create_all` de banco novo, considerar adicionar isso a ele (stampar pro head real após o
`create_all`, só em ambiente não-produção) para este gap parar de se repetir a cada nova migration.
