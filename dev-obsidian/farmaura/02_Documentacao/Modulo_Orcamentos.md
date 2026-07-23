# Módulo Orçamentos (cotações de compra)

## O que é

Seção "Orçamentos" no console interno (`/miaura`, grupo de sidebar próprio, acesso `admin`/`manager`) para decisão de compra: captura de cotações de fornecedores (manual ou por IA, a partir de PDF/imagem/XLSX/DOCX), comparativo de fornecedores por produto, e um painel analítico ABC/XYZ que cruza vendas reais com as cotações para sugerir o que comprar. Entregue em duas fases; ver [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|adoção de Alembic]] para o ajuste de processo de schema que fechou a Fase 1 para produção.

Requisito explícito do usuário, respeitado nas duas fases: um orçamento sozinho nunca cria ou altera `InventoryItem`/`InventoryProduct` (catálogo à venda) — é só registro para decisão de compra. A única exceção é a ação explícita "Confirmar Compra" (ver seção de refinamentos abaixo), que sempre exige decisão humana item a item antes de tocar o estoque — ver [[../00_Decisoes/2026-07-23-confirmar-compra-cruza-orcamentos-e-estoque|decisão]].

## Fase 1 — Captura de orçamentos

**Tabelas** (`app/models/purchase_quote*.py`, tenant-scoped como `suppliers`, sem `store_id`):
- `purchase_quotes` — cabeçalho: fornecedor (vínculo opcional com `suppliers` + snapshot de nome/CNPJ sempre preenchido), `quote_date` (dia da cotação, obrigatório e editável — preço varia por dia, não é o timestamp de upload), `valid_until`, `status` (draft/confirmed/archived), frete (`freight_type` FOB/CIF, `freight_cost`), `delivery_time_days`, metadados do arquivo original (`storage_key` etc., via `app/core/file_storage.py`, mesmo padrão de `InventoryInvoiceRecord`).
- `purchase_quote_payment_terms` — N por orçamento: `method` (pix/boleto_avista/boleto_prazo/cartao_credito/cartao_debito/consignado/dinheiro/transferencia/outro), desconto/acréscimo, parcelas, prazo em dias.
- `purchase_quote_items` — N por orçamento: descrição/marca/SKU/EAN cotados, `product_id` **opcional** (só referência cruzada para comparação, nunca obrigatório), preço unitário, `is_comodato`/`comodato_notes` (ex.: geladeira Red Bull cedida pelo fornecedor).

RLS: mesmo template de `suppliers` em `row_level_security.py`, restrito a `admin`/`manager` (mais sensível que cadastro de fornecedor — preços concorrentes entre fornecedores).

**Importação por IA** (`app/services/purchase_quote_ai_service.py`, reaproveitando `AiService` de `inventory_invoice_service.py`):
- PDF/PNG/JPEG → multimodal (Gemini aceita os três; OpenAI só imagem).
- XLSX/DOCX → sem suporte multimodal nos providers; parseados localmente (`openpyxl`/`python-docx`, novas dependências) e o texto/tabela extraído vai para a IA via prompt de texto, que normaliza para o schema-alvo.
- Fluxo preview → revisão em modal → confirm, igual ao de nota fiscal — mas o confirm aqui só grava em `purchase_quotes`/itens/formas de pagamento, nunca em estoque.

**Endpoints** (`app/api/v1/purchase_quotes.py`, prefixo `/purchase-quotes`): CRUD + status + `import-preview`/`import-confirm` + `GET /compare` (produto → orçamentos confirmados lado a lado, ordenados por melhor preço efetivo pós-desconto de pagamento — cálculo em `app/core/pricing.py::best_payment_offer`, reaproveitado pela Fase 2).

**Frontend**: `quotes-screen.jsx` (lista + KPIs + filtros + modal de importação com IA + cadastro manual) e `quotes-compare-screen.jsx` (comparativo).

## Fase 2 — Painel de Compras (classificação ABC/XYZ)

Cruza vendas reais (pedidos online + PDV) com os orçamentos da Fase 1 para sugerir compra. Sem tabelas novas — é leitura/agregação pura (`app/repositories/purchase_analytics_repository.py`, `app/services/purchase_analytics_service.py`).

**Fontes de demanda**: `order_items` (via `orders.status != 'cancelled' AND payment_status = 'paid'`) + `pdv_sale_items` (toda `PdvSale` já é venda concluída/paga, sem filtro extra) — ambas linkadas a produto via `inventory_item_id → InventoryItem.product_id → InventoryProduct`, agregação tenant-wide (não por loja), mesmo nível de `purchase_quotes`.

**Metodologia**:
- **ABC** (Pareto por receita acumulada no período): A ≤80%, B ≤95%, C >95%. Funciona desde o primeiro dia de venda.
- **XYZ** (coeficiente de variação da quantidade mensal, com meses sem venda contados como zero): X <0,5 (estável), Y <1,0 (variável), Z ≥1,0 (errático). Exige ≥2 meses distintos com venda — antes disso, `xyz_class = ""` ("aguardando histórico") em vez de uma letra.
- **Sem venda alguma no período**: resposta com `total_products_with_sales: 0`; a tela mostra estado vazio explicativo em vez de tabela vazia (com atalho para Cotações/Comparar fornecedores, que funcionam sem histórico).
- **Sugestão de compra**: `consumo médio mensal × 1 mês de cobertura alvo − estoque atual`, nunca negativa. Cruza com a melhor oferta confirmada por produto (`PurchaseQuoteRepository.list_confirmed_items_by_product_ids`).

