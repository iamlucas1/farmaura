# 2026-08-15 — "Ofertas do dia" ganha modo agendado (calendário) + `/offers` reaproveitada como extensão da faixa da home

## Contexto

Pedido do usuário: na home do marketplace, a faixa "Ofertas do dia" deveria mostrar só 2 fileiras de
produtos, com um botão levando para uma extensão completa da mesma lista; e o console interno
deveria ganhar a possibilidade de personalizar título/subtítulo, programar ofertas para dias
específicos e criar regras de repetição por dia da semana — além da reordenação que já existia para
o modo manual.

Duas decisões de escopo foram confirmadas com o usuário antes de implementar (ver
[[../../_Compartilhado/Skills/contexto|skill contexto]], usada para levantar o estado atual do
projeto antes de propor a mudança):

1. **Rota `/offers`**: já existia como vitrine genérica de "todo produto com `discount > 0`"
   (`ShopScreen mode="offers"`), usada como alvo de CTA em carrinho/checkout/cuidados/atalhos da
   home. Opção escolhida: **reaproveitar essa mesma rota** para mostrar a extensão da lista curada de
   "Ofertas do dia", em vez de criar uma rota nova — todo CTA existente que levava para lá agora leva
   para a lista curada, podendo ficar vazio se "Ofertas do dia" estiver desativada. Trade-off aceito
   explicitamente pelo usuário.
2. **Modelo de agendamento**: novo **4º modo `"scheduled"`**, convivendo com os 3 modos já existentes
   (`off`/`manual`/`auto` — sorteio aleatório por ciclo, ver
   [[2026-08-03-ofertas-do-dia-ciclos-automaticos-e-sorteio-por-parametros|ADR anterior]]), sem
   alterar nenhum deles.

## Decisão

### Backend — sem migration, mesmo padrão de settings schemaless já usado pela feature

Novo schema `DealScheduleEntry` (`schemas/portal.py`): `id`, `title`, `subtitle`, `product_refs`
(máx 30), `specific_dates` (lista de `"YYYY-MM-DD"`, máx 31), `weekdays` (lista de `0..6`, máx 7,
convenção `date.weekday()`), `start_date`/`end_date` opcionais (só limitam a recorrência semanal —
uma data específica já é autolimitada). `PortalDealOfTheDayResponse.mode` ganha o valor `"scheduled"`
e os campos `schedule_entries`, `title`, `subtitle` (esses dois últimos write-through/inertes nos
modos `manual`/`auto`, só populados de fato pelo resolve no modo agendado).

Resolução em `PortalService._resolve_deal_of_the_day`: novo método `_current_cycle_date(reset_time)`
(replica o cálculo de fronteira de dia já usado por `_deal_cycle_elapsed` — de meia-noite até
`reset_time`, "hoje" ainda é o dia de ontem — para o calendário nunca discordar do countdown/copy já
mostrados na faixa) + função `_match_deal_schedule_entry(entries, cycle_date)` (data específica
vence recorrência semanal; dentro de cada camada, a ordem da lista é o critério de desempate —
mesma convenção "ordem também é prioridade" já usada por `product_refs`). Esse caminho **não faz
nenhum `commit()`** — é leitura pura + escolha em memória — então não incorre no bug já documentado
de RLS limpo por commit ([[../04_Seguranca_Riscos|ver Segurança e Riscos]] /
`feedback_farmaura_rls_context_after_commit`, memória de sessão) que o modo `auto` precisa
contornar explicitamente.

### Frontend marketplace

`resolveDealOfTheDayProducts`/`DealCountdown` foram relocados de `home-screen.jsx` para
`core/marketplace-components.jsx` — o codebase não tinha nenhum import cross-screen até então (cada
tela só importa de `core/marketplace-*.jsx`), e agora essa lógica precisa ser consumida tanto pela
home quanto pela página `/offers`. A faixa da home (`DealOfTheDayStrip`) ganhou título/subtítulo
dinâmicos (fallback pro texto fixo de sempre quando vazios) e um cap CSS de 2 fileiras
(`.fa-deal-grid-limited`, `nth-child` espelhando os mesmos breakpoints de `.fa-grid-5`, sem listener
de resize) + botão "Ver todas as ofertas". `ShopScreen mode="offers"` passou a resolver seu `source`
pela lista curada em vez do filtro `discount > 0`, removendo o banner promocional fixo antigo
("Até 30% OFF...") em favor de um banner com o mesmo contador regressivo da home.

### Console interno

`deal-of-the-day-screen.jsx` ganhou um 4º botão de modo ("Agendado"). O bloco de curadoria de
produtos (abas de sugestão + busca manual + lista selecionada com ▲▼/remover), que só existia para o
modo manual, foi extraído para um componente `ProductCurationPanel` reutilizável — o modo agendado
precisa da mesma UI, só que uma instância por entrada do calendário em vez de uma lista única. Estado
de "qual aba está aberta"/"cache de nome-marca-preço por ref" continua no nível da tela (não por
entrada) — não faz sentido resetar a aba de sugestões toda vez que o admin troca de entrada.

Nova UI de calendário: lista de entradas reordenável (mesmo padrão de índice já usado para produtos)
+ editor por entrada (título, subtítulo, chips de datas específicas, botões de dia da semana +
intervalo opcional de vigência) + o `ProductCurationPanel` escopado à entrada selecionada.

## Consequências

- Todo CTA existente que navega para `{name:'offers'}` (carrinho, checkout, cuidados, banner/atalhos
  da home) agora mostra a lista curada de "Ofertas do dia" em vez de "todo produto com desconto" —
  pode ficar vazio se a seção estiver desativada ou sem produto ativo hoje. Aceito explicitamente
  pelo usuário.
- Sem migration — `deal_of_the_day` continua um único `PortalSetting` schemaless; `schedule_entries`/
  `title`/`subtitle` vêm com default vazio para configurações já persistidas (`mode` seguindo
  `off`/`manual`/`auto` como antes, sem nenhuma mudança de comportamento).
- Verificado nesta sessão: lógica de casamento (`_match_deal_schedule_entry`) testada diretamente no
  container `farmaura_api` reconstruído (data específica vencendo recorrência semanal; recorrência
  batendo o dia da semana certo; nenhum match retornando `None` corretamente); bootstrap público
  real (`GET /portal/marketplace/public-bootstrap`) confirmado retrocompatível (mode="manual" já
  configurado no ambiente de dev continuou intacto, novos campos vieram com default vazio); build de
  produção do frontend (`npm run build`) limpo, sem erros, com as novas strings de UI presentes nos
  bundles corretos (marketplace vs internal, code-split por portal preservado). **Não testado via
  Playwright/clique real** (exigiria login admin, que não estava disponível nesta sessão, e mutar a
  configuração `manual` já em uso no ambiente de dev compartilhado) — recomenda-se ao usuário abrir o
  console (Marketplace → Ofertas do dia → Agendado) e testar a criação de entradas manualmente antes
  de considerar a feature validada ponta a ponta.

## Ver também

- [[2026-08-03-ofertas-do-dia-curadoria-manual-e-motor-de-sugestoes|ADR: curadoria manual + motor de sugestões]]
- [[2026-08-03-ofertas-do-dia-ciclos-automaticos-e-sorteio-por-parametros|ADR: modo automático por ciclos]]
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]] — settings documentados (atualizar com o novo modo).
