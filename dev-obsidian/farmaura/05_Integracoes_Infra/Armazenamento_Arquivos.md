# Armazenamento de arquivos (filesystem privado)

**Tipo:** Infraestrutura

## Propósito

Armazenamento de arquivos enviados pelos usuários (prescrições, notas fiscais de fornecedor, etc.), separado por tenant.

## Contrato

- `app/core/file_storage.py`: filesystem privado sob `settings.storage_root` (`/app/storage/private` no container), com raízes separadas `storage_tmp_root` e `storage_quarantine_root`. Operações de I/O rodam via `asyncio.to_thread` (são bloqueantes).
- Volumes Docker nomeados: `farmaura_storage_private`, `farmaura_storage_quarantine`, `farmaura_storage_tmp`.
- Metadados em `models/file_asset.py` + `repositories/file_repository.py`.
- Validação em `app/core/file_validation.py`: allowlist de extensão (`.jpg/.jpeg/.png/.pdf` geral; `.pdf/.xml` para nota fiscal de fornecedor) + tamanho máximo (5MB padrão) + tipo de conteúdo declarado — **sem verificação de magic bytes ainda** (ver [[upload-sem-validacao-magic-bytes]]).
- `domain/enums.py` define `FileStatus` (`pending_scan`, `accepted`, `quarantined`), sugerindo um pipeline de varredura antimalware que ainda não está implementado em `file_validation.py`/`file_storage.py`.

## Dependências

- Skill [[secure-file-upload]] (`_Compartilhado/Skills/`) documenta o padrão completo esperado; a lacuna de magic-byte é um desvio conhecido desse padrão.

## Atualizações

- 2026-07-19: nota criada.
