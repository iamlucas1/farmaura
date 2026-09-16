# `product_ref` não normalizado provavelmente quebra favoritos e assinaturas silenciosamente

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-08-26

## Descrição

Ao corrigir `PortalService._resolve_review_purchase_match` (mesma leva de trabalho — avaliação de produto real em Meus pedidos), encontrei a causa raiz: `_split_product_ref` (`portal_service.py`) só entende refs prefixados `inv-`/`listing-`. O id real de produto usado pelo frontend em todo lugar (`product.id`, vindo de `build_marketplace_product_id`, formato `mkt-<nome>-<marca>`) **nunca** é prefixado assim. Para um ref não prefixado, `_split_product_ref` devolve a string crua como se fosse o `inventory_id` — que depois é usado para filtrar/gravar contra uma coluna `uuid`.

Essa mesma função (`_split_product_ref`) é usada também em `create_favorite` (`portal_service.py:952`) e `create_subscription` (`:997`) — ambas chamam com o `product_ref` real vindo do client. Pelo mesmo padrão do bug de reviews (já corrigido), isso deveria gerar erro de tipo/500 ao favoritar ou assinar um produto usando o id real do marketplace.

Evidência indireta: a tabela `saved_products` no banco de dev só tinha registros inseridos diretamente pelo `scripts/seed.py`, nenhum vindo de uso real da API — consistente com a rota real falhando silenciosamente. O frontend (`toggleFav` em `marketplace-app.jsx`) não tem `try/catch` ao redor dessa chamada, então uma falha vira uma promise rejeitada sem tratamento — visualmente, o coração de favoritar só não atualiza, sem erro visível ao usuário.

## Contexto

Achado colateral durante a correção do bug irmão em `_resolve_review_purchase_match` (ver [[../00_Decisoes/2026-08-26-nota-fiscal-acesso-do-cliente-por-pedido|ADR da leva de trabalho]] para o contexto geral). Não foi corrigido agora para manter o escopo da leva restrito a avaliação de produto + nota fiscal do cliente, mas é uma falha silenciosa em recursos já publicados (favoritos, assinaturas via toggle do carrinho) — prioridade alta porque pode estar afetando uso real agora, não é só débito técnico teórico.

**Próximo passo sugerido**: confirmar com um teste real (favoritar um produto pelo id real via `POST /portal/marketplace/favorites`) se de fato quebra, e se sim aplicar o mesmo tipo de correção usada em `_resolve_review_purchase_match` (recompor `build_marketplace_product_id` a partir dos itens do próprio recurso e comparar em Python, em vez de gravar a string crua na FK).
