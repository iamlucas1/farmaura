---
cssclasses: ia-nota
---

# 2026-09-16 — Card lateral do carrinho (PDV): local de retirada completo, receita/tarja mais intuitiva, seções separadas

## Contexto

Pedido (via `/impeccable`, referência [[../09_Design_Visual/Sistema_de_Design|layout.md]]): reformular o painel lateral do carrinho no PDV. Três problemas relatados: (1) o local de retirada do produto (dropdown de estoque) aparecia cortado; (2) o selo de receita/tarja para produtos controlados não era intuitivo; (3) desconto, cupom, subtotal e total ficavam todos visualmente juntos, sem separação.

## Decisão

### Linha do carrinho: de uma única linha flex para um bloco com sub-linhas

`.pdv-cart-line` deixou de ser uma única linha flex (`align-items:center`) e virou um container em coluna, com três sub-blocos:
- **Linha principal** (`.pdv-cart-line-main`): nome + badge "Tarja" + stepper de quantidade + total da linha + remover — como antes.
- **Local de retirada** (`.pdv-cart-line-location`): agora é uma linha própria de **largura total**, com ícone de pin. Antes, o `<select>` dividia espaço com o texto de preço/marca/loja numa única linha flex com `flexWrap` — o texto da opção selecionada (`"CONTROL-02 · Storage CONTROL-02 (18 un)"`) ficava espremido e cortava. Resolvido simplesmente dando a ele sua própria linha.
- **Status de receita** (`.pdv-rx-row`): antes era um badge pequeno ao lado do nome do produto, fácil de não notar. Agora é uma **linha inteira, colorida pelo tom do status** (`--critical-soft`/`--warning-soft`/`--good-soft`, mesmos tokens semânticos já usados no resto do sistema), clicável, com ícone + texto do status + "· toque para validar" quando ainda pendente + seta indicando que é interativo. O selo "Tarja" (estático, só indica que o produto é controlado) continua ao lado do nome — a diferença agora é clara: "Tarja" é uma etiqueta, a linha de receita é uma ação.

### Rodapé do carrinho: seções com rótulo e divisor

Novo padrão `.pdv-cart-section` (rótulo em caixa alta + divisor superior) agrupa: "Pagamento" (visão do caixa), "Desconto e cupom", e "Retirada ou entrega" — cada uma visualmente separada da anterior. O resumo financeiro (Subtotal/Cupom/Cashback/Itens/Total) ganhou uma **caixa própria com fundo destacado** (`.pdv-cart-summary`, `--surface-2`), em vez de flutuar solto entre o campo de cupom e a seção de entrega.

### Limpeza

Removidas `.rx-tag`/`.rx-tag.done`/`.rx-tag-static` — CSS de uma versão anterior do selo de receita, sem nenhum uso no JSX atual.

## Consequências

- Testado via Chrome headless (desktop e 400px): local de retirada aparece por inteiro, linha de receita clara e clicável (confirmado abrindo a modal de validação), seções do rodapé visualmente distintas em ambas as larguras, sem overflow.
- Nenhuma mudança de comportamento/dados — só reorganização visual; `pdvSetLocation`, `setPrescriptionTarget`, `applyCoupon` etc. seguem os mesmos.

## Atualização 2026-09-17 — carrinho maior (5 produtos antes de rolar) e aviso de receita reformulado

Dois ajustes pedidos depois de ver o resultado em uso real:

1. **Lista de itens pequena demais**: o limite antigo (`maxHeight: 340px` fixo, acionado só a partir de 6 linhas) datava de quando cada linha do carrinho era uma única linha flex — depois desta mesma reformulação, uma linha pode ter até 3 sub-linhas (principal + local de retirada + receita), então 340px mostrava bem menos que 5 produtos completos. Trocado por uma medição real via `useLayoutEffect`: com mais de 5 linhas no carrinho, mede a altura de fato das 5 primeiras (via `getBoundingClientRect`, que já reflete se cada uma tem local/receita ou não) e usa essa soma como `maxHeight` do container — computado dinamicamente a cada render, então sempre corresponde a exatamente 5 produtos visíveis antes de aparecer a barra de rolagem, não importa a mistura de itens simples/controlados no carrinho.
2. **Aviso "Há item controlado (tarja) na venda..."**: era um parágrafo grande (largura total, texto em negrito) sentado entre a lista de itens e o rodapé, repetindo uma informação que cada linha do item já mostra individualmente (e sempre aparecia enquanto houvesse qualquer controlado no carrinho, mesmo depois de validado — nunca refletia progresso real). Reformulado para: (a) só aparece quando ainda falta validar algo (`status !== "approved"`), e (b) virou um chip curto de uma linha ("1 item com receita pendente"), não um bloco. `.pdv-rx-blocked-note` mudou de bloco `flex` com padding 10/12 para `inline-flex` com padding 5/10 e `border-radius: 999px`.

