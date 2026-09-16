# 2026-09-14 — Nome dos filhos ponta a ponta + reorganização do card de cliente no PDV

## Contexto

Pedido em duas partes: (1) o card de cliente do PDV (`ClientInfoPanel`-like, `point-of-sale-screen.jsx`) deveria mostrar os filhos do cliente por nome e idade, quando cadastrados — hoje o cadastro (ver [[2026-09-05-perfil-completo-e-idade-dos-filhos|ADR de origem]]) só guarda quantidade e idade, sem nome; (2) três ajustes de layout no mesmo card, para bater com o artifact "Farmaura Operações": tirar o banner de cashback disponível dali e colocar embaixo do campo "Desconto adicional" (painel de carrinho), e trocar "Costuma comprar" de badges soltos para uma lista ordenada top-5.

## Decisão

### Nome dos filhos — campo novo, ponta a ponta

`Customer.children_names` (JSON, lista de strings) — migração `20260914_01`, paralela por índice a `children_birth_years` já existente (mesmo slot = mesmo filho). Fluxo completo:

- **Backend**: `CustomerProfileResponse`/`CustomerProfileUpdateRequest` (`app/schemas/customers.py`) ganham `children_names: list[str]`; `CustomerService.update_profile`/`_build_profile_response` persistem e devolvem. Para o console interno, `CrmCustomerResponse` ganha `children: list[CrmChildResponse]` (`name` + `age`) — `age` é **derivado na hora** (`ano atual − ano de nascimento`, `crm_service._serialize_customer`), nunca um número congelado, mesma disciplina já estabelecida para a idade no formulário do marketplace.
- **Formulário do marketplace** (`account-profile-screen.jsx`): "Idade dos filhos" virou "Filhos" — uma linha por filho com nome (opcional, texto livre) + idade lado a lado, mesmo padrão de redimensionamento automático pelo campo "Número de filhos" já usado para idade (`setChildName`, espelhando `setChildAge`). Ao salvar, um filho só é enviado se tiver **idade preenchida** (idade continua a âncora de "esse filho existe no cadastro", igual antes); o nome viaja pareado por índice com a idade mantida, mesmo vazio.
- **Card do PDV** (`point-of-sale-screen.jsx`): nova linha "Filhos: Nome (idade anos), ..." abaixo da grade de 4 estatísticas, só aparece quando há pelo menos um filho.
- **Documento legal sincronizado no mesmo commit** (política nova, ver [[../03_Padroes_Politicas/politica-sincronizar-legal-com-mudancas-reais-de-dados|política]]): `legal-screen.jsx` (`PRIVACY_SECTIONS`) ganhou uma entrada em "Quais dados coletamos" para o perfil pessoal (gênero, estado civil, filhos — nomes e idades) e a base legal em "Por que tratamos seus dados" passou a mencionar personalização de ofertas como consentimento revogável. Esse dado (gênero/estado civil/filhos) já era coletado desde 2026-09-05 e nunca tinha sido refletido nessas páginas — gap preexistente, corrigido agora por ser a primeira mudança de código a tocar exatamente esses campos depois da política entrar em vigor.

### Card do PDV: cashback sai do card, entra abaixo do desconto

O banner informativo "R$ X de cashback disponível" (sempre visível no card, sem ação) foi removido. O controle funcional de cashback (toggle "Usar cashback disponível" + valor, que já existia e já era exclusivo da tela do caixa — é lá que o pagamento de fato acontece) foi reposicionado para logo abaixo do campo "Desconto adicional (%)", em vez de antes dele — mesma posição relativa do artifact. Não foi estendido para a tela do farmacêutico: `pdvSendToCashier` não carrega `cashWanted`/`cashApplied` no handoff, então mostrar o toggle lá enganaria o farmacêutico (pareceria aplicado, mas se perderia ao chegar no caixa) — mantido como estava, só reposicionado dentro do caixa.

### "Costuma comprar" — de badges soltos para lista top-5 ranqueada

Trocado de `pdvCustomer.subscriptions` (lista arbitrária, sem ordem, renderizada como badges) para `pdvCustomer.topProducts` (já existente, com quantidade real comprada) — ordenado por quantidade decrescente, limitado a 5, renderizado como lista numerada com a quantidade à direita. `subscriptions` deixou de ser usado neste card (continua existindo no modelo/API, só não é mais lido aqui).

## Consequências

- Migração `20260914_01` aplicada localmente (`alembic stamp 20260905_02` + `alembic upgrade head` — mesmo contorno já documentado em [[../06_Pendencias/alembic-version-ausente-no-postgres-local|pendência de alembic_version ausente]]); não aplicada em produção nesta sessão.
- Testado ponta a ponta via Chrome headless: cadastrado "Sofia Souza Lima (8 anos)" e "Miguel Souza Lima (4 anos)" no formulário do marketplace (cliente seed `mariana.souza@cliente.farmaura.com.br`), confirmado salvo na tela de leitura do perfil, e confirmado que a mesma informação aparece no card do PDV interno — prova de que o dado atravessa marketplace → backend → console interno corretamente. Cashback reposicionado confirmado visualmente na tela do caixa.
- Nenhuma mudança de contrato que quebre consumidores existentes — `children_names` e `children` são campos aditivos.

## Ver também

- [[2026-09-05-perfil-completo-e-idade-dos-filhos]] — ADR de origem do campo de idade dos filhos (sem nome), que esta mudança estende.
- [[../03_Padroes_Politicas/politica-sincronizar-legal-com-mudancas-reais-de-dados|política de sincronização legal]] — regra que disparou a atualização de `legal-screen.jsx` nesta mesma mudança.
- [[2026-09-13-pdv-ajuste-visual-vs-artifact-e-produto-nao-encontrado]] — rodada anterior do mesmo esforço de aproximar o PDV real do artifact "Farmaura Operações".
