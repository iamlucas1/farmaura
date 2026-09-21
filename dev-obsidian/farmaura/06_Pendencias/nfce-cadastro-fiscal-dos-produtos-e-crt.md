---
cssclasses: ia-nota
---

# Cadastro fiscal dos produtos e regime tributário (CRT) dependem do contador

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

Nenhum produto tinha campo fiscal; foi criada `product_fiscal_profiles` e a rota `PUT /fiscal/products/{id}/profile` (admin). **Falta preencher o perfil de cada produto** com dados do contador — sem isso nenhuma venda gera NFC-e (a venda mostra os campos que faltam).

Decisão do contador que muda o XML: **CRT**. CRT=3 → IBS/CBS obrigatórios desde 03/08/2026 (CST, cClassTrib e alíquotas por produto); CRT=1/2/4 → ICMS por CSOSN e sem IBS/CBS. Também: produtos com ST (CST 60/CSOSN 500 — hoje sem valores de ST retido) e CEST/cBenef.

**Não há tela de edição do perfil** no console (só a API). Criar a UI ao lado do cadastro de produtos é o próximo passo natural.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]].