Verificado com script novo em Chrome headless: carrinho com 6 produtos (1 controlado) mostra exatamente os 5 primeiros sem rolar (`scrollHeight: 1018` vs `clientHeight: 788`, cap calculado automaticamente), o chip mostra "1 item com receita pendente", e ao rolar até o 6º item a linha de receita ("Sem receita · toque para validar") e o local completo ("CONTROL-02 · Storage CONTROL-02 (18 un)") aparecem certos; clicar na linha de receita ainda abre a modal "Validar receita — Clonazepam...". Confirmado também em largura mobile (400px).

## Atualização 2026-09-17 — aviso de receita pendente saiu do carrinho, virou banner no topo

Com a integração da maquininha ([[2026-09-17-integracao-maquininha-itau-via-agente-usb-local|ADR]]) o carrinho lateral ganhou mais uma seção de pagamento, e o chip "N item(ns) com receita pendente" (da atualização anterior) ficou espremido colado embaixo da própria linha de receita do item — visualmente redundante e apertado num espaço que já estava cheio.

Reformulado: o resumo de receitas pendentes saiu do `.pdv-cart` e virou um banner de largura total no topo da tela (`.pdv-rx-banner`, acima do cabeçalho "Limpar carrinho"/cronômetro, antes mesmo do grid de duas colunas) — com espaço de sobra para listar cada item pendente por nome, não só a contagem, cada um como um chip clicável que abre direto a modal de validação (`setPrescriptionTarget`). O carrinho lateral manteve só a linha de status por item (`.pdv-rx-row`, já existente) — a informação duplicada foi removida de lá, não repetida em dois lugares.

## Atualização 2026-09-17 (2) — linha principal do item: nome em cima, valores embaixo

Mais um ajuste reportado pelo usuário sobre a mesma linha principal do item (`.pdv-cart-line-main`): o nome do produto (às vezes longo, ex. "Clonazepam 2mg 30 comprimidos") disputava espaço com o selo "Tarja" numa única linha flex, forçando quebra de linha do nome; logo abaixo, a linha muted (`R$ 19,90 un · Medley · Farmaura Ponte Alta Norte`) ficava colada nisso e também quebrava em 3 linhas — tudo muito junto e confuso. Também foi pedido para tirar o nome da loja dessa linha (`storeName`), mantendo só valor unitário e marca.

Reestruturado `.pdv-cart-line-main` de uma linha flex única para duas linhas empilhadas:
- **Linha 1** (nome, largura total): nome com `text-overflow: ellipsis` (não quebra mais) + selo "Tarja" à direita, sem disputar espaço com mais nada.
- **Linha 2** (valores, largura total): `R$ preço un · marca` à esquerda, stepper de quantidade + total da linha + remover à direita — tudo que antes ficava espremido ao lado do nome.

Primeira tentativa (deixar tudo numa linha só, com o nome truncando via `ellipsis` ao lado do stepper/preço/remover) truncou demais ("Clonaz...", "Dipirona 1g 10 co...") porque sobrava pouquíssima largura para o nome — corrigido dando ao nome sua própria linha de largura total antes de aplicar o ellipsis, então ele só trunca em casos realmente extremos.

`storeName` removido da linha de valores (ficou só `{brl(l.price)} un · {l.brand}`) — a localização de fato (onde retirar o item) continua exclusivamente na linha dedicada `.pdv-cart-line-location`, sem duplicar em texto solto.

## Ver também

- [[2026-09-16-catalogo-pdv-minimalista-voltado-a-pesquisa]] e [[2026-09-16-produto-nao-encontrado-busca-ao-vivo-e-visual-distinto]] — mesma leva de reformulação visual do PDV.