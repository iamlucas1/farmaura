---
cssclasses: ia-nota
---

# Módulo fiscal NFC-e — riscos e controles

**Data:** 2026-09-20 · **Decisão relacionada:** [[../00_Decisoes/2026-09-20-nfce-real-svrs-df-homologacao|ADR]] · **Integração:** [[../05_Integracoes_Infra/SEFAZ_NFCe_SVRS_DF|SEFAZ_NFCe_SVRS_DF]]

## Controles implementados

| Risco | Controle |
|---|---|
| Vazar certificado/senha/CSC | `SecretStr`; `.pfx`/`secrets/` no `.gitignore` e `.dockerignore`; volume somente-leitura só na API; chave privada nunca persistida (TLS via arquivo temporário cifrado, apagado); teste que varre os logs |
| Emitir em produção por engano | Duas chaves (`FISCAL_ENV` + `FISCAL_PRODUCTION_ENABLED`) + `NFCE_ENABLED`; script de homologação recusa produção; `NFCE_ENV` divergente = erro |
| Certificado de outro CNPJ / vencido | Conferência do CNPJ ICP-Brasil e validade antes de assinar; alerta de vencimento |
| Nota duplicada | Índice único por venda; lease por documento; consulta antes de reenviar; teste de concorrência |
| Número repetido | Sequência atômica + índice único `(CNPJ, ambiente, modelo, série, número)` |
| XXE / SSRF no parser | Parser lxml sem entidades e sem rede; XSD só do repositório |
| XSS via nome de produto no DANFE | Escape de tudo que vem do XML; teste com `<script>` |
| Acesso indevido a XML/CPF (LGPD) | Rotas autenticadas por papel; loja diferente responde 404; storage privado por tenant; sem URL pública; logs sem CPF/XML |
| Escalada de privilégio | Cancelar = gerente/admin; inutilizar e editar perfil = admin; cliente do marketplace 403 em tudo (64 testes) |
| Overposting | `StrictModel` (campos extras → 422); a rota de emissão só aceita `sale_id`, nunca totais |

## Riscos abertos

- **Documentos simulados no marketplace**: continuam sendo criados com chave fictícia (`LEGACY_SIMULATED`) e o cliente vê "Baixar nota fiscal". Não é NFC-e real. Ver [[../06_Pendencias/nfce-marketplace-documentos-simulados|pendência]].
- **RLS das tabelas novas e migration não executadas em Postgres real** (sem Docker no ambiente de desenvolvimento desta sessão). Ver [[../06_Pendencias/aplicar-migration-nfce-fiscal-em-producao|pendência]].
- **Exceção de RLS**: o worker usa o contexto `is_system_job()` (cross-tenant) nas tabelas fiscais, como já fazia o `fiscal_scheduler` ([[../03_Padroes_Politicas/excecao-fiscal-scheduler-sessao-propria|exceção documentada]]). Código confiável de servidor; nenhuma rota o deriva de entrada do cliente.
- **SHA-1 na assinatura**: exigido pelo XSD da NF-e; risco aceito por imposição do protocolo.
- **Corrida de dois processos criando o mesmo documento**: coberta pelo índice único (o segundo recebe `IntegrityError`); tratamento de retry no `complete_sale` não foi necessário porque a venda é única por `pdv_order`.

## Atualizações

- 2026-09-20: nota criada.
