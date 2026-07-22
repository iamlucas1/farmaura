# Padrão: isolamento multi-tenant via RLS + GUCs de sessão Postgres

**Tipo:** Padrão técnico genérico

## Aplica-se a

Qualquer backend novo (ou stack existente) neste ecossistema que precise de isolamento multi-tenant reforçado no banco, além da filtragem na aplicação.

## Descrição

Duas implementações **independentes** deste mesmo padrão já existem no repositório:

- **Farmaura** (`farmaura-api/app/core/row_level_security.py` + `tenant_context.py`) — GUCs `app.current_tenant_id`, `app.current_user_role`, `app.current_user_id`, `app.current_store_id`. Ver [[../../farmaura/05_Integracoes_Infra/PostgreSQL_RLS|PostgreSQL_RLS]].
- **lumos-api** (`lumos-api/database/infra/connections.py`) — GUCs `lumos.current_role`, `lumos.current_user_public_id`, `lumos.current_clinic_public_id`, `lumos.is_authenticated`, `lumos.is_system_job`. Ver [[../../lumosmed/05_Integracoes_Infra/Banco_Dados|Banco_Dados]].

A receita comum, generalizada:

1. Ativar `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` em toda tabela com dado escopado por tenant.
2. Criar políticas (`CREATE POLICY`) que leem GUCs de sessão (`current_setting('<prefixo>.<chave>', true)`), não uma coluna/JOIN direto — assim a regra vale mesmo se o código da aplicação esquecer de filtrar explicitamente.
3. No início de cada unidade de trabalho (request, job, webhook), setar os GUCs via `set_config(..., true)` — **transaction-local**, nunca vaza para outra conexão/transação.
4. Definir exceções estreitas e nomeadas para os poucos casos legítimos de acesso cross-tenant (ex: lookup de login antes de autenticar, job de sistema, webhook já validado por outro mecanismo) — nunca um "modo admin" genérico que desliga RLS.
5. As funções que aplicam o contexto devem ser no-op em dialeto não-Postgres (segurança de teste/SQLite local).

## Motivo

Defesa em profundidade: mesmo que uma query na camada de aplicação esqueça um filtro de tenant, o banco recusa a linha. Provou-se valioso o suficiente para ser reinventado de forma independente duas vezes neste mesmo repositório — sinal de que deveria ser o padrão-default para qualquer backend novo aqui, não uma decisão caso a caso.

## Exceções conhecidas

Nenhuma — se um backend novo neste ecossistema decidir **não** usar RLS, essa decisão deveria virar uma ADR explícita no projeto correspondente, justificando o desvio.

## Ver também

- [[../../farmaura/03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|excecao-fiscal-scheduler-sessao-propria]] — exceção nomeada de acesso cross-tenant (job de sistema) num backend que segue esta receita.
- [[../../lumosmed/04_Seguranca_Riscos/prontuario-sem-criptografia-em-nivel-de-campo|prontuario-sem-criptografia-em-nivel-de-campo]] — cita esta RLS como proteção já existente para dado clínico sensível.

## Atualizações

- 2026-07-19: nota criada.
