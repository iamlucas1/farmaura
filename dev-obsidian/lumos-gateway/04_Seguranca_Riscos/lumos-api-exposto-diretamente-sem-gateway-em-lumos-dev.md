---
cssclasses: ia-nota
---

# `lumos-api` publicado direto na porta 8000 de `lumos-dev`, contornando completamente o `lumos-gateway`

**Tipo:** Vulnerabilidade (exposição de rede / bypass de camada de proteção)
**Status:** CONFIRMADO
**Severidade:** CRÍTICO
**Sistema afetado:** `lumos-api` (backend Python, domínios `lumosmed` + `identity`) em `lumos-dev`
**Categoria:** Exposição de rede / bypass de WAF-gateway / dados sensíveis em trânsito sem TLS
**Data de identificação:** 2026-09-18

## Descrição

Em `lumos-dev`, o container `lumos-api` (imagem `lumos-api-api`) está publicado como `0.0.0.0:8000->8000/tcp` **e** `[::]:8000->8000/tcp` — acessível diretamente da internet, em HTTP puro (sem TLS), sem passar pelo `lumos-gateway`. Isso significa que todo o tráfego para esse serviço (que hospeda o domínio de negócio do LumosMed — agenda, pacientes, faturamento, autenticação — e o domínio `identity` compartilhado) **não recebe nenhuma das proteções que o gateway existe para prover**:

- Sem TLS — tráfego (incluindo login, tokens JWT, dados de paciente) trafega em texto plano se acessado pela porta 8000.
- Sem bloqueio geográfico (GeoIP allowlist do gateway, ver [[../05_Integracoes_Infra/GeoIP|GeoIP]]) — qualquer país pode acessar.
- Sem os 5 jails de `fail2ban` que protegem os vhosts do gateway (`nginx-badbots`, `nginx-probes`, `nginx-limit-req`, `nginx-fake-searchbots`, `nginx-codigo`).
- Sem o `limit_req_zone` de rate limiting do Nginx.
- Sem os headers de segurança padrão (`HSTS`, `X-Frame-Options`, etc.) aplicados pelo gateway.

Existe um container irmão, `lumos-api-tls` (`nginx:1.27-alpine`), aparentemente destinado a ser um proxy TLS na frente do `lumos-api` (porta interna `8443`) — mas ele **não tem nenhuma porta publicada para o host** (`docker port lumos-api-tls` não retorna nada). Ou seja, o proxy TLS existe na topologia mas está desconectado do mundo real: quem acessa `lumos-api` hoje entra direto pela porta 8000 pura, não pelo `8443` do proxy.

O `docker-compose.yml` que define essa publicação de porta está em `/opt/lumos-api/docker-compose.yml` no próprio servidor `lumos-dev`.

## Evidência

```
$ docker ps --format '{{.Names}}\t{{.Ports}}'   # em lumos-dev
lumos-api        0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
lumos-api-tls    80/tcp, 8443/tcp     # nenhuma publicação para o host

$ docker port lumos-api-tls
(vazio)

$ ss -tulnp | grep 8000
tcp LISTEN 0.0.0.0:8000  users:(("docker-proxy",...))
tcp LISTEN [::]:8000     users:(("docker-proxy",...))
```

Comparando com `lumos-prd`: nenhum serviço de aplicação é publicado fora de `127.0.0.1` além do gateway em `80`/`443` — o padrão correto (app só acessível via gateway, ver arquitetura documentada em [[../02_Documentacao/Visao_Geral|Visão Geral]]) está presente em produção, mas **não** em `lumos-dev` para este serviço específico.

## Cenário de risco

Qualquer pessoa na internet pode acessar `http://<IP-de-lumos-dev>:8000/...` diretamente — sem TLS, sem geobloqueio, sem rate limit, sem fail2ban — e interagir com toda a API do domínio LumosMed/identity normalmente destinada a passar pelo BFF Laravel + gateway. Isso inclui qualquer endpoint de autenticação, o que amplia a superfície de brute force/enumeração sem nenhuma das mitigações que o restante do ecossistema tem.

