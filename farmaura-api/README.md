# Farmaura Backend

Base inicial da API da Farmaura em Python com FastAPI, SQLAlchemy 2.x e arquitetura em camadas.

## Estrutura

- `app/api`: camada HTTP, dependências e middleware;
- `app/core`: configuração, segurança, banco e respostas compartilhadas;
- `app/domain`: enums, erros e permissões;
- `app/models`: models ORM;
- `app/repositories`: acesso a dados;
- `app/services`: casos de uso;
- `app/schemas`: contratos de request/response;
- `app/tests`: testes unitários, de API e segurança;
- `storage`: diretórios privados de armazenamento.

## Execução

1. Crie um ambiente Python 3.13.13.
2. Instale as dependências com `uv sync`.
3. Ajuste `.env` a partir de `.env.example`.
4. Rode a aplicação com `uv run fastapi dev app/main.py`.

## Docker

1. Copie `.env.example` para `.env`.
2. Suba a stack com `./scripts/docker_up.sh`.
3. Sempre que alterar o frontend containerizado, rode `./scripts/docker_rebuild_web.sh`.

O compose do backend:

- sobe `farmaura-web`, `farmaura-api`, `farmaura-postgres` e `farmaura-redis`;
- mantém PostgreSQL e Redis somente na rede privada `farmaura_private`;
- por padrão não depende do `lumos_gateway` localmente;
- publica a camada web em `127.0.0.1:3000`;
- expõe a API localmente em `127.0.0.1:8080` para desenvolvimento;
- responde healthcheck em `/api/v1/health`.


Comandos operacionais úteis:

- `./scripts/docker_up.sh`: sobe ou recria a stack inteira com build;
- `./scripts/docker_rebuild_web.sh`: recompila a imagem web multi-stage e recria apenas o serviço `farmaura`, sem rebuildar dependências da API;

URLs locais após subir a stack:

- `http://127.0.0.1:3000/marketplace`
- `http://127.0.0.1:3000/internal`
- `http://127.0.0.1:8080/api/v1/health`

Para integrar com o gateway no servidor de dev/prod:

```bash
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up --build -d
```

## Observações

- `lumos-gateway/` permanece o único edge público.
- O arquivo `uv.lock` ainda não foi gerado neste scaffold porque não houve resolução de dependências nesta sessão.
- O `docker-compose.yml` foi preparado para ambiente local e integração com o gateway existente.
