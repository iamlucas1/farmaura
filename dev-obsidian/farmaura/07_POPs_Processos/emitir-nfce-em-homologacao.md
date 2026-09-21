---
cssclasses: ia-nota
---

# Emitir NFC-e em homologação (SEFAZ/SVRS, DF)

## Quando usar

Antes de ligar o módulo fiscal no PDV, para provar que certificado, emitente e perfil tributário fecham com a SEFAZ. **Nunca em produção**: o script recusa `FISCAL_ENV=producao`. Contexto: [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]], [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]], [[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]]. Detalhe técnico completo: `farmaura-api/docs/fiscal/NFCE.md`.

## Pré-requisitos (dependem de você e do contador)

1. Certificado **A1** (`.pfx`) e senha, do mesmo CNPJ do emitente.
2. CNPJ, IE/CF-DF, razão social, endereço com **código IBGE**, série e **CRT**.
3. Perfil tributário dos produtos (NCM, CFOP, CST/CSOSN, PIS/COFINS; e IBS/CBS se CRT=3): [[../06_Pendencias/nfce-cadastro-fiscal-dos-produtos-e-crt|pendência]].

## Passo a passo

1. Colocar o `.pfx` em `farmaura-api/secrets/nfce/` (ignorada pelo git e pelo build) e preencher o bloco "Fiscal" do `farmaura-api/.env` (modelo em `.env.example`). Manter `FISCAL_ENV=homologacao`. O CSC **não** é necessário (QR Code v3 online não usa CSC).
2. Conferir tudo sem enviar nota: `docker compose run --rm --no-deps --entrypoint uv farmaura-api run python scripts/fiscal_homologation_check.py` — lista o que falta, valida certificado (senha, validade, CNPJ) e consulta o status da SEFAZ.
3. Enviar **uma** nota de teste com o perfil do contador em `profile.json`: `... fiscal_homologation_check.py --send --profile profile.json`. Espera `cStat 100`; o XML autorizado fica em `homolog-out/`.
4. Só então ligar `NFCE_ENABLED=true`, aplicar a migration `20260920_05` ([[../06_Pendencias/aplicar-migration-nfce-fiscal-em-producao|pendência]]) e fazer uma venda no PDV; acompanhar no painel **Fiscal (NFC-e)**.
5. Testar cancelamento (gerente, dentro de 30 min) e "Consultar SEFAZ".

## O que a homologação pode revelar

Pacote de schemas (PL_010b vs. NT 2025.002 v1.51), regra do grupo `card` (cStat 391/392/737), URLs de QR/consulta do DF em homologação, cadeia de certificados do servidor da SVRS (`NFCE_CA_BUNDLE_PATH`). Ver [[../06_Pendencias/nfce-schemas-pl-010f-uv-lock-e-front-nao-buildado|pendência dos schemas]].

## Riscos se pulado

Emitir em produção sem nunca ter recebido um `cStat 100` de homologação; certificado de outro CNPJ; perfil tributário incorreto gerando rejeições em série.

## Atualizações

- 2026-09-20: POP criado com o módulo NFC-e. Ainda **não executado** (faltam as credenciais acima).
