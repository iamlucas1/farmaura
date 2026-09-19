---
cssclasses: ia-nota
---

# Docker / docker-compose (lumos-api)

**Tipo:** Infraestrutura

## Propósito

Empacotamento e orquestração do serviço `lumos-api` (Python) — backend consumido pelo `lumosmed` (dado clínico, ver [[../../lumosmed/05_Integracoes_Infra/Banco_Dados|lumosmed/Banco_Dados]]) e exposto publicamente também via seu próprio upstream no gateway (`LUMOS_API_UPSTREAM`, distinto de `LUMOSMED_UPSTREAM` em `lumos-gateway/docker-compose.yml`) — não é só um backend interno do LumosMed.

## Contrato

- `lumos-api/docker-compose.yml` (projeto `lumos-api`): serviços `api` (porta 8000, Gunicorn), `postgres` (`postgres:16`), `redis` (`redis:7.4-alpine`, usado para "internal replay backend", não sessão), `bootstrap` (perfil `bootstrap`, não sobe por padrão — roda `scripts/init_db.py` uma vez e sai, `restart: "no"`).
- `lumos-api/Dockerfile`: build multi-stage (`python_wheels` → `python_dependencies` → `runtime`), Python 3.12-slim, `pip wheel` com cache montado (`--mount=type=cache`). **Cria usuário não-root dedicado** (`useradd -m lumos-api`, `APP_USER=lumos-api`) — diferente de `farmaura-api`, que roda como root (ver achado já registrado em [[../../farmaura/04_Seguranca_Riscos/containers-docker-rodando-como-root|containers-docker-rodando-como-root]]). `COPY --chown=lumos-api:lumos-api . ./` copia **todo o contexto de build** — por isso o `.dockerignore` (que exclui `.env`, `*.key`, `*.pem`, `secrets/`, `tests/`) é uma camada de defesa real aqui, não cosmética.
- Entrypoint (`scripts/entrypoint.sh`) roda como root só para: ler segredos de arquivo (`read_secret`, função que lê `*_FILE` e exporta a var em texto), montar `LUMOSMED_DATABASE_URL` com a senha urlencoded, esperar Postgres ficar acessível (`wait_for`) e, opcionalmente, rodar bootstrap automático de banco (`AUTO_BOOTSTRAP_DATABASE_ON_STARTUP`). No fim, **usa `gosu` para trocar de root para o usuário `lumos-api` antes de executar o processo real** (`exec gosu lumos-api:lumos-api "$@"`) — padrão de "drop de privilégio" que nenhum outro Dockerfile deste ecossistema (`farmaura-api`, `lumos-gateway`) implementa hoje. `dumb-init` como PID 1 (`ENTRYPOINT ["/usr/bin/dumb-init", "--", ...]`) para reaping de processo zumbi e repasse correto de sinais.
- **Segredos via Docker secrets de arquivo** (mesmo padrão do `lumosmed`, ver [[../../lumosmed/05_Integracoes_Infra/Docker_Compose|lumosmed/Docker_Compose]]): `secret_key`, `identity_token_hash_secret`, `development_admin_password`, `lumosmed_db_pass`, `asaas_api_key`, `asaas_webhook_secret`, `portal_public_key`, `google_client_id`, `postgres_admin_pass` — todos montados em `/run/secrets/*` a partir de `./secrets/<ARQUIVO>` (fora do controle de versão).
- `postgres` usa `POSTGRES_PASSWORD_FILE` (suporte nativo da imagem oficial, não var direta) e um script de init (`scripts/postgres-init-multidb.sh`) montado em `/docker-entrypoint-initdb.d/` para provisionar múltiplos bancos/roles na primeira subida.
- Redes: `api_internal` (bridge interno) — `api`, `postgres`, `redis`, `bootstrap`; `gateway` (externa, `lumos_gateway`) — só `api`, alias `lumos-api`. Mesmo padrão de segregação dos demais projetos.
- `api` tem `init: true` (reaping de zumbi também no nível do compose) e `stop_grace_period: 30s`.

## Dependências

- `bootstrap` (perfil `bootstrap`) só sobe com `docker compose --profile bootstrap up bootstrap` ou equivalente — não faz parte do `up` normal, evitando reset acidental de schema.
- Consumido por `lumosmed` via `internal_base_url` (rede Docker) — ver [[../../lumosmed/05_Integracoes_Infra/Lumos_Api_Cliente_Interno|lumosmed/Lumos_Api_Cliente_Interno]].
- `tests/` está fora da imagem (excluído no `.dockerignore`) — testes não rodam dentro do container de runtime; não verificado neste levantamento como/onde a suíte de testes do `lumos-api` é executada (diferente do `farmaura-api`, que tem POP dedicado — ver [[../../farmaura/07_POPs_Processos/executar-testes-python-no-docker|farmaura/executar-testes-python-no-docker]]). Ver pendência [[../06_Pendencias/lumos-api-sem-auditoria-de-seguranca-docker|lumos-api-sem-auditoria-de-seguranca-docker]].

## Ver também

- [[../Hub|docker/Hub]] — visão cruzada de todas as engines/redes Docker do ecossistema.
- [[../../lumosmed/05_Integracoes_Infra/Banco_Dados|lumosmed/Banco_Dados]] — o que é persistido neste Postgres.
- [[../06_Pendencias/lumos-api-sem-auditoria-de-seguranca-docker|lumos-api-sem-auditoria-de-seguranca-docker]] — lacuna de auditoria registrada a partir desta nota.

## Atualizações

- 2026-09-18: nota criada — `lumos-api` não tinha nenhuma documentação de Docker no cofre até então.
