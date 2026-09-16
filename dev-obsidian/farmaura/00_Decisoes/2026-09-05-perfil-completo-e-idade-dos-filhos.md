# 2026-09-05 — "Dados pessoais" mostra todos os campos cadastrados + idade dos filhos

## Contexto

O usuário reportou que a visão de leitura de "Dados pessoais" (`ProfileManage`,
`account-profile-screen.jsx`) só mostrava 5 dos 8 campos que o próprio formulário de edição já
coletava (nome, CPF, nascimento, telefone, e-mail apareciam; gênero, estado civil e número de
filhos ficavam escondidos, só visíveis entrando no modo de edição). Pediu para mostrar tudo que é
cadastrado, e para acrescentar a idade de cada filho quando houver.

No mesmo pedido, aproveitando a tela aberta, também pediu para destacar visualmente qual endereço
é o padrão de entrega — o rótulo "Padrão" usava a classe `.chip`, que só tem regra CSS definida
com o seletor `.account-nav-link .chip` (badge de contagem do menu lateral); fora desse contexto o
span não tinha estilo nenhum aplicado, então "Padrão" aparecia como texto solto colado no apelido
do endereço, sem nenhum destaque visual.

## Decisão

**Leitura de "Dados pessoais"** (`PERSONAL_FIELDS`, `account-profile-screen.jsx`) passou a listar
todos os 8 campos que o formulário de edição já coleta: nome, CPF, nascimento, telefone, e-mail,
gênero, estado civil (com rótulo em português via `MARITAL_STATUS_LABELS`, já que o valor
persistido é um código curto — `single`/`married`/etc.) e número de filhos.

**Idade dos filhos** — campo novo, de ponta a ponta:
- `customers.children_ages` (JSON, lista de inteiros) — migração `20260905_01`, ao lado do já
  existente `children_count`. Sem tabela dedicada: mesma decisão de modelagem já usada para
  `active_subscriptions`/`favorite_items`/outros arrays denormalizados no `Customer`.
- Formulário de edição: quando "Número de filhos" > 0, aparece um input de idade por filho
  (`setChildAge`, dimensionado pelo próprio `childrenCount` — aumentar ou diminuir o número
  redimensiona a lista de idades automaticamente, sem precisar de um efeito React separado para
  manter as duas coisas em sincronia).
- Envio ao backend descarta slots de idade deixados em branco em vez de gravar `0` — um cliente
  que marcou "2 filhos" mas preencheu a idade de só um não deveria acabar com um filho fantasma de
  "0 anos" no cadastro.
- Leitura: a linha "Idade dos filhos" só aparece quando há pelo menos uma idade preenchida (`caso
  tenha`, nas palavras do usuário) — não polui a tela com uma linha vazia para quem não tem filhos
  ou não preencheu.

**Endereço padrão em destaque** — trocado `.chip` (sem estilo aplicável) por
`.fa-badge.fa-badge-rose` (mesmo sistema de badge sólido já usado em outras telas), com texto mais
explícito ("Padrão para entregas" em vez de só "Padrão") e ícone de check. O card do endereço
padrão em si também ganhou destaque (`.prof-addr-card.is-primary`: fundo rosé + ícone de pin na
cor primária em vez do rosé-suave neutro dos demais) — antes só havia essa etiqueta pequena
diferenciando dos outros endereços, agora o card inteiro comunica "este é o padrão" à primeira
vista.

## Consequências

- Migração `20260905_01_customer_children_ages` aplicada **só localmente** (`alembic stamp
  20260903_01` + `alembic upgrade head`, mesmo contorno do
  [[../06_Pendencias/alembic-version-ausente-no-postgres-local|gap conhecido de alembic_version
  ausente no Postgres local]]) — segue [[../07_POPs_Processos/aplicar-migration-alembic-producao|
  aplicar-migration-alembic-producao]], nunca aplicada em produção sem pedido explícito. Nova
  pendência de deploy: aplicar em produção junto com a migração de cashback de 2026-09-03, que
  também ainda não foi lá (ver [[../06_Pendencias/aplicar-migration-cashback-em-producao|pendência
  existente]] — vale atualizá-la para cobrir as duas quando a aplicação for pedida).
- `CustomerProfileResponse`/`CustomerProfileUpdateRequest` (`app/schemas/customers.py`) ganham
  `children_ages: list[int]` (cada item 0–90, lista até 20 itens — mesmo teto de
  `children_count`).
- Nenhuma mudança de RLS necessária — `customers` já está na malha genérica de tenant isolation.
- Build de `farmaura-api` e `farmaura` (frontend) limpos, containers redeployados localmente
  (`healthy`); sem verificação visual via navegador nesta leva (limitação de ferramental já
  registrada em ADRs anteriores).

## Correção (mesmo dia): idade armazenada como ano de nascimento, não como número congelado

O usuário notou o problema certo: uma idade digitada uma vez ("8 anos") fica errada assim que o
ano vira, e nada no sistema a atualizava. Como a feature tinha acabado de ser criada — **nunca
chegou a ir pra produção** (migration ainda pendente, ver
[[../06_Pendencias/aplicar-migration-cashback-em-producao|pendência de deploy]]) — a correção foi
trocar o dado guardado em vez de adicionar um mecanismo de "envelhecimento" por cima:

- `Customer.children_ages` (JSON, lista de idades) virou `Customer.children_birth_years` (JSON,
  lista de **anos de nascimento**). A migration `20260905_01` foi editada no lugar (não uma
  migration nova em cima) porque nunca tinha sido aplicada em nenhum ambiente compartilhado —
  só existia no dev local desta mesma sessão.
- A idade exibida em qualquer lugar (leitura de "Dados pessoais", formulário de edição) é sempre
  **derivada na hora** (`ano atual − ano de nascimento`, `childAgeFromBirthYear`,
  `account-profile-screen.jsx`) — nunca mais lida de um número gravado. Isso significa que a idade
  de cada filho avança sozinha a cada virada de ano, sem precisar de nenhum job agendado nem de o
  cliente voltar para corrigir.
- **A experiência de digitar não mudou**: o campo continua pedindo "idade" (não "ano de
  nascimento") — `setChildAge` converte o valor digitado para ano de nascimento
  (`anoAtual − idadeDigitada`) só na hora de guardar; o cliente nunca vê nem digita um ano.
- `CustomerProfileUpdateRequest`/`CustomerProfileResponse` (`app/schemas/customers.py`) trocaram
  `children_ages: list[int]` (0–90) por `children_birth_years: list[int]` (1900–2100).

## Ver também

- [[2026-09-04-shell-de-conta-unificado-conforme-demo|Shell de conta unificado]] — mesma tela
  (`ProfileManage`) já vinha de um re-skin recente.
