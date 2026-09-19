---
cssclasses: ia-nota
---

# 2026-09-15 — Recorrência: padrão real de compra (não mês calendário) + assinatura Asaas de verdade + uso contínuo

## Contexto

O card "Recorrência de compra" detectava recorrência por "comprado em 3 meses de calendário seguidos" — um critério grosseiro que não reflete o ritmo real do cliente (ex.: alguém que compra a cada 21 dias pode cair em 2 ou 3 meses de calendário dependendo de quando o mês vira). Pedido: (1) detectar o intervalo real entre as compras do mesmo produto, sugerir a partir da 3ª vez que esse padrão se repete; (2) mostrar quantidade comprada, quantas vezes o padrão se repetiu e quanto o cliente economizaria; (3) cobrar automaticamente todo mês no cartão via Asaas, como assinatura de verdade (não só um registro local); (4) incluir medicamentos de uso contínuo mesmo sem 3 compras ainda; (5) cor diferente de "Oportunidades de venda"; (6) modal "ver mais"; (7) renomear o título.

## Decisão

### Detecção: intervalo real entre compras, não mês de calendário

`PurchaseHistoryService._detect_interval_pattern` (novo, substitui `_longest_consecutive_month_streak`): a partir das datas reais de compra de um produto (pedidos do marketplace + vendas do balcão), calcula os intervalos entre compras consecutivas, tira a mediana, e considera um padrão "detectado" quando pelo menos 2 intervalos (ou seja, 3 compras) ficam dentro de uma tolerância de ±40% (mínimo 5 dias) da mediana — tolerância deliberada porque compra real nunca é exatamente regular. Retorna `(frequency_days, occurrences)`.

### Uso contínuo: sinal do próprio produto, não do histórico de compras

Novo `PurchaseHistoryService._continuous_use_product_names`: cruza os produtos do histórico do cliente contra o catálogo real atual (`InventoryRepository.list_products_by_names`, novo método) e verifica se a bula (`bula_markdown`) ou a descrição (`short_description`) contém "uso contínuo" — um medicamento assim **entra na sugestão mesmo com só 1 compra**, usando uma cadência clínica padrão de 30 dias (`CONTINUOUS_USE_DEFAULT_FREQUENCY_DAYS`) até haver histórico suficiente para detectar o intervalo real. Testado com Rafael Martins (2 compras de Losartana, insuficiente para o detector de intervalo) — apareceu corretamente marcado "Uso contínuo".

`RecurrenceCandidate` ganhou `frequency_days`, `occurrences`, `interval_detected` (True = padrão real do cliente; False = cadência clínica assumida), `continuous_use`, `savings_amount` (valor monetário economizado por ciclo, não só o percentual) — substituindo `consecutive_months`/`last_purchased_month`. Contrato de API (`CrmRecurrenceCandidateResponse`) e mapeamento no frontend atualizados juntos.

### Assinatura real no Asaas — cobrança automática de verdade

`PdvService.confirm_recurrence` deixou de fazer uma cobrança avulsa (`PaymentService.charge_card`) e passou a criar uma **assinatura real no Asaas** (`PaymentService.charge_recurring_subscription` → `AsaasClient.create_subscription`, `POST /v3/subscriptions`, `cycle: MONTHLY`, cartão tokenizado, `nextDueDate` hoje). A partir daqui, **é o próprio Asaas** que gera e cobra uma nova cobrança todo mês contra o cartão salvo — não foi criado nenhum cron job ou scheduler no lado da Farmaura para isso. `Subscription.provider_subscription_id` (campo novo, migração `20260915_01`) guarda o id da assinatura no Asaas.

**Decisão deliberada**: a cobrança é sempre **mensal**, independente do `frequency_days` detectado (que pode ser, por ex., 21 dias) — simplicidade e previsibilidade de faturamento, conforme pedido explícito do usuário ("cobrado... todos os meses"). O campo de ciclo no modal de confirmação foi rotulado deixando isso claro ("usado só para calcular a economia por ciclo — a cobrança no Asaas é sempre mensal").

