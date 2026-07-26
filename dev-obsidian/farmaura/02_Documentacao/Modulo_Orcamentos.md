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

## Robustez da IA de importação (PDF/OpenAI, JSON, XLSX pivot, divisão automática)

- **OpenAI processa PDF, não só imagem**: `AiService._execute_openai_document`
  (`app/services/ai_service.py`) ganhou um branch para `application/pdf` usando `input_file`/
  `file_data` (data URL base64) na Responses API — mesmo endpoint já usado para imagem, sem upload
  separado. Antes, qualquer PDF no provider OpenAI era rejeitado explicitamente.
- **JSON mais tolerante a erros de formatação do modelo**: `parse_ai_json_object`
  (`app/core/ai_json.py`) agora tenta, em sequência, o texto cru, o conteúdo dentro de cerca
  markdown, e o maior trecho `{...}` encontrado — cada um também com uma segunda tentativa após
  normalizar aspas curvas e remover vírgula sobrando antes de `}`/`]`. Cobre os erros mais comuns
  que modelos cometem, sem tentar ser um parser JSON tolerante completo.
- **Detecção de resposta cortada por limite de tokens**: nova `is_response_truncated()`
  (`app/core/ai_json.py`), checando `finish_reason` (Gemini: `MAX_TOKENS`; OpenAI: `incomplete`).
  Essa era a causa real mais provável do erro genérico "JSON mal formatado" reportado pelo usuário
  num orçamento com muitos itens — `max_output_tokens` subiu de 4000 para 8000 nos dois serviços de
  extração (orçamento e nota fiscal) para reduzir a chance de isso acontecer.
- **Divisão automática do arquivo quando a resposta é cortada mesmo assim**
  (`purchase_quote_ai_service.py`): em vez de só devolver um erro pedindo para o usuário dividir o
  arquivo manualmente, o sistema divide sozinho e tenta de novo, mesclando os resultados
  (`_merge_extracted_payloads` — concatena itens, mantém cabeçalho/formas de pagamento do primeiro
  trecho que tiver dado): PDF é dividido por página (`pypdf`, nova dependência), XLSX/DOCX por
  linha de texto extraído (repetindo as primeiras linhas do documento em cada pedaço, para o
  cabeçalho/fornecedor não se perder no meio da divisão). Recursivo, limitado a profundidade 2
  (até 4 pedaços). Imagem não é dividida (sem fronteira natural de corte) — mantém o erro claro.
- **XLSX com tabela dinâmica**: `_extract_xlsx_text` resolve células mescladas (comum em cabeçalho
  de tabela dinâmica exportada do Excel, ex.: nome do fornecedor mesclado sobre várias linhas) —
  troca `read_only=True` por leitura normal (para acesso confiável a `merged_cells.ranges`) e
  preenche toda célula de uma região mesclada com o valor da célula âncora antes de gerar o texto.
  Para o caso de rótulo em branco por repetição (sem ser mesclagem de fato — padrão comum de export
  de pivot table), o código não tenta adivinhar: o prompt de extração instrui a IA a considerar que
  célula de agrupamento em branco repete o valor da linha anterior daquela coluna.

## Quantidade de unidades por caixa/pacote (`units_per_package`)

Campo novo em `purchase_quote_items.units_per_package` (nullable, `Numeric(12,3)`, migration
`20260723_03_add_purchase_quote_item_units_per_package`) — quantas unidades de venda cabem numa
unidade cotada, quando ela for uma embalagem (caixa, fardo, pacote, dúzia, cartela). Puramente
aditivo/opcional: sem esse dado, nada muda.

- **Cotações**: quando a unidade do item é uma dessas "tipo embalagem"
  (`PACKAGE_LIKE_UNITS = ['cx', 'fardo', 'pct', 'dz', 'cartela']` em `quotes-screen.jsx`), aparece
  um campo extra "Unidades por cx/fardo/..." — no cadastro manual e na revisão do import por IA.
  A própria IA já tenta extrair esse número quando o documento indicar (ex.: "CX C/50").
