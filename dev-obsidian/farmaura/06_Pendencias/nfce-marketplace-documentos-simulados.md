---
cssclasses: ia-nota
---

# Marketplace ainda gera documento fiscal simulado (chave fictícia) e o cliente pode baixá-lo

**Status:** Aberto
**Prioridade:** Alta
**Registrado em:** 2026-09-20

## Descrição

Fora do escopo pedido (PDV). Pedidos online, 7 dias após o pagamento, continuam criando um `FiscalDocument` **simulado** (número e chave por hash) via `fiscal_scheduler` + `issue_for_order`, agora marcado `LEGACY_SIMULATED`. O cliente vê "Baixar nota fiscal" e a página diz "Autorizada". **Não é uma NFC-e válida.**

Decisão de negócio/contábil necessária: (a) emitir NFC-e/NF-e reais para vendas online (NFC-e exige presença ou entrega com `indPres=4`; avaliar NF-e modelo 55); ou (b) parar de gerar e de exibir o documento. Recomendação: decidir antes da produção fiscal — hoje coexistem notas reais (balcão) e fictícias (online).

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../03_Padroes_Politicas/regra-negocio-janela-cdc-nota-fiscal|regra da janela CDC]] e [[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]].
