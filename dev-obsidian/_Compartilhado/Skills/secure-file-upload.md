	# Skill: secure-file-upload

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/secure-file-upload/SKILL.md`

## Propósito

Padrão para upload, download, storage, intake de OCR e processamento de documento/imagem.

## Quando usar

Sempre que código de backend tocar em arquivos, em qualquer stack.

## Validação obrigatória

Allowlist de extensão; validação real de MIME; validação de magic bytes; limite de tamanho; limite de quantidade de arquivo; quota por tenant/usuário; nome de armazenamento gerado; caminho de storage separado por tenant; autorização no download.

## Rejeitar ou colocar em quarentena

Executáveis; scripts; HTML; SVG suspeito; extensão dupla; arquivo polyglot; bomba de arquivo compactado; arquivo que excede limite seguro de CPU/memória para processar.

## Regras de storage

Nunca confiar no nome de arquivo original para gerar o caminho; nunca expor caminho de filesystem cru; nunca guardar upload privado em web root público; guardar metadado separado dos bytes do arquivo; usar nome gerado por UUID ou hash de conteúdo.

## Regras de processamento

Stream de upload; evitar carregar arquivo grande inteiro em memória; limitar workers de OCR/processamento de imagem; validar antes de persistir; testar MIME inválido, assinatura inválida, arquivo grande demais, download não autorizado e estouro de quota; manter limites de upload/timeout alinhados com os limites de corpo/proxy do `lumos-gateway`.

## Gap conhecido no repositório

`farmaura-api/app/core/file_validation.py` hoje **não** implementa validação de magic bytes — só extensão/content-type declarado. Ver `../../farmaura/04_Seguranca_Riscos/upload-sem-validacao-magic-bytes.md`.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-18: nota criada.
