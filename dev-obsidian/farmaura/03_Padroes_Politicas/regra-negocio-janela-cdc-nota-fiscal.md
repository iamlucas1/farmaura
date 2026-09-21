---
cssclasses: ia-nota
---

# Regra de negócio: nota fiscal só é emitida 7 dias após o pagamento

**Tipo:** Regra de negócio (formalizada pela IA a partir da decisão em `00_Decisoes`)

## Descrição

Notas fiscais de pedidos do marketplace só podem ser emitidas 7 dias após a confirmação do pagamento, nunca antes.

## Motivo

Compras não presenciais dão ao consumidor direito de arrependimento pelo CDC (Código de Defesa do Consumidor) dentro de um prazo legal; emitir a nota fiscal antes desse prazo complica estorno/cancelamento dentro da janela. Ver decisão completa em [[2026-07-12-diferir-emissao-fiscal-7-dias]].

## Ver também

- [[excecao-fiscal-scheduler-sessao-propria]] — implementação técnica que aplica esta regra de negócio.
- [[Asaas]] — provedor que executa a emissão fiscal em si.

## Exceções conhecidas

Nenhuma conhecida — aplica-se a todo pedido do marketplace pago via Asaas. Se um novo canal de venda ou meio de pagamento for adicionado, esta regra deve ser revisitada explicitamente, não assumida como automática.

## Atualizações

- 2026-09-20: o prazo de 7 dias deixou de ser constante e virou `APP_FISCAL_ISSUANCE_DELAY_DAYS` (padrão 7). `0` é **só para testar em sandbox/dev**; nunca usar em produção. Ver [[../07_POPs_Processos/testar-asaas-sandbox|POP do sandbox]].
- 2026-07-19: nota criada.