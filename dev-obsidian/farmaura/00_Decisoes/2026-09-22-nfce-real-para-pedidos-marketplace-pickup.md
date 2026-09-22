---
cssclasses: ia-nota
---

# 2026-09-22 — NFC-e real (direto à SEFAZ-DF) para pedidos de marketplace com retirada em loja

## Contexto

Pedidos online geravam um documento fiscal **simulado** (`FiscalService.issue_for_order`, `status=LEGACY_SIMULATED`: número e chave são hash SHA1, nunca enviado à SEFAZ) e, em paralelo, agendavam uma **NFS-e** (nota de serviço) via Asaas (`_schedule_asaas_invoice`, `POST /v3/invoices`). Isso já estava registrado como pendência de prioridade alta ([[../06_Pendencias/nfce-marketplace-documentos-simulados|nfce-marketplace-documentos-simulados]]) e também no item 2 de [[../06_Pendencias/asaas-sandbox-pendencias-apos-preparacao|asaas-sandbox-pendencias-apos-preparacao]]: uma farmácia vende **mercadoria** (ICMS), não serviço — NFS-e é o documento fiscal errado para isso, independentemente de quem a emite.

Pedido do usuário: parar de depender do Asaas como intermediário fiscal e emitir a nota pelo "processo nativo, direto com a secretaria" — ou seja, usar o mesmo caminho que o PDV já usa desde [[2026-09-20-nfce-real-svrs-df-homologacao|a decisão anterior]]: `app/fiscal/` falando diretamente com a SEFAZ-DF (Secretaria de Economia do GDF) via SVRS, sem nenhum provedor pagador no meio da emissão fiscal.

## Alternativas consideradas

- **Construir um client de NFS-e nativo (webservice municipal de ISS), tirando o Asaas mas mantendo o tipo de documento** — descartada: manteria o documento fiscal tecnicamente incorreto (serviço em vez de mercadoria), e não há nenhum precedente, protocolo, schema ou credencial desse tipo de integração no repositório — seria construir do zero um módulo do tamanho do `app/fiscal/` inteiro, sem sequer corrigir o problema de fundo.
- **Estender o módulo NFC-e existente para todos os pedidos de marketplace de uma vez (pickup + delivery + shipping)** — descartada por enquanto: `_snapshot_pdv_sale` (o motor reaproveitado) bloqueia qualquer venda com taxa de entrega, com o comentário explícito "o tratamento fiscal da taxa depende de definição do contador". Pedidos `delivery`/`shipping` quase sempre têm frete > 0 e são vendas **não presenciais** (a NFC-e presume `indPres=1`, hardcoded em `xml_builder.py`, sem nenhum campo parametrizável hoje). Forçar esses pedidos pelo mesmo caminho exigiria inventar uma política tributária sem respaldo contábil.
- **Estender só para pedidos `pickup` (retirada em loja)** — escolhida. O cliente comparece fisicamente à loja para retirar: fiscalmente é **idêntico a uma venda de balcão** (presencial, sem frete, sem grupo `entrega` no XML). Cabe no motor existente sem nenhuma mudança de regra tributária e sem esperar o contador.

## Decisão

