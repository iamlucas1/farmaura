---
cssclasses: ia-nota
---

# PDV × NFC-e: troco, taxa de entrega, cashback resgatado e grupo de cartão

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

- **Troco/valor recebido**: o PDV não coleta o valor recebido em dinheiro; a nota sai com `vPag = total` e sem `vTroco`. O builder já suporta troco (testado); falta o campo na tela do caixa e na venda.
- **Taxa de entrega**: venda com entrega **não emite** NFC-e (fica `ERROR` com explicação) até o contador definir o tratamento (ISS/ICMS de transporte). Hoje bloqueia todas as vendas "Entregar em casa".
- **Cashback resgatado** é rateado como desconto (`vDesc`); alternativa `tPag=05/19`. Validar com o contador.
- **Cartão**: sai com `tpIntegra=2` (não integrado) sem CNPJ da credenciadora, bandeira ou `cAut`; a maquininha Itaú é integrada, então o correto pode ser `tpIntegra=1` + CNPJ + `cAut` (o NSU já está em `payment_terminal_reference`). Pode gerar cStat 391/392/737 na homologação.
- **Tributos aproximados (Lei 12.741)**: não são informados; o front deixou de exibir o "12%" fixo.
- **Pagamento dividido**: a venda só guarda um `payment_method`.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../02_Documentacao/Modulo_PDV|Modulo_PDV]].
