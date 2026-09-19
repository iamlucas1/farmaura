---
cssclasses: ia-nota
---

# Webhook do Asaas não trata os ciclos futuros de uma assinatura recorrente

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-15

## Descrição

Desde a mudança que faz `PdvService.confirm_recurrence` criar uma assinatura de verdade no Asaas (ver [[../00_Decisoes/2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas|ADR]]), o Asaas passa a gerar e cobrar sozinho uma nova cobrança todo mês contra o cartão do cliente. O primeiro ciclo (cobrado no momento da confirmação) segue o caminho de webhook já existente — mas os ciclos seguintes (2º mês em diante) chegam como um evento de pagamento comum, **sem estarem ligados a nenhum `PdvOrder`/venda**, e o processamento de webhook atual não credita cashback nem registra uma venda para esses ciclos.

Resultado prático: o cliente é cobrado corretamente todo mês (isso já funciona, é o Asaas fazendo), mas a partir do 2º mês o Farmaura não sabe reagir a isso — sem cashback creditado, sem uma venda aparecendo nos relatórios/histórico do cliente.

## Contexto

Ficou pendente porque tratar isso direito exige decidir: o que "vira" cada cobrança recorrente automaticamente (uma nova `PdvSale`? Só um crédito de cashback?), e ajustar `PaymentService.process_webhook_event` para reconhecer um evento cujo `payment.subscription` está preenchido e agir diferente de um pagamento avulso — escopo relevante o bastante para não improvisar dentro da mudança que já estava grande. Não bloqueia o uso atual (a cobrança em si funciona), mas a experiência de cashback/histórico fica incompleta a partir do 2º ciclo.