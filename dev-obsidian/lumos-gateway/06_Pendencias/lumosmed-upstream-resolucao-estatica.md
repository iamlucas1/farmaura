---
cssclasses: ia-nota
---

# `lumosmed_upstream` ainda usa bloco `upstream{}` clássico, resolvido estaticamente

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-08-19

## Descrição

Todos os outros vhosts do gateway resolvem seu upstream via variável (`set $farmaura_origin http://${FARMAURA_UPSTREAM}:80;`) usando `resolver 127.0.0.11` (DNS interno do Docker), forçando reresolução do IP do container a cada requisição — padrão adotado desde que o arquivo `00-upstreams.conf.template` foi esvaziado (`cc5b52c`, "Removendo arquivo de upstream", 2026-03-17). `30-lumosmed.conf.template` é a única exceção: ainda declara um bloco `upstream{}` Nginx clássico, cujo IP é resolvido **uma vez**, na inicialização/reload do Nginx, não por requisição.

## Contexto

Encontrado durante a auditoria completa de segurança de 2026-08-19, ao mapear a arquitetura de roteamento para `02_Documentacao/Visao_Geral.md`. Não é uma falha de segurança — é uma inconsistência de padrão que pode causar um problema operacional específico: se o container do LumosMed for recriado (deploy, restart com IP novo) sem que o `gateway_nginx` também seja recriado/recarregado, o vhost do LumosMed continuaria apontando para o IP antigo (agora inválido) até o próximo reload do Nginx — os demais vhosts não têm esse problema, porque resolvem o DNS a cada requisição.

Se confirmado como problema real (não só teórico), o fix é mecânico: substituir o bloco `upstream{}` de `30-lumosmed.conf.template` pelo mesmo padrão `set $lumosmed_origin ...` + `resolver 127.0.0.11` já usado nos outros 8 vhosts.