## Impacto

- Interceptação de credenciais/tokens em trânsito por qualquer um na mesma rota de rede (HTTP puro), caso alguém de fato use essa porta para acessar dados reais de ambiente de dev.
- Superfície de ataque a autenticação/autorização do domínio LumosMed sem nenhuma das camadas de defesa em profundidade que o resto do ecossistema tem.
- Já que é `lumos-dev`, o dado ali é presumivelmente de teste/seed — mas a arquitetura de auth (JWT RS256 interno, ver [[../../lumosmed/00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada|autenticacao-interna-rs256-assinada]]) e a própria lógica de negócio expostas nesse caminho são as mesmas de produção; um invasor pode usar esse acesso para mapear/testar a API sem as barreiras que dificultariam o mesmo trabalho contra produção.

## Pré-condições

Nenhuma — a porta está publicamente acessível sem autenticação prévia de rede (é um serviço HTTP normal, só sem estar atrás do gateway).

## Escopo afetado

`/opt/lumos-api/docker-compose.yml` em `lumos-dev`; container `lumos-api`; container órfão `lumos-api-tls` (não conectado a nada).

## Causa raiz

Aparenta ser uma configuração de desenvolvimento/depuração (acesso direto à API sem precisar do gateway, possivelmente para testar mais rápido) que ficou publicada com `0.0.0.0` em vez de `127.0.0.1`, ou que nunca foi migrada para o padrão "só o gateway é exposto" já usado por todos os outros serviços do mesmo servidor (`farmaura`, `farmaura_api`, todos em `127.0.0.1:PORT`).

## Correção sugerida para análise futura

1. Alterar a publicação de porta de `lumos-api` em `/opt/lumos-api/docker-compose.yml` de `0.0.0.0:8000:8000`/`- "8000:8000"` para `127.0.0.1:8000:8000` (mesmo padrão já usado por `farmaura`/`farmaura_api` no mesmo servidor) — ou remover a publicação por completo se o acesso deve ser só via rede Docker interna do gateway.
2. Decidir o destino do container `lumos-api-tls`: se a intenção era ele ser o ponto de entrada real (com TLS), reconectar essa topologia; se está obsoleto, removê-lo para não deixar infraestrutura morta.
3. Confirmar se `lumos-gateway` já tem um vhost/rota para `lumos-api` em `lumos-dev` equivalente ao `21-lumos-api.conf.template` de produção, e redirecionar todo tráfego legítimo para passar por ali.

## Dependências da correção

Levantar com quem usa esse acesso direto hoje (se for usado por alguma ferramenta/script de desenvolvimento) antes de fechar a porta, para não quebrar um fluxo de trabalho real sem aviso.

## Riscos de regressão

Baixo tecnicamente (mudar bind de `0.0.0.0` para `127.0.0.1` não quebra tráfego que já vem do gateway/rede interna) — o risco é só de quebrar algum acesso direto que alguém already dependa por conveniência.

## Como validar futuramente que a correção funcionou

`docker port lumos-api` deve mostrar `127.0.0.1:8000` (ou nenhuma publicação); `ss -tulnp | grep 8000` não deve mostrar `0.0.0.0`/`[::]`; uma tentativa de acesso de fora do servidor a `http://<IP>:8000` deve falhar (connection refused/timeout).

## Referências

- [[../05_Integracoes_Infra/GeoIP|GeoIP]], [[../05_Integracoes_Infra/Fail2ban|Fail2ban]] — proteções que este caminho de acesso não recebe hoje.
- [[../../lumosmed/00_Decisoes/2026-03-27-autenticacao-interna-rs256-assinada|autenticacao-interna-rs256-assinada]] — arquitetura de auth exposta por este bypass.
- [[auditoria-servidores-2026-09-18-resumo-consolidado]] — visão consolidada desta rodada de auditoria.

## Atualizações

- 2026-09-18: achado registrado.
