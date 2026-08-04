# 2026-08-03 (2) — "Ofertas do dia" ganha modo automático: reset configurável + sorteio por categoria/marca/fonte

## Contexto

Sequência direta do ADR anterior (`2026-08-03-ofertas-do-dia-curadoria-manual-e-motor-de-sugestoes`),
na mesma sessão: a curadoria manual (mode `on`/`off`) resolvia o caso "admin escolhe os produtos e a
lista fica igual até ele mexer", mas o usuário pediu uma segunda forma de operar em cima da mesma
seção — um horário fixo diário configurável de "reset" e um sorteio automático por ciclo, seguindo
parâmetros salvos (categorias/marcas elegíveis + quantos produtos tirar de cada uma das 5 fontes já
existentes, mais um pool "aleatório puro"). Confirmado com o usuário antes de implementar: reset de
verdade em segundo plano (não só um botão), parâmetros combinando categoria/marca **e** as 5 fontes,
cadência em horário fixo diário.

## Decisão

### Três modos, não dois

`PortalDealOfTheDayResponse.mode` passa de `off|on` para **`off|manual|auto`**. `manual` é o
comportamento antigo (curadoria produto a produto, sem mudança). `auto` é novo: `product_refs` deixa
de ser editado à mão e passa a ser recalculado pelo próprio backend.

### Parâmetros do ciclo (`DealOfTheDayAutoParams`, novo schema)

`categories`/`brands` (nomes, mesma convenção de `PricingPromotion.target_categories`/
`target_products` — vazio = sem restrição) + um `count_*` por fonte
(`bestsellers`/`margins`/`promotions`/`discounts`/`coupons`) mais `count_random` (sorteio puro,
sem ranking de fonte nenhuma, só pro pool elegível). `reset_time` (`"HH:MM"`) fica direto em
`PortalDealOfTheDayResponse`, não dentro de `auto_params` — é usado também pelo contador da home no
modo manual (ver abaixo), não só pelo agendamento do modo automático.

### Onde o sorteio roda: dentro da própria leitura, não um scheduler novo

Cogitado um scheduler de verdade (mesmo padrão de `fiscal_scheduler.py`, tarefa `asyncio` em
processo) e descartado — mais simples e suficiente checar "o ciclo já virou?" **dentro de
`PortalService._resolve_deal_of_the_day`** (chamado pelos 3 bootstraps) e regenerar ali mesmo, na
hora, se preciso. `DealSuggestionService.generate_auto_selection` (novo) sorteia embaralhando cada
fonte (`random.shuffle`) e cortando no `count_*` configurado, depois embaralha o resultado combinado
de novo (pra não sair sempre agrupado por fonte). Isso evita processo de background novo — mesmo
espírito de "sem Celery/APScheduler" já estabelecido no projeto, só que resolvido por invalidação
lazy (igual ao TTL do cache de catálogo) em vez de um scheduler.

### Bug real encontrado e corrigido no processo: RLS limpo pelo commit da própria leitura

`_resolve_deal_of_the_day` agora pode **escrever** (persistir o sorteio novo) no meio do que é,
pros outros métodos, uma chamada de leitura — e isso comita a transação, o que limpa o contexto
transaction-local de RLS (mesma classe de bug já registrada no projeto,
`feedback_farmaura_rls_context_after_commit`). Sem correção, qualquer resolver chamado **depois**
de `_resolve_deal_of_the_day` na mesma resposta de bootstrap (`launch_mode`, `health_services`,
`coupons`, etc.) passaria a rodar sem contexto de tenant — sem erro visível, só silenciosamente
retornando vazio. Corrigido reaplicando o contexto certo logo após qualquer commit interno:
`apply_tenant_context(session, subject)` nos dois bootstraps autenticados (a função agora aceita um
`subject` opcional só pra isso) e `apply_public_marketplace_context(session, tenant_id)` no
bootstrap público anônimo — mesma dupla de funções já usada pelo resto do arquivo, nenhuma criada
do zero. **Um segundo ponto do mesmo bug** apareceu em `update_deal_of_the_day` (já existente, sem
mudança de código até agora): ele já comitava antes de chamar `_resolve_deal_of_the_day` pra montar
a resposta — inofensivo antes (`_resolve_deal_of_the_day` só lia `portal_settings`, sem RLS), virou
bug real agora que essa mesma chamada pode disparar a primeira geração automática (mode="auto" com
`last_generated_at=None`). Confirmado via teste real: o primeiro save em modo automático retornava
`product_refs: []` mesmo com dado real disponível, até a correção. Reaplicar o contexto ali também
resolveu.

### Reuso de `DealSuggestionService` fora do contexto de admin

`DealSuggestionService` foi construído no ADR anterior assumindo um `TokenSubject` de admin (rotas
`GET /deal-suggestions/*`). A regeneração automática roda também no bootstrap **público** (visitante
anônimo, sem subject nenhum) — refatorado o construtor pra receber `tenant_id: str` puro em vez de
`subject`, já que nenhum método do serviço de fato precisava do papel/usuário (a permissão já é
decidida na rota). Isso é mais uma composição serviço-a-serviço nova (`PortalService` chamando
`DealSuggestionService` de dentro de um método de leitura do bootstrap) — mesmo espírito de
`excecao-delivery-pricing-cross-service`/`excecao-fiscal-scheduler-sessao-propria`, registrada como
mais uma exceção nomeada em `03_Padroes_Politicas/`.

### Console interno

Toggle de 2 (`Sem ofertas do dia`/ligado) virou 3 botões (`Desativado`/`Manual`/`Automático
(ciclos)`), trocar de modo salva na hora (mesmo padrão do toggle antigo). Modo automático ganhou
painel próprio: campo de horário (`<input type="time">`), chips de categoria/marca (toggle
simples, reaproveitando `ctx.categories`/`ctx.brands` já carregados), 6 campos numéricos (um por
fonte + aleatório) com soma exibida, botão **"Gerar agora"** (salva os parâmetros pendentes antes de
sortear — senão rodaria com o que já estava salvo, ignorando edição recém-digitada) e um painel
somente-leitura mostrando o sorteio atual + data/hora da última geração.

## Consequências

- Sem migration — `deal_of_the_day` continua um único `PortalSetting` schemaless, só com mais campos
  no JSON.
- Verificado de ponta a ponta: configurado modo automático com parâmetros reais (3 mais vendidos + 2
  margem + 2 aleatório = 7), "Gerar agora" testado via Playwright: produtos batendo com os critérios.
  Ciclo automático testado de verdade — configurado `reset_time` ~3 minutos no futuro, aguardado
  passar do horário, e confirmado que uma nova chamada de bootstrap (sem clicar em nada) trouxe um
  conjunto de produtos totalmente diferente, com `last_generated_at` atualizado sozinho. Home do
  marketplace confirmada mostrando o contador no horário configurado (não mais meia-noite fixa) e os
  produtos corretos. Configuração de teste revertida pra `mode="off"` com parâmetros zerados ao final.
- Modo manual não teve nenhuma mudança de comportamento — mesma tela, mesmas setas, mesmo fluxo.

## Ver também

- [[2026-08-03-ofertas-do-dia-curadoria-manual-e-motor-de-sugestoes|ADR anterior (curadoria manual +
  motor de sugestões)]] — a base sobre a qual este modo automático foi construído.
- [[../02_Documentacao/Modulo_Portal|Módulo Portal]].
- [[feedback_farmaura_rls_context_after_commit|feedback: RLS limpo após commit]] (memória de sessão)
  — mesma classe de bug, aqui com um caso concreto novo documentado.
