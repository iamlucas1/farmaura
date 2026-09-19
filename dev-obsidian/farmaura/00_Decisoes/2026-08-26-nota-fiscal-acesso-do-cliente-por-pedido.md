---
cssclasses: ia-nota
---

# 2026-08-26 — Nota fiscal: acesso do cliente escopado por pedido, não por `fiscal_document_id`

## Contexto

O marketplace ganhou um botão real "Baixar nota fiscal" em Meus pedidos (`OrderCard`/`OrderSupportDrawer`). Antes disso, `FiscalDocument` só era acessível pelas rotas internas (`GET /fiscal-documents/{document_id}[/printable]`, `ADMIN|PHARMACIST|CASHIER`) — o cliente via que a nota existia (`fiscal_document` já vinha embutido em `GET /orders`), mas não tinha como abrir/baixar.

Ao desenhar a rota nova, encontrei que `fiscal_documents_access_policy` (RLS, `row_level_security.py`) só filtra por `tenant_id` — sem predicado de dono, diferente de `orders_access_policy`, que já usa `can_access_order_row(customer_id)`. Ou seja: uma sessão de cliente autenticado, sob RLS, consegue em tese ler o `FiscalDocument` de qualquer outro cliente do mesmo tenant, se a query for feita por `document_id`.

## Alternativas consideradas

- **Abrir `fiscal_documents_access_policy` para incluir uma checagem de dono (via `Order.customer_id`) e reaproveitar a mesma rota `/fiscal-documents/{document_id}/printable` também para clientes.** Descartado: mudaria a política de RLS usada por *toda* leitura de nota fiscal do sistema (PDV, board interno, e-mail), aumentando o raio de impacto de uma mudança motivada por um caso de uso bem mais estreito (autoatendimento do cliente).
- **Nova rota aceitando `document_id` direto, só trocando o guard de role para `CUSTOMER` com checagem de dono no service.** Descartado: ainda expõe um id de documento enumerável a uma role que hoje nunca viu esse id — qualquer erro futuro na checagem de dono vira vazamento direto de nota fiscal de outro cliente.

## Decisão

Nova rota `GET /orders/{order_id}/fiscal-document/printable` (`orders.py`, guard `require_marketplace_subject(UserRole.CUSTOMER)`). O documento fiscal nunca é buscado por `document_id` do lado do cliente — sempre resolvido a partir de um `Order` já validado como do próprio cliente (`OrderService.get_customer_order_fiscal_document_html`: busca o pedido por `order_id` dentro do tenant, confere explicitamente `order.customer_id == customer.id` — 404 se não bater, nunca 403, para não confirmar a existência do pedido a quem não é dono — e só então chama `FiscalService.get_document_html_by_order_id(order_id=...)`, que busca `FiscalDocument` por `order_id`, nunca por `document_id`).

`fiscal_documents_access_policy` **não foi alterada**.

## Consequências

- A rota de cliente é estruturalmente incapaz de vazar nota fiscal de outro cliente, mesmo que a RLS de `fiscal_documents` continue sem predicado de dono — a checagem fica explícita no código, mais fácil de auditar do que confiar só numa policy SQL.
- Se no futuro alguém adicionar uma segunda forma de o cliente acessar nota fiscal, precisa repetir o mesmo padrão (resolver por pedido, nunca por id de documento direto) — vale revisar este ADR antes de criar uma rota nova nesse domínio.
- A lacuna de RLS em si (`fiscal_documents_access_policy` sem ownership) permanece — é pré-existente, não introduzida por esta mudança, e continua só protegida por roles internas terem acesso amplo por natureza (ADMIN/PHARMACIST/CASHIER já veem notas fiscais de qualquer cliente do tenant como parte do trabalho). Não abri pendência nova para isso porque já é coberto pelo mesmo desenho de risco que outras tabelas sem RLS completa no domínio (ver `04_Seguranca_Riscos/`).