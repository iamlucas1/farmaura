---
cssclasses: ia-nota
---

# 2026-08-29 — Faixa "Tendências" da home: curadoria manual, mesmo padrão de Ofertas do dia/Marcas em destaque

## Contexto

A pendência [[../06_Pendencias/faixa-tendencias-sem-sinal-real-no-catalogo|registrada em 2026-08-27]]
apontava que o demo de referência tem uma 6ª faixa colorida na home ("Tendências",
`--fa-success-soft`, entre "Sugestões para você" e "Cuidados e Infantil") sem equivalente real —
na época, decidido deixá-la de fora em vez de fabricar um sinal de "alta" sem lastro (reaproveitar
`tags`/`reviews` ou duplicar "Mais procurados" com rótulo diferente).

O usuário pediu explicitamente para implementar a faixa de verdade: página nova no console interno
para o admin curar os produtos, seed com produtos reais, e o visual batendo com o demo.

## Decisão

Tratada como uma 4ª seção de merchandising curável, no mesmo molde já estabelecido por "Banner da
vitrine"/"Marcas em destaque"/"Ofertas do dia" — `PortalSetting` própria (`home_trends`), resolvida
nos três bootstraps (público, autenticado, interno), com endpoint `PUT /portal/internal/home-trends`
e uma página nova no console (`Vitrine → Tendências`).

Deliberadamente **mais simples que "Ofertas do dia"**: só `mode="off"|"on"` + `product_refs`
(sem os modos automático/agendado, sem contador, sem título/subtítulo custom) — o demo em si só
mostra uma grade de produtos com um título fixo, sem urgência/tempo envolvido, então replicar toda
a máquina de agendamento de "Ofertas do dia" seria complexidade sem uso real. A curadoria em si
(escolher por fonte real — mais vendidos, melhores margens, promoção/desconto/cupom ativo — ou
busca manual, reordenar com ▲▼) reaproveita o componente `ProductCurationPanel` já existente em
`deal-of-the-day-screen.jsx` (exportado de lá, junto de `itemRef`/`SUGGESTION_TABS`) em vez de
duplicar a lógica — o componente já era genérico o bastante (parametrizado por `productRefs`/
`onChangeRefs`), só nunca tinha sido reaproveitado fora daquela tela.

Continua sendo **curadoria manual pelo admin, não um sinal automático de tendência real**
(crescimento de vendas período-a-período) — a razão original da pendência (sem esse dado no
backend hoje, curadoria manual é o caminho honesto) não mudou; o que mudou foi dar ao admin uma
ferramenta real pra alimentar a seção, em vez de deixá-la vazia. Se um sinal de tendência real for
implementado no futuro, essa seção pode ganhar um modo "auto" adicional reaproveitando o mesmo
padrão de "Ofertas do dia", sem precisar reestruturar o que já existe.

## Arquivos principais

- Backend: `app/schemas/portal.py` (`PortalHomeTrendsResponse`/`UpdateRequest`, campo `home_trends`
  nos três bootstraps), `app/services/portal_service.py` (`_resolve_home_trends`/
  `update_home_trends`, `SETTING_KEY_HOME_TRENDS`), `app/api/v1/portal.py` (`PUT
  /internal/home-trends`).
- Seed: `scripts/seed.py` (`build_home_trends_settings`, `HOME_TRENDS_CANDIDATE_KEYS` — 8 produtos
  reais distintos-mas-sobrepostos ao pool de "Ofertas do dia", já `mode="on"`).
- Console interno: `screens/home-trends-screen.jsx` (nova), `core/internal-shell.jsx` (item de nav
  em "Vitrine"), `core/internal-app.jsx` (estado/save/bootstrap), `shared/access-control.js`
  (`home-trends` adicionado ao whitelist de rotas de ADMIN/MANAGER/PHARMACIST — sem isso a página
  existe mas fica invisível no menu, achado só na verificação visual).
- Marketplace: `core/marketplace-app.jsx` (`normalizeHomeTrends`), `core/marketplace-components.jsx`
  (`resolveHomeTrendsProducts`), `screens/home-screen.jsx` (banda `index:5`/`success-soft`, entre
  "Sugestões para você" e "Cuidados e Infantil", mesma posição do demo).

## Consequências

- Verificado via screenshot ponta a ponta: console interno (curadoria com dados reais — vendas,
  preço, selo de promoção) → seed → banda real na home, cor/título/subtítulo idênticos ao demo.
- Achado durante a verificação (não um bug introduzido agora, mas quase virou um): esquecer o
  whitelist de `access-control.js` faz a rota existir e funcionar, mas o item de menu não aparece
  pra ninguém — vale checar esse arquivo sempre que uma rota nova de console interno for adicionada.
- Nenhuma migration necessária (mesma tabela `portal_settings`).

## Ver também

- [[../06_Pendencias/faixa-tendencias-sem-sinal-real-no-catalogo|Pendência original]] — resolvida por este ADR.
- [[2026-08-29-seed-banner-home-hero-e-limite-do-sanitizador|Padrão de seed de merchandising]] — mesmo molde já usado pro banner/marcas em destaque/ofertas do dia.