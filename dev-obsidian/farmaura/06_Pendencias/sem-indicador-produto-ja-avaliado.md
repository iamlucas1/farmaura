---
cssclasses: ia-nota
---

# Sem como saber se o cliente já avaliou um produto (e sem trava contra avaliação duplicada)

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-08-26

## Descrição

O botão "Avaliar produto" (novo, em `OrderCard`/`OrderSupportDrawer`, `POST /portal/products/reviews`) fica sempre disponível para qualquer item de um pedido `delivered`, mesmo que o cliente já tenha avaliado aquele produto antes — não existe:

- um endpoint que devolva "minhas avaliações" ou "já avaliei este produto" para o cliente autenticado;
- uma constraint (nem de app, nem de banco) impedindo múltiplas linhas em `product_reviews` para o mesmo `(customer_id, product_ref)`.

`create_product_review` (`portal_service.py`) insere sem checar duplicidade nenhuma.

## Contexto

Decisão deliberada de escopo ao implementar avaliação de produto real: como não há sinal nenhum vindo do backend para esconder o botão condicionalmente, ele fica sempre visível em vez de fingir um estado "já avaliado" no client sem lastro real. Corrigir direito precisa de: endpoint de leitura por cliente (ou expor isso dentro de `GET /orders`) e, se fizer sentido de negócio, uma `UniqueConstraint(customer_id, product_ref)` em `product_reviews` — decisão de produto sobre se múltiplas avaliações do mesmo cliente pro mesmo produto são aceitáveis (ex: compras repetidas) antes de travar isso.