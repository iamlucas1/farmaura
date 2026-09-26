---
cssclasses: ia-nota
---

# Certificado A1 real da FARMAURA LTDA ainda não fornecido

**Status:** Resolvido em 2026-09-24
**Prioridade:** Alta
**Registrado em:** 2026-09-22

## Descrição

O usuário adicionou um arquivo em `farmaura-api/secrets/nfce/AC-Certisign-RFB-G5.cer` esperando que servisse para assinatura fiscal. Inspecionado (`openssl x509`): é o certificado **raiz da cadeia ICP-Brasil** (Certisign AC-RFB-G5) — a autoridade certificadora, não o certificado da empresa. `NFCE_CERTIFICATE_PATH` (usado para *assinar* o XML da NFC-e) precisa do **certificado A1 da própria FARMAURA LTDA** (arquivo `.pfx`/`.p12`, com a chave privada, protegido por senha, emitido em nome do CNPJ da loja) — um `.cer` de CA isolado não contém chave privada e não serve para assinar nada.

Consequência prática: sem o `.pfx` real, qualquer tentativa de emissão real trava no estado `SIGNING` do outbox fiscal (`app/fiscal/`), mesmo com `NFCE_ENABLED=true` e ambiente de homologação configurado. Isso bloqueia teste ponta a ponta (assinar e transmitir de verdade à SEFAZ-DF) tanto do módulo original de PDV quanto da extensão para pedidos de marketplace com retirada (ver [[../00_Decisoes/2026-09-22-nfce-real-para-pedidos-marketplace-pickup|ADR]]).

O `.cer` da Certisign enviado pode eventualmente servir como `NFCE_CA_BUNDLE_PATH` (bundle de confiança TLS opcional, só se o certificado do sistema operacional não bastar) — isso é secundário e não resolve o bloqueio principal.

## Contexto

Achado ao preparar a emissão fiscal real de pedidos de marketplace. Pendência aplicável tanto ao PDV (já decidido em [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR anterior]]) quanto ao marketplace. Requer que o usuário obtenha o certificado A1 correto junto à autoridade certificadora/contador da empresa.

## Resolução (2026-09-24)

Usuário forneceu o `.pfx` real (`farmaura-api/secrets/nfce/certfarmaura.pfx`, senha em `NFCE_CERTIFICATE_PASSWORD`). Verificado: chave RSA, válido até 13/08/2027, CNPJ do certificado confere com `NFCE_CNPJ`. `NFCE_CERTIFICATE_PATH` e `NFCE_CA_BUNDLE_PATH` (cadeia ICP-Brasil do SERPRO, necessária para o TLS mútuo com a SEFAZ) configurados em `.env` local. Teste real de homologação confirmou conectividade e assinatura funcionando — ver [[nfce-homologacao-real-pendente-credenciais|pendência de homologação]] para o estado atual (bloqueio restante é credenciamento do emissor, não mais o certificado).
