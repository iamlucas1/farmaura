---
cssclasses: ia-nota
---

# 2026-09-14 — Telas de Termos de Uso, Política de Privacidade e Exclusão/Retenção de Dados

## Contexto

Usuário pediu as telas de Termos de Uso e Política de Privacidade (os links "Termos"/"Política de
Privacidade" no rodapé do login e no footer do marketplace existiam, mas eram `<a role="button">`
sem destino nenhum — confirmado por busca antes de escrever qualquer conteúdo: **não existia texto
legal real da Farmaura em lugar nenhum do repositório**). No meio do trabalho, pediu também uma
terceira: política de exclusão e retenção de dados.

Como são documentos legais para um negócio real, em pré-lançamento (2026-09-19), com pagamento real
(Asaas), dado de saúde real (receitas médicas) e LGPD aplicável, o princípio de "não fabricar" do
projeto pesou mais aqui do que em conteúdo de produto comum: identidade jurídica (razão social,
CNPJ, endereço) não pode ser inventada.

## Alternativas consideradas

- **Hardcodar CNPJ/razão social fictícios "só pra preencher a tela"** — descartado; seria
  informação legal falsa numa página que usuários reais vão ler antes de comprar remédio.
- **Bloquear o trabalho pedindo esses dados ao usuário antes de escrever qualquer linha** —
  descartado; `portal.py` (`PortalMarketplaceMetaResponse`) já tem `legal_name`/`cnpj`/
  `state_registration` como campos reais, configuráveis no console interno, e o rodapé
  (`marketplace-chrome.jsx`, `resolveMarketplaceMeta`/`resolveStoreMeta`) já lida com eles vazios
  graciosamente — bastava seguir o mesmo padrão em vez de esperar o preenchimento.
- **Confeccionar um documento jurídico completo copiando de algum boilerplate genérico da
  internet** — descartado; o conteúdo precisa refletir o que o produto realmente faz (achado via
  pesquisa no código: pagamento via Asaas sem guardar PAN/CVV, geocodificação Nominatim/OSM para
  frete, Google Analytics sem banner de cookies, preferências de comunicação reais em
  `AccountSettings`, sem exportação/exclusão de dado self-service), não um texto solto.
- **`lumosmed` tem Termos/Privacidade reais** (`lumosmed/storage/app/posts/blog/termos_uso.md`,
  `politica_privacidade.md`) — servem de esqueleto estrutural (bloco de identificação, LGPD,
  cookies, retenção, direitos do titular), mas o conteúdo é de telemedicina/prontuário, não de
  farmácia/e-commerce — reescrito do zero para a realidade da Farmaura, não copiado.

## Decisão

Três telas novas em `farmaura/react/marketplace/screens/legal-screen.jsx`
(`TermsScreen`/`PrivacyScreen`/`DataRetentionScreen`), compartilhando um único `LegalDocShell`:
sumário fixo (`.fa-legal-toc`) + seções ancoradas + card de identificação da empresa + bloco de
contato no fim, linkando os três documentos entre si. Rotas `terms`/`privacy`/`data-retention`
registradas em `marketplace-app.jsx`.

**Identidade jurídica é lida em tempo real**, nunca fixa no código: `LegalEntityBlock` chama
`resolveMarketplaceMeta`/`resolveStoreMeta` (agora exportadas de `marketplace-chrome.jsx`, antes
privadas) sobre `ctx.paymentRules`/`ctx.stores` — os mesmos campos que o rodapé já usa. Quando
`legalName`/`cnpj`/endereço estão vazios (caso atual, pré-lançamento), mostra um aviso honesto em
vez de qualquer CNPJ inventado; assim que alguém preencher esses campos no console interno, as três
páginas passam a exibir os dados reais automaticamente, sem precisar tocar neste código de novo.

**Conteúdo grounded no produto real**, não em boilerplate: Termos cobre cadastro, pedidos/Pix/cartão
via Asaas, receita médica com validação farmacêutica antes do pagamento, entrega por distância real,
cashback/assinaturas, arrependimento de 7 dias (CDC) com ressalva para medicamentos, nota fiscal via
Asaas (diferida 7 dias). Privacidade cobre exatamente os dados reais coletados, as 4 bases legais
aplicáveis, o tratamento restrito de receita como dado sensível, os 4 terceiros reais que recebem
dado (Asaas, Nominatim/OSM, Google Analytics, transportadora — nunca "vendemos dados"), e admite sem
rodeio que hoje não há central de cookies nem botão de autoexclusão/exportação. Retenção/Exclusão
detalha prazo por tipo de dado (nota fiscal: 5 anos, art. 173 CTN — fato legal geral, não específico
da empresa) e o que continua retido mesmo após excluir a conta.

**Canais de contato reais, não inventados**: WhatsApp do farmacêutico
(`buildPharmacistWhatsAppUrl`, mesmo número já usado no chat do app) é o único canal citado nas três
páginas — nenhum "dpo@"/"privacidade@" fictício, porque não existe caixa de e-mail dedicada
modelada no backend hoje.

Wiring: os links "Termos"/"Política de Privacidade" do rodapé do login (`account-screen.jsx`) e as
duas entradas do footer do marketplace (`marketplace-chrome.jsx`, coluna "Ajuda") passaram a navegar
de verdade; "Exclusão e retenção de dados" foi adicionada como terceira entrada nova no footer.

## Consequências