- **Fecha uma lacuna já documentada**: `InventoryInvoiceService.preview_from_purchase_quote` agora
  usa esse campo, quando presente, para converter a quantidade cotada (em caixas) numa quantidade
  de estoque (em unidades de venda) — `quantidade = quantity_reference × units_per_package` — e
  também converte o preço: o custo/preço sugerido passa a ser por unidade de venda
  (`unit_price ÷ units_per_package`), não mais o preço da caixa inteira aplicado a cada unidade
  (que superavaliaria o estoque em `units_per_package` vezes). Sem o campo preenchido, comportamento
  idêntico ao anterior — a limitação registrada no ADR original de Confirmar Compra ("quantidade
  entra na unidade de venda, sem conversão pela unidade cotada") deixa de se aplicar quando o
  fornecedor informou a conversão.

## Robustez da extração XLSX (planilhas reais analisadas)

Analisadas 4 planilhas reais de fornecedores (formulário de pedido com célula mesclada por
categoria, tabela plana com NCM/embalagem "N x tamanho", workbook com abas "resumo" + "cadastro"
duplicadas + 10 abas de alíquota ICMS-ST por estado, e um formulário de pedido gigante de 933
linhas com abas de cálculo interno de até 85 colunas) para endurecer `_extract_xlsx_text` e o
prompt de extração (`purchase_quote_ai_service.py`) contra padrões reais, não só hipotéticos.

- **Bug real encontrado: corte silencioso do arquivo antes da IA ver o conteúdo.**
  `LOCAL_PARSE_MAX_CHARS` cortava o texto extraído em 20.000 caracteres *antes* de passar pelo
  mecanismo de divisão-e-repetição (`_extract_text_payload`) — esse mecanismo só reage a resposta
  da IA cortada (`is_response_truncated`), nunca a um corte que já aconteceu no texto de entrada.
  Para uma planilha de algumas centenas de linhas, isso descartava a cauda do arquivo sem erro
  nenhum, e o usuário nunca saberia que faltou item. Subido para 200.000 caracteres — suficiente
  para as 3 planilhas menores analisadas (7k/15k/46k caracteres) caberem inteiras; um workbook
  realmente patológico (centenas de linhas *e* abas de cálculo interno muito largas, sem cabeçalho
  de item reconhecível) ainda pode bater nesse teto — limitação conhecida, não resolvida agora.
- **Abas de alíquota de ICMS-ST por estado são ignoradas**: heurística determinística em
  `_looks_like_tax_rate_sheet` — se as primeiras linhas de uma aba tiverem uma coluna "Estado"/
  "Escolha a UF" junto de "Alíquota"/"MVA", a aba inteira é substituída por uma nota curta em vez
  do conteúdo. Sem isso, uma tabela de 27 linhas por estado (uma por aba de produto, às vezes 10+
  abas no mesmo arquivo) competia por espaço com os itens de verdade e arriscava a IA interpretar
  uma linha de estado ("SP, 0.04, 0.18, ...") como produto.
- **Prompt ganhou reconhecimento de padrões reais de planilha**: coluna "Embalagem" no formato
  "12 x 120g" (o número antes do "x" é `units_per_package`); distinção explícita entre uma coluna
  de conversão de embalagem real ("CX", "Cx.", "Caixa de Embarque") e uma coluna de "Múltiplo de
  Venda"/quantidade mínima de pedido (regra de pedido, não conversão — não deve virar
  `units_per_package`); ignorar linhas de resumo/total ("TOTAL <marca>", lista de categorias com
  valor zerado no topo de formulário de pedido); e combinar num único item quando o mesmo
  código/EAN aparece em mais de uma aba do mesmo arquivo (ex.: aba resumida + aba "Cadastro" mais
  completa), preferindo o valor mais detalhado por campo em vez de duplicar o item.

