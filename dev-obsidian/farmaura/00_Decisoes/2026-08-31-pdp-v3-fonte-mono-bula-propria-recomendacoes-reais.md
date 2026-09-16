# 2026-08-31 — PDP v3: fonte mono corrigida, bula em página própria, descrição real, recomendações reais

## Contexto

Terceira rodada de ajustes na PDP no mesmo dia (ver
[[2026-08-31-pagina-de-produto-redesenhada-conforme-demo|1ª rodada]] e
[[2026-08-31-bula-dosagens-parcelamento-configuravel-na-pdp|2ª rodada]]). Usuário reportou que a
fonte ainda divergia do demo mesmo após a correção anterior, pediu que a bula fosse para uma
página própria (com a descrição real do produto no lugar dela), remoção do selo "Desconto
imperdível — só por tempo limitado", e as seções "Outros clientes também compraram"/"Recomendados
para você" do demo.

## Decisão

**Causa raiz do bug de fonte** — `marketplace.css` usa `var(--fa-mono)` em vários lugares (preço,
código de pedido etc.) mas **nunca definia essa variável em `:root`**, só `--fa-font`. Sem
fallback explícito, a propriedade herdava `--fa-font` (Nunito Sans) do elemento pai — todo
elemento "mono" da PDP sempre renderizou em Nunito Sans, nunca em Spline Sans Mono, apesar de já
estar documentado corretamente em `DESIGN.md`. A correção da rodada anterior (adicionar pesos
600/700 ao link do Google Fonts) era necessária mas não suficiente — nunca tocou a causa real.
Corrigido com uma linha: `--fa-mono: 'Spline Sans Mono', ui-monospace, monospace;` no `:root`.

**Bula em página própria** — nova rota `bula` (`/bula/<id>`, mesmo padrão de `/product/<id>`) e
novo arquivo `bula-screen.jsx`. A PDP agora só mostra um card `pd-bula-cta` (ícone + "Bula do
medicamento" + subtítulo), renderizado apenas quando `bula_markdown` não está vazio — nunca um
link morto. A página da bula usa um `dl` de identificação só com campos reais do catálogo (marca,
categoria, apresentação/dosagem via `variant_label`, código do produto) — nunca os campos
fabricados do demo (Registro MS, Forma farmacêutica, Via de administração), que este catálogo não
tem como preencher de verdade.

**Descrição real do produto** — campo novo `short_description` em `InventoryProduct` (Text,
distinto de `bula_markdown` e `marketing_highlights`), migration
`20260831_02_product_short_description`. Ocupa o painel "Descrição" que antes mostrava a bula
inline. Editável no console interno, populado no seed para os 4 produtos já enriquecidos no Task
9 (Losartana 50/100mg, Amoxicilina, Vitamina C).

**Selo "Desconto imperdível" removido** — bloco inteiro tirado de `PriceBlock`
(`product-screen.jsx`); a variável `isSuperpromo` continua existindo, só não usada mais para esse
selo (ainda controla o tamanho da linha "Você economiza").

**"Outros clientes também compraram" — dado real, não reaproveitado** — antes de implementar,
perguntei ao usuário como tratar essa afirmação de comportamento real de compra, já que não existe
análise de coocorrência de pedidos no backend hoje. Decisão do usuário: construir de verdade, não
usar outro critério com o mesmo rótulo. Implementado como uma nova função SQL
`app_private.public_also_bought_products(tenant_id, product_id, limit)` em
`row_level_security.py` (idempotente, roda a cada start, sem migration) — mesmo mecanismo de
segurança de `app_private.public_monthly_product_sales` (já existia para "Mais buscados"):
`SECURITY DEFINER`, nunca expõe `customer_id`/`order_id`, só ids de produto + contagem. Agrupa
pedidos online pagos/não-cancelados e vendas PDV por uma "basket_id" prefixada por sistema
(`o:`/`p:`) para nunca colidir UUIDs entre os dois. Exposto via `GET
/catalog/products/{id}/also-bought`, consumido pela PDP com o mesmo padrão de resolução por alias
`"prod-<id>"` já usado por `resolveMostSearchedProducts` — a seção só aparece quando a lista
resolvida não é vazia (sem placeholder de carregando nem estado vazio inventado).

**"Recomendados para você"** — a rail que já existia (`sameCategory` + fallback por avaliações,
antes rotulada "Quem viu, levou também") foi só renomeada — lógica sem mudança, já era dado real
de catálogo.

## Consequências

- Nova migration `20260831_02_product_short_description` (1 coluna em `inventory_products`).
  Aplicada em dev local; nunca em produção sem pedido explícito.
- **Gap de infraestrutura já registrado recorreu**: o Postgres de dev local continua sem
  `alembic_version` estampado após um `docker compose down -v && up` (schema nasce só via
  `create_all`). Contornado de novo com `alembic stamp head` (dessa vez direto pro head, já que
  `create_all` a partir do modelo atual já inclui a coluna nova) — ver
  [[../06_Pendencias/alembic-version-ausente-no-postgres-local|pendência já aberta]], sem
  necessidade de nova nota.
- **Achado durante a verificação**: `scripts/seed.py` roda automaticamente no boot do container
  via `bootstrap_database.py::run_seed_database()` quando o banco está vazio (usa a conexão admin,
  que tem bypass de RLS) — rodar `uv run python scripts/seed.py` manualmente falha com "new row
  violates row-level security policy", porque a settings usada pelo script (`database_url`) é a
  role restrita `farmaura_app`, não a `farmaura` admin. Não é um bug desta mudança, é assim que o
  script sempre funcionou — só nunca tinha sido invocado manualmente antes nesta sessão. Nada a
  corrigir: o fluxo certo em dev local é sempre `docker compose down -v && up -d` (reset completo),
  nunca chamar `seed.py` direto.
- Verificado via build de produção real + Playwright, incluindo um reset completo do zero:
  `.pd-price` renderizando em Spline Sans Mono de verdade (computed `font-family` confirmado),
  selo antigo ausente, painel "Descrição" com texto real, card da bula navegando para `/bula/<id>`
  e voltando, as duas rails novas populadas com produtos reais (a de "outros clientes também
  compraram" testada com um produto que tem coocorrência real no seed), console interno com o
  campo novo no formulário de produto. Nenhum erro de console/JS em nenhuma tela testada.

## Ver também

- [[2026-08-31-pagina-de-produto-redesenhada-conforme-demo|PDP 1ª rodada]]
- [[2026-08-31-bula-dosagens-parcelamento-configuravel-na-pdp|PDP 2ª rodada]]
- [[../06_Pendencias/alembic-version-ausente-no-postgres-local|Postgres local sem rastreamento Alembic]]
