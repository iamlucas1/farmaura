---
cssclasses: ia-nota
---

# 2026-08-31 — Carrinho e checkout redesenhados conforme o demo, unificados numa jornada de 3 fases

## Contexto

Sessão em duas rodadas. Pedido inicial: portar o visual do carrinho do demo de referência
("Farmaura — Padrão farmácia", Artifact `9dcd4089-953a-44bf-b486-bc751cc88cd7`, seção
`data-cat="cart"`) para `screens/cart-screen.jsx`, com integração real de backend — o carrinho já
era uma tela funcional (sync real com `/customers/me/cart`, cupom server-authoritative,
recorrência com desconto real de 15%), então o trabalho era majoritariamente visual: card de item
em grid (thumb/info/aside), badge de receita com CTA "Enviar receita" (ligado ao chat real,
`openPrescription`), modal de confirmação ao remover item mostrando o desconto perdido
(`RemoveItemModal`, mesmo padrão do `RecurrenceOffModal` já existente), link "Como funciona a
recorrência?" abrindo o `RecurrenceInfoModal` já existente.

Segunda rodada, feedback direto do usuário sobre a primeira entrega: botão "Continuar comprando"
fora do lugar certo, subtítulo "N itens · revise antes de finalizar" sobrando (redundante com a
nova contagem "N produtos"), "Resumo do pedido" com visual completamente diferente do demo (mas
preservar `FreeShipBar` e "Pagamento 100% seguro", que não existem no demo), "Quem levou esses
itens também levou" precisava do mesmo nível de detalhe do card do demo, e — pedido novo, não
estava no demo original — implementar um **faseamento em 3 partes**: 1) revisão do produto, 2)
entrega, 3) pagamento.

Achado ao investigar o pedido de faseamento: `checkout-screen.jsx` (variante `checkoutVariant`
`"A"`, a única alcançável — `"B"` é constante morta, mesmo padrão já confirmado pra
`cardVariant`/`homeVariant`/`productVariant` no ADR da PDP) já tinha um wizard de etapas real
(`StepHead`, indicador numerado com check verde), mas com até 4 etapas (`delivery` → `rx`
condicional → `payment` → `review` final) e **sem o carrinho como uma etapa nomeada** — decisão
registrada no [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|roadmap de
composição visual]] (Fase 6, 2026-08-26): "carrinho deliberadamente fora, não havia elemento de
moldura comparável". O pedido desta sessão reverte essa decisão.

## Alternativas consideradas

- **Trazer a seção de entrega (CEP/mapa/Waze) do demo para dentro do carrinho** — descartada
  ainda na primeira rodada, por resposta explícita do usuário: o checkout já tem esse fluxo mais
  completo (ViaCEP real, checagem de cobertura, escolha de loja, mapa Leaflet); duplicar dentro do
  carrinho custaria manter duas cópias sincronizadas sem ganho real.
- **Fundir carrinho e checkout numa única rota/componente** para o faseamento de 3 partes —
  descartada: exigiria reescrever roteamento (`onNav`/estado de tela em `marketplace-app.jsx`) sem
  necessidade real. Mantidas as duas rotas existentes (`cart`, `checkout`), conectadas por um
  indicador de fase compartilhado (`CheckoutPhaseBar`, novo em `marketplace-components.jsx` — não
  em nenhuma das duas telas, porque `checkout-screen.jsx` já importa `OrderSummary` de
  `cart-screen.jsx`; colocar o componente em qualquer uma das duas criaria import circular).
- **Manter a etapa "Receita digital" (`PrescriptionCard`) como uma 4ª fase nomeada** — descartada
  ao descobrir, nesta investigação, que `PrescriptionCard.data.sent` é um toggle 100% client-side
  (`set({ ...data, sent: !data.sent })`), nunca chamou nenhum endpoint — um placeholder visual, não
  uma feature real. O carrinho (fase 1, desta mesma sessão) já tem um CTA real por item
  (`openPrescription` → chat → `ChatService.submit_customer_prescription`, que de fato cria
  `Prescription`+anexo). Manter as duas seria oferecer um caminho fake ao lado do real. Substituído
  por um lembrete compacto e real dentro da fase "Entrega" (mesmo botão `openPrescription`), sem
  virar uma 4ª fase — mantém o pedido literal do usuário (3 fases, pagamento por último).
