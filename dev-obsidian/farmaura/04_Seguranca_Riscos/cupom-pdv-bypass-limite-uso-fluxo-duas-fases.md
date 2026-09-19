---
cssclasses: ia-nota
---

# Cupom no PDV: `usage_limit`/`per_customer_limit` checados na criação do pedido, nunca revalidados na finalização (fluxo em duas fases)

**Tipo:** Risco identificado (regra de negócio / bypass de limite, determinístico — não é uma corrida rara)
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `farmaura-api`
**Categoria:** Regra de negócio / integridade financeira
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

O fluxo de PDV é em duas fases, em duas transações separadas: `POST /pdv/orders` (fila — checa `usage_limit`/`per_customer_limit` do cupom via `CouponService.resolve_coupon`, mas **não incrementa** `usage_count`) e, minutos ou horas depois, `POST /pdv/orders/{id}/complete` (finalização — incrementa `campaign.usage_count += 1` sob `with_for_update()`, mas **sem reverificar** `campaign.usage_limit` nesse momento).

Isso é mais grave que uma simples corrida de concorrência: é **determinístico**. Basta enfileirar N pedidos citando o mesmo cupom (cada um passa a checagem individualmente, porque `usage_count` só sobe na conclusão) e completá-los em sequência normal — todos incrementam o contador, ultrapassando `usage_limit` sem nenhuma rejeição, mesmo sem qualquer tentativa deliberada de burlar o sistema.

## Evidência

`app/services/pdv_service.py:836-843` (bloco de finalização em `complete_sale`) só faz `campaign.usage_count += 1`, sem checar `campaign.usage_limit`. Comparar com `app/services/coupon_service.py:166` (`resolve_coupon`), que tem essa checagem — mas ela roda numa transação anterior (na criação da fila), já commitada, e não é repetida no momento em que o contador de fato sobe.

## Cenário de risco

Fluxo operacional normal, sem exploit técnico necessário: farmacêutico enfileira vários pedidos de PDV citando um cupom de uso limitado (ex.: promoção com `usage_limit=10`); o caixa completa esses pedidos ao longo do dia. Se mais de 10 pedidos citando esse cupom foram enfileirados antes do 10º ser completado, todos passam.

## Impacto

Bypass do limite de uso de cupom/promoção configurado pelo lojista — desconto concedido além do orçamento planejado para a campanha, sem qualquer alerta ao operador ou ao admin.

## Pré-condições

Acesso interno ao PDV (farmacêutico/gerente para criar a fila + caixa para completar) — é o fluxo operacional padrão, não uma ação anômala.

## Escopo afetado

`app/services/pdv_service.py` (`complete_sale`, bloco de incremento de cupom), `app/services/coupon_service.py` (`resolve_coupon`, checagem que não é repetida).

## Causa raiz

A checagem de limite (na criação da fila) e o incremento do contador (na finalização) não ocorrem na mesma transação nem no mesmo momento lógico; o ponto de incremento não repete a validação que deveria autorizá-lo.

## Correção sugerida para análise futura

Repetir a checagem `usage_limit`/`per_customer_limit` dentro do bloco já lockado (`with_for_update()`) em `complete_sale`, imediatamente antes do incremento — abortando a finalização (ou removendo o desconto do cupom, dependendo da decisão de produto) se o limite já tiver sido atingido por outros pedidos concluídos nesse meio-tempo.

## Dependências da correção

Nenhuma migration — mudança de lógica de aplicação. Decisão de produto necessária: o que fazer quando o limite já foi atingido no momento da finalização (rejeitar a venda toda, ou só remover o desconto do cupom e prosseguir)?

## Riscos de regressão

Baixo-médio — mudar o comportamento de "sempre aplica o cupom que foi resolvido na criação" para "pode falhar/mudar na finalização" é uma mudança de UX perceptível para o operador de caixa; vale alinhar com o time de produto antes de implementar, não só tecnicamente.

## Como validar futuramente que a correção funcionou

Teste automatizado: criar um cupom com `usage_limit=1`, enfileirar dois pedidos PDV citando esse cupom, completar ambos em sequência, e confirmar que o segundo é rejeitado (ou tem o desconto removido) em vez de incrementar `usage_count` para 2.

## Referências

- [[pdv-complete-sale-sem-guarda-estado]] — mesmo método (`complete_sale`), outra lacuna de guarda.
- [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — race condition como categoria de ataque a defender.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.