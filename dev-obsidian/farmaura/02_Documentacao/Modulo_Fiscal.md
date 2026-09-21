---
cssclasses: ia-nota
---

# Módulo Fiscal (NFC-e modelo 65)

## O que é

Emissão real de **NFC-e** (leiaute 4.00, DF via SVRS) para vendas do **PDV**, com estados, numeração transacional, recuperação de falhas, cancelamento, inutilização e DANFE. **Estado: implementado e testado offline; só homologação; produção bloqueada; sem chamada real à SEFAZ ainda** ([[../06_Pendencias/nfce-homologacao-real-pendente-credenciais|pendência]]). Documentação técnica completa: `farmaura-api/docs/fiscal/NFCE.md`. Decisão: [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]]. Integração: [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]]. Riscos: [[../04_Seguranca_Riscos/modulo-fiscal-nfce-riscos-e-controles|riscos e controles]].

**Atenção a falso cognato**: "nota fiscal" também aparece em `acquisition-costs-screen.jsx`/`purchase-receiving-screen.jsx`/`inventory-screen.jsx`, mas é a nota fiscal **de compra do fornecedor** ([[Modulo_Estoque|Estoque]]/[[Modulo_Orcamentos|Orçamentos]]) — módulo diferente.

## Fluxo

Venda do PDV → `enqueue_pdv_sale` (só banco: snapshot fiscal imutável + `fiscal_documents` em `DRAFT`) → **COMMIT da venda** → worker (`fiscal_worker.py`, fila = o próprio banco, lease por documento) → número atômico → XML → XSD oficial → XMLDSig (A1) → `signed.xml` + COMMIT → SOAP/mTLS `NFeAutorizacao4` → `nfeProc` autorizado + DANFE. Nenhuma chamada de rede acontece dentro da transação da venda.

## Tabelas / Models

- **`fiscal_documents`** (`FiscalDocument`): ciclo de vida completo (`status`, `cstat`, `protocol`, `serie`, `number`, `access_key`, `numeric_code`, `environment`, `emitter_cnpj`, `payload_snapshot`, chaves de storage do XML/PDF, `attempt_count`/`next_attempt_at`/`locked_until`). Únicos: `(emitter_cnpj, environment, model, serie, number)` e **um documento por venda**. Linhas do protótipo: `status = LEGACY_SIMULATED` (hash, nunca foram à SEFAZ; colunas legadas mantidas só para elas).
- **`fiscal_number_sequences`**, **`fiscal_events`** (cancelamento + XML), **`fiscal_attempts`** (auditoria de cada chamada), **`fiscal_inutilizations`**, **`product_fiscal_profiles`** (NCM, CFOP, CST/CSOSN, PIS/COFINS, IBS/CBS — dados do contador, nunca inferidos).
- RLS: tenant + carve-out `is_system_job()` para o worker (mesma exceção do scheduler — [[../03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|exceção]]).

## Endpoints (`/api/v1/fiscal`)

`POST /nfce`, `GET /nfce[/{id}]`, `GET /nfce/{id}/xml|pdf|printable`, `POST /nfce/{id}/print|cancel|sync|reprocess|send-email`, `GET /status`, `POST /reconcile`, `POST|GET /inutilization`, `GET|PUT /products/{id}/profile`. Papéis: caixa/farmacêutico emitem-consultam-imprimem; gerente cancela; admin inutiliza, reconcilia e edita perfis. Não-admin só vê a própria loja (404 caso contrário). Rota antiga `/fiscal-documents` removida; o acesso do cliente à própria nota (`GET /orders/{id}/fiscal-document/printable`) continua ([[../00_Decisoes/2026-08-26-nota-fiscal-acesso-do-cliente-por-pedido|ADR]]).

## Regras de negócio não óbvias

- **Timeout nunca é rejeição**: consulta a chave antes de reenviar; só reenvia o mesmo XML se a SEFAZ responder 217.
- **Rejeição fiscal não é repetida sozinha**; `Reprocessar` reaproveita número e chave. `CANCELED`/`DENIED` são finais.
- **Sem perfil fiscal completo → sem nota**, com a lista de campos que faltam.
- **Venda com taxa de entrega não emite** (decisão contábil pendente); cashback resgatado vira desconto rateado ([[../06_Pendencias/nfce-pdv-troco-taxa-entrega-cashback-e-card|pendência]]).
- **CRT=3 exige IBS/CBS desde 03/08/2026**; QR Code v3 online **não usa CSC**.
- **Contingência offline desabilitada** (falta a fórmula da assinatura do QR v3): [[../06_Pendencias/nfce-contingencia-offline-assinatura-qr-v3|pendência]].
- **Marketplace**: emissão diferida em 7 dias ([[../00_Decisoes/2026-07-12-diferir-emissao-fiscal-7-dias|decisão]], [[../03_Padroes_Politicas/regra-negocio-janela-cdc-nota-fiscal|regra CDC]]) segue criando documento **simulado** ([[../06_Pendencias/nfce-marketplace-documentos-simulados|pendência]]).

## Frontend

`fiscal-screen.jsx`: `FiscalStatusCard` (estado real, polling, Imprimir/PDF/XML/Reprocessar/Consultar) usado no modal do balcão (`NotaFiscalModal`) e em "Vendas & Notas"; painel **Fiscal (NFC-e)** (admin/gerente): contadores, filtros, ações, reconciliação, inutilização. Documentos só por chamada autenticada (blob). Foi removido o QR fictício e o "trib. aprox. 12%" fixo do modal. Não há tela de edição do perfil fiscal do produto.

## Ver também

- [[Fluxo_Pagamento_e_Nota_Fiscal|Fluxo de pagamento e nota fiscal]] — os dois caminhos (balcão/NFC-e e marketplace/Asaas) lado a lado; [[../05_Integracoes_Infra/Asaas|Asaas]] para a nota de serviço.
- [[Modulo_PDV|Módulo PDV]] — dispara a emissão; [[Modulo_Carrinho_Pedidos|Carrinho e Pedidos]] — emissão diferida (simulada).

## Atualizações

- 2026-09-20: adicionados o guia ponta a ponta [[Fluxo_Pagamento_e_Nota_Fiscal]] e o POP [[../07_POPs_Processos/emitir-nfce-em-homologacao|emitir NFC-e em homologação]].
- 2026-09-20: módulo reescrito — NFC-e real (SVRS/DF, homologação), outbox + worker, snapshot fiscal, numeração atômica, recuperação de timeout, cancelamento, inutilização, DANFE 80 mm, painel fiscal. Migration `20260920_05`. Documentos antigos viram `LEGACY_SIMULATED`. Ver o [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]].
- 2026-08-26: cliente ganhou acesso de leitura à própria nota fiscal — `GET /orders/{order_id}/fiscal-document/printable`.
- 2026-07-25: nota criada — documentação do estado anterior (protótipo simulado).
