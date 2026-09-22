---
cssclasses: ia-nota
---

# Marketplace: pedidos `delivery`/`shipping` ainda sem nota fiscal real

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20
**Atualizado em:** 2026-09-22 — resolvido para pedidos `pickup`, escopo restrito a `delivery`/`shipping`.

## Descrição

**Resolvido para pedidos `pickup` (retirada em loja) em 2026-09-22**: passaram a emitir NFC-e real, direto à SEFAZ-DF, pelo mesmo motor do PDV — ver [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR]]. Não geram mais nenhum documento simulado.

**Ainda em aberto para pedidos `delivery`/`shipping`**: esses continuam **sem nenhum documento fiscal** (nem simulado, nem real) até decisão do contador — o motor reaproveitado (`_snapshot_pdv_sale`/`_snapshot_marketplace_order`) bloqueia deliberadamente qualquer venda com `delivery_fee_amount > 0`, e a NFC-e presume `indPres=1` (presencial, hardcoded em `xml_builder.py`, sem parametrização hoje) — venda com entrega é não presencial (`indPres=4`), o que exigiria além da definição tributária do frete também uma mudança de código ainda não feita.

Decisão de negócio/contábil necessária para este subconjunto: (a) definir o tratamento fiscal da taxa de entrega e implementar `indPres=4` para emitir NFC-e/NF-e real também para `delivery`/`shipping`; ou (b) definir que esses pedidos seguem sem nota automática por ora. Documentos antigos já persistidos como `LEGACY_SIMULATED` (de antes de 2026-09-22) continuam sendo servidos normalmente (impressão, e-mail) — não foram apagados nem reprocessados.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../03_Padroes_Politicas/regra-negocio-janela-cdc-nota-fiscal|regra da janela CDC]], [[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]] e [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR de 2026-09-22]] (decisão que resolveu o subconjunto `pickup`).
