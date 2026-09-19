---
cssclasses: ia-nota
---

# 2026-09-16 — Recorrência sem cartão salvo: agendamento, lembretes por e-mail e cancelamento automático

## Contexto

A modal "Configurar recorrência" do PDV bloqueava a confirmação quando o cliente não tinha cartão salvo ("O cliente não tem cartão salvo — não é possível cobrar a recorrência agora."). Pedido: permitir agendar a assinatura mesmo assim, enviar e-mails lembrando o cliente de cadastrar um cartão (D-15/10/5/2/1/0 antes do vencimento), e no vencimento: cobrar se um cartão padrão foi cadastrado até lá, ou cancelar com motivo visível na tela de assinaturas do cliente caso não. O sistema interno (PDV) deveria liberar o agendamento mesmo sem cartão.

## Decisão

### Novo status "pending_card" + due date real

`Subscription` ganhou três campos (migração `20260916_01`): `next_charge_due_at` (datetime real e computável — `next_cycle_date_label` já existente é só texto de exibição, não servia para o scheduler comparar datas), `cancel_reason` (motivo curto e legível por máquina: `no_card_by_due_date` ou `charge_failed`) e `card_reminder_last_threshold_days` (guarda de idempotência, -1 = nenhum lembrete enviado ainda). `subscription_status` ganha seu primeiro uso real de `"pending_card"` e de `"cancelled"` como transição de status persistida — antes só existiam `"active"`/`"paused"` em uso real, e o cancelamento do marketplace sempre fazia `DELETE` físico da linha (não dava para reaproveitar esse padrão aqui, já que o objetivo é mostrar o motivo depois).

`PdvService.confirm_recurrence` (`payment_method_id` virou opcional no schema): sem cartão, cria a `Subscription` como `pending_card` com `next_charge_due_at = agora + frequency_days`, sem chamar o Asaas, e dispara na hora o primeiro e-mail de lembrete.

### Scheduler novo, mesmo padrão do `fiscal_scheduler.py`

`app/services/subscription_card_reminder_scheduler.py` — loop `asyncio` in-process (sem Celery/APScheduler, mesma decisão de arquitetura documentada em `fiscal_scheduler.py`), registrado em `main.py` ao lado do scheduler fiscal. A cada hora, para cada assinatura `pending_card`: compara `next_charge_due_at` com hoje (por data, não timestamp, para o lembrete disparar uma vez por dia independente do intervalo do tick); se `days_until_due` bater um dos limiares `(15, 10, 5, 2, 1)` e ainda não tiver sido enviado, dispara o e-mail e grava o limiar em `card_reminder_last_threshold_days`; se `days_until_due <= 0`, resolve definitivamente: busca o cartão **padrão** (`is_primary`) do cliente — se existir, tenta cobrar via `PaymentService.charge_recurring_subscription` (mesma assinatura real no Asaas do fluxo com cartão) e vira `active`; se a cobrança falhar (`AsaasError`/`HTTPException`) ou não houver cartão padrão, cancela com o motivo correspondente e envia e-mail de cancelamento.

### E-mails novos

`NotificationService.send_subscription_card_reminder_email` (urgência escalando conforme os dias diminuem) e `send_subscription_cancelled_no_card_email` — mesmo padrão de fragmentos HTML (`_eyebrow`/`_heading`/`_paragraph`/`_button`) e wrapper de marca já usado pelos e-mails existentes, com corpo em texto puro equivalente.

### RLS: gap encontrado e corrigido

`subscriptions_access_policy` e `customer_payment_methods_access_policy` não tinham o carve-out `app_private.is_system_job()` que `orders`/`customers`/`fiscal_documents` já tinham — o scheduler simplesmente não enxergava nenhuma linha (retornava sempre 0 processadas, silenciosamente, sem erro). Corrigido em `row_level_security.py`, reaplicado automaticamente no próximo boot via `bootstrap_database.py` (não precisa de migração — RLS é reaplicada em toda subida do container).

### Bug pré-existente encontrado e corrigido de raio: assinaturas do PDV eram invisíveis no marketplace

