# 2026-08-03 — Marcas em destaque: aviso visual para logo salvo sem nome (causa raiz de "salvei mas não apareceu")

## Contexto

Usuário relatou: "salvei as logos mas não apareceu no marketplace". Investigação (API real +
Playwright) encontrou a causa: `GET /portal/marketplace/public-bootstrap` retornava
`home_brands.mode: "on"` com 7 círculos, todos com `image` preenchida e `brand_name: ""` (vazio).

Raiz do comportamento (não é bug novo, é um efeito colateral do design já existente desde o ADR
original): o upload de logo (individual ou em lote,
[[2026-08-02-marcas-em-destaque-datalist-carrossel-e-layout-ponta-a-ponta|ver ADR anterior]]) salva a
imagem no servidor **na hora**, via `saveHomeBrands({...}, {silent:true})`. Já o campo "Nome da
marca" só persiste quando o admin clica no botão final "Salvar marcas em destaque" — se o admin subiu
os logos e saiu da tela sem preencher+salvar os nomes, a imagem fica salva mas o nome não.

O efeito visível — a tira sumir **inteira**, não só o texto do nome — vem de
`normalizeHomeBrands()` em `farmaura/react/marketplace/core/marketplace-app.jsx:576-588`:
`.filter((circle) => circle.image && circle.brandName)` descarta qualquer círculo sem nome (um
círculo sem nome não tem para onde levar o clique — a rota `/brand/<nome>` ficaria vazia). Com os 7
círculos todos sem nome, nenhum passa no filtro e a home renderiza `home_brands.circles: []`.

## Decisão

Adicionar aviso visual em `home-brands-screen.jsx` (só UI, nenhuma mudança de contrato/backend):

1. **Banner agregado** (mesmo estilo do banner "modo desativado" já existente, cor
   `var(--fa-warn)`): aparece quando `unnamedCount > 0` (algum círculo com `image` mas sem
   `brandName`), explicando que o logo já foi salvo mas o círculo não aparece no marketplace sem o
   nome.
2. **Destaque por card**: borda e fundo em `var(--fa-warn)` no card do círculo incompleto, borda do
   input também em `var(--fa-warn)`, e uma linha "Sem nome — não aparece no marketplace" abaixo do
   campo.

Nenhuma mudança no filtro do marketplace (`normalizeHomeBrands`) — o comportamento de esconder
círculo sem nome é correto e deliberado (evita link quebrado pro cliente final); o problema era só
falta de visibilidade dessa regra no console.

## Consequências

- Verificado com o dado real do usuário (7 círculos, na época todos sem nome) — banner e bordas
  âmbar apareceram corretamente nesse estado. Entre o diagnóstico e a implementação do aviso, o
  usuário preencheu e salvou os 7 nomes por conta própria; ao rebuildar o container pra testar,
  os círculos já estavam completos (Cimed, Nivea, Johnson & Johnson, La Roche-Posay, Vichy, Neo
  Química, EMS) e a tira já aparecia normalmente no marketplace — confirmado via screenshot, sem
  nenhum aviso residual (esperado, já que não há mais círculo incompleto).
- Sem migration, sem mudança de schema/API.

## Ver também

- [[2026-08-02-marcas-em-destaque-datalist-carrossel-e-layout-ponta-a-ponta|ADR anterior (datalist,
  carrossel, layout ponta a ponta)]].
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]].
