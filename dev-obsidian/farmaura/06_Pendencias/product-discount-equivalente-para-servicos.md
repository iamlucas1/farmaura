# Sem equivalente a "desconto direto de produto" para serviços de saúde

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-31

## Descrição

`PricingPromotion.kind` segrega `campaign` (segmentável por audiência) de `product_discount`
(markdown direto, sempre `scope_type="products"`, nunca segmentado — ver
[[../00_Decisoes/2026-07-30-remover-desconto-manual-precificador-kind-promocao|ADR]]). Serviços de
saúde só ganharam o eixo `scope_type="services"` dentro de `kind="campaign"` — não existe um
"desconto direto de serviço" equivalente ao `product_discount`. Um admin que só quer marcar um
serviço com preço promocional simples (sem nenhum filtro de audiência) precisa criar uma campanha
completa mesmo assim.

## Contexto

Não era um caso de uso pedido na sessão de 2026-07-31 (ver
[[../00_Decisoes/2026-07-31-atalhos-reais-e-servicos-de-saude-com-desconto|ADR]]) — registrado como
lacuna consciente, não esquecimento. Se virar necessidade real, o padrão a seguir é o mesmo já
usado para produtos: um `kind` adicional (ou reaproveitar `product_discount` também para
`scope_type="services"`) validado em `portal_service.py`.
