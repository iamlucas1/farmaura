---
cssclasses: ia-nota
---

# Endpoints de IA sem rate limiting; `/ai/execute` é um proxy de LLM quase irrestrito para ADMIN/PHARMACIST

**Tipo:** Vulnerabilidade (abuso de custo / DoS financeiro, amplifica risco já aceito de chaves compartilhadas)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura-api`
**Categoria:** Rate limit / abuso de recurso caro
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

Nenhuma rota de `app/api/v1/ai.py` (`/ai/execute`, `/ai/inventory/execute`) nem `POST /purchase-quotes/import-preview`/`import-preview/one` usa `Depends(rate_limit(...))`. A única proteção é autorização por papel (`require_internal_subject(ADMIN, PHARMACIST)` ou `ADMIN/MANAGER`) mais um teto de 10 arquivos por lote na importação — não há limite de chamadas por minuto/hora por conta.

Adicionalmente, `POST /ai/execute` é um proxy de LLM genérico: aceita `prompt` (até 16.000 chars), `system_prompt` **totalmente livre** (até 8.000 chars, sem qualquer restrição de conteúdo), `provider`, `model`, `temperature`, `max_output_tokens`, e repassa isso 1:1 para Gemini/OpenAI usando as chaves de API da Farmaura — sem trilha de auditoria do conteúdo enviado (o middleware de log de requisição não audita corpo, por design, ver [[../04_Seguranca_Riscos/backend-e-fonte-unica-de-verdade-nunca-confiar-no-client|princípios já documentados]]).

## Evidência

`app/api/v1/ai.py:51-68` — schema `AiPromptExecutionRequest` sem restrição de conteúdo em `system_prompt`; nenhuma rota do arquivo com `Depends(rate_limit(...))`.

## Cenário de risco

Qualquer conta `ADMIN`/`PHARMACIST` comprometida (phishing, senha fraca, credencial vazada) vira um proxy irrestrito para as chaves de IA da empresa — que, como já documentado em [[chaves-ia-dev-reaproveitadas-em-producao]], são as **mesmas** usadas em produção e dev. Isso amplia o risco já aceito naquela nota: dá um canal legítimo (não é nem preciso "vazar" a chave) para esgotar cota/gerar custo, ou disparar rate-limit/abuse-detection do provedor usando a própria aplicação como proxy — afetando produção mesmo sem nenhum vazamento de credencial.

## Impacto

Esgotamento de cota/custo financeiro direto (cada chamada de IA tem custo por token); possível gatilho de bloqueio de abuso do provedor, afetando a funcionalidade de IA em produção para todos os tenants.

## Pré-condições

Comprometimento de uma conta interna com papel ADMIN ou PHARMACIST.

## Escopo afetado

`app/api/v1/ai.py` (todas as rotas), `app/api/v1/purchase_quotes.py` (`import-preview`, `import-preview/one`).

## Causa raiz

`rate_limit()` nunca foi conectado a essas rotas — mesma lacuna raiz já documentada para `/uploads` em [[rate-limiting-nao-aplicado]]. `/ai/execute` foi desenhado como "prompt genérico" sem escopo/tópico fixo e sem guardrails de custo, diferente de `/ai/inventory/execute`, que usa um `system_prompt` fixo (`settings.ai_inventory_system_prompt`).

## Correção sugerida para análise futura

Aplicar uma política de rate limit dedicada (ex.: `AI_RATE_LIMIT`, por usuário/conta em vez de por IP, já que é tráfego interno autenticado) às rotas de `ai.py` e `import-preview*`. Se não houver caso de uso real para `system_prompt` arbitrário em `/ai/execute`, considerar restringir a prompts pré-definidos (como já é feito em `/ai/inventory/execute`); caso contrário, adicionar orçamento de tokens por período por usuário.

## Dependências da correção

Nenhuma migration — reaproveita a infraestrutura de rate limit sobre Valkey já existente (`core/rate_limit.py`).

## Riscos de regressão

Baixo — rate limiting adicional não deveria afetar uso legítimo dentro de limites razoáveis; calibrar o limiar com base no volume real de uso hoje antes de ativar.

## Como validar futuramente que a correção funcionou

Confirmar via teste que chamadas em excesso a `/ai/execute`/`/ai/inventory/execute` dentro de uma janela curta são rejeitadas com 429, sem afetar uso normal esperado.

## Referências

- [[chaves-ia-dev-reaproveitadas-em-producao]] — risco já aceito que este achado amplia.
- [[rate-limiting-nao-aplicado]] — mesma lacuna raiz (rate limit não conectado), aqui em outra família de rotas.
- [[prompt-injection-indireta-documentos-fornecedor]] — outro achado na mesma área de features de IA.
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.