**Limite de upload era menor do que documentos reais de fornecedor — três camadas, três limites
diferentes**: uma requisição de import passa por `lumos-gateway` (nginx) → nginx interno do
container `farmaura` (proxy `/api/v1/` → `farmaura-api`) → `BodyLimitMiddleware` do próprio
`farmaura-api`. Cada uma tinha um teto menor que o anterior, e cada uma precisou ser corrigida
separadamente, em rodadas diferentes, porque só apareciam ao testar o caminho real (domínio em
produção) — testar direto na porta 8080 do backend, como em dev local, pula as duas primeiras
camadas e mascara o problema:
- `farmaura-api`: `APP_MAX_REQUEST_BODY_BYTES` (middleware `BodyLimitMiddleware`, checado antes de
  qualquer outra validação) estava em 1MB no `.env`, mais restritivo até que o próprio
  `APP_MAX_UPLOAD_BYTES` de 5MB. Ambos subiram para ~20MB (`app/core/config.py` e `.env`, local e
  produção).
- `lumos-gateway`: o vhost do Farmaura (`nginx/conf.d/90-farmaura.conf.template`) herdava o
  `client_max_body_size` default global de 10MB — ganhou `client_max_body_size 25m;` explícito.
- `docker/web/nginx.conf` (nginx **dentro** do container `farmaura`, que serve os estáticos e faz
  `proxy_pass` de `/api/v1/` para `farmaura-api:8080`): não tinha `client_max_body_size` nenhum,
  caindo no default embutido do nginx de **1MB** — o teto mais apertado dos três, e o único que só
  se manifesta passando pelo domínio real (gateway → este proxy → backend), nunca testando a porta
  8080 direto. Ganhou `client_max_body_size 25m;` no bloco `server`.

Todas as três camadas foram implantadas em produção; validado com upload real de 8MB através do
domínio (`drogariafarmaura.com.br`) retornando 401 (exige login) em vez de 413.

## Campos fiscais do item (NCM, IPI, ST, preço final)

Alguns fornecedores enviam tabela de preço já com dados fiscais por linha (ex.: tabelas de
atacado/distribuidor com colunas "NCM", "% IPI", "ST" e "Preço Final"). Antes desses campos
existirem no schema, a IA extraía só descrição/unidade/preço base e o resto da tabela era
descartado silenciosamente — o usuário reportou isso ao importar um PDF que tinha essas colunas e
notar que "não virou tabela para conferência" nada relacionado a imposto.

Campos novos em `purchase_quote_items` (todos opcionais, migration
`20260723_04_add_purchase_quote_item_tax_fields`):

- `ncm_code` (`varchar(16)`, default `""`) — código de classificação fiscal do produto.
- `ipi_percentage` (`Numeric(6,3)`, nullable) — alíquota percentual do IPI (ex.: `6.5`, não `0.065`).
- `icms_st_value` (`Numeric(12,2)`, nullable) — valor monetário de substituição tributária por
  unidade.
- `final_unit_price` (`Numeric(12,2)`, nullable) — preço unitário já com impostos aplicados, quando
  o documento trouxer essa coluna pronta.

Puramente informativo/aditivo: `unit_price` continua sendo o preço base usado em toda a lógica de
comparação e "Confirmar Compra" — nada é calculado a partir dos campos fiscais automaticamente, e a
IA só preenche `final_unit_price` quando o documento já tem uma coluna própria para isso (nunca
calcula IPI/ST em cima do preço base por conta própria, para não inventar um valor que o fornecedor
não informou).

