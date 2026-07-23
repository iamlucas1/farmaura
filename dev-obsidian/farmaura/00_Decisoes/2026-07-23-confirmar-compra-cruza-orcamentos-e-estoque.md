# Confirmar Compra cruza orçamentos e estoque, por ação explícita e reaproveitando o pipeline de nota fiscal

**Status:** Aceita
**Data:** 2026-07-23

## Contexto

O módulo [[../02_Documentacao/Modulo_Orcamentos|Orçamentos]] (Fase 1) foi construído com uma regra
deliberada e repetidamente reforçada: um orçamento **nunca** cria ou altera `InventoryItem`/
`InventoryProduct` — é só um registro para apoiar a decisão de compra, nunca produto à venda.

O usuário pediu, numa rodada de refinamentos, uma página onde ele possa selecionar quais produtos de
um orçamento **realmente comprou** e ver isso corretamente refletido nas abas "Produtos" e "Estoque".
Isso exige, por definição, cruzar a fronteira que a Fase 1 protegeu.

## Decisão

1. **A regra da Fase 1 continua valendo para o orçamento em si** — nenhuma leitura ou listagem de
   orçamento toca o estoque. Só existe uma exceção: uma ação explícita e nomeada, "Confirmar Compra"
   (tela `purchase-receiving-screen.jsx`, rota `purchase-receiving`), onde o usuário decide item a
   item o que comprou antes de qualquer gravação.
2. **Nenhuma lógica de gravação de estoque nova foi criada.** O backend já tinha exatamente o
   mecanismo certo: `InventoryInvoiceService.confirm_invoice_import` / `POST /inventory/invoice-
   confirm`, usado hoje pela importação de nota fiscal por IA. Esse endpoint não foi alterado. Só foi
   adicionado `InventoryInvoiceService.preview_from_purchase_quote`, que gera o mesmo payload de
   revisão (`InventoryInvoicePreviewResponse`) a partir dos itens de um orçamento em vez de uma
   extração por IA — exposto em `GET /purchase-quotes/{quote_id}/purchase-preview`
   (`app/api/v1/purchase_quotes.py`).
3. O frontend reaproveita literalmente as funções já exportadas por `inventory-screen.jsx`
   (`buildInvoiceDraftLine`, `buildInvoiceReference`) e o normalizador `normalizeInventoryInvoicePreview`
   já usado pelo fluxo de nota fiscal — a tela nova só monta o payload de revisão a partir do
   orçamento, a revisão/edição linha a linha e a confirmação usam o mesmo código.

## Alternativas consideradas

- **Construir um pipeline de recebimento de estoque paralelo, específico para orçamentos.** Rejeitada
  — duplicaria toda a lógica de match de produto por EAN (`ProductService.find_or_create_by_ean`),
  cálculo de custo de aquisição, lançamento de movimento de estoque e auditoria, já testada e em uso
  pela importação de nota fiscal, sem ganho real (o formato de dado de entrada — linhas com
  descrição/marca/quantidade/preço — é o mesmo).
- **Deixar o orçamento confirmado virar estoque automaticamente, sem revisão.** Rejeitada — contraria
  o requisito original do usuário de que a decisão de compra é um passo humano deliberado; também
  quebraria para itens em comodato (nunca deveriam virar estoque vendável automaticamente).

## Consequências

- Zero mudança de schema (`is_comodato` já existia em `PurchaseQuoteItem` desde a Fase 1; o único
  campo novo é `is_comodato` em `InventoryInvoicePreviewLineResponse`, aditivo e opcional, default
  `False` — não quebra o fluxo de nota fiscal existente).
- Limitação herdada do pipeline reaproveitado: a quantidade informada na tela de compra entra no
  estoque na unidade de venda, sem conversão pela unidade cotada no orçamento (ex.: orçamento em
  caixa de 50 não é convertido automaticamente). Mesma limitação que já existia na importação de nota
  fiscal — não é uma regressão introduzida por esta feature.
- Qualquer bug corrigido ou melhoria futura em `confirm_invoice_import` beneficia os dois fluxos
  (nota fiscal e orçamento) automaticamente, por não terem sido duplicados.

## Ver também

- [[../02_Documentacao/Modulo_Orcamentos|Módulo Orçamentos]] — documentação completa do módulo.
- `app/services/inventory_invoice_service.py` — dono único da lógica de preview/confirm de entrada de
  estoque, agora usado por dois pontos de entrada (nota fiscal e orçamento).
