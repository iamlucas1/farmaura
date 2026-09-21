---
cssclasses: ia-nota
---

# NFC-e: pacote de schemas mais novo, `uv.lock` e front não compilados

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-09-20

## Descrição

1. **Schemas**: versionado o PL_010b v1.30 (o mais novo baixável na SVRS). Existem NT 2025.002 v1.51 e o pacote PL_010f. Se a SEFAZ rejeitar por schema ou por regra de IBS/CBS, trocar os arquivos em `app/fiscal/schemas/` (ver o README lá).
2. **`uv.lock`** não foi regenerado (sem `uv` no ambiente): as dependências novas (`cryptography`, `reportlab`, `segno`, `tzdata`, `lxml` pinada; dev `aiosqlite`) estão no `pyproject.toml` com versão exata. Rodar `uv lock` e commitar. Auditar os pacotes novos no CI de vulnerabilidades.
3. **Front-end**: alterações validadas só por parser (sem Node, sem `vite build`, sem teste no navegador). Rodar o build e o `qa-functional-review` no PDV e no painel **Fiscal (NFC-e)**.
4. Não há métricas Prometheus (a infraestrutura não as expõe); os contadores por status estão em `GET /fiscal/status`.

## Contexto

Registrada ao implementar o módulo NFC-e. Ver [[../02_Documentacao/Modulo_Fiscal|Modulo_Fiscal]].