- **Reescrever `CartRecommendations` do zero para bater com o card do demo** — descartada em favor
  de reaproveitar `ProductCard`+`ScrollRail`, componentes já existentes e já fiéis ao `.card` do
  demo (badges, super-badge, preço com desconto, coração de favorito) — mesmo padrão já usado em
  `product-screen.jsx` ("Quem viu, levou também"). Reaproveitar evitou duplicar a lógica de card
  pela terceira vez no código (já existia em `home-screen.jsx`/`shop-screen.jsx`/`product-screen.jsx`).
- **Desconto de recorrência: 10% (demo) vs. 15% (já em produção)** — mantido 15%, decisão do
  usuário na primeira rodada; mudar seria alterar precificação real, não só visual.

## Decisão

**Primeira rodada (visual do carrinho):**
- `screens/cart-screen.jsx`: card de item em grid (`fa-cart-item`/`-media`/`-info`/`-aside`, novo
  em `marketplace.css`), badge "Receita necessária" + botão "Enviar receita" por item, remoção
  passa por `RemoveItemModal` (novo em `marketplace-components.jsx`, mesmo padrão do
  `RecurrenceOffModal`: calcula e mostra o desconto perdido — de catálogo e/ou de recorrência —
  só quando há algo real a perder).
- `RecurrenceInfoModal` (já existente, antes só acessível pelo ícone de cada item) ganhou um
  segundo ponto de entrada: link "Como funciona a recorrência?" no cabeçalho da lista de itens.

**Segunda rodada (feedback + faseamento):**
- `OrderSummary` (compartilhado por `cart-screen.jsx` e `checkout-screen.jsx`) reescrito com as
  classes do demo (`fa-cart-summary-row`, `.is-discount`, `fa-cart-summary-total` — total grande,
  mono, cor primária). `FreeShipBar` e a linha "Pagamento 100% seguro" — que não existem no demo —
  preservadas, por pedido explícito.
- Campo de cupom movido para dentro do `OrderSummary` (nova prop `beforeTotal`), entre "Entrega" e
  "Total", mesma posição do demo.
- "Continuar comprando" virou link de texto (`fa-cart-continue-link`) no rodapé do resumo, mesma
  posição/estilo do demo — antes era um botão solto abaixo da lista de itens.
- `CartRecommendations` reescrito para usar `ScrollRail`+`ProductCard` (variant/onOpen/onAdd/
  onBuyNow/onFav/onNotify — mesmo `cardProps` já usado em `home-screen.jsx`/`shop-screen.jsx`/
  `product-screen.jsx`), dentro de `pd-section`/`pd-carousel-head` — mesmo container real de
  "Quem viu, levou também" na página de produto. Ganha de graça: super-badge, coração de favorito,
  aviso de fora de estoque, dois botões reais ("Comprar agora"/"Adicionar ao carrinho").
- Novo `CheckoutPhaseBar`/`CHECKOUT_PHASES` (`marketplace-components.jsx`) — 3 fases fixas
  (Revisão/Entrega/Pagamento), fase clicável só se já alcançada. Renderizado numa `FullBleedBand`
  no topo de `cart-screen.jsx` (fase 1, sempre ativa) e de `checkout-screen.jsx` (fases 2-3).
- `checkout-screen.jsx` variante A simplificada: estado interno passou de até 4 "steps" pra 2
  (`delivery`/`payment` — `step` 0/1), mapeados pra `activeIndex = step + 1` no indicador de 3
  fases. Etapa "Pagamento" ganhou um cartão de recapitulação da entrega escolhida (com link
  "Alterar" de volta pra fase 2), preenchendo o papel da antiga etapa de revisão final sem virar
  uma 4ª fase. `StepHead` renumerado (`n="2"`/`n="3"`) pra bater com o número que o indicador de
  fases já mostra — antes tinha duas numerações diferentes na mesma tela.

