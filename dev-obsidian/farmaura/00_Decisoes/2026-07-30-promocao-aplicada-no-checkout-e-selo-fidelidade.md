# 2026-07-30 — Promoção dinâmica reaplicada no checkout + selo de fidelidade real

**Status:** Aceita
**Data:** 2026-07-30

## Contexto

O usuário pediu uma segmentação de promoções bem mais rica no marketplace: visibilidade para
visitante deslogado vs. logado, filhos, estado civil, selo de fidelidade (Bronze/Prata/Ouro/
Diamante/Platina) por volume de compras, dispositivo (iPhone/Android/outro), novo vs. recorrente,
região (CEP/bairro/cidade/estado), faixa etária, gênero, período (dias/horários), preço cortado
visível, um modo "superpromoção" mais chamativo, e um popup incentivando o cliente a completar o
cadastro com consentimento explícito para receber promoções.

Investigação encontrou que a maior parte já existia: `PricingPromotion` + `pricing_promotion_service.py`
(motor de matching) + `catalog_service.py::_apply_personalized_promotions` (aplica no catálogo) +
tela admin completa `promotions-screen.jsx`. O `Customer` já tinha `gender`/`marital_status`/
`children_count`/`birth_date`/`last_device_type`/`loyalty_tier`. Preço cortado já renderizava no
`ProductCard`.

Duas lacunas reais e um gap colateral, porém, tornaram o trabalho maior que "só adicionar campos":

1. **A promoção nunca era reaplicada no checkout** — só na vitrine (ver
   [[../04_Seguranca_Riscos/promocao-nao-reaplicada-no-checkout|risco]]), mesma classe de problema
   já corrigida para cupom nesta sessão (ver
   [[2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR do cupom]]).
2. **`Customer.orders_count`/`total_spent`/`is_recurring` nunca eram atualizados** depois da criação
   do cliente — só setados uma vez com valores default. Isso já quebrava silenciosamente a
   segmentação `new_customers`/`recurring` que `PricingPromotion` tenta usar hoje, e bloqueava
   qualquer selo de fidelidade real (`loyalty_tier` ficava para sempre em `"Novo"`).
3. **`marketing_program_preferences`/`communication_channel_preferences` existiam no model `Customer`
   mas em nenhum schema/endpoint** — o toggle "aceito receber comunicação" na tela de perfil era só
   estado local, nunca persistia. Sem isso, o popup de consentimento pedido pelo usuário não teria
   efeito real.

Perguntado sobre 3 pontos de escopo, o usuário decidiu: **não implementar detecção de VPN** (sem
infra, custo de serviço pago, exposição de privacidade sem valor de negócio claro); **selo de
fidelidade por quantidade de pedidos concluídos**, faixas propostas aceitas (Novo 0, Bronze 1–4,
Prata 5–14, Ouro 15–29, Diamante 30–59, Platina 60+); **confirmou que não existe app nativo** — o
eixo de dispositivo vira sistema operacional (iOS/Android/desktop/outro) via User-Agent, não "web vs
aplicativo".

## Alternativas consideradas

- **Deixar a promoção continuar só na vitrine e documentar como limitação conhecida.** Rejeitada — o
  próprio pedido do usuário ("faça o precificador já levar isso em conta") pedia exatamente o oposto,
  e a divergência preço-mostrado vs. preço-cobrado é um problema de confiança, não só um gap técnico.
- **Detectar VPN via lista pública de IPs de datacenter (heurística fraca e gratuita).** Rejeitada
  pelo usuário — preferiu não implementar a implementar algo impreciso.
- **Tornar as faixas do selo de fidelidade configuráveis via tela admin.** Descartada por escopo —
  fixadas em código (`pricing_promotion_service.py::LOYALTY_TIER_THRESHOLDS`) para manter o trabalho
  contido; revisitável depois se virar necessidade real (ver Pendências).

## Decisão

1. **`pricing_promotion_service.py::apply_promotion_to_catalog_item` é a função única** que resolve a
   melhor promoção e aplica preço sobre um item de catálogo agrupado — chamada tanto por
   `catalog_service.py` (listagem, autenticada e pública) quanto por
   `order_service.py::create_marketplace_order` (checkout). Nunca reduz abaixo de um desconto manual
   já configurado (`InventoryItem.promotional_discount_percent`), mesma regra de antes.
2. **`record_customer_purchase`** (novo `customer_loyalty_service.py`) incrementa
   `orders_count`/`total_spent`/`average_ticket`, recalcula `is_recurring` (`orders_count >= 2`) e
   `loyalty_tier` (`compute_loyalty_tier`), chamado no mesmo commit da criação do pedido — mesmo corte
   de contagem que `CouponService` já usa para "pedidos anteriores" (toda linha de `Order`,
   independente de status).
3. **Novos eixos em `PricingPromotion`**: `target_loyalty_tiers` (JSON list), `guest_visible` (bool,
   só permitido sem nenhum filtro de audiência — visitante anônimo não tem perfil pra avaliar),
   `highlight_style` (`standard`/`superpromo`, controla o badge no marketplace).
4. **`regions` passa a casar bairro e prefixo de CEP**, além de UF/cidade — mesmo campo de texto
   livre já existente, matching estendido em `resolve_customer_promotion_profile`.
5. **`device_detection.py` troca `mobile` por `ios`/`android` distintos** — sem eixo real de "web vs
   aplicativo" (não existe app nativo).
6. **`marketing_program_preferences`/`communication_channel_preferences` passam a existir no schema
   (`CustomerProfileUpdateRequest`/`Response`) e a persistir de verdade** via
   `PUT /customers/me/profile`. O popup de completar cadastro (`ProfileCompletionNudge`, marketplace)
   usa exatamente esse mecanismo ao clicar "aceitar promoções" — não é um consentimento paralelo.
7. **Catálogo público (`GET /catalog/public`, visitante deslogado)** passa a aplicar promoções
   `guest_visible=true`, contra um perfil neutro sem nenhuma restrição de audiência (garantido pela
   validação do item 3).

## Consequências

- Nova migration (`20260730_03_pricing_promotion_targeting`): `pricing_promotions.
  target_loyalty_tiers`, `.guest_visible`, `.highlight_style`.
- `create_marketplace_order` (`api/v1/orders.py`) passou a receber `Request` para extrair o
  User-Agent, mesmo padrão já usado por `GET /catalog`.
- O risco [[../04_Seguranca_Riscos/promocao-nao-reaplicada-no-checkout|promocao-nao-reaplicada-no-checkout]]
  foi fechado por esta mudança; o princípio geral
  [[../04_Seguranca_Riscos/backend-e-fonte-unica-de-verdade-nunca-confiar-no-client|backend como fonte
  única de verdade]] ganhou este como segundo caso concreto (o primeiro foi cupom).
- Detecção de VPN e faixas de selo configuráveis via admin ficam registradas em `06_Pendencias/` como
  decisões conscientes de não implementar por ora, não esquecimentos.
- Dado pessoal novo usado para segmentação (gênero, estado civil, filhos, região) já existia no
  cadastro antes desta mudança — o que muda é que agora alimenta um eixo de negócio real (preço), o
  que reforça a necessidade do opt-in explícito (item 6) já estar realmente persistido.

## Ver também

- [[../02_Documentacao/Modulo_Catalogo|Módulo Catálogo]] — motor de promoção, agora compartilhado.
- [[../02_Documentacao/Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — checkout atualizado.
- [[2026-07-30-cupom-validado-no-servidor-com-service-compartilhado|ADR do cupom]] — mesma classe de
  correção, primeiro caso.
