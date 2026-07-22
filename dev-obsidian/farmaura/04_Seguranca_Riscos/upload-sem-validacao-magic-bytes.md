# Upload de arquivos confia em extensão/content-type declarado, sem checagem de magic bytes

**Tipo:** Vulnerabilidade
**Severidade:** Média
**Status:** Aberto
**Data de identificação:** 2026-07-18

## Descrição

`app/core/file_validation.py` restringe por allowlist de extensão e content-type declarado (`.jpg/.jpeg/.png/.pdf` geral; `.pdf/.xml` para nota fiscal de fornecedor) e por tamanho máximo (5MB padrão), mas não inspeciona os bytes reais do arquivo (magic bytes / assinatura de formato) — o próprio docstring do módulo já sinaliza isso como pendente.

## Impacto

Um arquivo malicioso com extensão e content-type forjados (ex: um executável renomeado para `.pdf` com content-type `application/pdf` declarado pelo cliente) pode passar pela validação atual. `domain/enums.py` já modela `FileStatus.PENDING_SCAN`/`QUARANTINED`, sugerindo que um pipeline de varredura foi previsto no design mas ainda não está implementado em `file_validation.py`/`file_storage.py`.

## Mitigação / Tratamento

Nenhuma ainda. Skill [[secure-file-upload]] (`_Compartilhado/Skills/`) já documenta o padrão completo esperado (magic-byte validation, quarentena, rejeição de polyglot/arquivo duplo-extensão) — usar como checklist ao endereçar este item.

## Referências

Ver [[Armazenamento_Arquivos]].

## Atualizações

- 2026-07-19: nota criada.