**Terceira rodada (correções de layout no mesmo dia, mesma decisão):**
- `.fa-cart-summary` perdeu `position: sticky` — o card de resumo, numa grade CSS onde a coluna do
  carrinho é mais alta que a do resumo, ficava "grudado" dentro da própria célula (comportamento
  correto de sticky) mas em telas mais curtas/larguras específicas isso lia como se estivesse
  sobrepondo/cortando o conteúdo abaixo. Pedido explícito do usuário ("faça com que o resumo não
  se mexa") — resumo agora rola normalmente com a página, sem stickiness.
- As recomendações (agora duas seções reais) foram movidas pra **fora** de `fa-cart-grid` —
  antes viviam dentro da coluna esquerda (872px, compartilhando linha com os 380px do resumo),
  cortadas pela largura da coluna; agora são um `pd-section` de largura cheia dentro do `fa-wrap`,
  abaixo da grade inteira (carrinho + resumo), igual ao "ocupar a tela inteira" pedido.
- A única vitrine anterior ("Quem levou esses itens também levou", heurística local de
  categoria+mais-vendido+desconto) virou **duas vitrines reais**, mesma fonte de dado já usada na
  página de produto — não inventada agora: `resolveAlsoBoughtProducts` (já exportada,
  `marketplace-components.jsx`) e o endpoint real `GET /catalog/products/{id}/also-bought`
  (`catalog.py:84`, dado de co-compra de verdade, não heurística) alimentam "Outros clientes
  também compraram", buscado **por item do carrinho** e mesclado (primeira ocorrência vence,
  paralelo via `Promise.all`) — diferente da página de produto, que busca só pra 1 produto.
  "Recomendados para você" reusa o mesmo fallback já usado lá (mesma categoria primeiro, depois
  preenche por nº de avaliações), agora considerando todas as categorias presentes no carrinho.
  Nenhuma das duas seções duplica produto já mostrado na outra.

**Quarta rodada (bug real, `marketplace-app.jsx`, fora do escopo visual desta ADR mas do mesmo
fluxo):** usuário relatou que ativar a recorrência de um item fazia os OUTROS itens do carrinho
"desaparecerem" (ficava só o item recém-alterado) — recuperados sempre que a página era
atualizada (F5). Isso já indicava que o servidor nunca perdeu dado nenhum (confirmado também
direto pela API: toda resposta de `PUT/DELETE /customers/me/cart/{ref}` e de
`GET /customers/me/cart`, testada exaustivamente via Playwright — sessão logada, visitante,
mobile, toggle duplo rápido, toggle no instante exato do carregamento da página — sempre trouxe a
lista completa e correta). Não foi possível reproduzir automaticamente (rede local Docker é rápida
e determinística demais pra expor isso), mas o mecanismo mais plausível — e consistente com "F5
resolve" — é uma condição de corrida client-side real: `syncCartItem`/`removeCartItem`
(`marketplace-app.jsx`) e o `GET /customers/me/cart` do bootstrap inicial todos **substituem a
lista inteira de `items`** pela resposta do servidor; se uma resposta mais antiga (de uma chamada
anterior, ainda em voo) chega **depois** de uma mais nova — perfeitamente possível em rede real,
onde a ordem de chegada não segue a ordem de disparo — ela sobrescreve silenciosamente o estado
mais recente com um retrato mais velho. Corrigido com um contador de sequência
(`cartMutationSeqRef`, incrementado antes de cada chamada que dispara uma dessas três
requisições): cada resposta só é aplicada se ainda for a mais recente disparada; uma resposta
"atrasada" é descartada, já que a chamada mais nova (ou uma futura) é quem vai trazer o estado
realmente atual. Nenhuma mudança de comportamento observável quando não há corrida — mesmo
resultado de sempre.

**Quinta rodada (causa raiz real do mesmo bug, `marketplace-app.jsx`, 2026-09-01):** o guard de
sequência da quarta rodada é defensivo e correto, mas não era a causa do bug relatado — o usuário
reproduziu de novo com um roteiro mais específico: adicionar itens ao carrinho **sem estar
logado**, fazer login, ir para o carrinho, ativar recorrência num item → os outros somem. Causa
raiz: o carrinho de visitante vive **só em estado local/`localStorage`** (não existe endpoint de
carrinho para visitante — `/customers/me/cart` exige auth). Ao logar, o efeito de merge
guest→conta (linha ~1301) já existia e juntava os itens do visitante com o cache local da conta
corretamente **na tela**, mas nunca persistia esses itens no servidor — o servidor seguia sem
saber que eles existiam. A primeira mutação de item único depois disso (`syncCartItem` — ex:
ativar recorrência) faz um `PUT` de só aquele item e aplica a resposta do servidor como "o
carrinho inteiro", **substituindo** o estado local por completo; como o servidor nunca viu os
itens de visitante, eles simplesmente não vêm na resposta e desaparecem da tela (e do
`localStorage`, já que o efeito de persistência de cache reage a toda mudança de `items`) — sem
depender de nenhuma corrida de rede, 100% reproduzível. É por isso que a rodada anterior não
conseguiu reproduzir via Playwright: todo teste automatizado partia de uma sessão já logada, nunca
do fluxo visitante → login → carrinho.