Ao testar a exibição do motivo de cancelamento, descobri que **nenhuma assinatura criada pelo PDV** (nem as `"active"` já existentes antes desta mudança) aparecia na tela "Assinaturas" do cliente: `subscriptions-screen.jsx` filtrava por `products.find(p => p.id === sub.id)`, mas o `product_ref` de uma assinatura do PDV é `"inv-<uuid>"` (via `_subscription_ref`), enquanto todo `product.id` do catálogo do marketplace segue o formato `"mkt-<nome>-<marca>"` (`build_marketplace_product_id`) — nunca batem. `PortalSubscriptionResponse` ganhou `product_name`/`unit_price` (do próprio snapshot da assinatura) e a tela passou a montar um produto "sintético" (`resolveSubProduct`) quando não há correspondência no catálogo, em vez de descartar a linha inteira. Efeito colateral: assinaturas reais já existentes, criadas no PDV antes desta sessão, também passam a aparecer agora — não é regressão, é a mesma classe de bug já documentada em [[../06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas|product-ref-nao-normalizado-quebra-favoritos-assinaturas]] (essa pendência trata o lado de **escrita**, ref cru vindo do cliente; aqui o problema era de **leitura**, no componente React) — a pendência continua aberta para o caso dela, não foi fechada por esta mudança.

### Visual

- Tela de assinaturas: badges novos "Aguardando cartão" (`--fa-warn`) e "Cancelada" (`--fa-vital`), com o motivo em texto logo abaixo (`SUB_CANCEL_REASON_LABEL`) e um botão "Cadastrar cartão" levando para `/account` quando `pending_card`. Card cancelado/pendente não mostra mais os controles de edição (quantidade/frequência/pausar/cancelar), que só fazem sentido para uma assinatura em curso.
- Modal "Configurar recorrência" do PDV: sem cartão, a mensagem deixa de ser um bloqueio vermelho e vira um aviso amarelo explicando o agendamento; botão vira "Agendar assinatura"; resumo financeiro explica quando cobra; modal de sucesso ganha uma variante ("Assinatura agendada").

## Consequências

- Testado ponta a ponta via API direta (sem UI) para os 3 desfechos do scheduler — agendar sem cartão (e-mail imediato disparado, ~4.6s de round-trip real com o Gmail configurado neste ambiente), vencimento sem cartão (`cancelled`/`no_card_by_due_date`), vencimento com cartão mas cobrança falha por Asaas desabilitado localmente (`cancelled`/`charge_failed`, fallback seguro) — e o lembrete D-15 com guarda de idempotência (rodar o tick de novo no mesmo dia não reenvia). Confirmado visualmente na tela de assinaturas da Mariana (cliente real) mostrando corretamente tanto a assinatura cancelada com motivo quanto uma assinatura ativa do PDV que antes era invisível.
- E-mail de teste foi enviado de verdade via SMTP real (Gmail configurado neste ambiente de dev, não um mock) para um endereço de cliente de seed que não existe de verdade — comportamento esperado deste projeto (e-mail não é uma integração "fake" nem em dev, ao contrário do Asaas que fica desabilitado localmente).
- **Não implementado**: catch-run para lembretes perdidos — se o scheduler ficar fora do ar um dia inteiro e `days_until_due` pular de 16 para 9 (por exemplo), os lembretes de 15 e 10 dias não disparam retroativamente (só compara igualdade exata, não "menor ou igual ainda não enviado"). Aceitável para o escopo atual; documentado aqui caso vire problema real.

## Ver também

- [[../06_Pendencias/webhook-asaas-nao-trata-ciclos-de-assinatura-recorrente|pendência: webhook não trata ciclos futuros de assinatura]] — mesma área (assinaturas recorrentes via Asaas), problema distinto (2º ciclo em diante).
- [[../06_Pendencias/product-ref-nao-normalizado-quebra-favoritos-assinaturas|pendência: product_ref não normalizado]] — mitigada no lado de leitura desta tela, não resolvida na raiz (lado de escrita/favoritos).
- [[2026-09-15-recorrencia-por-padrao-real-de-compra-e-assinatura-asaas|ADR anterior]] — fluxo original de confirmação com cartão, que esta mudança estende.