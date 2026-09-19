---
cssclasses: ia-nota
---

# 2026-09-14 — Indexação seletiva: home/catálogo indexáveis, telas privadas e legais com `noindex`

## Contexto

Usuário pediu para manter a tela principal e as páginas de produto indexáveis pelo Google, mas
excluir login, criar conta, primeiro acesso, termos "e etc" da indexação.

O marketplace é uma SPA client-side sem SSR (`farmaura/react/marketplace/`, um único
`marketplace.html` servido como shell para qualquer rota pelo nginx — ver comentário em
`docker/web/nginx.conf`). Isso significa que **não existe HTML diferente por rota**: qualquer
controle de indexação por página precisa acontecer via JavaScript depois que a SPA monta, não no
HTML estático.

## Decisão

Novo hook `useMarketplaceRobotsMeta(route)` (`marketplace-app.jsx`, ao lado do já existente
`useMarketplaceDocumentTitle`, mesmo padrão): a cada troca de rota, cria/atualiza uma tag
`<meta name="robots">` no `<head>` com `index, follow` ou `noindex, nofollow`, decidido por um Set
`MARKETPLACE_NOINDEX_ROUTES`.

**Ficam com `noindex, nofollow`**: `login` (cobre entrar/criar conta/primeiro acesso — os três modos
vivem na mesma rota), `unlock-account`, `terms`, `privacy`, `data-retention`, `account`, `orders`,
`cart`, `checkout`, `confirm`, `cashback`, `saved`, `chats`, `search`, `discover`. São todas rotas
privadas (exigem login ou são específicas de sessão/carrinho), transacionais, ou de resultado de
busca/algorítmicas — sem valor de SEO próprio e potencialmente conteúdo fino/duplicado.

**Seguem `index, follow`** (nada mudou nelas, só ficou explícito): `home`, `category`, `brand`,
`offers`, `trends`, `shop`, `product`, `bula`, `services`, `subscriptions`, `care` — catálogo e
páginas de marketing, as mesmas já listadas em `public/sitemap.xml`.

**`robots.txt` deliberadamente não tocado.** Combinar `Disallow` (robots.txt) com `noindex` (meta
tag) no mesmo conjunto de URLs é contraindicado pela própria documentação do Google: `Disallow`
impede o Googlebot de sequer rastrear a página, então ele nunca chega a ver a tag `noindex` — se a
URL for descoberta por outro caminho (link externo, por exemplo), pode continuar aparecendo no
índice sem nenhuma informação, em vez de ser corretamente excluída. Manter `robots.txt` permissivo
(como já estava) e usar só a meta tag garante que o Google rastreie, veja o `noindex` e
efetivamente remova/nunca indexe essas URLs.

## Consequências

- Depende do Googlebot executar JavaScript (ele faz, em uma segunda onda de rastreamento) — não há
  garantia de que a tag apareça na primeira leitura do HTML cru, só depois da SPA montar. Sem SSR,
  esse é o único mecanismo disponível por rota.
- `sitemap.xml` já não listava nenhuma dessas rotas — nada a mudar lá.
- Se uma rota nova privada/transacional for adicionada no futuro, precisa entrar manualmente em
  `MARKETPLACE_NOINDEX_ROUTES` — não há detecção automática de "rota exige login" aqui.
- Build limpo, container `farmaura` redeployado (porta 3000), confirmado com Puppeteer real
  (navegação + leitura da tag `<meta name="robots">`) em 8 rotas, cobrindo os dois grupos.

## Ver também

- [[2026-09-14-telas-de-termos-privacidade-e-retencao-de-dados|Telas de Termos/Privacidade/Retenção]] — três das rotas agora com `noindex`.