**Endpoint**: `GET /purchase-analytics` (`app/api/v1/purchase_analytics.py`), filtros `months` (3/6/12), `category_id`, `abc_class`, `xyz_class`.

**Frontend**: `purchase-analytics-screen.jsx` — KPIs (`StatCard`, reaproveitado de `dashboard-screen.jsx`), matriz ABC×XYZ (heatmap simples em CSS, um único tom sequencial sobre `--fa-primary`, sempre com o número escrito na célula), tabela de produtos com sugestão de compra.

## Refinamentos pós-Fase 1 (item a item, comparação por produto/marca, Confirmar Compra)

- **Item a item**: unidade do item cotado virou seleção (`un, cx, fardo, pct, kg, g, L, mL, fr, dz,
  cartela, ampola` + "Outro" com fallback de texto livre, necessário porque orçamentos já existiam
  em produção com valor de unidade fora dessa lista fixa) em `ItemsEditor` e no card de revisão do
  import por IA (`quotes-screen.jsx`); "valor total" (quantidade × preço unitário) exibido como
  campo somente leitura nos mesmos dois lugares — puramente derivado, sem mudança de schema.
- **Visualização**: `QuoteViewModal` (somente leitura) mostra cabeçalho, formas de pagamento e todos
  os itens de um orçamento, acessível por um botão "Visualizar" na listagem.
- **Comparar Fornecedores por produto ou marca**: `GET /purchase-quotes/compare` passou a aceitar
  `product_id` (igualdade exata) ou `brand_name` (igualdade case-insensitive) além do `product_query`
  de texto livre original (mantido só por robustez de API). O frontend trocou a busca por texto por
  um combobox local que filtra `ctx.products`/`ctx.brands` (já carregados no app) — sem endpoint de
  busca novo. **Substituído logo em seguida** (ver próximo item) por uma visão única com tudo
  carregado de uma vez — o combobox exigia escolher um produto antes de ver qualquer coisa, o que
  deixava a tela vazia e pouco intuitiva ao abrir.
- **Comparar Fornecedores — tabela, filtros, KPIs e orçamento sugerido** (reescrita da tela, mesmo
  endpoint estendido mais uma vez): `GET /purchase-quotes/compare` passa a aceitar chamada **sem
  nenhum filtro**, retornando todos os itens de orçamentos confirmados do tenant — deixou de
  rejeitar com 422 quando `product_id`/`brand_name`/`product_query` vêm vazios
  (`compare_items_by_product` no repositório e `compare_by_product` no serviço). A resposta ganhou 3
  campos aditivos por item (`product_id`, `brand_name`, `payment_methods` — todos os métodos aceitos
  naquele orçamento, não só o melhor) e `quantity_reference`, necessários para o frontend agrupar,
  filtrar e montar o orçamento sugerido sem endpoint novo. `quotes-compare-screen.jsx` busca tudo uma
  vez no carregamento e faz agrupamento por produto (`product_id`, com fallback por descrição
  normalizada para itens sem produto vinculado, ex.: comodato), cálculo de KPIs (produtos
  comparáveis, fornecedores cotados, melhor fornecedor por contagem de vitórias, economia potencial
  somada) e o "orçamento sugerido" (melhor oferta de cada produto, agrupada por fornecedor, com
  subtotal baseado na quantidade de referência cotada) inteiramente no cliente — mesmo padrão já
  usado em `ctx.products`/`ctx.brands` e nos filtros client-side de `quotes-screen.jsx`, evitando
  round-trip a cada filtro.
- **Confirmar Compra** (`purchase-receiving-screen.jsx`, rota `purchase-receiving`): tela nova onde o
  usuário escolhe um orçamento confirmado, decide item a item o que realmente comprou (quantidade,
  vincular a um produto existente ou criar um novo, ou não comprou) e confirma. Implementada
  **reaproveitando 100% do pipeline de importação de nota fiscal já existente**
  (`InventoryInvoiceService.confirm_invoice_import` / `POST /inventory/invoice-confirm`, sem nenhuma
  mudança nesse endpoint) — só foi adicionado `InventoryInvoiceService.preview_from_purchase_quote`,
  que monta o mesmo payload de revisão (`InventoryInvoicePreviewResponse`) a partir dos itens de um
  orçamento em vez de a partir de uma extração por IA, exposto em
  `GET /purchase-quotes/{quote_id}/purchase-preview`. O frontend reaproveita literalmente
  `buildInvoiceDraftLine`/`normalizeInventoryInvoicePreview`, já usados pelo import de nota fiscal.
  Itens em comodato vêm pré-marcados como "não comprei" (`is_comodato` no preview, campo aditivo
  opcional em `InventoryInvoicePreviewLineResponse`), mas o usuário pode mudar. Limitação assumida
  (igual à importação de nota fiscal): a quantidade digitada entra no estoque na unidade de venda,
  sem conversão pela unidade cotada (ex.: orçamento em caixa de 50 não vira 50× na conversão).
