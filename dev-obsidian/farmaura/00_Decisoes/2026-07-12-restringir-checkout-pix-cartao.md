# 2026-07-12 — Restringir checkout do marketplace a Pix, crédito e débito

## Contexto

O checkout do marketplace precisava de um conjunto fechado de meios de pagamento antes de integrar um provedor real. Definir esse escopo primeiro evita construir tokenização/cobrança para métodos que não serão suportados na primeira fase.

## Alternativas consideradas

- **Suportar boleto bancário também** — descartado nesta fase; aumentaria a superfície de conciliação (vencimento, baixa manual) sem estar nos requisitos imediatos.
- **Manter qualquer método futuro em aberto no schema** — descartado; optou-se por restringir explicitamente no domínio (enum fechado) em vez de aceitar valores livres.

## Decisão

Checkout do marketplace aceita apenas **Pix, cartão de crédito e cartão de débito**. Commit `ead6bb3`.

## Consequências

- Precede e prepara o terreno para a tokenização real de cartão (`edca24e`) e o processamento real de Pix/cartão via Asaas (`45bb58f`) — decisão de escopo antes de decisão de provedor.
- Qualquer novo método de pagamento exige revisitar esta decisão explicitamente, não apenas adicionar um valor a um enum genérico.
- Ver [[Asaas]] para o provedor que implementa esses métodos.

## Ver também

- [[2026-07-12-tokenizacao-cartao-real-asaas]] — decisão seguinte na mesma cadeia de escopo → provedor.
- [[2026-07-12-pagamentos-pix-cartao-via-asaas]] — processamento real que esta decisão prepara.
