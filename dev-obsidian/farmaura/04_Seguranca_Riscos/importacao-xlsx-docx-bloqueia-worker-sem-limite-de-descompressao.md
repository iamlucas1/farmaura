# Importação de orçamento (XLSX/DOCX) roda síncrona dentro do event loop, sem limite de descompressão — DoS de processo inteiro

**Tipo:** Vulnerabilidade (Denial of Service / recurso não limitado)
**Status:** CONFIRMADO
**Severidade:** ALTO
**Sistema afetado:** `farmaura-api`
**Categoria:** DoS / decompression bomb / bloqueio de event loop assíncrono
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

A importação de orçamento por IA aceita upload de XLSX/DOCX (entre outros formatos) de até 110MB (`max_upload_bytes`). `validate_quote_upload` só checa extensão/content-type/tamanho do arquivo **comprimido** — não a razão de compressão nem o tamanho depois de descomprimido. XLSX e DOCX são arquivos ZIP; `openpyxl.load_workbook`/`python-docx` descomprimem todo o conteúdo em memória sem nenhum teto.

O único limite existente (`LOCAL_PARSE_MAX_CHARS = 200_000`) só trunca o **texto final extraído**, depois que o workbook/documento inteiro já foi materializado em memória (`sheet.iter_rows()`, `document.paragraphs`, `document.tables` percorrem tudo antes do corte final) — não protege contra o custo de descomprimir/parsear o arquivo em si.

Mais grave: essas chamadas de parsing são **síncronas e bloqueantes**, executadas diretamente dentro de um método `async def` do handler da requisição, sem `asyncio.to_thread`/`run_in_executor` — diferente de `write_private_file`/`read_private_file` em `core/file_storage.py`, que corretamente usam `asyncio.to_thread` para não bloquear o loop.

## Evidência

```python
# app/services/purchase_quote_ai_service.py (extração de texto, dentro de método async)
if extension == ".xlsx":
    extracted_text = self._extract_xlsx_text(content)   # síncrono, bloqueante
elif extension in HTML_EXTENSIONS:
    extracted_text = self._extract_html_text(content)
else:
    extracted_text = self._extract_docx_text(content)   # síncrono, bloqueante
```

`_extract_xlsx_text` (linha ~702) usa `openpyxl.load_workbook` sem limite de linhas/células; `_extract_docx_text` (linha ~782) usa `python-docx` sem limite de parágrafos/tabelas. `core/file_validation.py::validate_quote_upload` (linha ~89) só valida `max_upload_bytes` (tamanho comprimido).

## Cenário de risco

Um usuário `ADMIN`/`MANAGER` (papel exigido pela rota de import, `_ALLOWED_ROLES`) — ou uma conta comprometida com esse papel — sobe um `.xlsx` de até 110MB especialmente construído (ex.: `sharedStrings.xml` altamente repetitivo, taxa de compressão deflate próxima de ~1000:1) que se descomprime para dezenas de GB em memória durante `load_workbook`. Como a chamada é síncrona dentro do event loop asyncio, ela bloqueia **todo o worker uvicorn** — travando todas as requisições concorrentes, de **todos os tenants** servidos por esse processo — até terminar ou até o processo ser OOM-killed.

## Impacto

Negação de serviço para o processo inteiro (não apenas para o tenant do atacante); possível OOM/crash do container `farmaura-api`, afetando toda a base de tenants ativa naquele processo.

## Pré-condições

Papel interno `ADMIN` ou `MANAGER` — privilégio relativamente alto, o que reduz a superfície prática de exploração (não é anônimo/público), mas o dano é desproporcional ao privilégio necessário: uma única conta comprometida derruba o serviço para todos os outros tenants, não só o próprio.

## Escopo afetado

`app/services/purchase_quote_ai_service.py` (`_extract_xlsx_text`, `_extract_docx_text`, e o método de orquestração que os chama), rota `POST /purchase-quotes/import-preview` (e variante `/import-preview/one`) em `app/api/v1/purchase_quotes.py`.

## Causa raiz

Duas causas combinadas: (1) ausência de guarda de tamanho de descompressão/número de linhas-células antes ou durante o parse; (2) parsing pesado de arquivo executado de forma síncrona dentro do event loop assíncrono, em vez de delegado a uma thread separada.

## Correção sugerida para análise futura

1. Mover `_extract_xlsx_text`/`_extract_docx_text` para `asyncio.to_thread` (mesmo padrão já usado em `core/file_storage.py`), para que um parse pesado não bloqueie outras requisições mesmo que ainda demore.
2. Adicionar limite de linhas/células/parágrafos processados (ex.: abortar após N milhares de linhas) e, se possível, inspecionar `ZipInfo.file_size` de cada entrada do ZIP antes de descomprimir, rejeitando arquivos cuja razão de compressão ultrapasse um teto plausível (proteção clássica contra zip bomb).

## Dependências da correção

Nenhuma migration. Mudança de código no serviço de extração; `asyncio.to_thread` já é padrão Python 3.9+, sem dependência nova.

## Riscos de regressão

Baixo para o `asyncio.to_thread` (só muda onde o código roda, não o resultado). Médio para o limite de linhas/tamanho descomprimido — precisa ser calibrado para não rejeitar planilhas legítimas de fornecedores grandes; testar com os maiores arquivos reais já processados com sucesso hoje antes de fixar o teto.

## Como validar futuramente que a correção funcionou

1. Gerar um XLSX de teste com alta taxa de compressão (não usar um real de produção) em ambiente local e confirmar que a importação é rejeitada antes de consumir memória excessiva.
2. Confirmar, via monitoramento local (não produção), que uma importação grande (mas legítima) não bloqueia outras requisições simultâneas ao mesmo processo (`farmaura-api`) enquanto está em andamento.

## Referências

- [[../02_Documentacao/Modulo_Orcamentos|Modulo_Orcamentos]] — módulo onde esta importação vive.
- [[../../_Compartilhado/Padroes_Politicas/padrao-ataques-defesas-e-limites-de-teste|padrao-ataques-defesas-e-limites-de-teste]] — limites seguros de teste, relevantes para validar esta correção sem gerar DoS real.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.
