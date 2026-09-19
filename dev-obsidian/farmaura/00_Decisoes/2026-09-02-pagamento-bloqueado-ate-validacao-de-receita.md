---
cssclasses: ia-nota
---

# 2026-09-02 — Pagamento do checkout bloqueado até validação farmacêutica da receita

## Contexto

Pedido do usuário: para itens com receita, o pagamento no marketplace deve ficar **bloqueado**
até que o farmacêutico valide a receita — não apenas um lembrete visual, um bloqueio de verdade.
Fluxo pedido, em 4 partes:

1. Na revisão (carrinho), o produto com receita mostra um alerta com botão para enviar a receita.
2. O envio abre o chat com o farmacêutico (arquivo digitalizado ou link).
3. O farmacêutico aprova ou nega pelo chat/sistema interno, vinculado ao pedido.
4. Aprovar libera a compra; negar exige motivo, que aparece no chat para o cliente.

Achado ao investigar: a maior parte da infraestrutura de receita já existia e estava madura —
`Prescription`/`PrescriptionItem`/`PrescriptionFile` (modelos), `PrescriptionService.decide()` já
validava motivo obrigatório na recusa, o console interno já tinha os botões "Validar"/"Recusar"
tanto na tela de Chat quanto na tela dedicada "Receitas" (`prescriptions-screen.jsx`), e o widget
de chat do marketplace já tinha upload de arquivo (`submit_customer_prescription`) com badge de
status ao vivo. O que faltava era especificamente: (a) o **gate real de pagamento** no checkout —
nada olhava pro status da receita antes de deixar confirmar o pedido — e (b) o **motivo da recusa**
nunca era coletado na UI (nem chat, nem tela de Receitas — os dois só mandavam uma string fixa
"Recusada pelo farmacêutico.", que o backend inclusive já rejeitava com 422 já que
`PrescriptionDecisionRequest` exige `rejection_reason` não vazio quando `status == "rejected"` —
ou seja, **recusar já estava quebrado antes desta sessão**, só nunca tinha sido exercitado
ponta-a-ponta).

## Alternativas consideradas

- **Gate por SKU** (aprovar receita libera só os itens daquele medicamento específico) —
  descartada por escopo: o modelo de dados já trata a receita como algo do PEDIDO inteiro
  (`order.prescription_status`, um valor só), não por item. Seguir o mesmo grão: um gate por
  carrinho/checkout, não por produto individual.
- **Endpoint de "status da receita" vinculado a um pedido** — não dá, porque neste ponto do fluxo
  **o pedido ainda não existe** (o gate acontece ANTES de `Confirmar e pagar`, de propósito). Toda
  a maquinaria pós-pedido já existente (`order.prescription_status`,
  `PrescriptionService._apply_decision_to_order`, cancelamento automático se recusada depois de
  criado o pedido) continua intacta e **não foi tocada** — ela cobre o caso de uma receita
  reprovada depois que o pedido já foi criado (ex: PDV). O gate novo cobre o caso ANTES do pedido
  existir, que é o que o pedido do usuário descreve.
- **Novo endpoint `GET /customers/me/prescription-status`**, escolhida: retorna a prescrição mais
  recente do cliente com `order_id IS NULL` (nunca vinculada a um pedido ainda) — simples,
  reaproveita 100% do modelo/fluxo de decisão já existente, sem precisar inventar um novo conceito
  de "sessão de checkout".

## Decisão

**Backend:**
- `PrescriptionRepository.get_latest_for_customer` — última prescrição do cliente sem `order_id`,
  fonte de verdade do gate.
- `CustomerService.get_prescription_status` + rota `GET /customers/me/prescription-status` —
  devolve `status` (`none|pending|approved|rejected`), `rejection_reason`, `prescription_id`.
- `ChatService.post_prescription_decision_message` — ao aprovar/recusar, posta uma mensagem de
  texto simples (não `prescription_request`, sem re-render do card de decisão) na thread de
  origem, achada via `ChatRepository.get_message_by_prescription_id` (nova). Silenciosamente não
  faz nada se a receita não veio do chat (ex: fluxo PDV, sem thread pra postar).
- `PrescriptionService.decide()` passou a chamar isso antes do commit final, e corrigido **um bug
  real e pré-existente**: depois do `session.commit()`, o método reconsultava a fila
  (`list_review_queue()`) sem reaplicar o contexto RLS da sessão — o mesmo padrão já documentado
  em `CustomerService.upsert_cart_item` ([[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|nota de RLS]]).
  Isso fazia `decide()` **sempre estourar 500** ("Prescription payload unavailable after update.")
  depois de gravar a decisão com sucesso — recusar/aprovar nunca tinha funcionado de ponta a ponta
  antes, mascarado porque ninguém tinha testado o fluxo completo até agora. Corrigido com
  `apply_tenant_context(self.session, self.subject)` logo após o commit.

**Console interno (farmacêutico):**
- Tanto o card de receita no Chat (`chat-screen.jsx`) quanto a tela dedicada "Receitas"
  (`prescriptions-screen.jsx`) ganharam um campo de motivo obrigatório antes de confirmar a
  recusa (textarea + "Confirmar recusa", desabilitado até ter texto) — antes mandavam um motivo
  fixo hardcoded, que o backend já rejeitava (ver bug acima). `validateRx` agora aceita o motivo
  como terceiro argumento.

**Marketplace (cliente):**
- `marketplace-app.jsx`: novo estado `prescriptionStatus` + `refreshPrescriptionStatus`, buscado
  no bootstrap e **em poll de 8s** enquanto o cliente estiver em `/cart` ou `/checkout` com item de
  receita no carrinho e status ainda não aprovado — mesmo raciocínio do poll de chat já existente
  dos dois lados (sem push/real-time, o farmacêutico pode decidir enquanto o cliente está com o
  chat aberto esperando).
- `cart-screen.jsx`: badge de receita no item passou a refletir o status real (`Receita
  necessária` / `em análise` / `validada` / `recusada` + motivo inline), não mais um rótulo fixo.
- `checkout-screen.jsx`: na etapa "3 Pagamento", se o carrinho tem item de receita e o status não
  é `approved`, o formulário de pagamento é substituído por um card de bloqueio (texto muda
  conforme `none`/`pending`/`rejected`, com botão que abre o chat) e o botão final vira "Pagamento
  bloqueado" (desabilitado) em vez de "Confirmar e pagar".

**Bug adicional encontrado e corrigido durante o teste ponta-a-ponta:** o estado
`addingNewAddress` do checkout (ver
[[2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|ADR do carrinho/checkout]]) era
inicializado uma única vez via `useState(() => addresses.length === 0)` — num F5 direto em
`/checkout`, o fetch de endereços ainda não tinha resolvido no primeiro render, então esse valor
travava em `true` para sempre, reabrindo o formulário completo de endereço mesmo quando o cliente
já tinha um endereço salvo. Corrigido: o efeito que auto-seleciona o endereço principal assim que
`addresses` chega agora também desliga `addingNewAddress` nesse exato momento — sem interferir
numa abertura manual genuína (esse efeito só age enquanto nenhum endereço foi selecionado ainda).

