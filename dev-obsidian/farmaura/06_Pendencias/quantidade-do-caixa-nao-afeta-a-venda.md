---
cssclasses: ia-nota
---

# Stepper de quantidade na tela do caixa do PDV não tem efeito real na venda

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-18

## Descrição

`POST /pdv/orders/{id}/complete` (`PdvSaleCreateRequest`, chamado por `recordSale` no frontend ao finalizar a venda) não recebe `items` no payload — só `payment_method`, `include_cpf_on_invoice`, `cashback_applied`, `payment_terminal_reference`. A venda é sempre faturada a partir das linhas já persistidas em `PdvOrderItem`, gravadas no momento em que o farmacêutico enviou o pedido à fila (`POST /pdv/orders`) — nunca a partir do que está em `pdvCart` no momento da finalização.

Isso significa que o botão "+"/"−" de quantidade no carrinho, quando visto na **tela do caixa**, não muda nada de fato na venda — é só estado local do React (`pdvCart`), que nunca é enviado de volta ao servidor nessa etapa. O caixa pode mexer no número em tela (e ver o subtotal/total mudarem, já que esses são calculados no cliente a partir de `pdvCart`), mas o que será realmente cobrado e registrado em `PdvSale`/`PdvSaleItem` continua sendo exatamente o que o farmacêutico enviou.

## Contexto

Achado ao implementar o bloqueio de quantidade por receita validada na tela do caixa (farmacêutico valida a receita para N unidades; caixa não pode aumentar além disso — ver [[../00_Decisoes/2026-09-18-carrinho-caixa-cashback-modal-local-e-teto-de-receita|ADR]]). Ao investigar onde a quantidade do caixa realmente impacta a venda, para decidir se o reforço deveria ser só de UI ou também no servidor, descobri que o `complete_sale` nunca olha pra quantidade vinda do cliente — então, na prática, aumentar a quantidade em tela nunca teria mudado o que é cobrado, controlado ou não.

Isso torna o risco de conformidade que motivou o pedido (vender mais do que a receita cobre) estruturalmente já impossível — mas expõe um problema de UX diferente e real: o número que o caixa vê (quantidade, subtotal, total) pode ficar desalinhado do que será de fato faturado, sem nenhum aviso. Se o farmacêutico enviou 2 unidades à fila e o caixa, por engano ou tentativa, aumenta pra 3 em tela, o cliente pode ser informado de um valor que não é o cobrado — a nota fiscal sai com base nas 2 unidades reais, mas a tela mostrou 3.

## Próximo passo sugerido

Decidir o comportamento pretendido antes de corrigir:
- Se o caixa **nunca** deveria poder editar quantidade (só farmacêutico, antes de enviar à fila): remover o stepper de quantidade da tela do caixa inteira (não só para itens controlados), deixando só visualização — mais simples e consistente com o que já acontece de fato.
- Se o caixa **deveria** poder ajustar quantidade em casos legítimos (ex.: cliente decide levar mais um item OTC no balcão): precisa de um novo endpoint para atualizar itens de um `PdvOrder` já na fila/claimed, e `complete_sale` (ou uma etapa antes dela) precisaria revalidar estoque/desconto/receita contra a nova quantidade — não é uma mudança pequena.