### Visual

- Card recolorido: `var(--info-soft)`/`var(--info)` (azul) em vez de `var(--accent-soft)`/`var(--accent)` (vermelho, igual ao card "Oportunidades de venda") — agora visualmente distintos.
- Título: "Recorrência de compra" → **"Oportunidades de recorrência"**.
- Cada item mostra: nome + badge "Uso contínuo" quando aplicável, preço riscado + desconto, "Padrão identificado: a cada N dias · comprado Nx seguindo esse ritmo" (ou, para uso contínuo sem padrão ainda, "Uso contínuo sugerido · cadência padrão de 30 dias"), quantidade por ciclo, e "economiza R$X por ciclo na recorrência".
- Modal "ver mais oportunidades" — mesmo padrão de `PdvUpsell` (5 inline + até 15 na modal, `RECURRENCE_CANDIDATES_LIMIT=15` no backend).
- `RecurrenceConfirmModal`: copy atualizado para "assinatura"/"cobrada automaticamente todo mês"; resultado de sucesso agora deixa explícito que a partir dali é cobrança automática, sem precisar confirmar de novo.

## Consequências

- Migração `20260915_01` aplicada localmente (mesmo contorno de sempre para o gap de `alembic_version` ausente, ver pendência já registrada).
- Testado ponta a ponta via Chrome headless: (1) Mariana Souza — 3 candidatos com padrão real detectado (Vitamina D3 a cada 30 dias, 5× — mesmo produto do card de recorrência de verdade dela); (2) Rafael Martins — Losartana marcada "Uso contínuo" com só 2 compras reais; (3) botão "Configurar" abre modal com cópia nova; (4) "Confirmar assinatura e cobrar agora" chama de fato o caminho novo (`charge_recurring_subscription`) e falha de forma segura e clara — "A integração fiscal com o Asaas não está habilitada." — já que o Asaas está desabilitado neste ambiente local (`asaas_enabled=False`); nenhuma cobrança real foi ou poderia ter sido feita durante o teste.
- **Gap identificado, não resolvido nesta sessão**: os ciclos futuros gerados automaticamente pelo Asaas (2º mês em diante) chegam como webhook de pagamento comum, sem estarem ligados a nenhum `PdvOrder`/venda — o processamento de webhook existente não credita cashback nem registra uma venda para esses ciclos recorrentes. Registrado como pendência abaixo.
- **Bug pré-existente encontrado (não introduzido por esta mudança, não corrigido)**: o mesmo produto pode gerar duas chaves de agrupamento diferentes (`_product_key`) quando `brand_name_snapshot` vem vazio em algumas transações e preenchido em outras (ex.: "Losartana Potassica 50mg" com marca "Genfar" numa compra e sem marca noutra) — aparece como duas linhas "duplicadas" na lista de recorrência/oportunidades. Causa provável: geração de dados de demonstração (`build_daily_operations`) não preenche a marca de forma consistente. Registrado como pendência abaixo.

## Ver também

- [[2026-09-15-costuma-comprar-por-categoria-em-vez-de-frequencia-bruta]] e [[2026-09-15-motor-de-oportunidades-de-venda-no-pdv]] — mudanças irmãs no mesmo conjunto de cards do PDV.
- [[2026-09-15-historico-sintetico-do-painel-de-compras-nao-pode-ter-customer-id-real|correção: histórico sintético do Painel de Compras estava sendo atribuído à Mariana]] — bug encontrado ao testar esta recorrência (ela aparecia com 45 un. de Vitamina D3), causa raiz na geração de dado de demonstração, não nesta lógica.
- [[../06_Pendencias/webhook-asaas-nao-trata-ciclos-de-assinatura-recorrente|pendência: webhook não trata ciclos futuros de assinatura]]
- [[../06_Pendencias/product-key-duplica-com-marca-inconsistente-no-snapshot|pendência: chave de produto duplica com marca inconsistente]]