## Segunda rodada (2026-09-02, mesmo dia): receita física não pode ser "digitalizada"

Correção de rumo do usuário, ainda no mesmo dia: uma receita física (nasceu em papel) **não pode**
ser enviada como foto/PDF pelo chat — por lei, o original precisa ficar retido na farmácia no ato
da dispensação; uma foto não substitui isso. Só receita **digital de verdade** (PDF assinado, link
de plataforma de receita digital) pode seguir o fluxo de upload construído na primeira rodada. Uma
receita física precisa ser (a) retirada presencial, com o original nas mãos, e (b) cobrada só na
retirada — o cliente pode pré-pedir, sem pagar nada agora.

### Decisão

- **Modal "Como é a sua receita?"** (`PrescriptionKindModal`, `marketplace-components.jsx`) — novo
  primeiro passo antes de qualquer envio, no carrinho e no checkout. "Digital" segue o fluxo já
  construído (chat, `prescriptionStatus`, gate de pagamento online). "Física" nunca abre o chat —
  só declara `prescriptionKind = 'physical'` (estado client-side em `marketplace-app.jsx`, **sem
  modelo de servidor por trás** — decisão consciente, ver Consequências).
- **Entrega travada em retirada**: com receita física declarada, `checkout-screen.jsx` filtra a
  lista de métodos de entrega pra mostrar só "Retirar na loja" (não desabilita as outras — remove,
  já que o motivo é regulatório, não de cobertura de endereço) e um efeito força
  `delivery.method = 'pickup'` toda vez que `hasRx && prescriptionKind === 'physical'` mudar.
- **Pagamento na retirada, não cobrado agora**: novo método de pagamento `pickup_cash` (schema
  `CheckoutPaymentRequest`, backend). `OrderService.create_marketplace_order` pula inteiramente a
  chamada ao Asaas para esse método — nenhum `charge_pix`/`charge_card` — e grava
  `order.payment_status = 'pending_pickup'` direto, sem `gateway_payment_id`. Validado
  server-side (não só no front): 422 se `payment.method == 'pickup_cash'` e
  `delivery.method != 'pickup'`. Cobrança real acontece fisicamente no balcão (dinheiro, maquininha
  — fora do sistema), exatamente como já acontecia no PDV com pagamento em dinheiro — decisão
  confirmada com o usuário via pergunta direta antes de implementar (a alternativa seria tokenizar
  o cartão agora e cobrar via Asaas só na confirmação da retirada; descartada por complexidade
  desproporcional ao pedido).
- **Validação da receita física continua acontecendo — só que presencialmente**: nenhum mecanismo
  novo de aprovação foi construído pra esse caminho. O pré-pedido já nasce com
  `order.requires_prescription_review = true` e um `Prescription` vinculado ao pedido (mecanismo
  **já existente**, `OrderService._create_prescription_snapshot`, chamado pra qualquer pedido com
  item de receita, independente do canal) — o farmacêutico vê o pedido na mesma fila "Receitas" já
  usada pra tudo, confere o papel original na retirada, e aprova pelo mesmo `PrescriptionService.decide()`
  já corrigido na primeira rodada. `advance_internal_order` já bloqueava NEW→SEPARATING→READY
  enquanto `order.prescription_status == 'pending'` (mecanismo pré-existente, não tocado) — então o
  pedido fisicamente não avança até a aprovação presencial, sem precisar de nenhum gate novo no
  board interno.
- Tela de confirmação (`ConfirmScreen`) e listagem de pedidos ganharam um terceiro estado de
  pagamento (`pending_pickup`, ao lado de `approved`/pendente-Asaas): "Pré-pedido confirmado!",
  "Pagamento: Na retirada", sem QR code Pix.

### Bug real encontrado e corrigido no caminho: `prescription_checks` nunca aceitava INSERT de cliente

Ao testar o pré-pedido físico ponta a ponta, `POST /orders` falhava com erro de conexão no
navegador (`net::ERR_FAILED`) — não um 4xx limpo, uma falha bruta. Log do backend:
`psycopg.errors.InsufficientPrivilege: new row violates row-level security policy for table
"prescription_checks"`, disparado dentro de `_create_prescription_snapshot` (que insere 4 linhas
de checklist pra toda prescrição nova, sempre existiu, não é código desta sessão).

Causa raiz: a policy `prescription_checks_access_policy`
(`app/core/row_level_security.py`) usava uma condição própria, incompleta —
`reviewed_by_user_id = current_user_id() OR role IN ('admin','manager','pharmacist')` — em vez do
helper `app_private.can_access_prescription_row(customer_id, reviewed_by_user_id)` já usado por
`prescription_files_access_policy`/`prescription_items_access_policy` na mesma tabela pai. Esse
helper inclui `target_customer_id = current_customer_id()`; a versão inline de
`prescription_checks` não — então **o próprio cliente nunca conseguia inserir o checklist da
prescrição do pedido que ele estava criando** (o farmacêutico ainda não revisou, `reviewed_by_user_id`
é `NULL` nesse momento). Isso significa que **todo pedido de marketplace com item de receita
sempre falhou ao ser finalizado**, em qualquer canal de pagamento — não é um bug introduzido por
esta feature, só nunca tinha sido exercitado ponta a ponta antes (o teste da primeira rodada
validou o gate de pagamento, mas nunca chegou a colocar um pedido real com item de receita).
Corrigido trocando a condição inline pelo mesmo helper `can_access_prescription_row` — mesmo padrão
já usado nas duas tabelas irmãs. `bootstrap_database.py` reaplica RLS a cada start do container
(idempotente), então bastou rebuild + restart do `farmaura-api`.

### Verificação

Playwright ponta a ponta, duas contas reais: cliente escolhe "física" no badge do carrinho →
checkout mostra só "Retirar na loja" (demais métodos ausentes) → etapa de pagamento mostra painel
"Pagamento na retirada" (sem seletor pix/cartão) → "Confirmar pré-pedido" → `POST /orders` 200,
`payment_status = 'pending_pickup'`, sem `gateway_payment_id`, `requires_prescription_review = true`,
`prescription_status = 'pending'` (confirmado direto no Postgres) → tela de confirmação mostra
"Pré-pedido confirmado!"/"Na retirada" → pedido aparece na fila "Receitas" do console interno,
`admin` aprova via "Validar e liberar" → `prescription_status` vira `approved` no banco. Fluxo
digital (primeira rodada) retestado sem regressão até o ponto de bloqueio de pagamento.

