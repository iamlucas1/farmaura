# Executar testes Python no Docker

## Quando usar

Ao executar ou criar testes do backend Farmaura, inclusive os cenários que exercitam serviços e integrações de IA, sem instalar dependências Python diretamente na máquina host.

## Pré-requisitos

- Docker Engine e Docker Compose disponíveis.
- Estar no diretório `farmaura-api/`.
- O `pytest==9.0.3` permanece declarado no grupo `dev` de `pyproject.toml`.

## Configuração da imagem

O `farmaura-api/Dockerfile` instala o grupo de dependências `dev` com `uv sync --group dev`. Portanto, a imagem da API contém `pytest`, além das demais ferramentas de desenvolvimento já declaradas, como `ruff` e `mypy`.

A imagem usa `docker/entrypoint.sh` como ponto de entrada normal. Esse entrypoint inicializa a API; para executar testes em um container temporário, o comando sobrescreve-o com `uv`.

## Passos

1. Construir ou atualizar a imagem da API:

   ```bash
   docker compose build farmaura-api
   ```

2. Executar toda a suíte configurada em `app/tests`:

   ```bash
   docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest
   ```

3. Executar somente uma área específica. Por exemplo, para localizar testes cujo nome contenha `ai`:

   ```bash
   docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest app/tests -k ai
   ```

4. Confirmar a disponibilidade da ferramenta, se necessário:

   ```bash
   docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest --version
   ```

## Observações

- `--rm` remove o container temporário após o comando; não remove imagens, volumes nem dados do banco.
- `--no-deps` não inicia Postgres, Valkey ou o frontend. Remova essa opção apenas quando o teste depender explicitamente desses serviços; nesse caso, suba a stack antes com `docker compose up -d`.
- A configuração do pytest em `pyproject.toml` define `app/tests` como diretório de testes e inclui a raiz do projeto no `PYTHONPATH`.
- Não use `docker compose run farmaura-api ...` sem `--entrypoint uv` para rodar pytest: o entrypoint padrão iniciará a API em vez do executor de testes.

## Responsável

Qualquer desenvolvedor que crie, execute ou mantenha testes do backend, incluindo os testes das integrações de IA.

## Riscos se pulado

Testes podem deixar de ser executáveis de forma reproduzível no ambiente Docker e diferenças entre dependências locais e as da imagem podem ocultar falhas.

## Ver também

- [[Docker_Compose]] — definição dos serviços e da imagem da API.
- [[IA_Gemini_OpenAI]] — integração de IA do backend.

## Atualizações

- 2026-09-01: nota criada após a inclusão do grupo `dev` na imagem da API, disponibilizando `pytest` no container.
