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

## Atualizações

- 2026-07-19: nota criada.
