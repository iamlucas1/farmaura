---
cssclasses: ia-nota
---

# Bootstrap autenticado vaza comissão/taxa/margem para qualquer cliente logado; bootstrap interno vaza financeiro/cupons/promoções para CASHIER

**Tipo:** Vulnerabilidade (Broken Object Property Level Authorization / excessive data exposure)
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `farmaura-api` (+ consumido por `farmaura`)
**Categoria:** Broken Access Control / exposição excessiva de dado
**Data de identificação:** 2026-08-19 (rodada de aprofundamento do frontend, parte da auditoria completa de segurança)

## Descrição

`PortalMarketplaceMetaResponse` carrega `commission_percent`, `payment_fee_percent`, `fixed_fee` e `minimum_margin_percent` — a economia interna da plataforma (dado comercial sensível). O caminho **público/anônimo** (`get_marketplace_public_bootstrap`) já zera esses quatro campos explicitamente antes de responder (correção aplicada na revisão de acesso anônimo de 2026-07-20, ver [[2026-07-20-revisao-acesso-anonimo]]). Porém o caminho **autenticado de cliente** (`get_marketplace_bootstrap`, usado por `GET /portal/marketplace/bootstrap`) chama a mesma função de resolução **sem aplicar o mesmo scrub** — qualquer `CUSTOMER` logado recebe os valores reais.

No console interno, `GET /portal/internal/bootstrap` é acessível a `CASHIER` (o papel de menor confiança que ainda entra no console). O payload retornado é **idêntico** ao de ADMIN/MANAGER — inclui `financial_settings` (faturamento, aluguel, folha, energia), `coupon_campaigns`, `pricing_promotions`, `delivery_pricing`, `pdv_discount_settings`, `cnae_settings` — sem qualquer filtro por papel na camada de serviço. A UI só esconde o menu de navegação para Analytics/Pricing/Finance (via `INTERNAL_ROUTE_ACCESS` em `access-control.js`, onde `CASHIER` só tem `['dash','pdv','sales']`) — mas o dado já chegou ao browser do caixa antes de qualquer checagem de UI, e fica persistido em `localStorage`.

## Evidência

- `app/services/portal_service.py:275-282` — scrub explícito só no caminho público:
```python
marketplace = (await self._resolve_marketplace_meta(tenant_id=tenant_id)).model_copy(
    update={'commission_percent': Decimal('0.00'), 'payment_fee_percent': Decimal('0.00'), ...}
)
```
- `app/services/portal_service.py:395` — caminho autenticado, sem scrub: `marketplace = await self._resolve_marketplace_meta(tenant_id=customer.tenant_id)`.
- `app/api/v1/portal.py:130-133` — `get_internal_bootstrap` com `require_internal_subject(ADMIN, MANAGER, PHARMACIST, CASHIER)`, mesmo payload para todos os quatro papéis.
- `farmaura/react/marketplace/core/marketplace-app.jsx:1810` — payload persistido em `localStorage` (`writeMarketplaceScopedCache`).
- `farmaura/react/internal/core/internal-app.jsx:2932` e `access-control.js:31-37` — filtro é só de navegação (menu), não de dado.

## Cenário de risco

1. Qualquer cliente que crie conta no marketplace e inspecione a aba Network/Application do navegador aprende a taxa de comissão, taxa de pagamento e margem mínima da farmácia — informação comercial competitiva, sem exigir nenhuma técnica de exploração, só logar e olhar a resposta da própria API que o cliente já recebe normalmente.
2. Qualquer funcionário-caixa (papel interno de menor confiança) vê faturamento, folha de pagamento, aluguel e todas as promoções/cupons do tenant, mesmo sem acesso de navegação a essas telas.

## Impacto

Vazamento de dado financeiro/comercial sensível (economia da plataforma, custos operacionais internos) para dois públicos que não deveriam ter acesso: clientes finais e funcionários de menor confiança. Quebra do princípio de menor privilégio — o mesmo tipo de problema já corrigido para visitante anônimo em 2026-07-20 nunca foi estendido para os níveis autenticados "cliente comum" e "caixa".

## Pré-condições

Conta de cliente comum (`CUSTOMER`) para o achado 1; conta interna com papel `CASHIER` para o achado 2 — ambas as barreiras são baixas (qualquer pessoa pode criar conta de cliente; CASHIER é o papel interno de menor privilégio, tipicamente atribuído a funcionários de balcão).

## Escopo afetado

`app/services/portal_service.py` (`get_marketplace_bootstrap`, `get_internal_bootstrap`, `_resolve_marketplace_meta`), `app/api/v1/portal.py` (rotas de bootstrap), `app/schemas/portal.py` (`PortalMarketplaceMetaResponse` e schemas do bootstrap interno).

## Causa raiz

A correção de 2026-07-20 tratou apenas o caso "visitante anônimo" como digno de scrub — o raciocínio não foi generalizado para "qualquer nível de acesso que não deveria ver este dado específico", deixando os níveis intermediários (cliente autenticado, caixa) sem o mesmo tratamento. No bootstrap interno, nunca existiu segmentação de payload por papel — sempre foi tudo-ou-nada (acesso à rota = acesso a todo o payload).

## Correção sugerida para análise futura

1. Aplicar em `get_marketplace_bootstrap` o mesmo `model_copy(update={...zeros...})` já usado no bootstrap público — ou melhor, mover a decisão para dentro de `_resolve_marketplace_meta` com um parâmetro explícito (`include_economics: bool`), evitando que uma futura chamada nova repita o mesmo esquecimento.
2. Segmentar `get_internal_bootstrap` por papel: só ADMIN/MANAGER recebem `financial_settings`/`coupon_campaigns`/`pricing_promotions`/`delivery_pricing`/`pdv_discount_settings`; CASHIER recebe um subconjunto mínimo (loja, turno, dado de PDV). Nunca confiar apenas no roteador client-side para decidir o que entra no payload.

## Dependências da correção

Nenhuma migration — mudança de lógica de serialização/composição de resposta. Requer levantar, com o time de produto, exatamente quais campos cada papel interno deveria ver (hoje implícito só pela navegação de UI).

## Riscos de regressão

Médio — qualquer tela do console que hoje leia um campo do bootstrap que passaria a ser omitido para CASHIER precisa ser identificada e ajustada (mostrar estado vazio/placeholder em vez de quebrar). Testar cada tela acessível a CASHIER após a mudança.

## Como validar futuramente que a correção funcionou

1. Autenticar como `CUSTOMER` comum e confirmar que `GET /portal/marketplace/bootstrap` retorna `commission_percent`/`payment_fee_percent`/`fixed_fee`/`minimum_margin_percent` zerados, igual ao caminho público.
2. Autenticar como `CASHIER` e confirmar que `GET /portal/internal/bootstrap` não retorna `financial_settings`/`coupon_campaigns`/`pricing_promotions`/`delivery_pricing`/`pdv_discount_settings` (ou retorna um subconjunto claramente reduzido).

## Referências

- [[2026-07-20-revisao-acesso-anonimo]] — correção original que tratou só o caso anônimo, precedente direto deste achado.
- [[cache-portal-nao-limpo-no-logout]] — achado relacionado: o payload vazado por este achado também fica persistido em `localStorage` além do logout.

## Atualizações

- 2026-08-19: achado registrado via rodada de aprofundamento do frontend, parte da auditoria completa de segurança.