Corrigido em duas camadas, `marketplace-app.jsx`:
1. O efeito de merge guest→conta agora também **persiste** os itens do carrinho de visitante no
   servidor logo após o merge — um `syncCartItem` por item, **sequencial** (não em paralelo, pra
   garantir que a resposta "carrinho completo" de cada `PUT` já reflita os itens anteriores
   confirmados, já que o backend não garante ordem de commit entre requisições concorrentes).
   Fire-and-forget (o merge local já deixou a tela correta; isso só põe o servidor a par).
2. Rede de segurança: a resposta de `syncCartItem` (só essa — não `removeCartItem`, que remove de
   propósito) agora funde com o estado anterior em vez de substituir — qualquer item presente
   antes e ausente na resposta de um `PUT` é mantido, já que um `PUT` nunca é uma remoção real.
   Cobre a janela residual entre o login e a persistência em segundo plano terminar.

Verificado via Playwright reproduzindo o roteiro exato do usuário (visitante adiciona 2 itens →
login → navega pro carrinho → ativa recorrência num item sem `select` de frequência ainda) contra
o build de produção real: a resposta do próprio `PUT` de ativação já trazia os dois produtos (prova
de que a persistência em segundo plano correu antes da mutação), carrinho manteve os 2 itens depois
do toggle e depois de F5.

**Sexta rodada (checkout, `checkout-screen.jsx`, 2026-09-01):** o "Resumo do pedido" (sidebar do
checkout, variante A) tinha dois bugs reais — thumbnail do item vazio (o card não renderizava
imagem nenhuma, só um `<div className="fa-ph">` sem filho) e badge de quantidade nunca visível
(posicionado com offset negativo dentro de um contêiner com `overflow: hidden`, então ficava
recortado). Corrigido trocando o placeholder cru por `ProductVisual` (mesmo componente já usado no
carrinho) dentro de um wrapper `position: relative` sem `overflow: hidden`, badge só aparece
quando `qty > 1`.

Pedido maior na mesma rodada: consolidar a etapa de entrega dentro do próprio "Resumo do pedido"
em vez de só numa lista de totais. Mudanças:
- **Lista de itens paginada**: mostra só 5 produtos por vez (`SUMMARY_VISIBLE_ITEMS`), com seta
  para baixo/cima que desloca a janela em 1 item por clique (não é um scroll de página, é o mesmo
  padrão "sobe 1, desce 1" pedido explicitamente).
- **Endereço reduzido + troca via modal**: se o cliente tem endereço salvo, mostra `label`
  (apelido: Casa/Trabalho/etc, já existia no schema) + linha reduzida
  (`buildAddressLine`/`buildAddressSecondaryLine`, já existiam em `marketplace-address.js`, não
  inventados agora). Botão "Alterar endereço" abre um modal (`Modal` já existente,
  `marketplace-components.jsx`) listando os endereços salvos do cliente + "Cadastrar novo
  endereço". Escolher um salvo troca a entrega na hora; "Cadastrar novo" fecha o modal e abre,
  na tela de entrega (coluna esquerda), o **mesmo** `AddressForm` já usado em "Gerenciar perfil"
  (`account-profile-screen.jsx` — reaproveitado via export, não duplicado), com apelido, ViaCEP e
  botão "Salvar endereço"/"Cancelar" reais (`ctx.createCustomerAddress`).
- **Seletor de método de entrega movido para o Resumo do pedido**: antes vivia só no formulário
  grande da esquerda (`DeliveryForm`); a lógica de cobertura (`coverage`, `checkCoverage`) foi
  içada de `DeliveryForm` para `CheckoutScreen`, e "Envio por transportadora" só entra na lista
  quando `coverage.requires_shipping` é verdadeiro — antes aparecia sempre.
- **`DeliveryForm` (usado só pela `checkoutVariant === 'B'`, morta) não foi alterada
  funcionalmente** — o form completo, o seletor de método e a lógica de cobertura internos
  continuam lá intactos. O único toque nela foi extrair o bloco de retirada/mapa para um novo
  componente `PickupStorePicker` (refatoração pura, mesmo output), reaproveitado tanto por
  `DeliveryForm` quanto pela variante A agora.
