# 2026-09-04 — Shell de conta unificado (`AccountNavShell`) e re-skin das 8 telas de "Minha conta" conforme o demo

## Contexto

Depois do redesenho de "Meus pedidos" ([[2026-09-04-cashback-real-no-marketplace|ADR anterior]]),
o usuário apontou que visualmente ainda não batia com o protótipo, e pediu para replicar as
demais telas do mesmo protótipo ("Padrão farmácia", Artifact `7f0765ed-…`): perfil,
configurações, assinaturas, cashback, produtos salvos, pagamentos e mensagens. Inventariando o
artifact (`data-cat="profile"/"settings"/"subscriptions"/"cashback"/"payments"/"saved"/"messages"`),
ficou claro que **todas as 8 telas de conta do demo compartilham o mesmo shell** — `.cat-crumb` +
`.account-shell` (`.account-nav` sidebar idêntica + `.account-main`) — enquanto o app real usava
um sidebar visualmente diferente (`.fa-acct-side`/`.fa-acct-nav`) só dentro de `AccountScreen`, e
Cashback/Assinaturas eram rotas de topo sem esse chrome nenhum. Esse shell diferente era
provavelmente a maior causa de "não parece igual", mais do que o conteúdo de cada tela em si.

## Decisão

**`AccountNavShell`** (novo, `account-shared.jsx`) — replica o `.cat-crumb`/`.account-shell`/
`.account-nav` do demo (usuário real, badge de pedidos, badge de saldo de cashback, sign-out) e
passa a envolver **todo** destino de conta: `AccountScreen` (por dentro, para suas 8 abas) e as
duas rotas de topo `CashbackScreen`/`SubscriptionsScreen` (por fora) — mesmo componente, mesmo
visual, em qualquer lugar da conta. `ACCOUNT_NAV_LINKS` replica os 8 links do demo, na mesma ordem,
e **acrescenta 2 destinos reais que o protótipo (estático, um subconjunto) não cobre** — "Resumo da
conta" e "Serviços de saúde" — em vez de removê-los para bater 1:1 com o demo.

**Configurações (nova aba `settings`)** absorve a antiga aba `privacy` — segurança (senha, 2FA
real via `TwoFactorModal` já existente) + preferências de comunicação (`programs`/`channels`,
mesma persistência real de antes). **Deliberadamente sem** lista de sessões ativas, alerta de
login, exportação de dados (LGPD) ou exclusão de conta — o demo mostra os quatro, mas nenhum tem
endpoint real no backend hoje; incluir seria simular funcionalidade que não existe (ver
`PRODUCT.md`). Mesmo raciocínio já usado para "Avaliar entrega" no ADR de Meus Pedidos.

**Meu perfil** — separado de Configurações (como no demo): identidade (avatar clicável = trocar
foto, real) + "Dados pessoais" com padrão visualização→edição (`Editar` revela o form; antes era
sempre-editável) + "Endereços" restilizado como lista de linhas (`.prof-addr-card`), mesmo
CRUD real de antes.

**Pagamentos** — cartões salvos mantêm o visual `.fa-paycard` (arte de cartão com gradiente por
bandeira) em vez do row simples do demo — decisão consciente: `.fa-paycard` já é uma exceção
documentada no `DESIGN.md` ("a saved-card visual is supposed to look like the real card network"),
mais realista que o placeholder do demo. Seção "Outras formas de pagamento" mostra só **Pix**
(real) — o "Dinheiro na entrega" do demo não existe como método de pagamento do marketplace
(`pickup_cash` é cobrança automática no cartão salvo na retirada, não dinheiro) e foi omitido.

**Assinaturas** — re-skin para `.sub-card`/`.sub-meta-grid` mantendo 100% da funcionalidade real
já existente (qty stepper, frequência, pular próxima, pausar/retomar, cancelar com confirmação) —
o app já tinha mais recursos reais que o protótipo estático, nada foi removido. "Economia
acumulada" do demo (histórico de entregas) não foi copiada — sem dado real de histórico de entrega
por assinatura para sustentar esse número.

**Cashback** — `.cb-balance`/`.cb-extract` reais (saldo disponível/pendente, extrato com filtro
Entradas/Saídas). **`.cb-expiry` do demo (contagem regressiva de vencimento) foi propositalmente
omitido** — não existe expiração de cashback implementada no backend
(`CashbackTransaction.expires_at_label` existe no schema, nada o calcula ou aplica), e os totais
"Entrou/Usado · 30 dias" do hero do demo também ficaram de fora — o ledger real só guarda um rótulo
de exibição ("agora"), não timestamp real, então não há como somar uma janela de 30 dias de
verdade sem inventar precisão que não existe.

**Produtos salvos** — sem mudança de conteúdo: já usava `ProductCard` no modo `variant="standard"`
(`.fa-pc-demo`), que uma sessão anterior já tinha construído especificamente para bater com o
`.card` bare deste mesmo demo. Só passou a herdar o novo shell.

