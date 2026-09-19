---
cssclasses: ia-nota
---

# Auditoria ativa controlada de segurança e resiliência — `lumos-prd` e `lumos-dev` — 2026-09-19

**Tipo:** Relatório de auditoria ativa controlada
**Status:** Concluída parcialmente
**Sistema afetado:** `lumos-prd` e `lumos-dev`
**Categoria:** Infraestrutura, exposição externa, SSH, HTTP, rate limiting e observabilidade
**Data de identificação:** 2026-09-19

## Escopo e limites executados

A origem externa foi `188.241.177.227`, distinta dos hosts auditados. Foram executados somente: baseline interno read-only, verificação TCP moderada contra portas autorizadas de `lumos-prd`, handshakes/probes mínimos sem autenticação, baseline HTTPS, duas rajadas HTTP limitadas e três autenticações SSH inválidas contra um único usuário inexistente.

Não foram executados DDoS volumétrico, flood de pacotes, exploração, wordlists, password spraying, tentativas com credencial real, alteração de servidor, remoção de bloqueio, restart manual, alteração de firewall ou snapshot restore.

## Superfície externa

`adcrdf.com.br`, `lumosmed.com.br` e `drogariafarmaura.com.br` resolveram diretamente para `31.97.30.213`, o IP de `lumos-prd`. Não foi observada Cloudflare nesses domínios; o tráfego HTTPS chega diretamente ao origin.

| Porta | Resultado externo | Evidência de protocolo | Conclusão |
| --- | --- | --- |
| 22 | conexão aceita | `OpenSSH_9.6p1 Ubuntu-3ubuntu13.19` | SSH público confirmado |
| 80/443 | conexão aceita | HTTP/HTTPS do gateway | exposição esperada confirmada |
| 2375, 2376, 3000, 3478, 5432, 6379, 8000, 8080 | handshake TCP aceito | sem resposta de protocolo em até 5s | inconclusivo; não confirma serviço funcional ou Docker API exposto |

Probes mínimos em `2375/version`, Redis `PING`, startup PostgreSQL e HTTP em `8000` não retornaram resposta. Não houve exploração posterior.

## Resultado SSH

Configuração confirmada em `lumos-prd`: `permitrootlogin yes`, `passwordauthentication yes`, `maxauthtries 6`, jail `sshd` ativa e ban configurado para 12 horas (`findtime=600`, `maxretry=5`, `bantime=43200`).

As três tentativas contra `audit_invalid_20260919` foram registradas no journal como `Invalid user` e `Failed none`. Após a primeira, o contador atual do Fail2ban passou de 0 para 1. Após as três, uma nova conexão recebeu `Connection reset by 31.97.30.213 port 22`.

O reset confirma bloqueio/rejeição posterior do IP de auditoria, mas a jail/regra exata não foi consultada após esse ponto porque o próprio IP administrativo de teste foi bloqueado. O bloqueio não foi removido manualmente.

| Evento | Classificação |
| --- | --- |
| falha SSH inválida | DETECTADO |
| bloqueio/rejeição posterior | DETECTADO |
| alerta administrativo | DETECTADO SEM ALERTA |

## Resultado HTTP

O vhost `https://adcrdf.com.br/` respondeu em TLS 1.3 com `TLS_AES_256_GCM_SHA384`.

| Carga | Latência p95 | HTTP 429 | HTTP 5xx | CPU Nginx | RAM Nginx | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 25 requests, concorrência 5, 5.41 req/s | 1.485s | 0 | 0 | 0% após teste | 14.38 MiB | 25/25 sucesso |
| 50 requests, concorrência 10, 11.67 req/s | 2.110s | provável: 27 não-2xx compatíveis com `limit_req_status 429` | 0 | 3.14% | 14.40 MiB | gateway estável; rate limit acionado |

No estágio de 50 requisições, ApacheBench informou 27 respostas não-2xx e nenhuma exceção/timeout. Como a configuração efetiva define `limit_req` em 5 req/s por IP, burst 20 e status 429, o resultado é consistente com rate limiting. Não foi classificado como confirmação absoluta de 429 porque a coleta do ApacheBench agregou os códigos e o recorte posterior de log não exibiu as linhas individuais.

## Limite observado

O primeiro controle acionado ficou na faixa de aproximadamente 10–12 req/s provenientes de uma única origem. A infraestrutura não atingiu saturação: não houve 5xx, OOM, swap, reinício de container, aumento material de conexões ou erro de kernel.

O limite observado foi de aplicação por IP, não de CPU, RAM ou Docker. A carga não foi elevada além dessa faixa para preservar margem operacional.

## Baseline e observabilidade

Em `lumos-prd`, havia 5.7 GiB de memória disponível, zero swap e load baixo antes dos testes. O gateway permaneceu saudável. Em `lumos-dev`, o baseline revelou crash loop de Lumos Horizon, registrado em [[lumos-horizon-dev-crash-loop-silencioso-por-host-redis-incorreto]].

Não foi evidenciado alerta operacional para o crash loop, para as falhas SSH, para o bloqueio/ban ou para o acionamento de rate limit.

## Achados anteriores reconfirmados

- [[ssh-root-login-por-senha-exposto-nos-dois-servidores]]: login SSH de root por senha permanece habilitado e acessível publicamente;
- [[sem-firewall-de-host-alem-do-docker-e-fail2ban]]: proteção de host permanece sem modelo deny-by-default; o comportamento de handshakes TCP nas portas não publicadas requer investigação adicional;
- [[kernel-desatualizado-reboot-pendente-ha-varias-versoes]]: reboot pendente em `lumos-dev` continua aplicável;
- [[fail2ban-timezone-quebra-deteccao-rate-limit]]: o rate limit do Nginx funcionou; esta execução não confirmou que a jail `nginx-limit-req` bane no host real.

## Novo achado

- [[lumos-horizon-dev-crash-loop-silencioso-por-host-redis-incorreto]] — ALTO: indisponibilidade persistente e sem alerta em `lumos-dev` por divergência `redis`/`valkey`.

## Recomendações

### IMEDIATO

1. Corrigir o hostname de Valkey no Lumos Horizon e configurar alerta de crash loop.
2. Desabilitar SSH de root por senha e adotar chave pública com usuário administrativo nominal.
3. Implementar alertas para Fail2ban, falhas SSH, 429, 5xx, healthchecks e restart count.

### CURTO PRAZO

1. Restringir SSH por allowlist e aplicar firewall de host deny-by-default compatível com Docker.
2. Investigar os handshakes TCP nas portas não publicadas a partir de uma segunda origem externa autorizada, sem exploração.
3. Confirmar duração real do bloqueio SSH depois da expiração natural ou por origem alternativa.

### MÉDIO PRAZO

1. Avaliar CDN/WAF e restringir acesso direto ao origin quando uma borda for adotada.
2. Centralizar métricas e alertas de host, Docker, Nginx e segurança.
3. Reexecutar o teste de carga a partir de origem externa secundária, após instrumentação de logs por código HTTP e métricas de latência.

## Atualizações

- 2026-09-19: relatório criado a partir de auditoria ativa, progressiva e limitada. Não foram aplicadas correções.