1. Novo `Order.payment_method` (migration `20260922_01`) — código bruto do checkout (`pix`/`credit_card`/`debit_card`/`pickup_cash`), ao lado do já existente `payment_method_label` (humanizado). Necessário porque não dá para mapear `tpag` (código fiscal de pagamento) de forma confiável a partir de um texto de exibição. Novo `ONLINE_PAYMENT_METHOD_TO_TPAG` em `app/domain/fiscal.py`. Atenção: `pickup_cash` mapeia para `"03"` (cartão), não `"01"` (dinheiro) — apesar do nome, `confirm_internal_pickup` sempre cobra no cartão salvo do cliente na confirmação da retirada, nunca dinheiro físico.
2. Novo `FiscalService.enqueue_order`/`_snapshot_marketplace_order` (`fiscal_service.py`), espelhando `enqueue_pdv_sale`/`_snapshot_pdv_sale` linha a linha, lendo de `Order`/`OrderItem` em vez de `PdvSale`/`PdvSaleItem`. Recusa silenciosamente (sem criar documento, sem erro) qualquer pedido `fulfillment_type != "pickup"` — isso é o que impede o `fiscal_scheduler` de tentar para sempre um pedido fora de escopo.
3. `fiscal_scheduler.py` passa a filtrar `Order.fulfillment_type == "pickup"` na consulta de elegibilidade e chama `enqueue_order` + `kick_emission` (grava `DRAFT`, acorda o worker genérico) em vez de `issue_for_order` (síncrono, simulado). A janela de 7 dias (prazo de arrependimento do CDC) **não muda** — só o que acontece quando um pedido é encontrado.
4. **Pedidos `delivery`/`shipping` deixam de gerar qualquer documento fiscal** (nem o simulado, nem a fatura Asaas) até o contador definir o tratamento tributário do frete e o `indPres` correto para venda não presencial — ver pendência atualizada [[../06_Pendencias/nfce-marketplace-documentos-simulados|nfce-marketplace-documentos-simulados]].
5. `_finalize_authorized` passa a enviar o e-mail de nota ao cliente quando `source_channel == "marketplace"` — movido do scheduler (que agora só enfileira, o documento nem existe autorizado ainda naquele ponto) para o momento real de autorização.
6. `reprocess` generalizado para aceitar documentos de origem `order_id`, não só `pdv_sale_id` (antes, reemitir um documento de pedido via API era literalmente impossível).
7. `issue_for_order`/`_schedule_asaas_invoice`/`_legacy_number`/`_legacy_key` **não foram removidos** — ficam sem nenhum chamador depois desta mudança (só o scheduler os usava), mas o status `LEGACY_SIMULATED` continua sendo servido normalmente (impressão, e-mail, etc.) para documentos antigos já persistidos antes desta decisão. Decisão consciente de não apagar código ainda testado e potencialmente útil como fallback manual — considerar remover numa leva futura se ninguém precisar.
8. Corrigido de quebra, em `app/tests/fiscal_support.py`: o certificado de teste usava `datetime.now()` real para `not_valid_before`, mas os testes de fluxo comparam contra um `Clock` fixo (`2026-09-20`) — assim que o relógio real do ambiente passou dessa data, todo teste que assina XML (incluindo os de PDV, não só os novos) começou a falhar com "certificado expirado", por uma causa que nada tinha a ver com o código sob teste. Ampliado o `not_valid_before` para 10 anos atrás.

## Consequências

- **Achado, não resolvido nesta leva**: o certificado que o usuário colocou em `farmaura-api/secrets/nfce/AC-Certisign-RFB-G5.cer` é a **raiz da ICP-Brasil (Certisign AC-RFB-G5)**, não o certificado A1 da própria FARMAURA LTDA. `NFCE_CERTIFICATE_PATH` continua precisando do `.pfx`/`.p12` real da empresa (com a chave privada, protegido por senha) — sem ele, a emissão real para de progredir em `SIGNING` mesmo em homologação. Ver pendência nova.
- Migration `20260922_01` testada isoladamente contra um Postgres descartável (`upgrade`/`downgrade` em um banco criado do zero via `create_all` + `alembic stamp head`) — **não** via `alembic upgrade head` desde a primeira migration, porque nenhum ambiente real (nem local, nem staging) jamais rodou a cadeia completa de migrations (gap já conhecido, ver [[../06_Pendencias/alembic-version-ausente-no-postgres-local|alembic-version-ausente-no-postgres-local]]); a cadeia histórica falha numa migration muito anterior e não relacionada (`chat_unblock_requests`), débito técnico pré-existente e fora do escopo desta leva. Ver [[../06_Pendencias/aplicar-migration-order-payment-method-em-producao|pendência de aplicar em produção]].
- Suíte `app/tests/unit/test_fiscal_flow.py` + 9 testes novos: 50/50 passam. Suíte completa do backend: baseline (antes desta leva) tinha 40 falhas pré-existentes; depois desta leva, 16 — as 24 restantes corrigidas eram todas a mesma causa raiz do certificado (item 8 acima). As 16 que continuam falhando são anteriores e não relacionadas a este trabalho (ex.: `test_issue_for_order_never_blocks_on_disabled_asaas` espera `asaas_enabled=False`, mas o Asaas sandbox foi habilitado neste `.env` local numa leva anterior desta mesma sessão, para testar pagamento).
- Teste real em homologação (assinar e transmitir à SEFAZ de verdade) permanece bloqueado até o certificado A1 real chegar — ver pendência nova.

## Ver também

- [[2026-09-20-nfce-real-svrs-df-homologacao|ADR do módulo NFC-e original (PDV)]] — motor reaproveitado nesta leva.
- [[2026-09-20-asaas-sandbox-guarda-remoteip-e-nota-no-formato-real|ADR do preparo do sandbox Asaas]] — Asaas continua sendo usado para **pagamento** (Pix/cartão); só saiu do caminho **fiscal**.
- [[../06_Pendencias/nfce-marketplace-documentos-simulados|Pendência atualizada]] — escopo restante (delivery/shipping).
- [[../06_Pendencias/certificado-a1-farmaura-ainda-nao-fornecido|Pendência nova]] — certificado A1 real da empresa.
