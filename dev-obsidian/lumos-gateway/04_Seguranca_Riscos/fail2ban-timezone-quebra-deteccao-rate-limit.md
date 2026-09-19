---
cssclasses: ia-nota
---

# `lumos_gateway_fail2ban` nunca bane ataques de rate-limit/DoS — descompasso de fuso horário com o nginx (container sem `TZ`)

**Tipo:** Vulnerabilidade (falha de controle defensivo, confirmada por teste ativo com ambiente completo — TLS self-signed, todos os 10 vhosts, todos os 5 jails)
**Status:** CONFIRMADO — causa raiz identificada e comprovada por A/B (um jail idêntico em estrutura funciona, outro não, só varia a fonte de log)
**Severidade:** ALTO
**Sistema afetado:** `lumos-gateway` (`lumos_gateway_fail2ban`, jail `nginx-limit-req`)
**Categoria:** Controle defensivo silenciosamente inoperante
**Data do teste:** 2026-09-18 (teste de intrusão mais agressivo, autorizado explicitamente pelo usuário — ver exceção registrada em `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md`)

## Descrição

O jail `nginx-limit-req` do `fail2ban` — responsável por banir IPs que abusam do rate limit do nginx (`limit_req`, a defesa central contra DDoS/spam de requisição documentada em `padrao-ataques-defesas-e-limites-de-teste.md`) — **nunca detecta nem bane nenhum IP**, mesmo diante de violação clara e repetida, porque o container `lumos_gateway_fail2ban` não tem a variável `TZ` definida (fica em UTC) enquanto o `gateway_nginx` loga em horário local `America/Sao_Paulo` (UTC-3, `TZ` explícito no compose). O `error_log` do nginx (de onde este jail especificamente lê) grava timestamp **sem informação de fuso** (`2026/09/18 21:17:08`) — o `fail2ban`, rodando em UTC, interpreta esse timestamp como se já fosse UTC, calcula um descompasso de exatas 3h, e descarta a entrada por parecer "antiga demais" (fora da janela `findtime`).

**Os outros 4 jails do mesmo container (`nginx-badbots`, `nginx-probes`, `nginx-fake-searchbots`, `nginx-codigo`) NÃO têm esse problema** — eles leem o `access_log`, cujo formato (`log_format lumos_combined`, `$time_local`) inclui o offset explícito (`[18/Sep/2026:21:19:30 -0300]`), que o `fail2ban` interpreta corretamente independente do seu próprio fuso. **Só o jail que lê `error_log` está afetado** — mas é justamente o jail responsável pela categoria de ataque mais crítica (DDoS/spam de requisição) entre as cinco.

## Evidência (teste A/B, mesmo ambiente, mesma sessão)

Ambiente: stack completo de `lumos-gateway` rodando localmente (build próprio, TLS com certificados self-signed gerados para os 8 domínios primários configurados, upstreams stub para destravar o boot do nginx — nada tocou domínio público real nem `/etc/letsencrypt` real).

**Passo 1 — confirmar o descompasso de relógio, direto:**
```
docker exec lumos_gateway_fail2ban date  →  Sat Sep 19 00:18:43 UTC 2026
docker exec lumos_gateway_nginx date     →  Fri Sep 18 21:18:43 -03 2026
```
Exatos 180 minutos de diferença — bate com o offset de `America/Sao_Paulo`.

**Passo 2 — jail quebrado (`nginx-limit-req`, lê `error_log`):** disparadas 60 requisições verdadeiramente paralelas (`xargs -P 60`) contra o vhost do Farmaura — 41 passaram (200), 19 rejeitadas pelo rate limit (429), cada uma logando uma linha `limiting requests, excess: ...` em `farmaura_error.log` com `client: 172.19.0.1`. Confirmado que o `fail2ban` **consegue ler o arquivo** (mesmo conteúdo visível de dentro do próprio container `fail2ban`) e que o filtro (`failregex = ^.* limiting (requests|connections),.*client: <HOST>, server: .*$`) **casa visualmente** com o formato da linha. Ainda assim:
```
fail2ban-client status nginx-limit-req
  Currently failed: 0 | Total failed: 0 | Currently banned: 0
```
Log interno do próprio `fail2ban` confirma a causa: `WARNING [nginx-limit-req] Detected a log entry 3h before the current time in operation mode. This looks like a timezone problem.`

**Passo 3 — jail equivalente, mas saudável (`nginx-codigo`, lê `access_log`):** disparadas 8 requisições com payload de injeção óbvio (`?codigo=<script>alert(1)</script>`, `maxretry=6` neste jail) contra o mesmo vhost. Resultado:
```
fail2ban-client status nginx-codigo
  Currently failed: 1 | Total failed: 8 | Currently banned: 1 | Banned IP list: 172.19.0.1
```
**Baniu corretamente**, na primeira tentativa além do limite — confirma que o mecanismo de detecção/banimento do `fail2ban` em si funciona; o problema é isolado à fonte de log sem timezone explícito.

## Impacto

Em produção (`lumos-prd`), se o mesmo `TZ` estiver ausente no serviço `lumos_gateway_fail2ban` do `docker-compose.yml` real do servidor (não verificado neste teste — este teste rodou 100% local; ver [[../../docker/06_Pendencias/verificar-tz-fail2ban-producao|verificar-tz-fail2ban-producao]] para o próximo passo), um atacante pode sustentar abuso de rate limit (scraping agressivo, tentativa de DoS de aplicação, brute force que dispare o rate limit antes de qualquer outro jail) **indefinidamente, sem nunca ser banido por este jail** — o rate limit do próprio nginx (`limit_req`) continua funcionando request-a-request (confirmado no passo 2: 429 real), mas a camada de banimento de IP que deveria escalar a resposta contra um agressor persistente nunca age. Um atacante que descubra isso (ou simplesmente persista) tem uma janela de abuso sem custo crescente.

## Correção sugerida para análise futura

Adicionar `environment: TZ: America/Sao_Paulo` (mesmo valor já usado pelo `gateway_nginx`) ao serviço `lumos_gateway_fail2ban` no `docker-compose.yml` — ou, alternativa mais robusta e independente de fuso, trocar o `error_log` do nginx para um formato com timestamp em UTC/com offset explícito (`error_log ... warn;` não aceita `log_format` customizado da mesma forma que o `access_log`, então a opção mais simples é mesmo alinhar o `TZ` do container `fail2ban`).

## Como validar futuramente que a correção funcionou

Repetir o passo 2 do bloco "Evidência" (rajada paralela de requisições excedendo o rate limit) após a correção — `fail2ban-client status nginx-limit-req` deve mostrar `Total failed` > 0 e, após exceder `maxretry=6`, o IP de teste deve aparecer em `Banned IP list`.

## Referências

- [[teste-roteamento-2026-09-18|teste-roteamento-2026-09-18]] — primeira rodada (mais leve) do mesmo teste, onde o `fail2ban` já tinha sido visto em crash-loop e a causa não investigada a fundo; esta nota substitui aquela observação por um diagnóstico completo.
- `dev-obsidian/_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste.md` — defesa "Rate limit por rota" listada como obrigatória contra DDoS/spam; este achado mostra que a camada de banimento (não o rate limit em si) está inoperante para essa categoria.

## Atualizações

- 2026-09-18: nota criada a partir de teste de intrusão mais agressivo contra `lumos-gateway`, autorizado explicitamente pelo usuário.
