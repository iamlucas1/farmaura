---
cssclasses: ia-nota
---

# `lumos-api` e `lumosmed` nunca passaram por auditoria de segurança Docker dedicada

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-18

## Descrição

`farmaura`/`farmaura-api` (2026-08-17) e `lumos-gateway` (2026-08-19) já tiveram rodadas de auditoria de segurança dedicadas que cobriram Docker explicitamente — CVEs de imagem base, usuário root em container, pin de versão, etc. (ver [[../../farmaura/04_Seguranca_Riscos/hardening-baixo-docker-e-gateway-diversos|hardening-baixo-docker-e-gateway-diversos]], [[../../farmaura/04_Seguranca_Riscos/cve-imagens-base-docker-farmaura|cve-imagens-base-docker-farmaura]], [[../../farmaura/04_Seguranca_Riscos/containers-docker-rodando-como-root|containers-docker-rodando-como-root]], [[../../lumos-gateway/04_Seguranca_Riscos/supply-chain-e-hardening-diversos|lumos-gateway/supply-chain-e-hardening-diversos]]). `lumos-api` e `lumosmed` nunca passaram por essa mesma rodada — o levantamento de 2026-09-18 que documentou o empacotamento Docker deles ([[../05_Integracoes_Infra/Docker_Compose_Lumos_Api|Docker_Compose_Lumos_Api]], [[../../lumosmed/05_Integracoes_Infra/Docker_Compose|lumosmed/Docker_Compose]]) foi só descritivo (o que existe), não uma auditoria (o que está errado/vulnerável).

Observações levantadas de passagem durante esse levantamento descritivo, sem aprofundar (candidatas a primeiro ponto de uma auditoria futura):

- `lumos-api/docker-compose.yml` usa `postgres:16` — tag de versão major, não pina o patch (diferente de `farmaura-api`, que usa `postgres:17.10-bookworm`, patch completo).
- Nenhum dos dois Dockerfiles (`lumos-api`, e o `Dockerfile.base` compartilhado que `lumosmed` usa, fora deste repositório) foi verificado quanto a CVE de imagem base/pacotes de sistema, ao contrário do que já foi feito para `farmaura-api`/`docker/web`.
- `lumos-api` já usa usuário não-root + `gosu` (bom sinal, ao contrário do Farmaura) — não avaliado se há outro gap equivalente (ex.: `cap_drop`, `no-new-privileges`, que `lumos-gateway` tem e nenhum dos serviços de aplicação aqui declara).

## Contexto

Ficou pendente porque o pedido que originou este levantamento (2026-09-18) era documentar o estado real do Docker no ecossistema, não auditar — auditoria de segurança é um esforço à parte, do mesmo tipo já feito para farmaura/lumos-gateway, e vale ser conduzido deliberadamente (não em cima de uma tarefa de documentação).
