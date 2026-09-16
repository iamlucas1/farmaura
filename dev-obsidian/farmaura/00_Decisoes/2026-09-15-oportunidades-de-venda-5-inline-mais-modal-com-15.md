# 2026-09-15 — "Oportunidades de venda": 5 direto no painel + modal "ver mais" com até 15

## Contexto

O painel "Oportunidades de venda" (ver [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv|ADR do motor]]) mostrava até 4 produtos, sem forma de ver mais. Pedido: mostrar 5 direto no painel, com um botão para abrir uma modal e ver até 15, na mesma ordem de relevância.

## Decisão

- `UPSELL_SUGGESTIONS_LIMIT` (`purchase_history_service.py`) subiu de 4 para 15 — o backend já resolve e ranqueia até 15 candidatos reais (em estoque) por chamada, em vez de cortar em 4 antes da hora.
- `pdvSuggestions` (cold-start local, carrinho vazio) também passou a preencher e devolver até 15 itens (antes cortava em 4, com um pool de reserva de só 6).
- `PdvUpsell` (`point-of-sale-screen.jsx`): mostra os 5 primeiros (`PDV_UPSELL_INLINE_LIMIT`) direto no painel; se houver mais, um botão "Ver mais oportunidades (N)" abre uma `Modal` com a lista completa (até `PDV_UPSELL_MODAL_LIMIT = 15`), na mesma ordem — clicar "Oferecer" dentro da modal adiciona o item e fecha a modal.

## Bug real encontrado e corrigido no caminho

Ao testar o carrinho vazio, o painel ficava travado em "Sem sugestões no momento" mesmo depois de vários segundos. Causa: o `useEffect` que calcula `upsellSuggestions` (para carrinho vazio, calcula localmente via `pdvSuggestions(insights, inventory, pdvCart)`) não tinha `inventory`/`insights` no array de dependências — se o estoque carrega de forma assíncrona depois do primeiro render, o efeito nunca recalculava, porque nenhuma das variáveis que ele de fato lê estava na lista de gatilhos. Corrigido adicionando `inventory` e `insights` às dependências do efeito. O caminho de carrinho não-vazio (busca no backend) não foi afetado — quem decide buscar de novo ali é só o carrinho/cliente, de propósito (ver comentário no código).

## Consequências

- Testado ponta a ponta via Chrome headless: carrinho vazio mostrou 5 itens + "Ver mais oportunidades (5)"; a modal abriu com os 10 disponíveis (o pool de fallback local não tinha 15 produtos distintos suficientes neste ambiente de dev); ofertar um item de dentro da modal adicionou ao carrinho e fechou a modal corretamente, e a lista de sugestões se atualizou sozinha para refletir o novo carrinho.
- Nenhuma mudança de contrato de API — só o valor do limite.

## Ver também

- [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv]] — ADR do motor de recomendação em si (os quatro sinais combinados).