- **Seed**: orçamentos passaram a ter mais sobreposição de produtos entre fornecedores (Amoxicilina e
  Vitamina D3 cotadas por 3 fornecedores; Losartana, Dipirona, Paracetamol, Ibuprofeno e Whey Protein
  por 2 cada) — necessário para o comparativo por produto/marca ter dados reais para mostrar.

## Refinamentos da tela "Comparar Fornecedores" (ordenação, melhores ofertas, meu catálogo)

Sobre a reescrita em tabela já documentada acima, mais uma rodada de melhorias, todas client-side
(sem mudança de backend):

- **Ordenação por coluna**: cabeçalhos clicáveis (Produto, Fornecedor, Preço, Valor total, Frete,
  Prazo, Cotado em) com indicador de direção — `SORT_COMPARATORS` centraliza os comparadores.
- **Filtro "Somente melhores ofertas"**: soma-se ao "Somente comparáveis" já existente; colapsa a
  tabela para uma linha por produto (a vencedora), independente de qual fornecedor for.
- **Coluna "Valor total"**: soma valor do produto (quantidade cotada × melhor preço) + frete daquela
  mesma cotação, mas só é exibida para a linha vencedora de cada produto (`isBestOffer`) — mostrar em
  toda linha incentivaria somar a coluna visualmente e contar o mesmo frete várias vezes.
- **Frete sem duplicação nos totais agregados**: tanto o "Orçamento sugerido" quanto o "Meu catálogo"
  (abaixo) agrupam por fornecedor e somam o frete **uma única vez por cotação** (`Map` por
  `quote_id`, função `groupBySupplier`), mesmo quando dois produtos vencedores/selecionados vêm da
  mesma cotação — sem essa deduplicação o total do fornecedor ficaria inflado.
- **"Meu catálogo"**: cada linha da tabela ganhou um checkbox de seleção manual (independente de ser
  ou não a melhor oferta — o usuário pode escolher deliberadamente uma oferta mais cara por outro
  motivo). A seleção monta uma segunda seção de cards, no mesmo formato do orçamento sugerido, e
  **sobrevive a mudanças de filtro** (calculada sobre a base completa de itens, não sobre a lista já
  filtrada) — assim marcar um item e depois trocar um filtro para olhar outra coisa não perde a
  seleção. Atalhos "Selecionar melhores ofertas visíveis" e "Limpar seleção" agilizam o uso.

## "Confirmar Compra": seleção explícita por checkbox

O controle de 3 posições por item (Vincular existente / Criar novo / Não comprei) virou um checkbox
"Comprei" no topo do card + um controle de 2 posições (Vincular existente / Criar novo) que só
aparece quando o item está marcado como comprado — mais direto para "selecionar os produtos que
comprei" do que inferir isso a partir de qual botão de um grupo de 3 está ativo. Atalhos "Marcar
todos como comprados" (pula itens em comodato) e "Desmarcar todos", e um contador "N de M itens
marcados como comprados" no topo da revisão. Nenhuma mudança de backend — o campo `action` por item
continua sendo `existing`/`new`/`skip` exatamente como antes, só a forma de definir isso mudou.

## Ver também

- [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|Adoção de Alembic em produção]] — como o schema desta feature foi migrado para o processo novo.
- [[../00_Decisoes/2026-07-23-confirmar-compra-cruza-orcamentos-e-estoque|Confirmar Compra cruza orçamentos e estoque]] — decisão sobre a exceção controlada à regra "orçamento nunca vira estoque".
- [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]] — migration gerada, ainda não aplicada em produção.
- [[Visao_Geral|Visão Geral]] — arquitetura geral do backend.

## Atualizações

- 2026-07-23: "Comparar Fornecedores" ganhou ordenação por coluna, filtro "somente melhores
  ofertas", coluna de valor total (produto + frete, sem duplicar frete entre itens da mesma
  cotação) e "Meu catálogo" (seleção manual do usuário, sobrevive a filtro). "Confirmar Compra"
  trocou o controle de 3 posições por item por um checkbox "Comprei" mais direto.
- 2026-07-23: "Comparar Fornecedores" reescrita — tabela (não mais cards) com todos os itens
  carregados de uma vez, filtros, KPIs (melhor fornecedor, economia potencial) e "orçamento
  sugerido" agrupado por fornecedor, tudo calculado no cliente sobre uma única chamada sem filtro
  obrigatório ao endpoint de comparação.
- 2026-07-23: refinamentos pós-Fase 1 — unidade como seleção, valor total por item, modal de
  visualização, comparação por produto/marca, seed com mais sobreposição entre fornecedores, e a
  tela "Confirmar Compra" (primeira ponte controlada entre orçamentos e estoque real).
- 2026-07-23: nota criada — módulo completo (Fase 1 + Fase 2) documentado.
