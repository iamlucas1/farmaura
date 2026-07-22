# Skill: project-test-orientation

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/project-test-orientation/SKILL.md`

## Propósito

Skill de orientação, não de checklist: responde "qual stack eu subo, em qual porta, com qual container" antes de testar algo que atravessa mais de uma stack deste repositório.

## Quando usar

Antes de testar qualquer feature que envolva mais de uma stack, ou sempre que não tiver certeza de qual container/porta corresponde a qual serviço.

## Tabela stack → onde testar

- **`farmaura`** (frontend): `farmaura-api/docker-compose.yml`, container `farmaura`, `127.0.0.1:3000`, healthcheck `GET /healthz`.
- **`farmaura-api`** (backend): mesmo compose, container `farmaura_api`, `127.0.0.1:8080`, healthcheck `GET /api/v1/health`.
- **`farmaura-postgres`/`farmaura-valkey`**: mesmo compose, rede interna `farmaura_private`, sem porta pública.
- **`lumos-api`**: `lumos-api/docker-compose.yml`, container `lumos-api`, `${API_PORT:-8000}`, healthcheck `GET /health`.
- **`lumos-api-postgres`/`lumos-api-redis`**: mesmo compose, rede interna `api_internal`, sem porta pública.
- **`lumos-gateway`**: `lumos-gateway/docker-compose.yml`, containers `lumos_gateway_nginx`/`lumos_gateway_certbot`/`lumos_gateway_fail2ban`, `80`/`443` — borda pública real, tratar como sensível.
- **`lumosmed`**: sem `docker-compose.yml` encontrado neste repositório — checar `lumosmed/README.md` antes de assumir como subir.

## Regras

Testar cada backend sempre pela própria porta local, nunca pela porta pública do gateway (a menos que o alvo do teste seja o próprio roteamento do gateway); nunca escanear/fazer fuzzing agressivo contra `lumos-gateway`, nunca mexer em certificado; banco/cache não têm porta pública por design — nunca expor porta só para testar.

## Ver também

- [[../Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — política completa de limites seguros de teste que esta tabela sustenta.
- [[security-vulnerability-testing]], [[qa-functional-review]] — skills que assumem esta tabela para saber onde apontar o teste.
- [[../../farmaura/05_Integracoes_Infra/Docker_Compose|Docker_Compose]] — detalhe de infra do compose do Farmaura.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-20: nota criada.
