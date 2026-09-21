---
cssclasses: ia-nota
---

# Executar os testes do backend sem Docker (Windows)

## Quando usar

Máquina sem Docker (ou sem `uv`) e você precisa rodar testes, lint e tipos do `farmaura-api`. O caminho **preferido** continua o Docker ([[executar-testes-python-no-docker]]); este é o plano B, usado para validar o módulo NFC-e e o preparo do Asaas. Contexto: [[../02_Documentacao/Fluxo_Pagamento_e_Nota_Fiscal|Fluxo de pagamento e nota fiscal]].

## Passo a passo

1. Python 3.13 (o projeto trava 3.13.13; qualquer 3.13.x serve para testes). Criar um venv **fora do repositório** (ou numa pasta ignorada): `python -m venv <pasta>\venv`.
2. Instalar as dependências fixas do `pyproject.toml` (todas com versão exata) e as de teste: `pip install alembic==1.18.4 argon2-cffi==25.1.0 fastapi==0.136.3 httpx==0.28.1 pydantic==2.13.4 pydantic-settings==2.14.1 PyJWT==2.13.0 "pwdlib[argon2]==0.3.0" python-multipart==0.0.32 openpyxl==3.1.5 python-docx==1.1.2 pypdf==5.1.0 valkey==6.1.1 sqlalchemy==2.0.50 structlog==26.1.0 nh3 pytest==9.0.3 ruff==0.15.16 mypy==2.1.0 cryptography==50.0.1 lxml reportlab==5.0.1 segno==1.6.6 tzdata aiosqlite==0.22.1`.
3. Na pasta `farmaura-api/`: `<venv>\Scripts\python.exe -m pytest app/tests -q -p no:cacheprovider`. O `conftest.py` já define as variáveis mínimas (SQLite, JWT de teste).
4. Lint e tipos: `python -m ruff check <arquivos>` e `python -m mypy <módulos>`. **Ignore `E501`**: o `pyproject` diz 100 colunas, mas o código existente usa ~120 e já tem 100+ avisos por arquivo.

## O que esperar

- **15 testes falham no `HEAD` limpo**, por falta de Postgres/Valkey: `test_auth_required` (13), `test_product_service` e `test_brand_service` (1 cada). Confirmado comparando com um `git archive HEAD farmaura-api` extraído numa pasta curta. Não é regressão; some com a stack Docker de pé.
- Os testes fiscais e de Asaas não dependem de banco real (SQLite + SEFAZ/Asaas simulados) e passam.
- O `mypy` do pacote inteiro já tem centenas de erros antigos; confira só os módulos que você mexeu.

## O que este método NÃO valida

Migration e RLS em Postgres, bloqueio de linha na numeração, Valkey, chamadas reais a SEFAZ/Asaas, e o build do front (`vite`). Isso continua exigindo Docker/Node ([[../06_Pendencias/aplicar-migration-nfce-fiscal-em-producao|pendência]], [[../06_Pendencias/nfce-schemas-pl-010f-uv-lock-e-front-nao-buildado|pendência]]).

## Front sem Node

Só validação de **sintaxe**: `pip install tree-sitter tree-sitter-javascript` e parsear os `.jsx` (o `esprima` não entende sintaxe moderna). Não substitui `vite build` nem teste no navegador.

## Dicas do ambiente

- Postgres embutido (`pgserver`) não tem wheel para Python 3.13/Windows; não vale tentar.
- `git worktree` do repositório falha por caminho longo dos assets do front: extraia só o backend com `git archive HEAD farmaura-api | tar -x -C <pasta-curta>`.
- Scripts em `scripts/` precisam de `PYTHONPATH=.` fora do container.

## Riscos se pulado

Achar que "os testes passam" sem saber que 15 falham por ambiente, ou concluir que Postgres/Valkey foram exercitados.

## Atualizações

- 2026-09-20: POP criado a partir da validação do módulo NFC-e e do preparo do Asaas em Windows sem Docker.
