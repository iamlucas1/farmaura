# Gate de receita no checkout não verifica item específico do carrinho

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-02

## Descrição

O gate que bloqueia o pagamento do checkout até a receita ser validada
(`GET /customers/me/prescription-status`, `PrescriptionRepository.get_latest_for_customer`) olha
para a **última** prescrição que o cliente enviou sem `order_id` ainda — não verifica se ela
corresponde aos itens de receita realmente presentes no carrinho atual. Um cliente que teve uma
receita aprovada e, semanas depois, monta um carrinho totalmente diferente (outro medicamento
controlado) veria o pagamento liberado sem enviar nada de novo, porque a última prescrição
aprovada ainda é a "mais recente sem pedido".

Corrigir exigiria vincular `PrescriptionItem` aos produtos/SKUs do carrinho no momento do envio
(hoje o upload via chat marketplace não cria `PrescriptionItem` nenhum — só a PDV cria) e comparar
contra `items` do carrinho no momento da checagem, ou expirar a validade da aprovação depois de um
tempo curto.

## Contexto

Decisão consciente de escopo ao implementar o bloqueio de pagamento por receita — ver
[[../00_Decisoes/2026-09-02-pagamento-bloqueado-ate-validacao-de-receita|ADR]]. O pedido original
tratava a receita como algo do pedido inteiro (mesmo grão do `order.prescription_status` já
existente), então o gate seguiu esse grão. Registrar aqui para revisar se o volume de receitas
recorrentes/controladas no marketplace justificar o refinamento por item.
