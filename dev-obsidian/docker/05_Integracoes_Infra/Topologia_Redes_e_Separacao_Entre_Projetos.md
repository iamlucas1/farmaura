---
cssclasses: ia-nota
---

# Topologia de redes Docker e separação entre projetos

**Tipo:** Infraestrutura (visão cruzada — não duplica o contrato detalhado de cada projeto, só mapeia como eles se conectam)

## Propósito

Nenhuma nota de projeto individual mostra o desenho completo de como os stacks Docker deste ecossistema se isolam e se conectam entre si. Esta nota existe só para isso — o contrato detalhado de cada compose continua em cada projeto (linkado abaixo).

## O padrão: uma rede privada por projeto + uma rede pública compartilhada

Todo stack de aplicação segue o mesmo desenho:

1. Uma rede Docker **privada e interna**, exclusiva do projeto (banco, cache, workers, serviços que nunca devem ser alcançáveis de fora do stack).
2. Só o(s) container(s) que efetivamente servem tráfego HTTP público entram também na rede **compartilhada** `lumos_gateway` — nunca o banco, cache ou workers.
3. O `lumos-gateway` (Nginx + Certbot + Fail2ban) é o único ingress público real — nenhum outro serviço expõe porta 80/443 para fora do host.

| Projeto | Rede privada | Quem entra em `lumos_gateway` | Fica só na rede privada |
|---|---|---|---|
| `farmaura` | `farmaura_private` | `farmaura` (web/nginx) — **não** `farmaura-api` diretamente | `farmaura-api`, `farmaura-postgres`, `farmaura-valkey`, `farmaura-mailhog` |
| `lumos-api` | `api_internal` | `api` (alias `lumos-api`) | `postgres`, `redis`, `bootstrap` |
| `lumosmed` | `lumosmed_internal` (nome do compose: `private`) | `web` (alias `lumosmed-web`) | `app`, `queue`, `scheduler`, `redis` |
| `lumos-gateway` | — (é o próprio ingress) | `gateway_nginx` (ouve 80/443 no host) | `lumos_gateway_certbot`, `lumos_gateway_fail2ban` (`network_mode: host`, não usa rede Docker isolada) |

Ver o contrato completo de cada um: [[../../farmaura/05_Integracoes_Infra/Docker_Compose|farmaura/Docker_Compose]], [[Docker_Compose_Lumos_Api|docker/Docker_Compose_Lumos_Api]], [[../../lumosmed/05_Integracoes_Infra/Docker_Compose|lumosmed/Docker_Compose]], [[../../lumos-gateway/05_Integracoes_Infra/Docker_Compose|lumos-gateway/Docker_Compose]].

**Exceção conhecida:** `gateway_nginx` (lumos-gateway) também entra diretamente em `farmaura_private` — não pelo padrão "rede pública compartilhada", mas como rede externa adicional declarada no seu próprio compose. Existe desde a correção de um bug real de produção (ver [[../../farmaura/05_Integracoes_Infra/Lumos_Gateway|farmaura/Lumos_Gateway]], "bug encontrado e corrigido em 2026-07-24" — sem essa declaração, qualquer recreate do gateway perdia a conectividade manual com `farmaura_private`). É a única rede privada de projeto que o gateway toca diretamente.

## `lumos_gateway`: rede externa que nenhum compose cria

Todos os quatro `docker-compose.yml`/`compose.yaml` (`farmaura-api`, `lumos-api`, `lumosmed`, e o próprio `lumos-gateway`) declaram a rede `lumos_gateway` como **`external: true`** — nenhum deles a cria de fato. Isso significa que ela precisa existir previamente no host (`docker network create lumos_gateway`, presumivelmente feito manualmente no bootstrap do servidor) antes de qualquer um desses stacks subir com sucesso. Não encontrado nenhum script ou nota que documente esse passo de bootstrap — se um servidor novo for provisionado do zero, este é o primeiro coisa a fazer manualmente antes de `docker compose up` em qualquer um dos quatro projetos.

## Segurança: comparação do que cada Dockerfile/compose faz diferente

