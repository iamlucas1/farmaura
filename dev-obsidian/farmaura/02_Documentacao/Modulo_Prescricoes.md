# Módulo Prescrições

## O que é

Fluxo de validação de receita médica para produtos controlados, com dois pontos de origem (checkout marketplace e balcão/PDV) convergindo para uma fila de revisão farmacêutica. Hoje é majoritariamente **scaffold de negócio**: a infraestrutura de arquivo/upload existe no schema mas não está conectada a nenhum service — o cliente nunca envia de fato um arquivo de receita ao backend, só sinaliza "enviei".

## Tabelas / Models

- **`prescriptions`** (`app/models/prescription.py`) — `customer_id`/`order_id`/`pdv_order_id`/`reviewed_by_user_id` (FKs SET NULL), `source_channel` (marketplace/pdv), `delivery_method` (digital/physical), `status` (pending/approved/rejected), snapshots de paciente/médico, `has_controlled_medication`, `requires_retention`, `pharmacist_notes`/`rejection_reason`.
- **`prescription_files`** — liga a `file_assets` (payload fora do banco); suporta múltiplas páginas. **Nenhum código de produção cria linhas aqui** — a infraestrutura existe, o fluxo de upload real não.
- **`prescription_items`** — medicamento/dosagem em texto livre (deliberadamente não normalizado, para não fazer normalização insegura de posologia), FKs opcionais a `order_items`/`inventory_items`/`marketplace_listings`.
- **`prescription_checks`** — checklist do farmacêutico (`check_key`, `is_passed`, `note`) como tabela filha (não JSON), para permitir evoluir a rubrica sem migração — mas hoje é hardcoded no service (4 checks fixos), sem endpoint para atualizar granularmente.
- **Flags em outras tabelas**: `orders.requires_prescription_review`/`prescription_status`, `order_items.requires_prescription_upload`/`prescription_status`, `marketplace_listings.is_controlled`/`requires_prescription_upload`, `inventory_products.is_controlled`/`controlled_category` (fonte real de "quais produtos exigem receita"), `chat_messages.prescription_id`.
- RLS via `can_access_access_prescription_row(customer_id, reviewed_by_user_id)`: tenant + (dono da linha OU revisor OU role admin/manager/pharmacist). `prescription_files`/`items`/`checks` com `FORCE ROW LEVEL SECURITY`, reaplicando a mesma função por subquery.

## Fluxo

**a) Checkout marketplace** (`order_service.py`): cliente só informa `{sent: bool}` no payload — sem upload real. `_create_prescription_snapshot` cria 1 `Prescription` (`pending`) + 1 `PrescriptionItem` por item que exige receita + 4 `PrescriptionCheck` fixos (legibilidade, validade, posologia, CRM), todos não aprovados. `requires_retention` é **sempre `True`** nesse caminho, independente da categoria.

**b) PDV/balcão** (`PrescriptionService.create_from_pdv`): farmacêutico registra no balcão. `delivery_method="physical"` → decisão imediata (aprovado/rejeitado, com motivo obrigatório se rejeitado). `delivery_method="digital"` → cliente informa link/referência, status fica `pending`, e dispara `ChatService` para abrir/reaproveitar uma thread e postar mensagem `prescription_request` (mesmo sem o cliente estar autenticado no marketplace). `requires_retention` aqui **é calculado por categoria** (`prescription_retention`, `special_control`, `black_stripe`) — diferente do checkout, que é sempre `True`.

**Fila de revisão** (`list_review_queue`, tenant-scoped, pending-first) e **decisão** (`decide`): valida motivo obrigatório se rejeitado; se a prescription tem `order_id`, propaga via `_apply_decision_to_order` — **aprovar só libera o hold** (`prescription_status=approved`); **rejeitar cancela o pedido inteiro** (`status=CANCELLED`) e credita o estoque de volta automaticamente (`restock_marketplace_order`, replay dos ledgers de movimento por `reference_code`).

**Gate de fulfillment**: pedido não avança de `new`/`separating` enquanto `requires_prescription_review=True` e `prescription_status=pending` (ver [[Modulo_Carrinho_Pedidos|Carrinho e Pedidos]]).

## Endpoints

- `GET /prescriptions/status` — placeholder, texto fixo, não funcional.
- `GET /prescriptions/review-queue`, `POST /prescriptions/{id}/decision` — `ADMIN, PHARMACIST`.
- `POST /pdv/prescriptions`, `GET /pdv/prescriptions/status` — `ADMIN, MANAGER, PHARMACIST`.
- **Não existe endpoint de upload de arquivo de receita** em lugar nenhum do domínio.

## Regras de negócio não óbvias

- **Quais produtos exigem receita** vem do catálogo (`inventory_products.controlled_category`), não desta tabela; `requires_retention` de fato só é calculado por categoria no fluxo PDV (checkout marketplace hardcoda `True`).
- **Janela de validade não é calculada**: `remaining_validity_days` é sempre `None` na criação em ambos os fluxos — sem lógica de expiração no backend.
- **Checklist do farmacêutico é hardcoded e nunca granularmente atualizável** — decisão só acontece no nível "receita inteira" (aprovado/rejeitado), não check a check.
- **Rejeição é decisão terminal e side-effect cross-domain**: cancela pedido + credita estoque automaticamente, acoplando prescriptions↔orders↔inventory diretamente no service (sem evento assíncrono).
- **Canal isolado no PDV**: o status de receita que libera item controlado no carrinho do balcão só considera receitas do próprio canal (`source_channel="pdv"`) — receita enviada via marketplace não libera item no PDV e vice-versa.
- **Gap upload real vs. UI**: existe schema+RLS completos para `prescription_files` e storage privado (`file_storage.py`/`file_validation.py`), mas nenhum service liga as duas pontas — nem endpoint, nem chamada de `validate_upload`/`write_private_file` a partir de prescriptions.

## Frontend

- **Interno** (`prescriptions-screen.jsx`): master-detail com checklist e ações (Falar c/ paciente, Recusar, Validar e liberar, Reabrir). O shape do checklist consumido no componente diverge do formato real do backend (`checks[key]` boolean vs. lista `{key,label,passed,note}`), sugerindo que a tela ainda roda sobre dados mockados em parte.
- **Marketplace**: três pontos com dropzone de upload (`PrescriptionCard` no checkout, `PrescriptionModal`, `PrescriptionScreen`/rota `rx` com `PharmacistChatPanel` ao lado) — todos **client-side apenas**, nenhum faz `POST`/`FormData` real; o clique em "enviar" só seta um boolean local `sent=true`.

## Ver também

- [[Modulo_Carrinho_Pedidos|Módulo Carrinho e Pedidos]] — gate de fulfillment e único caminho de cancelamento de pedido.
- [[Modulo_Chat|Módulo Chat]] — canal usado para solicitar validação digital de receita no PDV.
- [[Modulo_Estoque|Módulo Estoque]] — `restock_marketplace_order`, acionado na rejeição.

## Atualizações

- 2026-07-25: nota criada — documentação do estado atual do módulo.