## Terceira rodada (2026-09-02, mesmo dia): reorganização visual — "ficou confuso"

Feedback direto do usuário após a segunda rodada: o fluxo de receita ficou espalhado e duplicado
entre carrinho e checkout (botão + modal em dois lugares, endereço escondido na lateral direita
onde ninguém olha primeiro). Ajuste puramente de organização/local, nenhuma regra de negócio nova:

- **Carrinho (`cart-screen.jsx`)**: o item com receita agora mostra só um aviso estático
  ("Receita obrigatória para este item"), sem botão nem modal — `PrescriptionKindModal`,
  `openPrescriptionFlow` e o CTA de status (`RX_STATUS_COPY`) saíram inteiramente do carrinho.
  Escolher digital/física e enviar a receita agora só acontece na etapa de Pagamento.
- **Recorrência mais clara**: painel de "Compra recorrente" ganhou uma linha própria
  "Quantidade por entrega" com o mesmo `QtyStepper`/`updateQty` já usado no item (não é um campo
  novo no backend — é o mesmo `item.qty`, só exposto dentro do próprio painel de recorrência em
  vez de só no canto direito da linha, onde a relação "essa quantidade é a que repete todo mês"
  não ficava óbvia).
- **Checkout, etapa Entrega**: "Como você quer receber?" e "Entregar para" — antes escondidos na
  barra lateral direita — viraram os primeiros elementos da coluna principal (esquerda), no topo,
  antes até do nome/telefone do destinatário. Nenhuma menção a receita nesta etapa. A barra lateral
  ficou só com a lista de itens + totais.
- **Checkout, etapa Pagamento**: quando há item de receita, mostra o produto real (imagem + nome +
  "Receita obrigatória") antes de qualquer pergunta — depois disso, o mesmo fluxo já existente
  (escolher digital/física → se digital, pendente/recusada/aguardando envio).
- **Envio de receita digital não abre mais o modal grande** (`PharmacistChatModal`) — abre o popup
  pequeno do widget flutuante (`ChatWidget`) no canto da tela, no lugar. Isso exigiu uma mudança
  real (não só de onde chamar): `ChatWidget` não tinha nenhuma forma de ser aberto
  programaticamente de fora — seu estado `open` é interno, persistido em `sessionStorage`, só
  alternado pelo próprio clique na bolha. Adicionado um prop `openSignal` (um contador — mudar de
  valor, não o valor em si, é o sinal) que o widget escuta num efeito pra chamar `setOpen(true)`
  sem tomar posse do estado. `marketplace-app.jsx` ganhou `openWidgetChatPanel()` (garante a
  thread + incrementa o sinal) e um novo campo de ctx com o mesmo nome; `PrescriptionKindModal`
  (opção "Digital") e o botão "Enviar receita"/"Abrir chat" da etapa de Pagamento passaram a usar
  isso em vez de `openPrescription()` (que ainda existe e ainda abre o modal grande — só deixou de
  ser chamado a partir daqui).

Confirmado por pergunta direta ao usuário antes de implementar: a escolha digital/física continua
existindo (modal `PrescriptionKindModal` mantido), só mudou de lugar — de carrinho para pagamento.

Verificado via Playwright: aviso sem botão no carrinho, quantidade por entrega visível ao ativar
recorrência, etapa de Entrega sem nenhuma menção a receita com método+endereço no topo da coluna
principal, etapa de Pagamento mostrando o produto real antes do aviso, escolher "digital" abre o
popup pequeno do widget (confirmado: modal grande com contagem 0, painel do widget com
`data-open="1"`) com uma thread real já pronta pra anexar o arquivo, fluxo de receita física
retestado sem regressão (retirada-only e pagamento-na-retirada intactos).

## Quarta rodada (2026-09-02, mesmo dia): nome/telefone de quem recebe vira parte do endereço

Pedido do usuário: "Nome completo"/"Telefone" no checkout eram campos soltos, digitados de novo a
cada compra — deveriam ser parte do **cadastro do endereço**, com opção "Eu mesmo" (puxa do
perfil) ou "Outra pessoa" (nome/telefone de quem realmente vai receber ali). E quando o cliente
escolhe cadastrar um endereço novo, o card "Entregar para" (mostrando o endereço antigo
selecionado) deveria sumir — mostrar isso ao lado de um formulário de endereço em branco lia como
duas respostas contraditórias pra mesma pergunta.

### Achado: o dado já existia, só não tinha UI

`CustomerAddress` (`app/models/customer_address.py`) já tem colunas `recipient_name`/
`recipient_phone`, os schemas (`CustomerAddressResponse`/`CustomerAddressUpsertRequest`) já as
expõem, e `marketplace-app.jsx` (`fromBackendAddress`/`toBackendAddressPayload`) já fazia o
mapeamento nos dois sentidos — só nunca tinha campo nenhum no `AddressForm` pra realmente
preenchê-las. Nenhuma mudança de backend/schema foi necessária, só frontend.

### Decisão

- **`marketplace-address.js`**: `createEmptyAddress`/`normalizeAddress` passaram a incluir
  `recipientName`/`recipientPhone` no formato normalizado (antes só sobreviviam por acaso, via
  spread, sem default nem normalização de tipo).
- **`AddressForm`** (`account-profile-screen.jsx`, compartilhado entre "Gerenciar perfil" e o
  checkout) ganhou um seletor "Quem vai receber" — dois `.fa-chip` ("Eu mesmo"/"Outra pessoa", já
  existentes no design system, sem CSS novo). "Eu mesmo" preenche `recipientName`/`recipientPhone`
  com `selfName`/`selfPhone` (dois novos props — cada chamador passa `profile.name`/`profile.phone`);
  "Outra pessoa" revela dois campos livres. Detecção do estado inicial ao editar um endereço
  existente: bate contra `selfName`/`selfPhone` pra decidir qual chip já vem ativo.
- **Checkout (`checkout-screen.jsx`)**: removidos os campos soltos "Nome completo"/"Telefone" do
  step de Entrega — o efeito que já sincroniza CEP/rua/etc do endereço selecionado para
  `delivery` passou a sincronizar `recipientName`/`phone` também, lidos de
  `selectedAddress.recipientName`/`recipientPhone` (com fallback pro perfil se o endereço nunca
  teve isso preenchido — dado legado). O card "Entregar para" ganhou uma linha "Recebe: {nome} ·
  {telefone}" com esse dado.
- **"Entregar para" some ao adicionar novo endereço**: a condição de exibição do card passou a
  exigir `!addingNewAddress`. No lugar, quando existem endereços salvos, aparece um prompt
  "Prefere usar um endereço já salvo?" com botão "Selecionar endereço salvo" que cancela o modo
  "novo" e reabre o modal de escolha — sem essa opção sumir de vez, só reordenada pra não coexistir
  visualmente com o formulário em branco.