- **Prompt de extração** (`purchase_quote_ai_service.py`): instruído a reconhecer sinônimos comuns
  de coluna (NCM; `% IPI`/`IPI`/`IPI%`; `ST`/`ICMS-ST`/`Subst. Tributaria`; `Preço Final`/`Preço com
  Imposto`/`Valor Final`) e a tratar preço listado por caixa/pacote inteiro (ex.: catálogo "Caixa
  com 12 Unidades R$ 31,20") como `unit_price` da própria caixa (unidade `cx`) em vez de dividir
  pelo `units_per_package` — evita o erro de transformar preço de caixa em preço de unidade sem o
  usuário pedir.
- **Cotações** (`quotes-screen.jsx`): campos NCM/IPI(%)/ST(R$)/Preço final aparecem no editor manual
  de item, na revisão do import por IA, e como coluna "Impostos" + subtexto "Final: R$ X" na
  visualização da cotação (`QuoteViewModal`).

## Importação em lote (múltiplos arquivos, segregado por fornecedor e marca)

`/import-preview` e `/import-confirm` aceitam vários arquivos numa única requisição (até
`MAX_BATCH_FILES = 10`, mesma constante no backend `purchase_quote_ai_service.py` e no frontend
`quotes-screen.jsx`) — por exemplo, cotações de vários fornecedores diferentes de uma vez.

**Decisão de design: um `PurchaseQuote` por arquivo, nunca mesclado entre arquivos.** Cada arquivo
continua extraindo exatamente uma cotação/fornecedor, exatamente como no fluxo de arquivo único —
um lote nunca combina itens de dois arquivos numa mesma cotação. "Segregar primeiro por
fornecedor, depois pela marca que cada fornecedor oferece" (pedido original do usuário) é resolvido
assim: cada arquivo vira uma cotação distinta (segregação por fornecedor), e dentro de cada
cotação os itens já carregam `brand_name` — a tela de conferência agrupa e sub-cabeçalha os itens
por marca dentro de cada cartão de fornecedor. Isso evitou qualquer mudança de schema (nenhuma
migration nova nesta feature) e reaproveita `find_supplier_match` exatamente como já era (já era
escopado por cabeçalho, chamado uma vez por arquivo extraído).

- **Backend** (`purchase_quote_ai_service.py`): `preview_quote_import_batch`/
  `confirm_quote_import_batch` são wrappers finos que chamam `preview_quote_import`/
  `confirm_quote_import` (inalterados) num laço **sequencial** — nunca concorrente, para não
  empilhar chamadas simultâneas de IA na mesma chave de API compartilhada entre dev e produção
  (risco de rate-limit já observado nesta sessão). Cada arquivo tem sucesso ou falha
  independentemente — um PDF corrompido não derruba o lote inteiro, só aparece como item com
  `success: false` e `error` no resultado.
- **Bug real encontrado testando esta feature**: o laço de `confirm_quote_import_batch` batia
  exatamente no problema já documentado de "RLS após commit" (`confirm_quote_import` comita ao
  persistir cada cotação, o que limpa o contexto de RLS transaction-local) — todo arquivo depois
  do primeiro num lote falhava o INSERT com "new row violates row-level security policy". Corrigido
  chamando `apply_tenant_context(session, subject)` entre iterações, mesmo padrão já usado em
  `purchase_quote_service.py` (`_reapply_tenant_context`).
- **Frontend** (`quotes-screen.jsx`): `<input type="file" multiple>`; a tela de conferência mostra
  um cartão por cotação extraída com sucesso (fornecedor, formas de pagamento, itens agrupados por
  marca), arquivos que falharam ficam listados com o erro sem bloquear os que deram certo; a
  confirmação envia o lote inteiro numa requisição e mantém abertos só os cartões que falharam ao
  salvar, para o usuário corrigir e tentar de novo sem reenviar tudo.
- **Limites de tamanho**: por arquivo, ~100MB (`APP_MAX_UPLOAD_BYTES` subiu de ~20MB); por lote,
  ~500MB (`APP_MAX_REQUEST_BODY_BYTES` subiu de ~21MB). As mesmas três camadas de proxy já tocadas
  antes nesta sessão (`farmaura-api`, nginx interno do container `farmaura`, vhost do
  `lumos-gateway`) subiram juntas — `client_max_body_size` para 600m nas duas camadas de nginx, e
  `proxy_read_timeout`/`proxy_send_timeout` para 1800s (processamento sequencial de vários arquivos
  grandes pode legitimamente levar bem mais que os 300s já usados para um arquivo só).

## Ver também

- [[../00_Decisoes/2026-07-23-adocao-alembic-migrations-producao|Adoção de Alembic em produção]] — como o schema desta feature foi migrado para o processo novo.
- [[../00_Decisoes/2026-07-23-confirmar-compra-cruza-orcamentos-e-estoque|Confirmar Compra cruza orçamentos e estoque]] — decisão sobre a exceção controlada à regra "orçamento nunca vira estoque".
- [[../06_Pendencias/aplicar-migration-orcamentos-em-producao|aplicar-migration-orcamentos-em-producao]] — migration gerada, ainda não aplicada em produção.
- [[Visao_Geral|Visão Geral]] — arquitetura geral do backend.

## Atualizações

- 2026-07-25: importação em lote — `/import-preview`/`/import-confirm` aceitam múltiplos arquivos
  (até 10), cada um vira uma cotação própria (nunca mesclada entre arquivos), segregado por
  fornecedor com itens agrupados por marca na conferência. Limites subidos para ~100MB/arquivo e
  ~500MB/lote nas três camadas de proxy, timeouts para 1800s. Corrigido bug real de RLS-após-commit
  no laço de confirmação em lote (achado testando, não reportado pelo usuário). Validado ponta a
  ponta em produção com 2 arquivos reais de fornecedores diferentes.
- 2026-07-24: corrigido 413 ao importar catálogo/orçamento grande — três causas em sequência, uma
  por camada (`farmaura-api` 1MB → `lumos-gateway` 10MB → nginx interno do container `farmaura`
  1MB default), a última só reproduzível testando pelo domínio real, não pela porta 8080 direto.
  Todas as três subidas para ~20-25MB e implantadas em produção; validado com upload real de 8MB
  pelo domínio retornando 401 em vez de 413.
- 2026-07-24: robustez da extração XLSX contra planilhas reais de fornecedores (4 arquivos de
  exemplo analisados) — corrigido corte silencioso de conteúdo por `LOCAL_PARSE_MAX_CHARS` (20k →
  200k caracteres) que descartava a cauda de planilhas grandes sem erro; abas de alíquota ICMS-ST
  por estado agora são detectadas e ignoradas (`_looks_like_tax_rate_sheet`); prompt reconhece
  "Embalagem" no formato "N x tamanho", distingue múltiplo de venda de conversão de embalagem real,
  ignora linhas de total/resumo, e combina item duplicado entre abas do mesmo arquivo.
- 2026-07-24: campos fiscais do item de cotação — `ncm_code`, `ipi_percentage`, `icms_st_value`,
  `final_unit_price` (todos opcionais, migration `20260723_04`). Corrige tabelas de fornecedor com
  colunas NCM/%IPI/ST/Preço Final sendo descartadas pela IA na importação; prompt de extração
  ganhou instruções para reconhecer essas colunas e para tratar preço de caixa/pacote inteiro (ex.:
  catálogo "Caixa com 12 Unidades R$ 31,20") sem dividir pelo `units_per_package`. Aplicado
  diretamente no Postgres de dev local (`ALTER TABLE`) porque `bootstrap_database.py` só roda
  `create_all`, que não adiciona coluna em tabela já existente — só cria tabela ausente; a migration
  Alembic é quem cobre isso em produção.
- 2026-07-23: corrigido erro real encontrado ao testar a importação de PDF por OpenAI logo após
  a mudança acima — `httpx.ReadTimeout` (30s era pouco para PDF + `max_output_tokens=8000`) subia
  como exceção não tratada, o que faz o FastAPI devolver 500 sem os headers de CORS (o navegador
  reporta isso como bloqueio de CORS, escondendo o erro real). `AiService` ganhou um `_post()`
  compartilhado que converte timeout/erro de conexão em `HTTPException` limpa (504/502);
  `ai_request_timeout_seconds` subiu de 30 para 90s (`app/core/config.py` e `.env` local).
- 2026-07-23: robustez da importação por IA — OpenAI passa a processar PDF (não só imagem);
  `parse_ai_json_object` tolera vírgula sobrando e aspas curvas; resposta cortada por limite de
  tokens é detectada e o arquivo é dividido automaticamente (PDF por página via nova dependência
  `pypdf`, XLSX/DOCX por linha de texto) e os resultados mesclados; XLSX com células mescladas
  (comum em tabela dinâmica exportada) é lido corretamente. Campo novo `units_per_package` em
  Cotações (quantas unidades tem uma caixa/pacote), usado por "Confirmar Compra" para converter
  quantidade e custo corretamente quando presente — nova migration `20260723_03`.
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
