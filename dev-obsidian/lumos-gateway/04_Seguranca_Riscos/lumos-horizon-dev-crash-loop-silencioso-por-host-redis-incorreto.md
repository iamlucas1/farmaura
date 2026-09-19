---
cssclasses: ia-nota
---

# Lumos Horizon em `lumos-dev` em crash loop silencioso por hostname Redis incorreto

**Tipo:** Vulnerabilidade/robustez/disponibilidade
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `lumos-dev` — `lumos_horizon_web`, `lumos_horizon_worker` e `lumos_horizon_beat`
**Categoria:** Resiliência, observabilidade e configuração de dependência
**Data de identificação:** 2026-09-19

## Descrição

Os componentes web, worker e scheduler da stack Lumos Horizon reiniciam continuamente porque o entrypoint aguarda Redis em `redis:6379`, enquanto o serviço saudável na rede Docker se chama exclusivamente `valkey`.

## Evidência

- `lumos_horizon_web`: `restart_count=157208`, sem OOM;
- `lumos_horizon_worker`: `restart_count=157459`, sem OOM;
- `lumos_horizon_beat`: `restart_count=157454`, sem OOM;
- `lumos_horizon_valkey`: saudável, sem reinicializações desde 2026-05-28;
- logs repetidos: timeout ao aguardar Redis em `redis:6379`, depois de PostgreSQL disponível;
- na rede `lumoshorizon_internal`, `valkey` resolve para `172.24.0.2`; `redis` não resolve;
- `entrypoint.sh` aplica `REDIS_HOST="${REDIS_HOST:-redis}"` quando não recebe host configurado;
- não foi evidenciado alerta operacional para o crash loop.

## Cenário de risco

Containers aparentam estar em execução ou em healthcheck inicial enquanto não concluem a inicialização. O ciclo contínuo pode ocultar indisponibilidade funcional, atrasar tarefas e consumir recursos/logs sem alertar responsáveis.

## Impacto

- indisponibilidade do Lumos Horizon em desenvolvimento;
- workers e scheduler sem processamento confiável;
- churn de processos e logs;
- ambiente de desenvolvimento não representa um estado operacional válido;
- ausência de aviso automático sobre incidente persistente.

## Pré-condições

- URL de Redis sem host válido ou que acione o fallback `redis`;
- serviço Docker publicado somente como `valkey`;
- política de reinício ativa.

## Escopo afetado

`lumos-dev`, rede `lumoshorizon_internal` e os containers `lumos_horizon_web`, `lumos_horizon_worker` e `lumos_horizon_beat`.

## Causa raiz

Divergência entre o hostname de cache esperado pelo entrypoint (`redis`) e o nome DNS fornecido pelo Compose (`valkey`), sem validação pré-deploy e sem alerta para reinicialização contínua.

## Correção sugerida

1. Configurar explicitamente a URL/host de Valkey como `valkey` nos três serviços.
2. Validar resolução DNS e conexão autenticada antes do deploy.
3. Monitorar `restart_count`, healthcheck e disponibilidade de worker/scheduler, com alerta em minutos.
4. Documentar o contrato de nome Redis/Valkey no runbook da stack.

## Dependências da correção

- responsável pelo deploy do Lumos Horizon;
- validação da URL e da autenticação de Valkey sem expor segredos;
- canal e destinatários de alerta definidos.

## Riscos de regressão

Configuração de URL incorreta pode manter a indisponibilidade; recriação de containers fora de janela controlada pode interromper processamento em andamento.

## Como validar

1. Aplicar a configuração em janela controlada.
2. Confirmar resolução de `valkey` em cada container dependente.
3. Confirmar healthcheck saudável e `restart_count` estável.
4. Confirmar tarefa não destrutiva processada por worker.
5. Simular indisponibilidade em ambiente isolado e confirmar alerta entregue.

## Referências

- [[auditoria-ativa-controlada-2026-09-19]]
- [[auditoria-servidores-2026-09-18-resumo-consolidado]]

## Atualizações

- 2026-09-19: identificado no baseline da auditoria ativa controlada. Nenhuma configuração ou container foi alterado como parte da auditoria.
