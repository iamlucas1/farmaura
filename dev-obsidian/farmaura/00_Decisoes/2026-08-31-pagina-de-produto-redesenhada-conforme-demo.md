# 2026-08-31 — Página de produto (PDP) redesenhada conforme o demo "Padrão farmácia"

## Contexto

Pedido do usuário: substituir o visual atual da tela de produto (`screens/product-screen.jsx` —
preço, descrição, informações, avaliações) pelo modelo prototipado no demo de referência
("Farmaura — Padrão farmácia", Artifact `fd74c9f1-16f1-48be-a937-fa7d0d3a7a1a`, seção
`data-cat="product:losartana-50"`). A implementação anterior tinha dois layouts alternativos
(`productVariant` "A"/"B", split vs. editorial) — investigação confirmou que `productVariant`
era uma constante morta (`"A"` fixo em `marketplace-app.jsx`, nunca lida de nenhuma configuração
real, nunca alternada em lugar nenhum do código) — removida junto, não era uma feature real a
preservar.

## Decisão

Layout único, ported do demo: `pd-layout` (galeria 440px sticky + coluna de info) → seção
`pd-two-col` (Descrição/Especificações lado a lado) → carrossel de relacionados → Avaliações.
Todo dado é real (mesmo model/endpoints de antes); nenhum HTML do demo foi copiado como mock —
onde o demo já tinha um equivalente real no app, a implementação real foi reaproveitada em vez de
duplicada:

- Estrela/preço/desconto/parcelamento: `PriceBlock` existente, só reestilizado com as classes
  `pd-price*` do demo (inclusive o pill `-X%` do desconto, que no demo é verde/`--fa-success`,
  diferente do vermelho/`--fa-badge-vital` usado antes).
- Contador de quantidade → `QtyStepper`/`.fa-qty` já existente (não um `.pd-qty` paralelo).
- Toggle de assinatura → componente `Toggle`/`.fa-switch` já existente, dentro do novo cartão
  `.pd-recurrence` (texto corrigido para "15% off", o desconto real — o demo mockava "10%").
- Calculadora de frete por CEP (`.pd-shipping`, novo) → **conectada de verdade**: reaproveita
  `fetchViaCepAddress`/`fetchDeliveryCoverage` (ViaCEP + `GET /orders/delivery-coverage/public`),
  o mesmo fluxo já usado no popover "Entregar em" do header — extraídas para
  `core/marketplace-address.js` (antes só existiam dentro de `marketplace-chrome.jsx`) para serem
  reaproveitadas sem duplicar lógica; `DeliveryCoverageNote` passou a ser exportada de
  `marketplace-chrome.jsx` pelo mesmo motivo.
- "Comprar agora"/"Adicionar ao carrinho": mantidos os dois botões reais (o demo só tem um) —
  mesma ordem/cor já padronizada nesta sessão em todo o app (vermelho = Comprar agora, branco =
  Adicionar ao carrinho).
- Avaliações: usa `product.reviewComments` (já real), agora também exibindo
  `reviewer_avatar_initials` e `submitted_at` (campos que o backend já devolvia e o código antigo
  simplesmente não usava).

## Alternativas consideradas — elementos do demo que ficaram de fora

- **Seletor de forma de pagamento por item** (`pdPayMethod`, Crédito/Débito/Pix/Dinheiro na
  entrega) — descartado, não só "não implementado ainda": o domínio real de pagamento é por
  *pedido*, não por item de carrinho (`CheckoutPaymentRequest.method`), então um seletor por
  produto implicaria um conceito que não existe no backend. Não é uma pendência, é incompatível
  com o modelo de dados atual.
- **Caixa de cupom com "Aplicar" na própria página do produto** — cupom hoje só é validado
  server-side no carrinho/checkout (`CouponService`); um campo de cupom aqui que não faz nada
  seria simular funcionamento real, o que o `PRODUCT.md` proíbe explicitamente. Ver pendência
  registrada.
- **Link "Bula do medicamento"** — decisão já tomada antes (ver
  [[../06_Pendencias/bula-pagina-sem-conteudo-real|bula-pagina-sem-conteudo-real]]): sem conteúdo
  regulatório real, o link não foi recriado.
- **Especificações regulatórias fabricadas** (Princípio ativo, Registro MS, Fabricante, Dosagem,
  Classificação/tarja como texto) — o catálogo real não tem essas colunas; preencher com o texto
  de exemplo do demo seria inventar dado de saúde/regulatório, a mesma classe de problema já
  evitada na decisão da bula. `Especificações` hoje mostra só campos reais (marca, categoria, SKU
  quando existe, EAN quando existe, necessidade de receita, disponibilidade de assinatura).
- **Duas vitrines de recomendação distintas** ("Outros clientes também compraram" +
  "Recomendados para você") — o catálogo só tem um sinal real de relacionados (mesma
  categoria + fallback por avaliações, já existente); duas vitrines exigiriam um segundo sinal de
  personalização que não existe (mesmo raciocínio já usado para não fabricar a faixa
  "Tendências" — ver [[../06_Pendencias/faixa-tendencias-sem-sinal-real-no-catalogo|pendência
  irmã, já resolvida com curadoria manual]]). Mantida uma vitrine real ("Quem viu, levou
  também"), reestilizada para as classes `pd-section`/`pd-carousel-head` do demo.
- **"Fotos" de avaliação de cliente** (`pd-review-photo`, no demo são só blocos de cor sólida) —
  o model `product_reviews` não tem campo de foto anexada; omitido, não fabricado.

## Consequências

- `screens/product-screen.jsx` reescrito por completo; `BuyBox`/`ProductTabs` (funções internas,
  nunca importadas fora deste arquivo — confirmado antes de remover) deixaram de existir como
  tal, substituídas pelo fluxo único da coluna `pd-info`. `PriceBlock`/`RxNotice`/`PharmacistCard`
  continuam exportadas.
- Nova seção `.pd-*` em `marketplace.css`.
- `core/marketplace-address.js` ganhou `fetchDeliveryCoverage` (antes vivia só em
  `marketplace-chrome.jsx`); `marketplace-chrome.jsx` agora importa de lá e exporta
  `DeliveryCoverageNote`.
- Verificado via build de produção real (`docker compose build/up farmaura`) + Playwright contra
  `localhost:3000`: desktop (1440px, produto com desconto real), mobile (390px) e — inserindo
  temporariamente duas avaliações reais via SQL local (removidas logo depois, `FLUSHALL` no
  Valkey antes e depois) — a lista de avaliações com avatar/data reais. Nenhum erro de console/JS.
- Nenhuma migration necessária (nenhum campo novo de schema, só leitura de campos já existentes).

## Ver também

- [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|Roadmap de composição visual "padrão farmácia"]] — mesma prática de adoção faseada do demo, agora estendida à PDP.
- [[../06_Pendencias/bula-pagina-sem-conteudo-real|bula-pagina-sem-conteudo-real]] — precedente do mesmo princípio (não fabricar conteúdo regulatório).
