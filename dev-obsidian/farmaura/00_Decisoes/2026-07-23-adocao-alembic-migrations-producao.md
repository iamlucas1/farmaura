# 2026-07-23 — Adoção de migrations Alembic agora que farmaura-api está em produção

## Contexto

Farmaura foi para produção em 2026-07-22 (`drogariafarmaura.com.br`, servidor `lumos-prd`). Até então, toda mudança de schema em `farmaura-api/` ia direto no ORM (`app/models/`) e era aplicada via `scripts/bootstrap_database.py` (`Base.metadata.create_all`) a cada start — política deliberada de velocidade de desenvolvimento, documentada como "Development Environment Policy" no `claude.md`/`agent.md`. O usuário atualizou essa política (`claude.md`, `agent.md` e as notas deste cofre) para exigir migrations Alembic em `farmaura-api/` daqui em diante — mudar schema direto no ORM/bootstrap contra um banco de produção real arrisca perda de dados de clientes/pedidos.

O trabalho corrente (módulo de Orçamentos — ver [[../02_Documentacao/Modulo_Orcamentos|Modulo_Orcamentos]]) tinha acabado de adicionar 3 tabelas (`purchase_quotes`, `purchase_quote_items`, `purchase_quote_payment_terms`) do jeito antigo, direto no ORM + bootstrap, sem migration — precisava ser reconciliado com a nova política antes de poder ir para produção.

Ao investigar, o histórico Alembic existente no repositório (`alembic/versions/`) tinha só 5 migrations pequenas, de 2026-07-20, cobrindo ajustes pontuais recentes (flag genérico de inventário, `inventory_products`, marca/categoria/classe terapêutica, largura de `marketplace_image_url`, custo de imposto/ICMS-ST). A esmagadora maioria do schema real (~46 tabelas) nunca virou migration — existe em produção só porque o bootstrap rodou `create_all` historicamente. `target_metadata = Base.metadata` no `env.py` reflete sempre o schema completo (por importar `app.models`, que importa todos os models como efeito colateral), então rodar `alembic revision --autogenerate` puro geraria uma migration tentando recriar dezenas de tabelas que já existem em produção.

Também foram encontrados dois problemas que impediam esse Alembic de funcionar de verdade: `env.py` usava `get_settings().database_url` — a role restrita do runtime (`farmaura_app`, só `SELECT/INSERT/UPDATE/DELETE`, sem `CREATE TABLE`) — em vez da role elevada; e faltava por completo o `alembic/script.py.mako` (nunca commitado), sem o qual `alembic revision` nem gera o arquivo.

## Alternativas consideradas

- **Gerar só a migration das 3 tabelas de Orçamentos, encadeada em cima da revisão `20260720_05`** — descartado; o histórico Alembic estava tão defasado do schema real que autogenerate detectaria dezenas de tabelas "faltando" (na verdade só não registradas em migration), gerando uma migration enorme e incorreta, não uma migration limpa só de Orçamentos.
- **Manter o histórico de 5 migrations antigas e tentar reconciliar por cima** — descartado a pedido do usuário ("pode desconsiderar todos os migrates existentes e inicie um do 0"); as 5 migrations cobriam uma fração mínima do schema e não valiam a complexidade de preservar.
- **Uma única migration baseline cobrindo schema completo + Orçamentos junto** — descartado; misturaria, no mesmo arquivo, tabelas que já existem em produção (precisam de `alembic stamp`, sem DDL) com tabelas que ainda não existem (precisam de `alembic upgrade`, com DDL real). Um único arquivo não permite tratar as duas metades de forma diferente no deploy.

## Decisão

**1. Corrigir `alembic/env.py`** para usar `get_settings().database_bootstrap_url` (mesma propriedade elevada que `bootstrap_database.py` já usa para RLS/seed) em vez de `database_url`.

**2. Criar `alembic/script.py.mako`**, que faltava, seguindo o estilo de cabeçalho já usado nas migrations antigas (docstring + seções `MIGRATION METADATA` / `UPGRADE / DOWNGRADE`).

**3. Apagar as 5 migrations antigas de 2026-07-20** e recomeçar o histórico do zero, a pedido do usuário.

**4. Duas migrations novas, encadeadas:**
- `20260723_01_baseline_full_schema.py` (`down_revision=None`) — captura via autogenerate o schema completo que já existe em produção hoje (~46 tabelas), **sem** as 3 tabelas de Orçamentos.
- `20260723_02_add_purchase_quotes.py` (`down_revision="20260723_01"`) — só `purchase_quotes`/`purchase_quote_items`/`purchase_quote_payment_terms`, extraídas manualmente do autogenerate original (que gerou tudo junto) e movidas para este segundo arquivo.

**5. Receita de deploy em produção, documentada em [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]]:** `alembic stamp 20260723_01` (marca a baseline como aplicada, sem rodar DDL — as tabelas já existem) seguido de `alembic upgrade head` (roda de verdade só a `20260723_02`, criando as 3 tabelas novas). Rodar `upgrade head` direto, sem o `stamp` antes, falharia tentando recriar tabelas existentes.

RLS continua fora do Alembic — `app/core/row_level_security.py` não é modelado via SQLAlchemy, então autogenerate nunca o toca; `bootstrap_database.py` segue aplicando RLS de forma idempotente a cada start, independente de como as tabelas foram criadas.

## Consequências

- Esta migration **ainda não foi aplicada em produção** — só gerada e verificada. Ver [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]].
- Verificação feita inteiramente em Postgres isolado e descartável, nunca contra a stack real do usuário: diff de schema completo entre o caminho antigo (bootstrap) e o novo (migrations) deu zero diferença estrutural (só RLS, que é separado por natureza); `alembic check` contra o schema totalmente migrado confirmou "No new upgrade operations detected"; a receita `stamp` + `upgrade head` foi testada de ponta a ponta simulando o estado real de produção (schema baseline sem tracking do Alembic).
- Daqui em diante, toda mudança de schema em `farmaura-api/` precisa de uma migration nova encadeada em `20260723_02` — nunca mais editar o model e confiar só no bootstrap.
- `lumos-api`/`lumosmed` continuam na política antiga (sem migrations, direto no ORM/bootstrap) — não estão em produção ainda.

## Ver também

- [[../05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]] — RLS e schema, contrato atualizado.
- [[../07_POPs_Processos/aplicar-migration-alembic-producao|aplicar-migration-alembic-producao]] — POP com a receita de deploy.
- [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]] — aplicação em produção, ainda pendente.
- [[../02_Documentacao/Modulo_Orcamentos|Modulo_Orcamentos]] — feature que motivou esta decisão.
