# Bootstrap e seed do banco do lumos-api

## Quando usar

Ao subir um ambiente local/homologação do domínio LumosMed pela primeira vez, ou quando é preciso resetar o schema/seed do `lumos-api`.

## Como funciona

Diferente do Farmaura (que faz bootstrap incondicional em todo start), o `lumos-api` só roda o bootstrap automático se a env var **`AUTO_BOOTSTRAP_DATABASE_ON_STARTUP`** estiver setada (`1`/`true`/`yes`/`on`) — ver `lumos-api/database/runtime_bootstrap.py`, `should_auto_bootstrap_on_startup()`. Se ativado, `bootstrap_runtime_environment()`:

1. `bootstrap_databases()` (`database/infra/bootstrap.py`) — cria as tabelas a partir do `LumosMedBase.metadata` e roda `ensure_lumosmed_schema_updates()` (o "migration runner" próprio do projeto, não Alembic).
2. `run_all_seeds(environment)` (`database/seeds/runner.py`) — roda o conjunto de seeds apropriado para o ambiente resolvido (`settings.core.environment`).

## Passos

1. Confirmar/setar `AUTO_BOOTSTRAP_DATABASE_ON_STARTUP=true` no `.env` do `lumos-api` para ambiente local.
2. Subir o serviço normalmente — o bootstrap roda no startup da aplicação, não é um comando separado a rodar manualmente.
3. Se a env var não estiver setada, o bootstrap é pulado silenciosamente — checar isso primeiro se o banco local aparentar estar vazio/desatualizado sem razão aparente.

## Parâmetros do seed (`database/seeds/`)

O plano de seed é resolvido por ambiente em `registry.py` (`SEED_REGISTRY_BY_ENVIRONMENT`) — não há flags de linha de comando, só a env var `AUTO_BOOTSTRAP_DATABASE_ON_STARTUP` (liga o processo) e os parâmetros abaixo (controlam o conteúdo):

- **`DEVELOPMENT`**: roda `seed_lumosmed_plan_catalog` + `seed_lumosmed_development`.
  - `plan_catalog.py` popula os planos (`MedPlan`) a partir de `domains/lumosmed/services/plan_catalog.py::PLAN_CATALOG` (preço, tier de IA, créditos de tokens/Meta incluídos).
  - `development_dataset.py` cria **uma clínica demo por plano do catálogo** (`Clinica <Plano> Ltda`, CNPJ/telefone/e-mail derivados do índice), cada uma com **3 usuários fixos**: `gestor.<slug>@lumosmed.local` (CLINIC_ADMIN), `profissional.<slug>@lumosmed.local` (HEALTH_PROFESSIONAL) e `atendente.<slug>@lumosmed.local` (RECEPTIONIST) — todos com a mesma senha, vinda da env var **`DEVELOPMENT_ADMIN_PASSWORD`** (obrigatória; o seed levanta `RuntimeError` se estiver vazia). Cada clínica também ganha conta e contrato de billing ativos ligados ao seu plano.
  - Para a clínica do plano cujo slug é `neuro`, o seed também chama `seed_whatsapp_only_test_user` (ver abaixo).
- **`PRODUCTION`**: roda `seed_lumosmed_plan_catalog` + `seed_lumosmed_production_admin`.
  - `production_admin.py` cria (se não existir) **um único usuário admin de sistema**, e-mail vindo de **`PRODUCTION_ADMIN_EMAIL`** (default `lucas@lumosmed.com.br`) com senha de **`PRODUCTION_ADMIN_PASSWORD`** (obrigatória; `RuntimeError` se vazia — nunca há senha default em produção).
  - Também garante a clínica de teste "Facebook WhatsApp Tester Ltda" (CNPJ fixo) associada ao plano "Lumos Neuro" + billing account/contract ativos, e chama o mesmo `seed_whatsapp_only_test_user` — ou seja, essa conta de teste existe tanto em dev quanto em produção.
- **`TEST`**: tupla vazia — nenhum seed roda (bootstrap de schema ainda ocorre, mas sem dados).
- **Conta de teste WhatsApp/Facebook** (`whatsapp_access_user.py`): usuário fixo (RECEPTIONIST) com e-mail e senha **hardcoded no próprio arquivo fonte** (não vêm de env var) — usado para validar a integração Meta/WhatsApp com acesso restrito. Por já estar em código versionado e valer para uma conta de teste dedicada, a senha real não é repetida aqui (ver regra de segurança do cofre); consultar o arquivo diretamente se precisar dela.

## Responsável

Qualquer desenvolvedor trabalhando no domínio LumosMed localmente. Não usar em produção sem revisar o que `run_all_seeds` popula para o ambiente de produção — os testes `lumos-api/tests/unit/test_production_seed.py` e `test_development_seed.py` sugerem que o comportamento de seed já é diferenciado por ambiente.

## Ver também

- [[Banco_Dados]] — banco populado por este procedimento.
- [[Asaas_LumosMed]] — planos/billing seedados a partir do mesmo catálogo (`PLAN_CATALOG`).
- [[resetar-e-re-semear-dados-locais]] — POP equivalente no Farmaura.

## Atualizações

- 2026-07-19: nota criada.
