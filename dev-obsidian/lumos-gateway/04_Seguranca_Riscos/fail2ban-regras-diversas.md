---
cssclasses: ia-nota
---

# fail2ban: regex incompleta em um filtro + falso-positivo em outro

**Tipo:** Vulnerabilidade/robustez (regras de detecção de abuso)
**Status:** CONFIRMADO
**Severidade:** BAIXO-MÉDIO
**Sistema afetado:** `lumos-gateway`
**Categoria:** Rate limit / detecção de abuso
**Data de identificação:** 2026-08-19

Nota consolidada — dois achados relacionados a `fail2ban`, agrupados por afinidade. Confirmado antes: todos os 5 jails (`nginx-codigo`, `nginx-badbots`, `nginx-fake-searchbots`, `nginx-probes`, `nginx-limit-req`) estão `enabled = true`, e `chain = DOCKER-USER` está correto (ponto de inserção recomendado pelo Docker para que o banimento afete tráfego chegando via portas publicadas/DNAT).

## 1. Filtro `nginx-codigo.conf`: regex só cobre `codigo` como primeiro parâmetro de query string

**Localização:** `fail2ban/filter.d/nginx-codigo.conf:2` — `failregex = <HOST> -.*"(GET|POST|HEAD).*\?codigo=.*[<>'";{}\[\]]+.*"`.
**Descrição:** o padrão exige o literal `?codigo=` (interrogação imediatamente seguida de `codigo=`), então só casa quando `codigo` é o **primeiro** parâmetro da URL. Uma tentativa como `/pagina?outro=1&codigo=<script>` não é capturada, pois a substring é `&codigo=`, não `?codigo=`.
**Cenário de risco:** um atacante que descubra esse gap (testando o parâmetro como não-primeiro) escapa do banimento automático mesmo repetindo o mesmo payload várias vezes.
**Correção sugerida:** trocar `\?codigo=` por `[?&]codigo=`.

## 2. Filtro `nginx-fake-searchbots.conf`: pode banir crawlers legítimos (Googlebot/Bingbot reais) por 24h

**Localização:** `fail2ban/filter.d/nginx-fake-searchbots.conf:2`, combinado com `fail2ban/jail.local:23-28` (`maxretry=2`, `findtime=3600`, `bantime=86400`).
**Descrição:** o bloqueio no Nginx (`$block_search_bot`, `nginx.conf.template:99-103`) e o banimento subsequente dependem só da string do `User-Agent`, nunca de resolução reversa de DNS/ASN do IP de origem (prática padrão para diferenciar Googlebot real de UA spoofado). Um bot real do Google/Bing que siga um link para uma rota restrita (`/login`, `/checkout`, link mal formado em algum lugar do site) recebe 403 e, com só 2 ocorrências em 1h, é banido por 24h no nível de IP — afetando **todos os tenants simultaneamente**, já que o banimento opera na chain `DOCKER-USER` compartilhada.
**Impacto:** perda temporária de indexação/crawling real por 24h em caso de falso positivo — dano de SEO, não de dados, mas afeta todos os produtos atrás do gateway ao mesmo tempo.
**Correção sugerida:** adicionar validação de reverse-DNS+forward-confirm (`googlebot.com`/`search.msn.com`, conforme documentação oficial dos motores) antes de tratar um UA como "search bot real"; ou, no mínimo, aumentar `maxretry`/`findtime` deste jail específico.

## Referências

- [[rate-limit-burst-baixo-em-sete-tenants]] — jail `nginx-limit-req` interage com o mesmo mecanismo de banimento, sob outro ângulo (burst de rate-limit baixo demais gerando banimento indevido).

## Atualizações

- 2026-08-19: nota criada.