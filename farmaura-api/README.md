# Farmaura Backend

Base inicial da API da Farmaura em Python com FastAPI, SQLAlchemy 2.x e arquitetura em camadas.

## Estrutura

- `app/api`: camada HTTP, dependências e middleware;
- `app/core`: configuração, segurança, banco e respostas compartilhadas;
- `app/domain`: enums, erros e permissões;
- `app/models`: models ORM;
- `app/repositories`: acesso a dados;
- `app/services`: casos de uso;
- `app/fiscal`: motor puro da NFC-e (chave, XML 4.00, XSD oficial, assinatura, SOAP/mTLS, DANFE) — sem banco;
- `app/schemas`: contratos de request/response;
- `app/tests`: testes unitários, de API e segurança;
- `alembic`: migrations (produção exige migration, nunca alterar o banco à mão);
- `scripts`: seed, bootstrap e verificações operacionais (`fiscal_homologation_check.py`, `asaas_sandbox_check.py`);
- `docs`: documentação técnica dos módulos (`docs/fiscal/NFCE.md`, `docs/asaas/ASAAS.md`);
- `secrets`: certificados locais (ignorada pelo git e pelo build);
- `storage`: diretórios privados de armazenamento (inclui os XML/PDF fiscais).

## Execução

1. Crie um ambiente Python 3.13.13.
2. Instale as dependências com `uv sync`.
3. Ajuste `.env` a partir de `.env.example`.
4. Rode a aplicação com `uv run fastapi dev app/main.py`.

## Docker

1. Copie `.env.example` para `.env` (`cp` no Linux/Git Bash, `Copy-Item` no PowerShell).
2. Dentro de `farmaura-api/`, suba a stack: `./scripts/docker_up.sh` (Linux, macOS, Git Bash) ou `.\scripts\docker_up.ps1` (Windows PowerShell).
3. Sempre que alterar o frontend containerizado, rode `./scripts/docker_rebuild_web.sh` ou `.\scripts\docker_rebuild_web.ps1`.

Os pares `.sh`/`.ps1` fazem exatamente a mesma coisa (`docker compose up --build` e rebuild só do serviço `farmaura`); os comandos `docker compose ...` puros também funcionam igual nos dois sistemas. Se o PowerShell recusar o `.ps1` ("a execução de scripts foi desabilitada"), rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` ou use `powershell -ExecutionPolicy Bypass -File .\scripts\docker_up.ps1`.

O compose do backend:

- sobe `farmaura-web`, `farmaura-api`, `farmaura-postgres`, `farmaura-valkey`, `farmaura-mailhog` e `farmaura-nominatim`;
- mantém PostgreSQL e Valkey somente na rede privada `farmaura_private`;
- por padrão não depende do `lumos_gateway` localmente;
- publica a camada web em `127.0.0.1:3000`;
- expõe a API localmente em `127.0.0.1:8080` para desenvolvimento;
- responde healthcheck em `/api/v1/health`;
- `farmaura-nominatim` é um Nominatim (geocodificação) auto-hospedado — importa o extrato OSM do Centro-Oeste no primeiro boot (~200MB, pode levar alguns minutos); acompanhar com `docker compose logs -f farmaura-nominatim` e checar `http://127.0.0.1:9090/status.php` quando quiser confirmar se já terminou.


Comandos operacionais úteis:

- `docker_up.sh` / `docker_up.ps1`: sobe ou recria a stack inteira com build;
- `docker_rebuild_web.sh` / `docker_rebuild_web.ps1`: recompila a imagem web multi-stage e recria apenas o serviço `farmaura`, sem rebuildar dependências da API;

URLs locais após subir a stack:

- `http://127.0.0.1:3000/marketplace`
- `http://127.0.0.1:3000/miaura` (console interno)
- `http://127.0.0.1:8080/api/v1/health`

Para integrar com o gateway no servidor de dev/prod:

```bash
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up --build -d
```

## Testes e qualidade

Sem instalar nada no host, dentro do container da API:

```bash
docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest                 # toda a suíte
docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest app/tests -k fiscal
docker compose run --rm --no-deps --entrypoint uv farmaura-api run ruff check app
docker compose run --rm --no-deps --entrypoint uv farmaura-api run mypy app
```

Em Windows sem Docker é possível usar um venv com as dependências fixas do `pyproject.toml` (procedimento e limitações no cofre: POP "executar testes Python sem Docker no Windows"). Testes que dependem de Postgres/Valkey só passam com a stack Docker de pé.

## Migrations

```bash
docker compose run --rm --no-deps --entrypoint uv farmaura-api run alembic current
docker compose run --rm --no-deps --entrypoint uv farmaura-api run alembic upgrade head
```

Todo schema novo do `farmaura-api` exige migration revisada. Produção só recebe migration com confirmação explícita (ver o POP de migration no cofre). Um Postgres novo criado por `create_all` não tem `alembic_version`: use `alembic stamp <revisão>` antes do `upgrade`.

## Módulos com configuração própria

- **NFC-e (nota fiscal do balcão)** — `docs/fiscal/NFCE.md`. Desligada por padrão (`NFCE_ENABLED=false`); só homologação; produção exige `FISCAL_ENV=producao` **e** `FISCAL_PRODUCTION_ENABLED=true`. Verificação: `python scripts/fiscal_homologation_check.py`.
- **Asaas (pagamentos e nota de serviço do marketplace)** — `docs/asaas/ASAAS.md`. Em qualquer `APP_ENV` diferente de `production` só o sandbox é aceito. Verificação: `python scripts/asaas_sandbox_check.py`.

As variáveis de ambos estão no `.env.example`, sem valores. Nunca versionar chave de API, senha de certificado ou o `.pfx`.

## Observações

- `lumos-gateway/` permanece o único edge público.
- O `uv.lock` existe, mas as dependências do módulo fiscal (`cryptography`, `reportlab`, `segno`, `tzdata`, `lxml`, e `aiosqlite` no grupo dev) foram adicionadas ao `pyproject.toml` sem regenerar o lock: rode `uv lock` e commite.
- O `docker-compose.yml` foi preparado para ambiente local e integração com o gateway existente.