- **Este conteúdo não passou por revisão jurídica** — foi escrito a partir do comportamento real do
  produto (código-fonte + ADRs deste cofre), não por um advogado. Antes do lançamento
  (2026-09-19), vale confirmar com jurídico, especialmente a seção de arrependimento/exceção para
  medicamentos e os prazos de retenção.
- CNPJ, razão social, inscrição estadual e endereço da empresa continuam **não preenchidos** — as
  três páginas mostram isso honestamente em vez de esconder ou inventar; preencher em
  `PortalMarketplaceMetaResponse` (console interno) resolve nas três de uma vez.
- `resolveMarketplaceMeta`/`resolveStoreMeta` passaram de privadas a exportadas de
  `marketplace-chrome.jsx` — agora é a forma canônica de ler identidade jurídica/endereço da loja
  em qualquer tela nova, evita reimplementar o mesmo fallback em outro lugar.
- Nenhuma mudança de backend — as três telas são só apresentação sobre campos que já existiam.
- Verificação visual real (não só build): `docker compose build/up farmaura` (porta 3000) +
  screenshots via `google-chrome --headless=new --screenshot` das três páginas em desktop e mobile.

## Ver também

- [[2026-09-14-tela-de-login-redesenhada-halo-aureola-dupla|Redesenho da tela de login]] — mesma
  sessão de trabalho, é onde os links "Termos"/"Política de Privacidade" ficavam mortos antes desta
  ADR.

## Atualizações

- 2026-09-14: usuário pediu modelos "mais estilizados e bonitos" para o mesmo `LegalDocShell` — 5
  novas composições visuais (Farmacopeia, Receituário, Jornal de Bairro, Selo Oficial, Vitral),
  buscando referência fora do padrão "site de documentação" (caderno de farmacopeia, receita
  médica real, jornal impresso, certificado, o halo `--fa-aura` da tela de login), sempre sobre o
  mesmo conteúdo e os mesmos tokens. Escolhida a **Vitral**: halo de dois tons full-bleed atrás da
  página (mesmo truque de `.fa-login-aureola-bg`, agora `.fa-legal-vitral-bg`), cartão de conteúdo
  em vidro fosco (`.fa-legal-glass`, `rgba(255,255,255,.88)` + `blur(14px)`), e cada seção marcada
  por uma barra lateral colorida (rosé/vermelho/bege revezando a cada 3) no lugar do ícone que
  existia antes. O sumário lateral (`fa-legal-toc`) foi mantido — a rodada de composição visual não
  discutia a navegação em si, e um documento de 12-14 seções sem sumário perderia utilidade real.
  Aplicado nas três páginas (`LegalDocShell` é compartilhado); build limpo, container `farmaura`
  redeployado (porta 3000) e conferido visualmente em desktop e mobile nas três rotas.
- 2026-09-14: usuário reportou que o sumário lateral (`fa-legal-toc`) redirecionava para a home ao
  clicar. Causa raiz confirmada com um clique real via Puppeteer (`.fa-legal-toc a` → URL virava
  `http://localhost:3000/#sobre` em vez de `.../terms#sobre`): `marketplace.html` tem
  `<base href="/" />` (mesmo `<base>` já registrado em
  [[../06_Pendencias/vite-dev-server-pagina-em-branco-base-href|vite-dev-server-pagina-em-branco-base-href]]
  como causa da tela branca do `vite dev`), e por especificação um `<base href>` também rege a
  resolução de links **só-fragmento** (`href="#id"`) — não apenas relativos — então `#sobre`
  resolvia para `/#sobre` (a home), nunca para `/terms#sobre`. Confirmado por grep: era o único
  `href="#..."` em todo `react/marketplace/`, então não é um padrão espalhado pelo app.
  Corrigido removendo o sumário por completo (o usuário também pediu — "ainda ficou com o
  índice"), voltando o `LegalDocShell` para coluna única centralizada (`.fa-legal-single`,
  max-width 760px) com o cartão de vidro Vitral; `.fa-legal-grid`/`.fa-legal-toc*` (CSS) removidos
  junto. Build limpo, redeploy, e confirmado com um clique real (Puppeteer) que a página não tem
  mais nenhum link `href="#"` para reproduzir o bug.
- 2026-09-14: usuário pediu para reformular o cabeçalho (eyebrow "LEGAL", título, "Última
  atualização", card de identificação) — estava plano/desconectado do resto da página Vitral.
  `LEGAL` virou um selo pill rosé com ícone de escudo; título aumentado (até 42px); "Última
  atualização" virou um chip com ícone de relógio em vez de texto solto; e o card de identificação
  da empresa ganhou a mesma barra lateral rosé que já marca cada seção do conteúdo, fechando o
  vocabulário visual entre topo e corpo do documento (novas classes `fa-legal-hero`,
  `fa-legal-kicker`, `fa-legal-title`, `fa-legal-updated`, `fa-legal-intro`,
  `fa-legal-entity-bar`). Build limpo, redeploy, conferido em desktop e mobile.
- 2026-09-14: a pedido do usuário, registrada
  [[../03_Padroes_Politicas/politica-sincronizar-legal-com-mudancas-reais-de-dados|política]]
  exigindo que qualquer mudança futura em dado pessoal coletado, tratamento/compartilhamento de
  dado, ou regra de negócio que estas três páginas descrevem seja acompanhada da atualização do
  texto legal correspondente na mesma mudança — e um apontador para essa política adicionado à
  seção "Como a IA deve atuar" do `CLAUDE.md` raiz do cofre, para valer em qualquer sessão futura,
  não só quando lembrado.