---
cssclasses: ia-nota
---

# Teste real de homologação da NFC-e pendente (faltam certificado e dados do emitente)

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

O módulo foi implementado e testado **offline** (XML validado no XSD oficial, assinatura verificada, SEFAZ simulada). **Nenhuma chamada real à SEFAZ foi feita**: faltam certificado A1 (`.pfx` + senha), CNPJ/IE, razão social, endereço com código IBGE, série, CRT e o perfil tributário dos produtos.

Para executar: preencher o `.env`, colocar o `.pfx` em `farmaura-api/secrets/nfce/` e rodar `python scripts/fiscal_homologation_check.py` (passos 1-3) e depois `--send --profile profile.json`. Só depois disso os itens "homologação funcionando", "autorização funcionando", "QR Code funcionando" e "cancelamento funcionando" do checklist podem ser marcados.

Riscos que só a homologação revela: pacote de schemas (PL_010b v1.30 vs. NT 2025.002 v1.51), regra do grupo `card` (`tpIntegra=2`, cStat 737) e URL de consulta/QR do DF em homologação.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]] e o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]].
