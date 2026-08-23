# PDV: `complete_sale`/`claim_order` sem guarda de estado — dupla finalização duplica venda, cashback, cupom e documento fiscal

**Tipo:** Risco identificado (máquina de estados / dupla execução)
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `farmaura-api`
**Categoria:** Concorrência / integridade financeira (não requer concorrência real)
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

`PdvService.complete_sale(order_id, payload)` busca a `PdvOrder` e cria uma nova `PdvSale`/itens **sem checar se `order.order_status` já é `"completed"`**. Se chamada duas vezes para o mesmo `order_id` (duplo clique no caixa, retry de rede), cada execução: cria uma nova `PdvSale` (com `sale_code` novo via `uuid4`), roda `_settle_cashback_ledger` (débito/crédito de wallet de cashback), incrementa `campaign.usage_count` (se houver cupom) e emite documento fiscal (`fiscal_service.issue_for_pdv_sale`) — tudo duplicado.

`claim_order` tem a mesma lacuna: nenhuma checagem do `order_status` atual antes de sobrescrever para `"claimed"` — o que inclusive permite "reclamar" de volta um pedido já `completed`/`cancelled`, reabrindo a porta para completá-lo de novo.

Por contraste, o método vizinho `cancel_order` no mesmo arquivo **já tem** a guarda correta (checa `order.order_status == "completed"` e `== "cancelled"` explicitamente antes de agir) — mostra que o padrão é conhecido no codebase, só não foi replicado em `complete_sale`/`claim_order`.

## Evidência

`app/services/pdv_service.py:734-846` (`complete_sale`) e `:558-595` (`claim_order`) — nenhum `if order.order_status == "completed": raise HTTPException(409, ...)`. Comparar com `:597-609` (`cancel_order`), que tem essa checagem.

## Cenário de risco

Operador de caixa clica duas vezes em "finalizar venda" na tela de PDV, ou o app do console repete a requisição `POST /pdv/orders/{id}/complete` após um timeout percebido (mas que já tinha sido processado no servidor).

## Impacto

- Receita duplicada nos relatórios financeiros/PDV.
- Cashback creditado/debitado duas vezes ao cliente.
- Contador de uso de cupom (`campaign.usage_count`) incrementado a mais (ver achado relacionado [[cupom-pdv-bypass-limite-uso-fluxo-duas-fases]]).
- Documento fiscal duplicado para a mesma venda.

## Pré-condições

Acesso interno (CASHIER/ADMIN/MANAGER) + duas requisições ao mesmo `order_id`. Não exige concorrência real — funciona sequencialmente.

## Escopo afetado

`app/services/pdv_service.py` (`complete_sale`, `claim_order`), rotas correspondentes em `app/api/v1/pdv.py` (`POST /pdv/orders/{id}/complete`, endpoint de claim).

## Causa raiz

Ausência de checagem de estado terminal antes de reexecutar efeitos colaterais irreversíveis (criação de venda, movimentação de cashback, incremento de cupom, emissão fiscal) — o padrão de guarda já existe em `cancel_order` no mesmo arquivo, mas não foi replicado.

## Correção sugerida para análise futura

Adicionar guarda de estado em `complete_sale` (`if order.order_status != "claimed": raise HTTPException(409, ...)` ou equivalente — ajustar à máquina de estados real do pedido PDV) e em `claim_order` (`if order.order_status != "queued": raise HTTPException(409, ...)`), espelhando exatamente o padrão já usado em `cancel_order`.

## Dependências da correção

Nenhuma migration — mudança de lógica de aplicação.

## Riscos de regressão

Baixo — a guarda só bloqueia reexecução indevida sobre um pedido que já mudou de estado; não deveria afetar o fluxo normal de completar um pedido ainda `"claimed"` uma única vez.

## Como validar futuramente que a correção funcionou

Teste automatizado: completar um pedido PDV, depois chamar `complete_sale` de novo para o mesmo `order_id` e confirmar 409 (não uma segunda `PdvSale`); repetir para `claim_order` sobre um pedido já `completed`/`cancelled`.

## Referências

- [[rejeicao-prescricao-duplicavel-credita-estoque-em-dobro]] — mesma classe de bug em outro fluxo.
- [[cupom-pdv-bypass-limite-uso-fluxo-duas-fases]] — consequência relacionada (incremento de cupom duplicado).
- [[../02_Documentacao/Modulo_PDV|Modulo_PDV]].
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