| Item | `farmaura`/`farmaura-api` | `lumos-gateway` | `lumos-api` | `lumosmed` |
|---|---|---|---|---|
| Usuário não-root no container | ❌ Não — roda como root (achado registrado: [[../../farmaura/04_Seguranca_Riscos/containers-docker-rodando-como-root\|containers-docker-rodando-como-root]]) | Parcial — `www-data` via nginx nativo, usuário dedicado criado mas nunca usado | ✅ Sim — usuário `lumos-api`, drop de privilégio via `gosu` no entrypoint | Não verificado neste levantamento (Dockerfile compartilhado vive fora deste repo) |
| Segredos via Docker secrets (arquivo) | ❌ Não — `env_file`/env direto no compose | N/A (secret único, `geoip_license_key`, via Docker secret) | ✅ Sim — 9 secrets via arquivo | ✅ Sim — 4 secrets via arquivo |
| Build multi-stage | Parcial — só `docker/web/Dockerfile` (frontend); `farmaura-api/Dockerfile` é single-stage (achado: [[../../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos\|hardening-baixo-docker-e-gateway-diversos]] item 1) | N/A (single-stage, imagem de sistema) | ✅ Sim — 3 estágios | Não verificado (fora do repo) |
| `cap_drop`/`no-new-privileges` | ❌ Não declarado | ✅ Sim, no `gateway_nginx` (mas não replicado em `certbot`/`fail2ban` — ver [[../../lumos-gateway/04_Seguranca_Riscos/supply-chain-e-hardening-diversos\|supply-chain-e-hardening-diversos]]) | ❌ Não declarado | Não verificado |
| Auditoria de segurança dedicada já feita | ✅ 2026-08-17 | ✅ 2026-08-19 | ❌ Nunca — ver [[../06_Pendencias/lumos-api-sem-auditoria-de-seguranca-docker\|lumos-api-sem-auditoria-de-seguranca-docker]] | ❌ Nunca |

`lumos-api` é, isoladamente, o Dockerfile mais endurecido do ecossistema (não-root + drop de privilégio via `gosu` + `dumb-init` + secrets de arquivo) apesar de nunca ter passado por auditoria formal — o oposto de `farmaura-api`, que já foi auditado e tem achados abertos.

## Testes

- `farmaura-api`: testes rodam **dentro** do container (`docker compose run --rm --no-deps --entrypoint uv farmaura-api run pytest`) — ver POP dedicado [[../../farmaura/07_POPs_Processos/executar-testes-python-no-docker|farmaura/executar-testes-python-no-docker]]. Sem `--no-deps`/serviços de dependência reais, os testes usam SQLite local (`conftest.py` define `APP_DATABASE_URL=sqlite+aiosqlite:///./test.db` como default) — ou seja, a suíte padrão **não exercita Postgres real nem RLS** a menos que explicitamente configurada contra o Postgres do compose.
- `lumos-api`: `tests/` é explicitamente excluído do contexto de build (`.dockerignore`) — a suíte não roda dentro da imagem de runtime. Não verificado neste levantamento onde/como ela roda (provavelmente fora do Docker, direto no host) — ver pendência [[../06_Pendencias/lumos-api-sem-auditoria-de-seguranca-docker|lumos-api-sem-auditoria-de-seguranca-docker]].
- `lumosmed`: `.env.testing` usa SQLite `:memory:` e `SESSION_DRIVER=array` (ver [[../../lumosmed/05_Integracoes_Infra/Banco_Dados|lumosmed/Banco_Dados]]) — testes do Laravel não parecem depender do compose Docker para rodar.

## Ver também

- [[Ambiente_Docker_Local]] — as duas *engines* Docker da máquina de desenvolvimento local (tema diferente: isso aqui é sobre redes/isolamento entre projetos, dentro de qualquer engine ou no servidor de produção).
- `claude.md` (raiz do repositório `dev`, fora deste cofre) — seção "Existing Gateway Constraint", política estática que exige este desenho (gateway como único ingress, serviços privados fora da rede compartilhada).

## Atualizações

- 2026-09-18: nota criada a partir de um levantamento completo de Docker em todo o ecossistema (Dockerfiles, composes, `.dockerignore`, políticas em `claude.md`) pedido explicitamente pelo usuário.
