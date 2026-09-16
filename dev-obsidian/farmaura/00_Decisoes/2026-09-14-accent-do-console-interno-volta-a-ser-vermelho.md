# 2026-09-14 — `--accent` do console interno deixa de ser teal e volta a ser vermelho, igual ao marketplace

## Contexto

Pedido direto do usuário: trocar a cor verde/teal usada nos botões e destaques principais do console interno (herdada do artifact "Farmaura Operações", que definia `accent` como um teal reservado para ação primária, distinto do `brand` vinho usado só no chrome/rail) para vermelho, "para seguirmos o mesmo padrão visual do marketplace".

A migração de 2026-09-11 (ver [[2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes|ADR]]) tinha deliberadamente separado os tokens do console interno dos do marketplace, cada um com sua própria paleta independente — documentado em [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] como "qualquer mudança na paleta do marketplace não afeta mais o console interno, e vice-versa". Este pedido **não desfaz essa separação técnica** (os arquivos CSS continuam independentes, cada um com seus próprios tokens), mas alinha deliberadamente o valor de `--accent` do console interno à mesma cor vermelha (`--fa-primary`) já usada no marketplace, por escolha visual consciente — as duas superfícies devem se ler como o mesmo produto.

## Decisão

`internal.css` — só os 3 pontos onde `--accent`/variantes são definidos (nenhum outro arquivo tinha a cor hardcoded fora da variável, confirmado por grep):

- **Tema claro** (`:root`): `--accent` passa de `#0f6b60` (teal) para `#a11017` — o mesmo hex de `--brand` e do `--fa-primary` do marketplace ("Vinho Aura"/"Vermelho Vital"). `--accent-hover` vira `#7c0c12` (= `--brand-ink`). `--accent-soft`/`--accent-soft-strong` viram `#ffecec`/`#ffd5d5` (= `--fa-rose-soft`/`--fa-rose` do marketplace) em vez dos tons de teal claro.
- **Tema escuro** (`@media (prefers-color-scheme: dark)` e `:root[data-theme="dark"]`, os dois blocos duplicados de sempre): marketplace **não tem tema escuro** (sem precedente a copiar), então o vermelho escuro foi derivado à parte — `--accent:#e2636d` (mais claro/legível sobre fundo escuro que o vinho sólido), `--accent-hover:#ee8890`, `--accent-contrast:#2b0506` (texto escuro sobre o botão claro), soft/soft-strong em `rgba(226,99,109,...)`. Escolhido deliberadamente **diferente** do `--critical` escuro (`#f16565`) para manter a regra "dois vermelhos" (accent = ação primária/confiança, critical = erro/urgência) — não são intercambiáveis, mesmo ambos vermelhos agora.
- Comentário de topo do arquivo atualizado (linha que descrevia "accent = a ação primária (teal), reservado e raro") para refletir a nova escolha.

Como toda a UI já lia a cor exclusivamente via `var(--accent)`/`var(--accent-hover)`/etc. (nenhum hex de teal solto em nenhum outro arquivo do console interno), a troca cascateou automaticamente para todo botão primário, pill de pagamento selecionada, badge de destaque, foco de campo, toggle ativo etc. — sem precisar tocar em nenhum componente individualmente.

## Consequências

- Verificado visualmente via Chrome headless em claro e escuro: PDV (pills de pagamento, "Gerar nota fiscal"), tela de Produtos (filtro selecionado, "Novo produto", toggle ativo) — tudo consistentemente vermelho, com bom contraste nos dois temas, e sem colidir visualmente com o vermelho de erro/crítico já existente.
- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] atualizado para registrar que, apesar de tecnicamente independentes, os dois arquivos de token agora compartilham deliberadamente a mesma cor de ação primária.
- Nenhuma mudança de estrutura, só de valor de token — nenhum componente/JSX precisou ser tocado.

## Ver também

- [[2026-09-11-migracao-visual-console-interno-para-farmaura-operacoes]] — ADR que separou os tokens; contexto do porquê essa separação existia.
- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] — paleta "Warm Apothecary" e a regra "dois vermelhos" que este ADR respeita.
