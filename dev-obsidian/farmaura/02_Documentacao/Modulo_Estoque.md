# Módulo Estoque

## O que é

O maior e mais complexo domínio do backend: quantidade/preço/local por loja, rastreabilidade fina por lote, auditoria field-level, importação de nota fiscal de fornecedor por IA, custos de aquisição e custos de implantação de loja. Distinto do [[Modulo_Catalogo|Catálogo]] (identidade do produto, tenant-wide) — aqui vive tudo que é operacional e por loja. Movimentações de estoque em si (regras de `store_id` nas rotas, validação de pertencimento) já estão detalhadas em [[../05_Integracoes_Infra/Estoque_Movimentacoes|Estoque_Movimentacoes]]; esta nota cobre o restante: models completos, endpoints, IA de nota fiscal, rastreabilidade/auditoria, custos, regras de negócio e frontend.

## Tabelas / Models

- **`InventoryItem`** (`inventory_item.py`) — registro por loja: `storage_location`, `batch_code`, `expiry_label` (string livre, não Date), `quantity` (agregado rápido, mantido igual à soma dos lotes `available`), thresholds (`low ≤ attention ≤ normal`, CHECK), `sale_price`/`acquisition_cost`/`market_reference_price`, `is_subject_to_icms_st` (override nullable por item do padrão do CNAE).
- **`InventoryStockLot`** — saldo fino por lote/local: `status` (available/reserved/quarantine/expired/written_off), `expiry_date` (Date real), unique `(tenant, item, location, batch_code, status)` — receber o mesmo lote/local/status incrementa em vez de duplicar.
- **`InventoryLotMovement`** — trilha fina por lote (receipt/transfer_out/transfer_in/adjustment/sale_exit), com `batch_code`/`expiry_date` denormalizados (sobrevivem mesmo se o lote depois for zerado) e `source_type`/`source_id` linkando a venda PDV ou pedido marketplace que consumiu o estoque.
- **`InventoryMovement`** — trilha agregada por item, legado/dashboard (initial/entry/exit/adjustment/transfer).
- **`InventoryLocation`** — `code` único por loja, `location_type` (estoque/prateleira/gondola/caixa/outro), `is_controlled_only`.
- **`InventoryAuditEntry`** — trilha field-level (create/update/status_change) com ator denormalizado no momento da escrita (nome/e-mail/role/IP/user-agent); não duplica movimentação de quantidade (essa já tem `InventoryMovement`).
- **`InventoryInvoiceRecord`** — nota fiscal do fornecedor anexada a um item: `unit_cost` sempre derivado server-side (`product_total_amount / quantity`), arquivo fora do banco via storage privado, `tax_cost_amount`/`is_subject_to_icms_st` opcionais.
- **RLS**: todas as tabelas acima têm política dedicada (tenant + `can_access_store_row`), exceto `inventory_audit_entries` (restrita a `admin/manager`, **pharmacist não vê auditoria** apesar de ver o resto) e **`inventory_invoice_records`, que não tem nenhuma política RLS** — isolamento só via filtro Python no repositório (gap de defesa em profundidade).

## Endpoints principais

- Itens/dashboard: `GET /inventory/dashboard`, `GET/POST /inventory/items`, `PUT /inventory/items/{id}`, `POST /inventory/items/{id}/adjustments|transfers|invoices` (invoices é **ADMIN only**), `GET /inventory/items/{id}/invoices`, `GET /inventory/invoices/{id}/file`.
- Locais: CRUD completo com audit trail field-level.
- `GET /inventory/movements`, `GET /inventory/audit` (**ADMIN/MANAGER only**), `GET /inventory/export` (CSV).
- IA de nota fiscal: `POST /inventory/invoice-preview`, `POST /inventory/invoice-confirm`.
- Lotes (`inventory_lots.py`): `GET /inventory/lots` (filtros ricos: status, validade, fornecedor, local), `POST /inventory/lots/receipts|{id}/transfers|{id}/adjustments`.
- Rastreabilidade (**ADMIN only**): `GET /inventory/trace/search`, `GET /inventory/trace/{item_id}`.

## Importação de nota fiscal por IA — fluxo preview→confirm

`InventoryInvoiceService` favorece Gemini para PDF e OpenAI para imagem (refletido também no frontend). **Preview**: valida upload → `AiService.execute_document_prompt` com prompt de extração JSON estrito → detecta resposta cortada por limite de tokens (502) → parse tolerante → para cada item, calcula `acquisition_cost` e busca candidatos de match por EAN+texto (top 6) com sugestões pré-preenchidas. **Confirm**: por linha, `skip` ignora; `existing` soma quantidade + atualiza campos + grava audit `update` + `InventoryMovement entry`; `new` cria `InventoryProduct` (via `find_or_create_by_ean`) + `InventoryItem`, grava audit `create` + `InventoryMovement initial`.

O mesmo shape de preview é **reaproveitado por "Confirmar Compra"** do módulo [[../02_Documentacao/Modulo_Orcamentos|Orçamentos]] (`preview_from_purchase_quote`, sem chamar IA) — quando o item cotado tem `units_per_package`, converte quantidade/custo de caixa para unidade de venda antes de cair no mesmo `confirm_invoice_import`.

