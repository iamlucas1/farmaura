# Cupom vira ponto de controle único no servidor, via CouponService compartilhado entre canais

**Status:** Aceita
**Data:** 2026-07-30

## Contexto

Auditoria da tela de cupons encontrou o problema estrutural documentado em
[[../04_Seguranca_Riscos/cupom-validado-so-no-client|cupom-validado-so-no-client]]: o checkout do
marketplace confiava inteiramente no cliente para calcular elegibilidade e valor do desconto —
`order_service.py` recebia `coupon_type/percent/amount` já prontos e só reaplicava a fórmula, sem
nunca consultar `CouponCampaign`. `usage_count` nunca era incrementado.

O usuário pediu a correção, e durante a implementação também pediu análises de uso de cupom
cruzando pagamento, canal de origem (online × presencial) e entrega × retirada. Isso expôs que
**cupom simplesmente não existia no PDV** — só desconto manual em percentual, sem código associado
— tornando "canal de origem" uma métrica vazia. Perguntado, o usuário optou por adicionar suporte a
cupom no PDV também, em vez de documentar a limitação e seguir só com dados online.

## Decisão

1. **`app/services/coupon_service.py` (novo) é a única fonte de verdade** para resolver e precificar
   um cupom, chamada tanto por `OrderService.create_marketplace_order` (canal `online`) quanto por
   `PdvService.create_queue_order` (canal `pdv`). Recebe um formato neutro de linhas de carrinho
   (`CouponCartLine`: preço/categoria/nome/quantidade) — nenhum dos dois serviços de canal precisa
   conhecer o formato de carrinho do outro.
2. **Elegibilidade por cliente passa a somar os dois canais**: contagem de "pedidos anteriores"
   (`first_purchase_only`/`new_customers`/`recurring`) e de usos de um código específico
   (`per_customer_limit`) agora consultam `Order` **e** `PdvSale` — um cliente não contorna o limite
   trocando de canal, e deixa de ser classificado como "novo" só porque nunca comprou online.
3. **Novo campo `channel_scope`** (`all`/`online`/`pdv`) em `coupon_campaigns`, permitindo restringir
   um cupom a um canal só — ex.: cupom de recompensa de fidelidade só resgatável no balcão.
4. **No PDV, cupom exige cliente identificado.** O PDV permite venda "consumidor não identificado",
   mas cupom sem identidade quebraria `per_customer_limit` e as próprias análises de segmento de
   cliente — regra nova, sem equivalente necessário no marketplace (cliente ali é sempre
   autenticado).
5. **Cupom e desconto manual do PDV são mutuamente exclusivos**, e o desconto do cupom passa a
   respeitar o mesmo teto de margem média do carrinho que já protegia o desconto manual
   (`_discount_ceiling`) — sem essa checagem, um cupom mal configurado furaria a única proteção de
   margem que o PDV tinha.
6. **`usage_count` incrementa atomicamente no commit final de cada canal** (`create_marketplace_order`
   e `PdvService.complete_sale`), nunca na etapa intermediária do PDV (`create_queue_order`) — um
   pedido de fila cancelado antes do fechamento nunca infla o contador, mesma garantia que o
   marketplace já tinha adotado.
7. **Novo módulo `coupon-analytics`** (`app/api/v1/coupon_analytics.py` + service + repository),
   espelhando a arquitetura já usada por `purchase_analytics` (router fino → service → repository
   dedicado), agregando `Order`+`PdvSale` por `coupon_code`: status real (calculado no backend com
   `datetime.now(UTC)`, não mais só no frontend), breakdown de pagamento (com normalização de
   vocabulário — online usa `Pix`/`Cartão de crédito`/`Cartão de débito`, PDV usa
   `cash|pix|debit|credit`), canal, entrega/retirada e segmento de cliente (`loyalty_tier`).

## Alternativas consideradas

- **Manter cupom só no marketplace e documentar "canal presencial" como métrica sempre vazia.**
  Rejeitada explicitamente pelo usuário, perguntado via pergunta direta — preferiu o escopo maior.
- **Duplicar a lógica de validação dentro de `pdv_service.py`** em vez de extrair um serviço
  compartilhado. Rejeitada — duplicaria ~120 linhas de regra de negócio sensível a dinheiro
  (janela de vigência, escopo, teto de desconto), com risco real de as duas cópias divergirem numa
  correção futura.
- **Deixar `per_customer_limit` contar só o próprio canal.** Rejeitada — um cliente poderia usar um
  cupom de uso único duas vezes só trocando de canal, contornando a regra que o lojista configurou.

## Consequências

- Nova migration (`20260730_01_pdv_coupon_support`, `20260730_02_coupon_channel_scope`):
  `pdv_orders.coupon_code`, `pdv_sales.coupon_code`, `coupon_campaigns.channel_scope`.
- `CheckoutOrderRequest` perdeu `coupon_percent`/`coupon_amount`/`coupon_type` — o cliente manda só
  `coupon_code`; o servidor decide tudo. Mudança de contrato aceitável porque não há consumidor
  externo da API além do próprio frontend, atualizado na mesma mudança.
- Cupom tipo `shipping` não é utilizável no PDV hoje — a taxa de entrega do PDV só é conhecida
  **depois** do desconto ser calculado em `create_queue_order` (ordem de cálculo pré-existente,
  não alterada), então `secondary_fee_amount=0` é passado para o canal PDV, o que sempre resulta em
  desconto zero para esse tipo. Limitação aceita, não é um caso de uso pedido.
- `PdvOrderItem`/`PdvSaleItem` continuam sem `category_name_snapshot` persistido — a categoria é lida
  em memória de `InventoryItem` no momento da resolução do cupom, suficiente para validar, mas não
  fica auditável depois numa linha de venda já fechada. Aceito como está; ver
  [[../02_Documentacao/Modulo_PDV|Módulo PDV]] se isso virar necessidade real de auditoria.
- O risco [[../04_Seguranca_Riscos/cupom-validado-so-no-client|cupom-validado-so-no-client]] foi
  fechado por esta mudança.

## Ver também

- [[../02_Documentacao/Modulo_CRM|Módulo CRM]] — mecânica de cupons atualizada.
- [[../02_Documentacao/Modulo_PDV|Módulo PDV]] — fluxo de venda no balcão, agora com cupom.
- [[../02_Documentacao/Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — checkout online atualizado.
