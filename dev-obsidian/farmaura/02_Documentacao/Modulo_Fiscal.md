# Módulo Fiscal (documentos fiscais / NFC-e)

## O que é

Emissão de nota fiscal (NFC-e, hoje o único `document_type` suportado) para vendas do marketplace (diferida 7 dias, ver [[../00_Decisoes/2026-07-12-diferir-emissao-fiscal-7-dias|decisão]] e [[../03_Padroes_Politicas/regra-negocio-janela-cdc-nota-fiscal|regra da janela CDC]]) e do PDV (síncrona, na hora). O scheduler que resolve o diferimento já está detalhado em [[../03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|excecao-fiscal-scheduler-sessao-propria]] — esta nota cobre o restante: model, endpoints, regras de negócio e frontend.

**Atenção a falso cognato**: "nota fiscal" também aparece em `acquisition-costs-screen.jsx`/`purchase-receiving-screen.jsx`/`inventory-screen.jsx`, mas é a nota fiscal **de compra do fornecedor** (entrada de estoque, domínio [[Modulo_Estoque|Estoque]]/[[Modulo_Orcamentos|Orçamentos]]) — módulo diferente e não relacionado a este.

## Tabela / Model

Único model: **`FiscalDocument`** (`fiscal_document.py`). Campos principais: `document_type` (default `nfce`), `source_channel` (marketplace/pdv), `pdv_sale_id`/`order_id` (FKs SET NULL, mutuamente exclusivos por fluxo), `issued_by_user_id` (só no PDV), `document_number`/`access_key`/`series_code` (**gerados deterministicamente por hash SHA1** do código do pedido/venda — simulados, não vêm de uma SEFAZ real), `authorized` (bool, sempre `True` na emissão — **não há máquina de estados nem campo de cancelamento**), snapshots (`payment_method_snapshot`, `recipient_name/document_snapshot`), `gross_total_amount`, `approximate_tax_amount` (12% flat, aproximação de protótipo, não cálculo tributário real). RLS: tenant + `is_system_job()` (carve-out para o scheduler cross-tenant). **Sem repositório dedicado** — o service acessa a sessão diretamente com `select()`.

## Endpoints

`GET /fiscal-documents/{id}`, `GET /fiscal-documents/{id}/printable` (HTML pronto para impressão), `POST /fiscal-documents/{id}/send-email` — todos `ADMIN, PHARMACIST, CASHIER`. **Não há endpoint de emissão manual** — a emissão acontece só dentro de `order_service`/`pdv_service`.

## Regras de negócio não óbvias

- **Idempotência por venda**: emitir para um pedido/venda que já tem documento retorna o existente em vez de duplicar.
- **Sem cancelamento nem reemissão em lugar nenhum do código** — se um pedido for cancelado *depois* da nota emitida, o `FiscalDocument` permanece `authorized=True` para sempre, sem reconciliação. O único tratamento é preventivo (scheduler pula pedidos já `CANCELLED` antes de emitir).
- **PDV é síncrono, marketplace é diferido**: no PDV a nota é emitida dentro da mesma transação da venda (antes do commit) — venda presencial não tem janela de arrependimento do CDC. Só pedidos online passam pelo scheduler de 7 dias.
- **CPF opcional no PDV**, conforme o toggle "Incluir CPF na nota" escolhido pelo operador.
- **Best-effort com Asaas, nunca bloqueia a venda**: qualquer erro do provedor fiscal (mesmo provedor de pagamento, via invoice) é engolido silenciosamente — a venda já aceita nunca é revertida por falha fiscal.
- **Envio de e-mail é best-effort**, retorna falha sem exceção se SMTP não estiver configurado.

## Frontend

Não há tela própria "Documentos Fiscais" — embutido em `sales-screen.jsx` ("Vendas & Notas", coluna de nota fiscal + `SaleNotaModal` para reenvio) e em `point-of-sale-screen.jsx` (`NotaFiscalModal` exibido ao finalizar venda no balcão, com reenvio por e-mail/link de impressão). No marketplace, `checkout-screen.jsx` só avisa o cliente para completar o CPF em "Minha Conta" — o cliente não consulta o documento fiscal em si.

## Decisões de arquitetura dignas de nota

- **Sem repositório dedicado** — único acesso a dados via `select()` direto no service, diferente do padrão de camadas do resto do backend.
- **Ausência total de fluxo de cancelamento/estorno fiscal** — candidato natural a `04_Seguranca_Riscos/` ou `06_Pendencias/`.
- **Numeração/chave de acesso são hashes determinísticos**, stand-in de protótipo para dados que normalmente viriam de uma SEFAZ real — limitação já comentada no próprio model.

## Ver também

- [[../00_Decisoes/2026-07-12-diferir-emissao-fiscal-7-dias|Diferir emissão fiscal em 7 dias]].
- [[../03_Padroes_Politicas/regra-negocio-janela-cdc-nota-fiscal|Regra de negócio: janela CDC / nota fiscal]].
- [[../03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|Exceção: fiscal scheduler com sessão própria]].
- [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — pedido que dispara a emissão diferida.
- [[Modulo_PDV|Módulo PDV]] — venda que dispara a emissão síncrona.

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
