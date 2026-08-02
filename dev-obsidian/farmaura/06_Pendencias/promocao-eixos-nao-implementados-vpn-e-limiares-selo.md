# Promoção: eixos de segmentação deliberadamente não implementados (VPN, limiares de selo configuráveis)

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-07-30

## Descrição

Duas decisões conscientes de escopo tomadas durante a implementação da segmentação avançada de
promoções (ver [[../00_Decisoes/2026-07-30-promocao-aplicada-no-checkout-e-selo-fidelidade|ADR]]),
registradas aqui para não virarem "esquecimento" silencioso:

1. **Detecção de VPN/proxy como eixo de segmentação de promoção não foi implementada.** Não existe
   nenhuma infraestrutura de IP intelligence no projeto hoje; implementar de verdade exigiria
   integrar um serviço pago de terceiro (ex.: IPQualityScore, MaxMind) — custo recorrente, integração
   nova, e exposição de rastreamento de IP sem valor de negócio claramente demonstrado para uma
   farmácia. Uma heurística gratuita (lista de IPs de datacenter conhecidos) foi oferecida como
   alternativa e recusada pelo usuário por ser imprecisa.
2. **Faixas do selo de fidelidade (Bronze/Prata/Ouro/Diamante/Platina) são fixas em código**
   (`pricing_promotion_service.py::LOYALTY_TIER_THRESHOLDS`: Bronze 1+, Prata 5+, Ouro 15+, Diamante
   30+, Platina 60+ pedidos concluídos), não configuráveis via tela admin.

## Contexto

Perguntado diretamente sobre os dois pontos durante o planejamento, o usuário optou por não
implementar VPN por ora e aceitou as faixas de selo propostas sem pedir uma tela de configuração.
Ambos ficam abertos aqui caso a necessidade de negócio mude — VPN precisaria de uma decisão de
provedor + orçamento; limiares configuráveis precisariam de um novo endpoint admin + schema
(`PortalLoyaltyTierSettings` ou equivalente) antes de deixar de ser constante em código.
