---
cssclasses: ia-nota
---

# Gap de testes: sem cobertura de API E2E para isolamento cross-tenant; sem CI/CD para pegar isso automaticamente

**Tipo:** Risco identificado (gap de processo/qualidade, não uma vulnerabilidade ativa)
**Status:** CONFIRMADO
**Severidade:** BAIXO (mas amplificador de risco para qualquer achado futuro de autorização)
**Sistema afetado:** `farmaura-api` (processo de desenvolvimento)
**Categoria:** Gap de testes / gate de qualidade
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

`farmaura-api/app/tests/` (10 arquivos) cobre autorização negativa dentro do mesmo portal (ex.: cashier interno não acessa `/customers/me`) e isolamento de tenant **no nível de serviço/repositório com mocks** (`test_brand_service.py`, `test_product_service.py`). O próprio `test_auth_required.py` reconhece a lacuna no docstring: "more forbidden and cross-tenant tests should be added with real fixtures".

**Não existe** nenhum teste de API HTTP end-to-end que autentique como tenant A e tente acessar/mutar um recurso de `order_id`/`item_id`/`document_id` pertencente ao tenant B esperando 403/404. Toda a garantia de isolamento por tenant repousa em RLS no Postgres e em filtros manuais nos repositórios — sem teste automatizado que comprove esse comportamento pela API pública.

Adicionalmente, não existe nenhum pipeline de CI/CD no repositório (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` — nenhum encontrado). Não há verificação automatizada de testes/lint/type-check/scan de dependências antes de merge.

## Evidência

`farmaura-api/app/tests/security/test_auth_required.py` (docstring admite a lacuna); busca por `.github/workflows/` e equivalentes em todo o repositório sem resultado.

## Cenário de risco

Uma regressão futura de autorização (endpoint novo esquecendo filtro de tenant, refactor que remove uma checagem) — exatamente a classe de bug que o achado [[cashback-wallet-vazamento-cross-tenant-via-pdv]] representa — não seria pega automaticamente por nenhum teste nem por nenhum gate de CI antes de chegar em produção.

## Impacto

Amplifica o risco de qualquer achado futuro de autorização/multi-tenancy não ser detectado antes do deploy — não é uma vulnerabilidade em si, é ausência da rede de segurança que pegaria a próxima.

## Pré-condições

N/A — é uma lacuna estrutural, não uma condição de exploração.

## Escopo afetado

`farmaura-api/app/tests/` (cobertura), ausência de `.github/workflows/` ou equivalente em todo o repositório.

## Causa raiz

Testes de isolamento de tenant foram escritos no nível de serviço com mocks (mais rápido de escrever), não no nível de API real com dois tenants provisionados; nenhum pipeline de CI foi configurado até hoje.

## Correção sugerida para análise futura

Adicionar testes de API (não apenas unitários com mock) que provisionem dois tenants reais e verifiquem 403/404 cruzado nos endpoints com `{id}` mais sensíveis (`orders/{order_id}`, `fiscal/{document_id}`, `inventory/items/{item_id}`, e agora também os endpoints de PDV/cashback do achado crítico). Configurar um pipeline mínimo (`pytest`, `ruff`, `mypy --strict`, `uv lock --check`/`npm audit --production`) rodando em cada PR.

## Dependências da correção

Nenhuma migration. Testes de API com dois tenants exigem fixtures/factory de tenant duplo (provavelmente não existem hoje, precisam ser criadas). CI exige decisão de plataforma (GitHub Actions é o óbvio, dado que o remote é GitHub).

## Riscos de regressão

Nenhum — são adições (testes novos, pipeline novo), não mudança de comportamento da aplicação.

## Como validar futuramente que a correção funcionou

Confirmar que os novos testes de API cross-tenant realmente falham quando um bug de autorização é introduzido propositalmente (teste de teste) antes de considerar a cobertura confiável; confirmar que o pipeline de CI roda e bloqueia merge em caso de falha.

## Referências

- [[cashback-wallet-vazamento-cross-tenant-via-pdv]] — exatamente a classe de bug que esse gap de teste não pegou.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.