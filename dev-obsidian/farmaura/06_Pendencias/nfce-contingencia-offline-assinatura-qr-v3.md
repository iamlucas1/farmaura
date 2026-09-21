---
cssclasses: ia-nota
---

# Contingência offline da NFC-e não habilitada (falta a fórmula oficial da assinatura do QR v3)

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

Na contingência (`tpEmis=9`) o QR Code v3 exige o parâmetro `assinatura`. A fórmula (campos assinados, algoritmo, codificação) está no **Manual do DANFE NFC-e v6** (março/2025). O portal nacional (`nfe.fazenda.gov.br`) bloqueia download automatizado e nenhuma fonte secundária trouxe a fórmula completa. **Não foi inventada**: `build_offline_qrcode_url()` levanta `ContingencyNotSupportedError` e `NFCE_CONTINGENCY_ENABLED` não tem efeito.

O que já existe: campos `dhCont`/`xJust`, estado `CONTINGENCY`, fila persistente, regra "mesmo `cNF` e mesma chave no reenvio" (MOC Anexo IV), prazo de transmissão (1º dia útil seguinte). Hoje, com a SEFAZ fora do ar, a nota fica `PENDING_RECOVERY` e é enviada quando ela volta — sem DANFE para o cliente.

Para concluir: baixar o Manual v6 pelo navegador, colocar no repositório e implementar `assinatura` + "via do estabelecimento" + aviso "EMITIDA EM CONTINGÊNCIA" (já previsto no DANFE).

## Contexto

Registrada ao implementar o módulo NFC-e. Ver o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]].
