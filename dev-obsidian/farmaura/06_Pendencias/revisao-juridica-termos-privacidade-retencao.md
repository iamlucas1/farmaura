---
cssclasses: ia-nota
---

# Revisão jurídica dos Termos de Uso, Política de Privacidade e Exclusão/Retenção de Dados

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-14

## Descrição

As três telas legais (`farmaura/react/marketplace/screens/legal-screen.jsx` — Termos de Uso,
Política de Privacidade, Exclusão e Retenção de Dados) foram escritas a partir do comportamento
real do produto (código-fonte + ADRs deste cofre), **não por um advogado**. Antes do lançamento
(2026-09-19), confirmar com jurídico — em especial: a cláusula de arrependimento/exceção para
medicamentos (`cancelamento`), os prazos de retenção citados (nota fiscal: 5 anos, art. 173 CTN),
e se a ausência de banner de cookies (Google Analytics já ativo, ver
[[../05_Integracoes_Infra/Google_Analytics|nota de integração]]) precisa de tratamento antes do
tráfego real começar.

Também pendente: preencher `legal_name`/`cnpj`/`state_registration` em
`PortalMarketplaceMetaResponse` (console interno) e o endereço da loja — hoje as três páginas
mostram um aviso honesto de "dados ainda não preenchidos" em vez de qualquer CNPJ inventado (ver
[[2026-09-14-telas-de-termos-privacidade-e-retencao-de-dados|ADR]]).

## Contexto

Ficou pendente porque a IA não tem — nem deveria inventar — a razão social, CNPJ, endereço
registrado ou validação jurídica da empresa; só quem tem acesso a esses dados reais e a um
advogado pode fechar esse ciclo antes do lançamento.