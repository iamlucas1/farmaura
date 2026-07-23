# Aplicar uma migration Alembic pendente em produção

## Quando usar

Sempre que houver uma migration nova em `farmaura-api/alembic/versions/` ainda não aplicada ao banco de produção — desde 2026-07-22, toda mudança de schema em `farmaura-api/` passa por Alembic, nunca mais direto no ORM/bootstrap (ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|decisão]]).

## Antes de rodar: `stamp` vs `upgrade`

- **`alembic upgrade head`** executa de verdade o `upgrade()` de cada migration pendente (roda DDL — `CREATE TABLE`, `ALTER TABLE`, etc.).
- **`alembic stamp <revisão>`** só grava a revisão na tabela `alembic_version`, **sem rodar nenhum DDL** — usado quando o schema daquela revisão já existe no banco por outro caminho (ex.: a migration baseline `20260723_01`, que só descreve o schema que o bootstrap antigo já tinha criado em produção antes da adoção do Alembic).

Rodar `upgrade head` num banco que já tem o schema de uma revisão anterior sem ter dado `stamp` nela antes falha, tentando recriar tabelas que já existem.

## Passos

1. Conferir o estado atual: `alembic current` (revisão que o banco de produção acha que está) e `alembic history` (todas as revisões conhecidas, em ordem).
2. Se o banco já tem o schema de uma revisão mas ela não está registrada em `alembic_version` (caso da baseline `20260723_01`, cujo schema já existia via bootstrap antes da adoção do Alembic): `alembic stamp <revisão_baseline>` primeiro.
3. Rodar as migrations de verdade pendentes: `alembic upgrade head`. Cada uma roda dentro de uma transação (`Will assume transactional DDL`) — falha no meio reverte sozinha.
4. Conferir: `alembic current` deve mostrar a revisão head; validar as tabelas/colunas esperadas existem (`\d+ <tabela>` via `psql`, ou a rota de API correspondente).
5. RLS não é tocada por este processo — `scripts/bootstrap_database.py` continua aplicando `row_level_security.py` de forma idempotente a cada start do container, independente de como o schema foi criado. Confirmar que o container reiniciou (ou vai reiniciar) depois da migration, para a RLS cobrir as tabelas novas.

## Responsável

Quem tem acesso ao banco de produção (`lumos-prd`) — normalmente o próprio usuário; a IA gera e revisa migrations mas não aplica em produção sem confirmação explícita.

## Riscos se pulado

Rodar `upgrade head` sem o `stamp` correto num banco com schema pré-existente falha com erro de "relation already exists" — não é destrutivo por si só (a migration não commita), mas pode confundir o estado do `alembic_version` se manipulado manualmente depois. Nunca editar `alembic_version` à mão fora do fluxo `stamp`/`upgrade`.

## Ver também

- [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|Adoção de Alembic]] — por que este processo existe.
- [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]] — aplicação concreta pendente hoje.
- [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]] — RLS e schema, contrato completo.

## Atualizações

- 2026-07-23: nota criada, junto com a adoção de Alembic em produção.
