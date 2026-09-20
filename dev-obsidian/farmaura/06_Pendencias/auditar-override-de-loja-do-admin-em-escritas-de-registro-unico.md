---
cssclasses: ia-nota
---

# Auditar outros serviços atrás do mesmo bug: override de loja do admin não chega a escritas de registro único

**Status:** Aberto — não investigado ainda fora de `order_service.py`
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

Ver [[../00_Decisoes/2026-09-20-despachar-pedido-loja-nao-primaria-order-not-found|ADR do bug original]]: em `order_service.py`, seis métodos de escrita sobre um pedido específico chamavam `self._get_store_id(subject)` sem repassar o override de loja do admin (`requested_store_id`) — um `ADMIN` com uma loja não-primária selecionada na UI sempre caía no fallback de "loja primária do tenant" para a *ação* (mesmo a *listagem* já resolvendo certo), gerando 404 "Order not found." em qualquer pedido de outra loja. Corrigido nos seis pontos encontrados.

Não foi feita uma varredura equivalente em nenhum outro serviço do backend. Serviços com um padrão parecido de "loja ativa resolvida a partir do subject, com um helper tipo `_get_store_id`/`_resolve_store_id`" e que expõem escrita sobre um registro único (não só listagem) são candidatos: `app/services/inventory_service.py`, `app/services/pdv_service.py`, `app/services/crm_service.py`, `app/services/team_service.py`, entre outros — não confirmado se algum deles reproduz o mesmo padrão quebrado.

## Como investigar

Em cada serviço candidato: localizar o helper de resolução de loja ativa e listar todo método de **escrita** que o chama sem repassar um override explícito do chamador (grep por `_get_store_id(subject)$` ou equivalente, sem argumentos, como feito em `order_service.py`). Para cada achado, confirmar se o endpoint HTTP correspondente sequer aceita um `store_id` de query — se não aceita, o bug provavelmente existe ali também.

## Por que prioridade média, não alta

O bug falha sempre fechado (404, nunca vazamento cross-loja) e só afeta sessões `ADMIN` numa loja não-primária — gerente/farmacêutico/caixa têm loja fixa e não são afetados. Incômodo real (bloqueia uma ação legítima), não um risco de segurança.

## Ver também

- [[../00_Decisoes/2026-09-20-despachar-pedido-loja-nao-primaria-order-not-found|ADR do bug original em order_service.py]].
- [[../00_Decisoes/2026-09-19-entregas-dijkstra-bidirecional-multi-entregador-multi-loja|ADR que introduziu o trabalho multi-loja]] — motivo pelo qual esse padrão de bug só ficou visível agora.
