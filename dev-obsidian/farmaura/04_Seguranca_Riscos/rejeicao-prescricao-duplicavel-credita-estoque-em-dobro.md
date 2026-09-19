---
cssclasses: ia-nota
---

# Rejeição de receita médica pode ser executada duas vezes, creditando estoque em dobro

**Tipo:** Risco identificado (máquina de estados / dupla execução, sem guarda de idempotência)
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `farmaura-api`
**Categoria:** Concorrência / integridade de dados (não requer concorrência real — funciona sequencialmente)
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

`PrescriptionService.decide` não verifica o estado atual da prescrição/pedido antes de aplicar a decisão. Se `status="rejected"` for enviado duas vezes para a **mesma** `prescription_id` (duplo clique no console interno, retry de rede, duas abas abertas), `_apply_decision_to_order` roda duas vezes: define `order.status = CANCELLED` (essa parte é idempotente) mas chama `restock_marketplace_order` incondicionalmente a cada execução.

`restock_marketplace_order` (`app/services/inventory_stock_sync.py`) varre `InventoryMovement` com `movement_type == "exit"` e `reference_code == order_code`, e credita de volta a quantidade — sem marcar/excluir os movimentos já revertidos (a compensação é gravada como `"adjustment"`, mas a busca seguinte ainda encontra os **mesmos** registros `"exit"` originais). Ou seja, a segunda chamada credita a mesma quantidade de novo.

## Evidência

Nenhum `if prescription.status == "rejected": return` nem `if order.status == CANCELLED.value: return` em `PrescriptionService.decide`/`_apply_decision_to_order` (`app/services/prescription_service.py:228-273`). `restock_marketplace_order` (`app/services/inventory_stock_sync.py:108-160`) filtra só por `movement_type == "exit"`, sem excluir os já estornados.

## Cenário de risco

Farmacêutico dá duplo clique em "rejeitar" no console interno (`POST /prescriptions/{id}/decision`), ou o cliente HTTP retenta a chamada após um timeout de rede pensando que a primeira falhou.

## Impacto

Estoque é creditado duas vezes para o mesmo pedido cancelado — o sistema passa a acreditar que existe mais produto físico do que realmente existe, criando risco de overselling futuro (vender algo que não está na prateleira).

## Pré-condições

Acesso interno com papel ADMIN/PHARMACIST + duas chamadas à mesma decisão de prescrição. Não exige concorrência real — funciona de forma puramente sequencial (segunda chamada depois que a primeira já terminou).

## Escopo afetado

`app/services/prescription_service.py` (`decide`, `_apply_decision_to_order`), `app/services/inventory_stock_sync.py` (`restock_marketplace_order`), rota `POST /prescriptions/{id}/decision` em `app/api/v1/prescriptions.py`.

## Causa raiz

Ausência de guarda de transição de estado (verificação de que a prescrição/pedido ainda não foi decidido) antes de aplicar um efeito colateral irreversível (crédito de estoque).

## Correção sugerida para análise futura

Adicionar checagem no início de `_apply_decision_to_order` (ou logo no início de `decide`): se `order.status` já é `CANCELLED` (ou a prescrição já tem uma decisão registrada), retornar o estado atual sem reaplicar o efeito colateral, em vez de reexecutar `restock_marketplace_order`.

## Dependências da correção

Nenhuma migration — mudança de lógica de aplicação.

## Riscos de regressão

Baixo — a guarda só impede reexecução do mesmo efeito, não deveria afetar o caminho de primeira decisão (aprovar/rejeitar uma prescrição ainda pendente).

## Como validar futuramente que a correção funcionou

Teste automatizado: chamar `POST /prescriptions/{id}/decision` com `status="rejected"` duas vezes seguidas para a mesma prescrição/pedido e confirmar que o saldo de estoque só é creditado uma vez (comparar `InventoryMovement`/saldo antes e depois de cada chamada).

## Referências

- [[pdv-complete-sale-sem-guarda-estado]] — mesma classe de bug (ausência de guarda de estado antes de efeito colateral), em outro fluxo do mesmo sistema.
- [[../02_Documentacao/Modulo_Prescricoes|Modulo_Prescricoes]] e [[../02_Documentacao/Modulo_Carrinho_Pedidos|Modulo_Carrinho_Pedidos]].
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.