### Verificação

Playwright: endereço existente mostra "Recebe: Mariana Souza · +55 61 99811-2201" na etapa de
Entrega, sem nenhum campo solto de nome/telefone; abrir "Cadastrar novo endereço" esconde o card
"Entregar para" antigo e mostra o prompt "usar endereço salvo"; toggle "Outra pessoa" revela os
campos, preenchidos ("João da Entrega" · "(61) 91234-5678"), CEP real resolvido via ViaCEP,
`POST /customers/me/addresses` 200, endereço selecionado automaticamente após salvar, recap
mostrando exatamente o destinatário digitado.

## Quinta rodada (2026-09-02, mesmo dia): editar endereço salvo direto do modal de escolha

Pedido do usuário: dentro do modal "Escolher endereço de entrega", um ícone pra editar um
endereço já salvo — caso o cliente tenha digitado algo errado e salvo mesmo assim, sem precisar
apagar e recadastrar do zero.

### Decisão

- Cada linha do modal ganhou um botão-ícone (lápis, `.fa-iconbtn`, mesmo padrão já usado em
  "Gerenciar perfil") que abre o mesmo `AddressForm` já usado pra "Cadastrar novo endereço" — só
  que pré-preenchido com os dados daquele endereço e salvando via `PUT` (`updateCustomerAddress`)
  em vez de `POST`. Novo estado `editingAddressId` (distinto de `addingNewAddress`); um booleano
  derivado `isEditingAddress = addingNewAddress || !!editingAddressId` agora governa tanto o
  esconder do card "Entregar para" quanto qual formulário mostrar.
- **Correção de HTML inválido no caminho**: a linha de cada endereço no modal já era um
  `<button>` clicável (selecionar o endereço); colocar o novo botão de editar *dentro* dele seria
  `<button>` aninhado em `<button>` — inválido, com comportamento imprevisível entre navegadores.
  Trocado o contêiner da linha de `<button>` para `<div role="button" tabIndex={0}>` com
  `onClick`/`onKeyDown` (Enter/Espaço) equivalentes, permitindo o botão de editar real como filho
  direto, com `event.stopPropagation()` pra não disparar a seleção do endereço junto.
- O prompt "Prefere usar um endereço já salvo?" (rodada 4) permanece só para o fluxo de
  **adicionar** novo — editar um já tem seu próprio "Cancelar" no formulário, que basta pra voltar
  ao estado normal sem confundir os dois fluxos.

Verificado via Playwright: ícone de editar aparece em cada linha do modal, clicar nele fecha o
modal e abre o formulário já preenchido com os dados reais do endereço (rua, número, etc.),
editar o complemento e salvar dispara `PUT /customers/me/addresses/{id}` (200) — não um `POST`
novo — e o card "Entregar para" reflete a edição imediatamente, sem duplicar o endereço.

## Sexta rodada (2026-09-02, mesmo dia): formulário de endereço vira modal + gate de "Continuar" no checkout

Dois pedidos do usuário no mesmo turno: (1) o formulário de cadastro/edição de endereço (rodadas 4
e 5) estava inline na página de checkout — colocar numa modal de verdade; (2) o cliente não pode
avançar para pagamento se o endereço estiver incompleto/errado.

### Decisão

- **`AddressForm` (`account-profile-screen.jsx`)** ganhou validação própria antes do "Salvar":
  `missingFields` lista o que falta (nome/telefone de quem recebe, CEP com 8 dígitos, rua, bairro,
  cidade, UF), botão "Salvar endereço" fica `disabled` enquanto a lista não estiver vazia, com um
  hint visível listando exatamente o que falta. **"Número" só é exigido para endereço novo**
  (`isNewAddress = !initial || !initial.id`) — achado no meio do trabalho: o backend não tem coluna
  separada de número, `street_line` é uma string mesclada "rua, número"
  (`toBackendAddressPayload`), e `fromBackendAddress` sempre devolve `number: ''` na leitura. Exigir
  "número" de novo ao editar um endereço já existente bloquearia salvar qualquer endereço antigo (o
  campo sempre chega vazio) ou faria o cliente duplicar o número dentro de `street` ao redigitá-lo.
  Não é uma correção da arquitetura (fora de escopo, exigiria migration) — só a validação nova
  respeitando como o dado já se comporta.
