---
cssclasses: ia-nota
---

# 2026-09-20 — NFC-e real (SVRS/DF) substitui o protótipo fiscal; só homologação, produção bloqueada

## Contexto

O módulo fiscal era um protótipo: número e chave de acesso por hash SHA1, `authorized=True` fixo, sem XML, sem SEFAZ, sem estados, e a nota era emitida **dentro da transação da venda** ([[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]]). Pedido do usuário: módulo completo de NFC-e modelo 65 para o Distrito Federal, **exclusivamente em homologação**, com numeração transacional, idempotência, recuperação de timeout, cancelamento, inutilização, contingência, DANFE e QR Code.

## Alternativas consideradas

- **Biblioteca fiscal pronta (ACBr, sped-nfe, PyNFe, signxml)** — descartada: as candidatas em Python estão defasadas frente ao leiaute 2026 (IBS/CBS) ou trazem dependências nativas; o que é necessário (XML, XMLDSig, SOAP) é pequeno e determinístico, e validar contra o **XSD oficial** dá uma checagem mais forte que confiar numa lib. Só se adicionaram `cryptography`, `reportlab` (PDF) e `segno` (QR); `lxml` já era transitiva (python-docx).
- **Emitir dentro da transação da venda (como antes)** — descartada: SEFAZ lenta reverte/duplica venda. Adotado **outbox**: a venda grava um documento `DRAFT` e um worker transmite depois do commit.
- **Ler venda/produtos no worker** — descartada: as policies de RLS de `inventory_*`/`pdv_*` dependem do papel do operador. Adotado **snapshot fiscal imutável** gravado no fechamento da venda; o worker só toca tabelas fiscais (com o mesmo carve-out de "job de sistema" do `fiscal_documents`).
- **Tabela nova em vez de evoluir `fiscal_documents`** — descartada (dois conceitos de "documento fiscal"). Evolução aditiva por migration; linhas antigas viram `LEGACY_SIMULATED`.

## Decisão

- **Produção bloqueada por duas chaves** (`FISCAL_ENV=producao` **e** `FISCAL_PRODUCTION_ENABLED=true`) e chave-mestra `NFCE_ENABLED` (desligada por padrão: deploy do código não emite nada).
- **QR Code v3, sem CSC** para emissão online (NT 2025.001, verificada na fonte primária). CSC fica configurável mas sem uso.
- **Assinatura RSA-SHA1/SHA-1/C14N 1.0**: é o que o XSD da NF-e fixa; não é escolha. Auto-verificação após assinar.
- **Numeração**: um `UPDATE ... SET next_number = next_number + 1 ... RETURNING` na tabela `fiscal_number_sequences` (por CNPJ+ambiente+modelo+série) + índice único parcial `(emitente, ambiente, modelo, série, número)`. Nunca `MAX()+1`.
- **Idempotência**: índice único parcial em `pdv_sale_id` + lease (`locked_until`) por documento.
- **Timeout nunca é rejeição**: `PENDING_RECOVERY` → consulta a chave → só reenvia o **mesmo XML** se a SEFAZ responder 217.
- **Tributação nunca é inventada**: `product_fiscal_profiles` (dados do contador); produto sem perfil = nota não emitida com lista do que falta.
- **Contingência offline: falha fechada.** A fórmula da `assinatura` do QR v3 está no Manual do DANFE v6, que não foi obtido de fonte primária. Ver [[../06_Pendencias/nfce-contingencia-offline-assinatura-qr-v3|pendência]].
- **Marketplace fora do escopo**: continua gerando documento simulado (`LEGACY_SIMULATED`); ver [[../06_Pendencias/nfce-marketplace-documentos-simulados|pendência]].

## Consequências

- **Migration obrigatória** antes do deploy ([[../06_Pendencias/aplicar-migration-nfce-fiscal-em-producao|pendência]]): o modelo `FiscalDocument` passa a selecionar colunas novas.
- Regime tributário (CRT) muda o XML: **CRT=3 exige IBS/CBS desde 03/08/2026**; Simples/MEI não. Decisão do contador ([[../06_Pendencias/nfce-cadastro-fiscal-dos-produtos-e-crt|pendência]]).
- Verificado offline: 160 testes novos (motor contra o XSD oficial, SEFAZ simulado, fluxo com ORM, segurança das rotas). **Não** verificado: SEFAZ real, Postgres real (RLS, migration, bloqueio de linha), build do front.
- Integração e riscos: [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]], [[../04_Seguranca_Riscos/modulo-fiscal-nfce-riscos-e-controles|riscos e controles]].
