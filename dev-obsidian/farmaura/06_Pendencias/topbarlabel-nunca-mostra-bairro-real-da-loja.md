# `resolveStoreMeta.topbarLabel` nunca mostra bairro/CEP reais da loja

**Status:** Aberto
**Prioridade:** Baixa
**Registrado em:** 2026-09-14

## Descrição

`resolveStoreMeta` (`react/marketplace/core/marketplace-chrome.jsx`) calcula `topbarLabel` lendo
`store.district`/`store.postalCode`, mas o objeto de loja normalizado pelo frontend
(`normalizeMarketplaceStore`, `marketplace-app.jsx`) só expõe `dist` (que guarda o **CEP**, não o
bairro) — nem `district` nem `postalCode` existem nesse objeto. Resultado: `topbarLabel` sempre cai
no fallback `'Consulte a disponibilidade'`, nunca mostra bairro/CEP reais em nenhuma tela que o use
(provavelmente a faixa de topo "Entregar em ..." do `Header`).

Mesma classe de bug do campo `address` já corrigido em
[[../00_Decisoes/2026-09-14-identidade-juridica-real-configurada-e-bug-de-endereco-corrigido|ADR]]
(que trocou `store.address` por `store.addr`) — não corrigido junto porque estava fora do escopo do
pedido do usuário (configurar identidade jurídica) e o fallback aqui não bloqueia nada, só mostra um
texto genérico em vez do bairro real.

## Contexto

Descoberto por inspeção do mesmo arquivo/função durante a correção do bug de endereço. Fix provável:
`normalizeMarketplaceStore` já recebe `district`/`postal_code` da API (usados para montar `dist` e
`address`) — bastaria `resolveStoreMeta` usar `store.dist` (renomeando para deixar claro que é CEP)
e, se bairro real for necessário no topbar, expor um campo `district` separado no objeto
normalizado.