- **`checkout-screen.jsx`**: novo `isEditingAddress = addingNewAddress || !!editingAddressId`
  passou a abrir um `Modal` de verdade (`addressFormModal`, título "Cadastrar novo endereço" ou
  "Editar endereço") em vez do bloco inline anterior — o card "Entregar para" agora aparece sempre
  que `delivery.method !== 'pickup'`, sem mais o workaround da rodada 4 ("Prefere usar um endereço
  já salvo?"), porque a modal já separa naturalmente os dois estados.
- **Gate de "Continuar" no step de Entrega**: novo helper `isAddressComplete(address)` (CEP de 8
  dígitos, rua, bairro, cidade, UF de 2 letras — propositalmente sem checar `number` pelo mesmo
  motivo acima, e sem checar nome/telefone de quem recebe porque há fallback pro perfil) e
  `deliveryReady` (endereço completo pra entrega, ou loja escolhida pra retirada). O botão
  "Continuar" fica `disabled` até `deliveryReady`, com aviso inline explicando o motivo — tanto
  dentro do card "Entregar para" quanto ao lado do botão.
- Correção de HTML no caminho: cada linha do modal de escolha de endereço (rodada 5) era um
  `<button>`; o botão de editar dentro dele virou filho de outro `<button>`. Trocado o contêiner
  pra `<div role="button" tabIndex={0}>` com `onClick`/`onKeyDown` equivalentes.

### Bug encontrado e corrigido durante o teste: `isAddressComplete` bloqueava TODO endereço existente

Primeira versão de `isAddressComplete` exigia `address.number` preenchido. Teste via Playwright
revelou que "Continuar" ficava desabilitado mesmo com um endereço real, completo e já salvo — porque
`number` sempre vem vazio na leitura (mesmo achado descrito acima sobre `fromBackendAddress`). Ou
seja, a primeira versão teria travado o checkout pra **qualquer** cliente com endereço cadastrado
antes desta sessão. Corrigido removendo o check de `number` do helper.

Verificado via Playwright (rebuild Docker + `full-final-probe.cjs`): modal abre com título correto,
"Salvar" desabilitado com formulário vazio + hint de campos faltando visível, "Continuar" **não**
desabilitado com um endereço real e completo (a versão corrigida).

## Sétima rodada (2026-09-02, mesmo dia): banner de instrução no popup do chat ao escolher receita digital

Pedido do usuário, no mesmo turno: quando o cliente escolhe "digital" (`PrescriptionKindModal`) e o
popup pequeno do widget de chat abre (fluxo já existente desde a terceira rodada), mostrar uma
mensagem central explicando que deve enviar o link da receita ou anexar pelo clipe, deixar claro
que "digital" foi selecionado, e oferecer um jeito de voltar pra "física".

### Decisão

- `openWidgetChatPanel` (`marketplace-app.jsx`) passou a aceitar um `context` opcional
  (`'prescription_digital'` por enquanto), guardado em novo estado `chatWidgetContext` e limpo ao
  minimizar o widget (`onDismissContext`). `PrescriptionKindModal` (opção "Digital") e o botão
  "Enviar receita"/"Abrir chat" da etapa de Pagamento passaram a chamar
  `openWidgetChatPanel('prescription_digital')` em vez da chamada sem argumento.
- `ChatWidget` (`marketplace-care-actions.jsx`) ganhou três props novos (`chatContext`,
  `onDismissContext`, `onSwitchToPhysical`) e, quando `chatContext === 'prescription_digital'`,
  renderiza um banner fixo acima do painel de chat: "Receita digital selecionada" + instrução pra
  enviar o link ou anexar pelo clipe + link "Na verdade, minha receita é física" que chama
  `onSwitchToPhysical` (que troca `prescriptionKind` pra `'physical'` e fecha o contexto do banner).
  Sem efeito em nenhum outro uso do widget (falar com farmacêutico em geral não passa `chatContext`,
  banner não aparece).

Verificado via Playwright: banner "Receita digital selecionada" visível ao escolher digital, texto
de instrução (link/clipe) visível, link "Na verdade, minha receita é física" visível — sem erros de
console.

## Oitava rodada (2026-09-02, mesmo dia): receita física cobra automaticamente pelo cartão salvo na retirada

Pedido do usuário: mudar o texto "Nada é cobrado agora... o pagamento é feito ali, no balcão" —
em vez de cobrança manual presencial (dinheiro/maquininha, fora do sistema, como decidido na
Segunda rodada), o pagamento deve ser efetuado automaticamente pelo cartão que o cliente já tem
cadastrado, no momento da retirada. Se o cliente não tiver nenhum cartão salvo, a compra deve
exigir que ele cadastre um antes de finalizar.

### Achado: tokenização de cartão já existe de ponta a ponta, só nunca foi usada nesse fluxo

Pesquisa antes de implementar (ver `CustomerPaymentMethod`, `CustomerPaymentMethodRepository`,
`CustomerService.tokenize_and_save_card`, `AsaasClient.tokenize_credit_card`,
`PaymentService.charge_card`) confirmou que cartão salvo/tokenizado, endpoints de gerenciar cartão
e o picker de cartão salvo no checkout (`CardMethodDetail`, já usado por `credit_card`/`debit_card`)
já existiam e já funcionavam — nada disso é novo. O gap real era só: (a) exigir um cartão salvo
antes de aceitar um pedido de receita física, e (b) cobrar de fato, mais tarde, no momento certo
(retirada confirmada, não na criação do pedido).

### Decisão

- **Backend (`OrderService.create_marketplace_order`)**: `payload.payment.method == 'pickup_cash'`
  agora resolve um `CustomerPaymentMethod` do mesmo jeito que `credit_card`/`debit_card` já fazem
  (por `payment_method_id` explícito, ou o primeiro da lista — primário primeiro — quando nenhum é
  informado). Sem nenhum cartão disponível, 422 "Cadastre um cartão em 'Meus cartões' antes de
  finalizar a compra com receita física." — a compra nunca chega a ser criada. `order.selected_payment_method_id`
  passa a ser gravado para `pickup_cash` também (antes só para cartão online). **Nada é cobrado
  neste momento** — `order.payment_status` continua `pending_pickup`, igual à Segunda rodada.
- **Backend (`OrderService.confirm_internal_pickup`)**: novo bloco no início do método — quando
  `order.payment_status == 'pending_pickup'`, resolve o `CustomerPaymentMethod` salvo em
  `order.selected_payment_method_id` e chama `PaymentService.charge_card` (billing type
  `CREDIT_CARD`, mesma chamada que o checkout online de cartão já usa) **antes** de marcar o
  pedido como `DISPATCHED`. Esse é exatamente o momento em que o farmacêutico já conferiu o código
  de retirada — e, por já exigir `order.status == READY`, também já passou pelo gate existente de
  `advance_internal_order` que bloqueia NEW→SEPARATING→READY enquanto `prescription_status ==
  'pending'` (mecanismo da Primeira rodada, não tocado) — ou seja, a cobrança só dispara depois que
  a receita física já foi aprovada presencialmente. Se o cartão salvo tiver sido excluído entre o
  pedido e a retirada, ou se a cobrança falhar, o método levanta uma exceção antes de qualquer
  `commit()` — a transação inteira é descartada, o pedido continua em `READY`/`pending_pickup`
  intacto, pronto pra tentar de novo (confirmado no teste, ver Verificação).
- **Frontend (`checkout-screen.jsx`)**: o card de receita física ganhou o mesmo picker de cartão
  salvo (`CardMethodDetail`) já usado no fluxo de cartão online, com o texto atualizado — "Leve a
  receita original na retirada [...]. O pagamento só é efetuado depois disso, automaticamente pelo
  cartão já cadastrado que você escolher abaixo." Novo `physicalCardReady` (mesma checagem de
  campos que o cartão online já faz antes de tokenizar) gate o botão "Confirmar pré-pedido" —
  sem cartão selecionado nem novo cartão preenchido, mostra "Pagamento bloqueado" com aviso, igual
  ao padrão já usado pro gate de CPF/endereço/receita. **Preseleção automática**: como o cliente já
  confia nesse cartão o bastante pra tê-lo salvo, o primeiro da lista (primário) é selecionado
  sozinho ao entrar no modo receita física — sem isso, o botão ficaria bloqueado por padrão mesmo
  quando não havia nada de fato errado, obrigando um clique extra desnecessário.
- **Frontend (`marketplace-app.jsx`, `placeOrder`)**: a mesma lógica de "resolver cartão salvo ou
  tokenizar um novo antes de enviar" que já existia só para `credit_card`/`debit_card` passou a
  também cobrir `pickup_cash` (`requiresSavedCardOnly`).
