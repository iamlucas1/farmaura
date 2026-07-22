# IA — provedor configurável (Gemini / OpenAI)

**Tipo:** API de terceiro

## Propósito

Funcionalidades de IA no portal da clínica (ex: assistente "Luna", uma das páginas do portal — ver [[../Hub|Hub]]).

## Contrato

- `lumos-api/domains/lumosmed/services/ai_metering.py` (24KB) — abstração de provedor/modelo (`current_provider`, `current_model`), com métricas de uso ("metering").
- Histórico recente de commits em `lumos-api` mostra migração/ajuste entre provedores: `76ff4ca` "Adicionando secret gemini", `0ac21dc` "Ajuste modelo openia", mais commits de "ajuste de seleção de modelo" — sugerindo Gemini e OpenAI ambos suportados, com Gemini como adição mais recente.
- Lado Laravel: `Portal/PortalAiApiController.php` — proxy fino (`GET /app/ai/settings`, `PUT /app/ai/settings/model`).

## Dependências

- Integração independente da usada pelo Farmaura ([[IA_Gemini_OpenAI]]) — produtos diferentes, credenciais diferentes.

## Atualizações

- 2026-07-19: nota criada.
