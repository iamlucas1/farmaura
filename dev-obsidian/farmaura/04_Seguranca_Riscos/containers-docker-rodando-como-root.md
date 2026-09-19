---
cssclasses: ia-nota
---

# Containers `farmaura-api` e `farmaura` (nginx) rodam como root — sem diretiva `USER`

**Tipo:** Vulnerabilidade (hardening de imagem Docker ausente)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** infraestrutura (`farmaura-api/Dockerfile`, `docker/web/Dockerfile`)
**Categoria:** Hardening de container / blast radius
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

Nenhum dos dois Dockerfiles do produto cria/usa um usuário não-root — o processo final (uvicorn no backend, nginx no frontend) roda como root dentro do container.

## Evidência

`farmaura-api/Dockerfile` — nenhuma diretiva `USER`. `docker/web/Dockerfile` — nenhuma diretiva `USER` no estágio runtime (`nginx:1.29.1-alpine`).

## Cenário de risco

Um escape de container (vulnerabilidade no runtime Docker/kernel) ou uma vulnerabilidade de execução de código dentro da aplicação (ex.: um RCE hipotético, ainda que nenhum tenha sido confirmado nesta auditoria) tem impacto maior rodando como root do que como usuário sem privilégio — amplia o "blast radius" de qualquer comprometimento.

## Impacto

Ampliação do dano potencial em caso de container escape ou RCE — não é uma vulnerabilidade explorável isoladamente, é ausência de uma camada de contenção padrão.

## Pré-condições

Depende de outra vulnerabilidade primária (escape de container ou RCE) já ter sido explorada — este achado por si só não é diretamente explorável.

## Escopo afetado

`farmaura-api/Dockerfile`, `docker/web/Dockerfile`.

## Causa raiz

Nenhuma diretiva `USER` foi adicionada aos Dockerfiles desde a criação.

## Correção sugerida para análise futura

Adicionar usuário dedicado (`RUN useradd -r appuser` no backend; a imagem `nginx:alpine` já tem um usuário `nginx` nativo que pode ser usado com ajuste de permissão de porta/arquivos) e `USER appuser`/`USER nginx` antes do `ENTRYPOINT`/`CMD`, ajustando permissões dos diretórios de storage (`storage_root`, `storage_tmp_root`, `storage_quarantine_root`) e do socket/porta correspondente.

## Dependências da correção

Nenhuma migration. Pode exigir ajuste de permissões de volume (`farmaura_storage_private` etc.) para o novo UID/GID não-root.

## Riscos de regressão

Baixo-médio — testar que a aplicação continua conseguindo escrever em `storage/` e que o nginx consegue bindar a porta (portas <1024 exigem capability especial para usuário não-root; a porta 80 interna do nginx pode precisar de ajuste ou `CAP_NET_BIND_SERVICE`).

## Como validar futuramente que a correção funcionou

`docker exec farmaura-api whoami` (ou equivalente) deve retornar o usuário não-root, não `root`; confirmar que upload/leitura de storage e health checks continuam funcionando normalmente após a mudança.

## Referências

- [[../05_Integracoes_Infra/Docker_Compose|Docker_Compose]] — contrato completo dos serviços.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.