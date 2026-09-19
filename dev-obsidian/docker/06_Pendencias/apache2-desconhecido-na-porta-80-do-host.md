---
cssclasses: ia-nota
---

# Apache2 rodando no host (fora do Docker), escutando em `*:80` todas as interfaces

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-18

## Descrição

Durante um teste de intrusão contra `lumos-gateway` (2026-09-18), a tentativa de subir o container `gateway_nginx` localmente nas portas 80/443 padrão falhou com `address already in use`. Investigação encontrou um serviço `apache2.service` (systemd, nível de sistema, fora de qualquer container Docker) ativo no host, escutando em `*:80` — todas as interfaces, não só loopback. Não identificado o que esse Apache serve, desde quando está rodando, nem se é intencional (algum projeto antigo, teste esquecido, ou parte de alguma ferramenta instalada). O teste contornou o problema remapeando o gateway para portas alternativas (`18080`/`18443`) em vez de investigar/parar o Apache.

## Contexto

Ficou pendente porque investigar/decidir o que fazer com o Apache é ortogonal ao teste de segurança Docker/nginx que estava em andamento — e pará-lo exigiria `sudo` (não disponível sem senha para a IA) e uma decisão do usuário sobre se esse serviço ainda é necessário. Relevante registrar porque: (1) bloqueia qualquer teste local futuro do `lumos-gateway` nas portas padrão, e (2) um serviço web não rastreado, escutando em todas as interfaces (não só localhost) num ambiente de desenvolvimento, é por si só uma superfície não inventariada — vale ao menos confirmar o que é.