- Textos atualizados: card de receita física no checkout, tela de confirmação (`ConfirmScreen`,
  "assim que o farmacêutico conferir o papel, o pagamento é feito automaticamente pelo cartão
  cadastrado"), docstring de `CheckoutPaymentRequest`, `internal_note` do pedido interno.

### Verificação

Playwright ponta a ponta: escolher "física" no checkout pré-seleciona o cartão Visa salvo do
cliente e habilita "Confirmar pré-pedido"; trocar para "Usar outro cartão" sem preencher nada
bloqueia o botão ("Pagamento bloqueado" + aviso); reselecionar o cartão salvo reabilita; pedido
criado com `payment_status = pending_pickup` e `selected_payment_method_id` gravado apontando pro
cartão certo (conferido direto no Postgres). Do lado interno: farmacêutico aprova a receita física
na fila "Receitas", pedido avança NEW→SEPARATING→READY, código de retirada informado — nesse
ambiente local o Asaas está desligado por configuração (`asaas_enabled=false`, mesmo estado do
`.env.production` — "Pagamento real (Asaas) desligado neste primeiro deploy"), então a chamada de
cobrança retorna 503 "A integração fiscal com o Asaas não está habilitada", **exatamente como já
aconteceria hoje com qualquer cobrança de cartão online neste ambiente** (não é uma regressão desta
mudança). Confirmado o ponto mais importante: o pedido permanece intacto em `status=ready`,
`payment_status=pending_pickup`, sem `gateway_payment_id`, pronto pra nova tentativa — nenhum
commit parcial. Verificação completa de cobrança bem-sucedida (`payment_status` virando `approved`)
fica pendente de um ambiente com Asaas habilitado — ver
[[../06_Pendencias/asaas-desabilitado-localmente-bloqueia-teste-de-cobranca|pendência]].

## Nona rodada (2026-09-03): chat de receita sempre reabre a mesma conversa; "em análise" sempre volta pro seletor

Dois problemas relatados pelo usuário, mesmo dia: (1) toda vez que clicava pra abrir o chat da
receita (no carrinho/checkout), o sistema abria uma **conversa nova**, em vez de cair na mesma
conversa de sempre — confirmado no banco: 8 threads `Atendimento farmacêutico` distintas criadas
pra mesma cliente em menos de 3 minutos de teste. (2) quando a receita está "em análise", clicar no
botão da etapa de Pagamento deveria sempre abrir a modal "Como é a sua receita?" primeiro — o chat
só abre de fato quando o cliente clica em "Física" ou "Digital" dentro dela, cada opção mostrando
seu próprio fluxo. Também pedido um ajuste geral de textos pra reduzir a confusão dessa área.

### Causa raiz do bug de conversas duplicadas

`ensureMarketplaceChatThread` (`marketplace-app.jsx`), usado por todo "falar com farmacêutico" do
marketplace (header, rodapé, widget flutuante, todos os botões de receita), só reaproveitava uma
thread já existente quando um `threadId` explícito era passado — nunca o caso nesses botões. Sem
isso, ele sempre fazia `POST /chat/customer/threads` com `order_id: null`. O backend
(`ChatService.ensure_customer_thread`) já sabe devolver uma thread existente em vez de criar outra
— **mas só quando recebe um `order_id`/`order_code`** pra procurar por ele; com `order_id: null`
(o caso de toda receita pré-pedido, já que o pedido só existe depois do checkout) ele não tem como
saber que já existe uma conversa geral em aberto, e cria uma nova sempre. O comentário original do
código já dizia a intenção certa ("thread geral... reaproveitada depois"), só a implementação nunca
chegou a fazer essa checagem.

### Decisão

- **`ensureMarketplaceChatThread`**: antes de `POST`, quando não há `order_id` (nenhum pedido
  ainda), procura em `chatThreads` (já carregado em memória, do `GET /chat/customer/threads` do
  bootstrap/poll) por uma thread já existente sem `orderCode` e com `threadStatus !== 'closed'` —
  reaproveita essa em vez de criar outra. Corrige de uma vez todo caminho que chama isso sem pedido
  (header, widget, qualquer botão de receita no carrinho/checkout), não só o botão relatado.
- **Checkout, card de receita "em análise"**: o botão deixou de chamar `openWidgetChatPanel`
  diretamente — agora chama `setPrescriptionKindModalOpen(true)`, o mesmo modal usado na primeira
  escolha. Só escolher "Digital" de novo (dentro da modal) reabre o chat (reaproveitando a mesma
  conversa, graças à correção acima); escolher "Física" troca pro fluxo físico. Escopo
  deliberadamente restrito ao estado "em análise" (`pending`) — é o único onde o texto já dizia
  "não é preciso voltar aqui", então um botão que abria o chat direto soava contraditório; os
  estados "recusada" e "nunca enviada" continuam abrindo o chat direto, porque ali a ação real e
  óbvia é mandar algo agora.
- **Textos ajustados** nesse card, pra cada estado deixar claro o que o botão realmente faz:
  "Receita digital em análise" / "Ver conversa ou mudar tipo de receita" (pending, abre modal);
  "Receita digital recusada" / "Abrir chat e reenviar receita" (rejected, abre chat); "Abrir chat e
  enviar receita" (nunca enviada, abre chat) — nomes de botão agora descrevem a ação de verdade
  (antes "Abrir chat"/"Enviar receita" eram usados de forma intercambiável pros três estados, sem
  deixar claro se abria chat ou não).

### Verificação

Contagem de threads órfãs (`order_id IS NULL`) da cliente de teste antes/depois: 8 antes da
correção (criadas em ~3 min de teste), **0 novas** depois de repetir a mesma sequência de cliques
(escolher "Digital", minimizar o widget, reabrir via "Abrir chat e enviar receita" duas vezes) —
confirmado também que nenhum `POST /chat/customer/threads` novo foi disparado nessa sequência
inteira (reaproveitou uma thread já existente do teste anterior). Separadamente: com a receita já
"em análise" (dado real do banco), o botão do card mostra "Ver conversa ou mudar tipo de receita" e,
ao clicar, abre a modal "Como é a sua receita?" — confirmado que o chat **não** abre nesse clique,
só ao escolher uma das duas opções dentro da modal.

## Décima rodada (2026-09-03): botão de trocar tipo de receita sempre visível + modal de retirada ao escolher física

Feedback direto do usuário depois da Nona rodada, com print: ao escolher um tipo de receita, o
card seguinte (ex: "Envie a receita digital...") não tinha **nenhuma** forma de corrigir a escolha
— parecia que tinha "voltado pra pergunta" quando na verdade era só o próximo passo do fluxo
digital. Dois ajustes pedidos: (1) o botão de escolher física/digital deve **sempre** ficar visível
em qualquer estado da receita, pra corrigir uma escolha errada sem precisar achar um link
escondido; (2) ao escolher "Física" especificamente, deve abrir uma modal avisando que o pedido só
pode ser retirado na farmácia, com a escolha da loja ali mesmo.

### Decisão

- **Botão de trocar tipo sempre visível**: os cards de receita digital "nunca enviada" e
  "recusada" (`!rxCleared`, dentro de `checkout-screen.jsx`) ganharam um segundo botão fixo
  "Escolher tipo de receita" (`.fa-btn-ghost`, reabre `PrescriptionKindModal`) ao lado do botão de
  ação principal ("Abrir chat e enviar/reenviar receita") — os dois sempre visíveis juntos, nunca
  um escondendo o outro. O card de receita física (`prescriptionKind === 'physical'`) já tinha esse
  botão (antes rotulado "Na verdade é digital") — renomeado pra "Escolher tipo de receita", mesmo
  texto em todo lugar. O card "em análise" (rodada anterior) já usava esse único botão; só teve o
  rótulo ajustado pra "Ver conversa ou escolher tipo de receita", mantendo a mesma consistência.
- **Nova modal `PhysicalPrescriptionModal`** (`checkout-screen.jsx`), disparada por
  `onSelectPhysical` do `PrescriptionKindModal` (tanto na primeira escolha quanto numa correção
  posterior): título "Esse pedido só pode ser retirado na farmácia", explica o motivo legal (papel
  original retido), e embute o `PickupStorePicker` já existente (mesmo componente do step de
  Entrega) — o cliente escolhe a unidade sem precisar voltar pro step 0. Aviso final reforça "leve a
  receita física original". Botão "Confirmar unidade de retirada" fecha a modal.

### Verificação

Playwright: com a receita ainda não enviada, o card mostra os dois botões lado a lado ("Abrir chat
e enviar receita" + "Escolher tipo de receita"); clicar em "Escolher tipo de receita" → "Receita
física (papel)" abre a modal "Esse pedido só pode ser retirado na farmácia" com o seletor de loja
(mapa incluso) e o aviso de levar a receita; escolher uma unidade e confirmar fecha a modal e
atualiza o resumo pra "Retirada · {loja escolhida}"; o card de pagamento reflete física com
"Escolher tipo de receita" visível; "Confirmar pré-pedido" segue habilitado (gate de cartão salvo
da Oitava rodada intacto).

## Décima primeira rodada (2026-09-03): remover o item de receita recusada libera o pagamento

Pedido do usuário: quando a receita é recusada, o cliente deve poder remover do carrinho o produto
que exigia receita, pra continuar a compra sem esse item — em vez de ficar preso até enviar (e
esperar aprovação de) uma nova receita.

### Achado: o gate é por carrinho, não por item — remover qualquer item de receita já libera tudo

`CustomerService.get_prescription_status` já documenta isso: "a single, cart-wide gate — not per
medication". `hasRx`/`rxCleared` em `checkout-screen.jsx` já são computados a partir dos itens
reais do carrinho a cada render — então bastou expor a ação de remover; nenhuma mudança de gate foi
necessária, o carrinho ficando sem item de receita já reabre o pagamento sozinho.

### Decisão

- Cada item de receita listado no topo do card de pagamento (`rxItems.map`) ganhou um botão
  "Remover" (`.fa-cart-item-remove`, mesmo estilo do carrinho) — **só visível quando
  `prescriptionStatus.status === 'rejected'`**. Escopo deliberado: remover durante "em análise" ou
  antes de qualquer envio descartaria uma submissão que ainda pode ser aprovada ou que nunca
  existiu; só faz sentido como saída quando já foi recusada.
- Reaproveitado o `RemoveItemModal` já existente (`marketplace-components.jsx`, mesmo componente
  do carrinho) — mesma confirmação, mesmo aviso de perda de desconto se houver. Confirmar chama
  `ctx.removeItem(id)`.
- Texto do card "recusada" passou a mencionar as duas saídas: "Abra o chat para enviar uma nova
  receita digital... — ou remova o produto com receita acima para continuar a compra sem ele."

### Verificação

Playwright: carrinho com Clonazepam (receita) + Dipirona (sem receita), receita recusada (dado
real do banco) → botão "Remover" visível só no item de receita → confirmar remoção no modal →
Clonazepam sai do carrinho, resumo do pedido atualiza pra 1 item (Dipirona) → card de receita e
aviso de bloqueio desaparecem inteiramente → formulário normal de pagamento (Pix/cartão) aparece
com "Confirmar e pagar" habilitado, sem nenhum resquício de bloqueio.

## Décima segunda rodada (2026-09-03): receita por link vira submissão de verdade + recusa encerra o chamado

Três pedidos do usuário no mesmo turno: (1) uma receita digital enviada como **link** (não
arquivo) pelo chat deve virar uma submissão de verdade — o farmacêutico precisa poder validar e
liberar o pagamento a partir dela, igual já acontece com upload de arquivo; (2) o botão "Remover"
do item com receita recusada deve ser mais visível/evidente; (3) quando uma receita é recusada, o
atendimento (thread do chat) deve ser encerrado, com uma mensagem dizendo que, se achar que foi um
engano, é só abrir um novo atendimento e enviar uma nova receita.

### Achado: a peça estava quase toda pronta, só nunca ligada ao chat do marketplace

`Prescription.digital_reference_url` já existia como coluna — usada hoje só pelo fluxo PDV
(`PrescriptionService.create_from_pdv`, `delivery_method == 'digital'`), nunca pelo chat do
marketplace. O card de decisão dentro do chat interno (`chat-screen.jsx`) já renderiza qualquer
`message.text` genericamente (já mostra a URL de receitas vindas do PDV) e já tem
"Validar"/"Recusar" pra qualquer `message.prescriptionId` — **zero mudança necessária ali**. A
única coisa que faltava de verdade: nada no chat do marketplace criava uma `Prescription` a partir
de um link colado como mensagem — virava só uma mensagem de texto comum, sem `prescription_id`,
inexistente pra fila de aprovação e pro gate de pagamento (limitação já registrada como pendência
antes desta rodada).

### Decisão

- **Backend**: novo `ChatService.submit_customer_prescription_link(thread_id, url)`
  (`chat_service.py`) — mesmo "dobra pro chat" do upload de arquivo
  (`submit_customer_prescription`), só que sem `PrescriptionFile`: grava
  `digital_reference_url=url`, posta uma `ChatMessage` `message_type='prescription_request'` com
  `prescription_id` setado. Novo endpoint `POST /chat/customer/threads/{id}/prescriptions/link`
  (`chat.py`), novo schema `ChatSubmitPrescriptionLinkRequest`. Validação de formato
  (`is_http_url`, novo helper em `app/domain/validators.py`) rejeita qualquer coisa que não seja
  um link http(s) de verdade — 422, não silenciosamente aceito.
- **Frontend**: `sendChatMessage` (`marketplace-app.jsx`) passou a detectar quando a mensagem
  inteira (aparada) é só um link (`CHAT_URL_ONLY_PATTERN`) e, nesse caso, chama o novo endpoint em
  vez de mandar como texto comum — vale pra qualquer composer do chat do cliente (widget, modal
  grande), sem mudança nenhuma nos componentes de UI. Deliberadamente conservador: só ativa quando
  a mensagem inteira é o link, nunca por conter um link em algum lugar da frase.
- **Fila "Receitas" do console interno** ganhou um gap fechado de brinde: `PrescriptionQueueItemResponse`
  não expunha `digital_reference_url` (só usado pelo card do chat, nunca pela tela dedicada) — a
  área "imagem da receita" daquela tela era um placeholder estático sem link/imagem real nem pra
  upload de arquivo. Adicionado o campo na resposta e, quando presente, a tela mostra um card
  "Receita enviada como link" com o link clicável — sem tocar no caminho de arquivo (que continua
  com o mesmo placeholder de antes, fora de escopo).
- **Recusa encerra o atendimento**: `ChatService.post_prescription_decision_message` agora fecha a
  thread (`thread_status='closed'`, `closed_reason='prescription_rejected'`) quando
  `decision_status == 'rejected'` — mesmo mecanismo já usado quando um pedido é concluído
  (`close_threads_for_order`). A mensagem final no chat e o banner de "atendimento encerrado" (novo
  branch em `ChatWidget`, `marketplace-care-actions.jsx`) dizem a mesma coisa: "Se você acha que
  foi um engano, abra um novo atendimento e envie uma nova receita." Como
  `ensureMarketplaceChatThread` (Nona rodada) já pula threads fechadas ao procurar uma geral pra
  reaproveitar, "Abrir chat e reenviar receita" já abre uma conversa nova automaticamente — nada
  extra precisou ser feito nesse lado.
- **Botão "Remover" mais evidente**: trocado de link de texto sutil (`.fa-cart-item-remove`) pra um
  botão de verdade (`.fa-btn.fa-btn-soft`, borda e texto vermelhos) no item com receita, só
  visível quando `status === 'rejected'` (mesmo escopo da Décima primeira rodada).

### Verificação

Playwright ponta a ponta: cliente cola um link como única mensagem no chat → `POST
.../prescriptions/link` 200, mensagem aparece com badge "Receita enviada" → farmacêutico abre
"Receitas", vê o card "Receita enviada como link" com o link clicável, recusa com motivo →
mensagem de recusa (com o aviso de reenviar) aparece no chat do cliente, banner "Este atendimento
foi encerrado porque a receita foi recusada..." aparece automaticamente no widget já aberto (via
poll, sem precisar recarregar) → botão "Remover" no item visivelmente vermelho/contornado →
clicar em "Abrir chat e reenviar receita" abre uma conversa **nova** (composer funcional, sem
banner de encerrado) — confirmado também no banco: a thread antiga ficou `closed` +
`prescription_rejected`, nenhuma thread nova foi criada à toa quando já existia uma geral aberta
pra reaproveitar.

## Consequências

- **`prescriptionKind` ('digital'/'physical') não tem modelo de servidor — é só estado de sessão
  no cliente** (`marketplace-app.jsx`), perdido num F5. Decisão consciente: não existe hoje um
  lugar natural pra persistir "como é a receita" antes de uma `Prescription`/`Order` existir (o
  campo mais próximo seria `Prescription.delivery_method`, mas essa linha só nasce quando o
  cliente efetivamente envia algo digital, ou quando o pedido físico já foi criado — não antes). Na
  prática, um F5 no meio do fluxo faz o cliente escolher de novo — mesmo comportamento fallback já
  aceito pra `addingNewAddress` e outros estados efêmeros do checkout.
- **Limitação conhecida, aceita conscientemente**: o gate é por "última receita enviada antes de
  um pedido", não por SKU — se o farmacêutico aprovar hoje e o cliente voltar semanas depois com
  um carrinho de receita totalmente diferente, essa aprovação antiga ainda contaria como válida
  (não existe expiração nem vínculo com os itens específicos do carrinho atual). Aceitável para o
  escopo pedido, mas registrado como possível refinamento futuro — ver
  [[../06_Pendencias/receita-gate-nao-verifica-item-especifico-do-carrinho|pendência]].
- ~~**"Envio por link" não implementado como fluxo formal**~~ — resolvido na Décima segunda rodada:
  um link colado como mensagem única agora cria uma `Prescription` real
  (`ChatService.submit_customer_prescription_link`), igual ao upload de arquivo.
- Achado à parte, não relacionado ao gate: `marketplace_listings.requires_prescription_upload`
  (coluna que sugeriu "Amoxicilina" como item de receita) e o campo `product.rx` do catálogo (na
  prática vem de `inventory_products.controlled_category`) são **duas fontes de verdade
  diferentes e hoje divergentes** — Amoxicilina tem a primeira `true` e a segunda `none`
  (`Clonazepam`, testado aqui, tem as duas coerentes). Não corrigido nesta sessão (fora do pedido,
  risco de mudar comportamento de catálogo/pedido em produção sem confirmação); registrado em
  [[../06_Pendencias/duas-fontes-de-verdade-para-item-exigir-receita|pendência]].
- Nenhuma migration nova — todo o schema usado (`Prescription`, `PrescriptionFile`, `ChatMessage`)
  já existia.
- Verificado via Playwright ponta a ponta, duas contas reais (`mariana.souza@cliente.farmaura.com.br`
  como cliente, `adriana.lima@farmaura.com.br` como admin interno — evita a necessidade de TOTP do
  usuário farmacêutico semeado): item Clonazepam no carrinho → alerta + "Enviar receita" → upload
  real de arquivo no chat → carrinho mostra "Em análise" → checkout mostra "Pagamento bloqueado" →
  farmacêutico recusa com motivo pela tela de Receitas e pelo card do Chat → motivo aparece no
  carrinho e como mensagem no chat do cliente → nova receita enviada → farmacêutico aprova →
  checkout libera o formulário de pagamento e o botão "Confirmar e pagar".

## Ver também

- [[2026-08-31-carrinho-e-checkout-unificados-em-jornada-de-3-fases|Carrinho e checkout unificados em jornada de 3 fases]] — mesma tela de checkout, endereço/método de entrega.
- [[2026-08-30-chat-farmaceutico-anti-spam-vinculo-pedido-e-congelamento|Chat farmacêutico: anti-spam, vínculo a pedido e congelamento]] — mesma infraestrutura de chat reaproveitada aqui.
- [[../04_Seguranca_Riscos/rls-ausente-em-tabelas-de-varios-dominios|RLS ausente em tabelas de vários domínios]] — mesmo padrão de bug (RLS após commit) corrigido em `PrescriptionService.decide()`.
- [[../06_Pendencias/receita-gate-nao-verifica-item-especifico-do-carrinho|Pendência: gate de receita não verifica item específico do carrinho]]
- [[../06_Pendencias/duas-fontes-de-verdade-para-item-exigir-receita|Pendência: duas fontes de verdade para "item exige receita"]]