**Mensagens** — escopo intencionalmente **parcial** nesta leva: só o cabeçalho da aba "Mensagens"
foi ajustado para o padrão visual novo (`.orders-head`/`.cart-title`). O componente que renderiza
as conversas de verdade (`PharmacistChatInbox`/`PharmacistChatPanel`,
`marketplace-care-actions.jsx`) **não** foi reescrito para o layout `.msgs-shell`/`.msg-in`/
`.msg-out` do demo — ele já tem estilo próprio funcionando (`.fa-chat*`) com lógica real não
trivial (polling, anexos, WhatsApp fallback, pedido de desbloqueio, troca de thread), e é
compartilhado com o modal de chat flutuante usado em vários pontos do app. Reescrever esse
componente por inteiro para bater pixel-a-pixel com o demo é trabalho maior e mais arriscado do
que o resto desta leva — decisão consciente de não arriscar quebrar chat real por fidelidade
visual, registrada como pendência.

## Consequências

- Nenhuma migration, nenhum endpoint novo — troca puramente de apresentação sobre dado já real.
- CSS novo em `marketplace.css` (~230 regras portadas do artifact: `.account-shell`/`.account-nav*`,
  `.sub-card*`, `.set-*`, `.prof-*`, `.cb-*`, `.ghost-btn`, `.cat-crumb*`), sem colisão com as
  classes reais de `ProductCard`/`.fa-pc-demo` (confirmado via grep antes de colar).
- Build de produção (`docker compose build farmaura`) rodado e limpo a cada etapa; **sem
  verificação visual via navegador/Playwright** — mesma limitação de ferramental já registrada no
  ADR anterior.
- Pendência nova: [[../06_Pendencias/mensagens-sem-restyle-completo-do-demo|restyle completo de
  Mensagens para o layout `.msgs-shell` do demo]].

## Atualizações

- 2026-09-04: A pedido do usuário ("vamos por parte, remova o resumo da conta"), o link "Resumo da
  conta" foi removido de `ACCOUNT_NAV_LINKS` (`account-shared.jsx`) e a função `AccountSummary`
  inteira foi apagada de `account-screen.jsx` (junto com `ACCT_TABS`, que só existia para alimentar
  essa tela). `AccountScreen` agora abre em **"Meu perfil"** por padrão quando nenhuma `tab` é
  passada (`route.tab || 'profile'`) — o demo nunca teve conceito de dashboard, e toda entrada real
  em `/account` já especifica uma aba explícita, então não havia dependência real no fallback
  `'summary'` anterior (confirmado por grep antes da remoção).
  **Efeito colateral não resolvido nesta leva**: o link "Cuidado Farmaura → Conhecer todos" dentro
  de `AccountSummary` era o **único** ponto de entrada real para a rota `care`
  (`CareScreen`/`care-screen.jsx`, registrada em `marketplace-app.jsx`). Com `AccountSummary`
  removida, essa rota ficou órfã — só alcançável hoje via navegação programática direta, sem link
  visível em nenhum lugar do app (confirmado via grep: `care-screen.jsx`, `account-screen.jsx` antes
  da remoção e `marketplace-app.jsx` eram os únicos 3 arquivos com referência). `CareScreen` não foi
  apagado nem uma nova entrada foi criada — decisão de não decidir por conta própria uma remoção
  adicional de superfície que o usuário não pediu explicitamente. Ver
  [[../06_Pendencias/care-screen-orfa-apos-remocao-do-resumo-da-conta|pendência]].
- Build (`docker compose build farmaura`) limpo e container `farmaura` redeployado localmente
  (porta 3000, `healthy`) após a remoção; sem verificação visual via navegador nesta leva também.
- 2026-09-04/05: dois ajustes pedidos pelo usuário no submenu de conta (`ACCOUNT_NAV_LINKS`,
  `account-shared.jsx`): (1) "Meu perfil" reordenado para o primeiro item da lista (era o
  penúltimo, na ordem original do demo) — a ordem do submenu não bate mais 1:1 com o artifact.
  (2) Corrigido bug visual do avatar circular do submenu (`.profile-avatar`, `marketplace.css`):
  faltava `flex: none` no span dentro do `.account-nav-user` (flex row), então o avatar
  espremia de largura e ficava oval em vez de circular; e o avatar do submenu passou a exibir a
  foto real do cliente (`profile.photo`) em vez de sempre mostrar as iniciais — só a tela "Meu
  perfil" (`.prof-avatar-lg`) mostrava a foto de verdade até então.
  Nesse mesmo pedido, o upload de foto de perfil (`ProfileManage`, `account-profile-screen.jsx`)
  ganhou um passo de **recorte antes de salvar**: novo componente `PhotoCropModal` (canvas nativo,
  sem biblioteca externa) deixa arrastar para reposicionar e usar um slider de zoom sobre um
  círculo-guia antes de confirmar; só então `ctx.saveCustomerAvatar` é chamado com o recorte final
  (quadrado 512×512, mesma compressão JPEG progressiva que já existia). Antes, a foto ia direto do
  seletor de arquivo do sistema operacional para o avatar circular, sem controle de enquadramento
  — daí fotos cortadas/deslocadas quando o formato original não era quadrado. Build limpo e
  container redeployado local (porta 3000, `healthy`); sem verificação visual via navegador
  também nesta leva.

## Ver também

- [[2026-09-04-cashback-real-no-marketplace|Cashback real no marketplace + primeiro redesenho de Meus pedidos]]
- [[../09_Design_Visual/Sistema_de_Design|Sistema de Design]] — `.fa-paycard` como exceção documentada de paleta.