## Rastreabilidade e auditoria

- **Rastreabilidade** (`product-trace-screen.jsx`, ADMIN only): busca por SKU/EAN/nome/lote → painel "onde está agora" (local/lote/validade/status/fornecedor, destaque se validade ≤120 dias) + timeline de até 300 movimentações de lote, com rótulo de origem (`pdv_sale`→"venda no balcão", `marketplace_order`→"pedido online").
- **Auditoria** (`inventory-audit-screen.jsx`, ADMIN/MANAGER): **funde duas fontes heterogêneas** — `InventoryAuditEntry` (field-level) e `InventoryMovement` reformatado como entrada sintética (`stock_movement`/`pdv_sale`) — com paginação feita em memória após o merge (não é paginação pura de banco).

## Custos de aquisição e de construção

- **Acquisition Costs** (`acquisition-costs-screen.jsx`): CRUD de custo de compra por produto/loja, reaproveita o mesmo `InvoiceImportModal` do estoque para leitura em lote via IA; salva via o mesmo endpoint `POST /inventory/items/{id}/invoices`.
- **Construction Costs** (`construction-costs-screen.jsx`): tecnicamente fora do domínio Estoque (vive em `PortalService`, settings key `construction_costs`) — CRUD de itens de investimento por loja com ROI/payback calculados sobre vendas reais desde `opened_at` (orders + PDV sales), nunca sobre um valor cadastrado manualmente.

## Regras de negócio não óbvias

- **FEFO obrigatório na saída** (`decrement_lot_fefo`), nunca FIFO — sempre por `expiry_date` ascendente. Chamado por PDV e marketplace; se o saldo por lote for insuficiente, decrementa o que conseguir e **para silenciosamente** (o agregado do item é a fonte de verdade) — **exceto** quando o operador do PDV escolheu explicitamente um local, caso em que faltar estoque ali é erro real (409).
- **Estoque negativo bloqueado em 3 camadas independentes**: agregado do item, saldo do lote, e saldo do item verificado de novo dentro do ajuste de lote (lock pessimista).
- **Cancelamento de pedido restaura estoque via replay dos ledgers** (`restock_marketplace_order`) — não soma de volta ingenuamente, varre `InventoryMovement`/`InventoryLotMovement` por `reference_code`/`source_id` e escreve ajustes compensatórios equivalentes.
- **Thresholds auto-derivados quando zerados**: se low/attention/normal vierem todos 0, o backend deriva valores a partir do mínimo — nunca fica com faixas zeradas silenciosamente.
- **ICMS-ST em três níveis**: padrão do CNAE → override nullable por item → registro histórico do que valeu naquela compra específica (nota fiscal).
- **Custo de aquisição nunca é digitado livremente** — sempre derivado de `total/quantidade`, em qualquer um dos três pontos de entrada (edição manual, importação de NF, "Confirmar Compra").
- **`apply_tenant_context` precisa ser reaplicado após `commit()`** — padrão recorrente em todo o domínio (RLS transaction-local é limpa pelo commit).

## Frontend

- **`inventory-screen.jsx`** (tela principal, 4 sub-views: itens/lotes/movimentações/locais) com modais reutilizados por outras telas: `InventoryItemModal`, `InvoiceImportModal` (fluxo IA de 3 estágios), `StockMovementModal`, `TransferInventoryModal`, `LocationModal`, `LotReceiptModal`/`LotTransferModal`/`LotAdjustmentModal`.
- **`inventory-audit-screen.jsx`**, **`product-trace-screen.jsx`**, **`acquisition-costs-screen.jsx`**, **`construction-costs-screen.jsx`** — ver seções acima.

## Decisões de arquitetura dignas de nota

- **Dualidade agregado/segregado deliberada**: `InventoryItem.quantity` (rápido, legado) coexiste com `InventoryStockLot` (fino); toda mutação relevante escreve ambos os ledgers, decisão explicitamente aditiva, não uma migração completa para o modelo fino.
- **Acoplamento intencional** entre `InventoryInvoiceService` e `InventoryService` (o primeiro chama métodos "privados" do segundo diretamente) — trade-off consciente para não duplicar lógica de audit/threshold/serialização.
- **Gap de RLS em `inventory_invoice_records`** — única tabela do domínio sem policy dedicada.

## Ver também

- [[../05_Integracoes_Infra/Estoque_Movimentacoes|Estoque_Movimentacoes]] — detalhe de store-scoping das rotas de movimentação.
- [[Modulo_Orcamentos|Módulo Orçamentos]] — reaproveita 100% do pipeline de importação de nota fiscal via "Confirmar Compra".
- [[Modulo_Catalogo|Módulo Catálogo]] — identidade do produto (`InventoryProduct`), tenant-wide.
- [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — checkout aloca/decrementa estoque com lock pessimista + FEFO.
- [[Modulo_PDV|Módulo PDV]] — baixa de estoque acontece no envio à fila, não na finalização.

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
