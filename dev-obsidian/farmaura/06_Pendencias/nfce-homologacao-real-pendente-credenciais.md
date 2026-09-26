---
cssclasses: ia-nota
---

# Emissor ainda não credenciado na SEFAZ-DF para NFC-e (cStat 781)

**Status:** Bloqueado
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

Atualizado em 2026-09-24 — a maior parte desta pendência foi resolvida: certificado A1 real fornecido e verificado (ver [[certificado-a1-farmaura-ainda-nao-fornecido|pendência do certificado]]), `.env` preenchido (CNPJ/IE/razão social/endereço/IBGE/série/CRT=1, Simples Nacional), e o teste real `python scripts/fiscal_homologation_check.py --send --profile ...` chegou a transmitir uma NFC-e de teste de verdade para a SEFAZ-DF (homologação).

Nesse teste real apareceu (e foi corrigido) um bug sério: a canonicalização C14N usada para assinar (`app/fiscal/xml_signer.py`) invalidava a assinatura em qualquer envio real — rejeição cStat 297 "Assinatura difere do calculado". Isso bloquearia **100% das emissões reais**, mesmo com certificado e dados corretos, e não era visível offline porque a auto-verificação interna reusava a mesma função com bug nos dois lados da comparação. Corrigido e testado (105 testes de `app/tests/unit/test_fiscal_*` passando, e nova transmissão real confirmando que a rejeição de assinatura desapareceu). Detalhe técnico no commit `8aaea2f`.

Depois da correção, a SEFAZ-DF passou a avaliar a nota por regras de negócio reais e rejeitou com **cStat 781: "Emissor não habilitado para emissão da NF-e/NFC-e"** — o CNPJ da FARMAURA (67.262.082/0001-13) ainda não está credenciado para emitir NFC-e no ambiente de homologação da SEFAZ-DF. Isso é um passo administrativo junto à SEFAZ (fora do código) — normalmente feito pelo contador ou diretamente no Portal do Contribuinte do DF.

Depois do credenciamento, falta ainda o perfil fiscal dos produtos (CSOSN, NCM, etc. — ver [[nfce-cadastro-fiscal-dos-produtos-e-crt|pendência separada]]) antes de qualquer venda real do marketplace/PDV gerar NFC-e.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]] e o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]].
