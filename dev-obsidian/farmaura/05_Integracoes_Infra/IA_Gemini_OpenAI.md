# IA — Gemini e OpenAI (análise de estoque)

**Tipo:** API de terceiro

## Propósito

Funcionalidades assistidas por IA, com foco em análise de estoque farmacêutico (`inventory_ai_service.py`) e um serviço de IA mais genérico (`ai_service.py`), expostos via `app/api/v1/ai.py`.

## Contrato

- Dois provedores suportados, configuráveis: Gemini (`ai_gemini_api_key`, `ai_gemini_base_url`, modelo `gemini-2.5-flash`) e OpenAI (`ai_openai_api_key`, modelo `gpt-5.5`) — `app/core/config.py`.
- Prompt de sistema customizado em português (`ai_inventory_system_prompt`), papel de "analista de estoque farmacêutico".
- Feature flag `ai_enabled` controla se o recurso está ativo.

## Dependências

- Saída do modelo não deve ser executada diretamente nem ter efeitos colaterais sem validação — ver seção "AI, LLM, OCR e Prompt Injection" em `claude.md`/`agent.md` na raiz do repositório (regra estática, não duplicar aqui).
- Ver `04_Seguranca_Riscos/` se surgir algum achado específico de prompt injection ou vazamento cross-tenant nesse fluxo.
- Ver [[IA_Provider]] — mesma dupla de provedores (Gemini/OpenAI), integração independente no domínio LumosMed.
- Ver [[../04_Seguranca_Riscos/chaves-ia-dev-reaproveitadas-em-producao|chaves de IA dev reaproveitadas em produção]] — risco aceito conscientemente em 2026-07-24.

## Atualizações

- 2026-07-24: `ai_enabled` estava com o default `false` em produção — **a importação de orçamento
  por IA nunca funcionou em produção antes desta data**, só em dev local. O sintoma era enganoso:
  `farmaura-api` devolvia 503 em ~37ms (rápido demais pra ser uma chamada de IA real, era a checagem
  `_ensure_ai_enabled()` rejeitando na hora), e o `lumos-gateway` intercepta 502/503/504 com um
  redirect (`@fallback`) para `lumosmed.com.br` — por isso o erro no navegador parecia
  "foi parar no produto errado" em vez de um 503 claro. Habilitado
  (`APP_AI_ENABLED=true`) e configurado com as mesmas chaves Gemini/OpenAI do ambiente de dev/teste
  local, por escolha explícita do usuário (ver nota de risco linkada acima).
- 2026-07-19: nota criada.
