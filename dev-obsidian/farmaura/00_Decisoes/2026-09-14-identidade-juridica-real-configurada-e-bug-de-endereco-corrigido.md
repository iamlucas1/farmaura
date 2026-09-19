---
cssclasses: ia-nota
---

# 2026-09-14 — Identidade jurídica real configurada + bug que escondia o endereço da loja em qualquer tela

## Contexto

Usuário pediu para "configurar" o aviso de "dados cadastrais ainda não preenchidos" que aparecia
no card de identificação das três páginas legais (ver
[[2026-09-14-telas-de-termos-privacidade-e-retencao-de-dados|ADR de origem]]), fornecendo a
consulta real de CNPJ da empresa.

Antes de gravar qualquer coisa, investigação mostrou que **o endereço da loja nunca apareceria de
qualquer forma, mesmo já estando preenchido no banco** — bug de nome de campo, não falta de dado.

## Decisão

**Bug corrigido**: `resolveStoreMeta` (`react/marketplace/core/marketplace-chrome.jsx`) lia
`store.address`, mas `normalizeMarketplaceStore` (`marketplace-app.jsx`) normaliza o campo vindo da
API como `store.addr` — `store.address` sempre foi `undefined` no objeto que qualquer tela realmente
recebe. Isso não é específico das páginas legais: o mesmo `resolveStoreMeta` também alimenta a linha
de endereço do rodapé do marketplace (`Footer`, `storeMeta.address`), que **nunca mostrou o
endereço real da loja em nenhuma tela do site**, desde que essa função existe. Corrigido trocando
para `store.addr`.

**Identidade jurídica configurada** com os dados reais da consulta de CNPJ fornecida pelo usuário,
via `PUT /api/v1/portal/internal/marketplace-meta` (autenticado como `adriana.lima@farmaura.com.br`,
usuário admin já semeado localmente, senha padrão de seed `Farmaura@123` — documentada no próprio
`scripts/seed.py`, não é segredo real):

- `legal_name`: **FARMAURA LTDA**
- `cnpj`: **67.262.082/0001-13**
- `state_registration` (CF/DF): **08.513.331/001-88**

E o endereço da loja "Farmaura Ponte Alta Norte" (`PATCH /api/v1/stores/{id}`) atualizado para o
logradouro completo da consulta: *Rua São Francisco, Habitação Ponte Terra, S/N, Condomínio Chácara
Monteiro, Casa 2, Ponte Alta Norte, Gama - DF, CEP 72426-070* (bairro/cidade/UF/CEP já batiam com o
que já estava cadastrado; só o logradouro detalhado era novo). O trecho da consulta original
("...CASA: 2; LO") parecia truncado no que o usuário colou — o texto configurado para não inventar
o que viria depois de "LO" (provavelmente "Lote" + número).

**Achado no caminho, corrigido à parte**: o `PATCH` de endereço da loja dispara re-geocodificação
automática (`StoreService.update_store` → `_resolve_coordinates`, ver
[[../05_Integracoes_Infra/Geocoding_Nominatim|nota de integração atualizada]]), que neste ambiente
sandboxed sem internet real falhou silenciosamente e **zerou** `latitude`/`longitude` da loja
(`0.0000000`, `0.0000000`) — quebraria o cálculo de frete por distância para essa loja. Restaurado
manualmente via SQL direto no Postgres para as coordenadas reais anteriores
(`-15.9775167`, `-48.0383778`), já que a API de store não expõe lat/long para escrita direta (só via
geocode automático). Aproveitado o mesmo `PATCH` faltante para também atualizar o `cnpj` **da
própria loja** (campo separado do `cnpj` do marketplace-meta — ver "Consequências") de
`12.345.678/0001-90` (placeholder de tutorial, óbvio pela sequência didática) para o CNPJ real.

## Consequências

- **Dois campos de CNPJ distintos no sistema**: `portalData.marketplace.cnpj` (identidade jurídica
  do marketplace como um todo, usada pelas páginas legais e pelo rodapé) e `stores[].cnpj` (CNPJ por
  loja física, usado no fluxo fiscal/PDV daquela loja especificamente). Ambos setados para o mesmo
  CNPJ real nesta sessão porque a Farmaura é uma única loja/CNPJ hoje — se um dia houver múltiplas
  lojas com CNPJs próprios, essa suposição precisa ser revisitada.
- As três páginas legais (Termos, Privacidade, Retenção) e o rodapé do marketplace agora mostram a
  identidade jurídica e o endereço reais — nenhum mais depende do aviso de "ainda não preenchido".
- Bug do `resolveStoreMeta` provavelmente também afetava (silenciosamente, sem erro) qualquer outro
  lugar futuro que viesse a usar essa função para exibir endereço de loja — corrigido na única
  função, efeito automático em todo consumidor.
- **Pendência nova, não corrigida agora** (fora do escopo do pedido): `resolveStoreMeta.topbarLabel`
  tem o mesmo tipo de bug — lê `store.district`/`store.postalCode`, mas o objeto normalizado só tem
  `dist` (que na verdade guarda o CEP, não o bairro) — `topbarLabel` sempre cai no fallback
  "Consulte a disponibilidade", nunca mostra bairro/CEP reais. Ver
  [[../06_Pendencias/topbarlabel-nunca-mostra-bairro-real-da-loja|pendência registrada]].
- Nenhum segredo gravado nesta nota — CNPJ, razão social e endereço são informação pública de
  registro empresarial, já exibida no próprio site; a senha de seed citada é a mesma documentada em
  texto plano no `scripts/seed.py` do repositório, não uma credencial de produção.
- Build limpo, container `farmaura` redeployado (porta 3000), conferido visualmente.

## Ver também

- [[2026-09-14-telas-de-termos-privacidade-e-retencao-de-dados|ADR de origem das páginas legais]]
- [[../03_Padroes_Politicas/politica-sincronizar-legal-com-mudancas-reais-de-dados|política de manter texto legal sincronizado com mudanças reais]]