- Verificado via Playwright (login real, 8 produtos no carrinho, fluxo completo): imagens e badge
  de quantidade corretos, seta desce/sobe troca a janela de 5 itens, modal de endereço abre e
  lista o endereço real do cliente, "Cadastrar novo endereço" volta pra tela de entrega com o
  form completo aberto, "Retirar na loja" esconde o bloco de endereço e mostra o picker de loja +
  mapa real na coluna esquerda. Zero erros de console em todo o fluxo.

**Sétima rodada (gate de autenticação da rota, `checkout-screen.jsx`, 2026-09-01):** o botão
"Finalizar compra" já passava por `requireAuth` (`marketplace-app.jsx`), que redireciona ao login
e reexecuta a ação após autenticar — mas isso só protegia aquele clique específico. Acessar
`/checkout` direto pela URL (digitada, favoritada, ou um link antigo depois de um logout) chegava
direto no formulário de entrega/pagamento sem estar logado, sem passar pelo gate. Corrigido com
uma guarda de rota dentro do próprio `CheckoutScreen`: se `ctx.user` for nulo, renderiza um prompt
inline ("Entre para continuar sua compra" + botões "Entrar na conta"/"Voltar ao carrinho") em vez
do conteúdo do checkout — mesmo padrão já usado por `AccountScreen` para o mesmo cenário (`!user`
depois de todos os hooks, nunca um redirect automático, pra um F5 nessa tela não simplesmente
chutar o visitante pra outro lugar sem explicação). Verificado via Playwright: visitante sem login
batendo direto em `/checkout` vê o prompt (nenhum campo de entrega/pagamento vaza), "Voltar ao
carrinho" navega pra `/cart`; fluxo logado (adicionar itens, chegar no resumo, trocar
endereço/método) retestado sem regressão.

## Consequências

- Nenhuma migration; nenhuma mudança de schema ou endpoint. Todo dado consumido já era real
  (`is_subscription`, preço/desconto de catálogo, `checkCoverage`, métodos de pagamento) — nada
  novo foi simulado.
- `checkoutVariant === 'B'` (branch morta, nunca alcançável) não foi tocada — `PrescriptionCard`
  continua exportada e usada lá; só deixou de ser renderizada na variante A (a única real).
- Reverte a decisão "carrinho deliberadamente fora" da Fase 6 do roadmap de composição visual —
  ver entrada correspondente lá.
- "Outros clientes também compraram" dispara 1 requisição `also-bought` por item único do
  carrinho (paralelo, `Promise.all`) — aceitável para o tamanho típico de carrinho (poucos itens);
  reavaliar se algum dia o carrinho comportar dezenas de itens.
- `FullBleedBand` usa por padrão `padding-bottom: 86px` (`.fa-band .fa-wrap`, pensado pra banda
  decorativa tipo hero, com título/subtítulo/conteúdo denso) — pra uma banda fina que só carrega
  o `CheckoutPhaseBar`, isso sobrava como espaço vazio óbvio. Corrigido com
  `contentStyle={{ paddingTop: 22, paddingBottom: 22 }}` nas duas bandas de fase (carrinho e
  checkout variante A) — não é um ajuste geral do componente, só destas duas instâncias.
- Verificado via build de produção real (`docker compose build/up farmaura`) + Playwright contra
  `localhost:3000`, logado como cliente semeado (`mariana.souza@cliente.farmaura.com.br`): carrinho
  com item de receita real (Clonazepam) mostrando o botão "Enviar receita", modal de remoção com
  cálculo de perda ativo (recorrência ligada em tempo real durante o teste), fluxo completo
  Revisão → Entrega → Pagamento com o indicador de fase e o cartão de recapitulação corretos,
  carrinho em mobile (390px). Nenhum erro de console/JS.

## Ver também

- [[../09_Design_Visual/Roadmap_Composicao_Visual_Padrao_Farmacia|Roadmap de composição visual "padrão farmácia"]] — Fase 6 atualizada por esta decisão.
- [[2026-08-31-pagina-de-produto-redesenhada-conforme-demo|2026-08-31-pagina-de-produto-redesenhada-conforme-demo]] — mesma prática (reaproveitar componente real em vez de duplicar) aplicada à PDP no mesmo dia.
- [[../06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas|product-ref-nao-normalizado-quebra-favoritos-assinaturas]] — não afetado por esta mudança, mas mesmo domínio (`cart_items`/`is_subscription`).