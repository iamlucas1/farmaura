---
cssclasses: ia-nota
---

# Auditoria completa de segurança (Farmaura / Farmaura API)

**Arquivo operacional:** `dev-obsidian/farmaura/08_Skills_Agentes_Prompts/auditoria-completa-seguranca/PROMPT.md`

## Quando usar

Auditoria de segurança ampla e periódica de todo o produto Farmaura (frontend `farmaura/`,
backend `farmaura-api/`, infraestrutura Docker/Nginx associada, histórico Git e supply chain) —
não é uma varredura pontual de uma mudança específica (para isso, ver
[[../../_Compartilhado/Prompts/prompt-varredura-vulnerabilidades|prompt-varredura-vulnerabilidades]]).
Rodar periodicamente (ex.: antes de um marco importante, após acúmulo de features desde a última
auditoria) ou sob pedido explícito do usuário.

Cobre, entre outros: autenticação/JWT/sessão, multi-tenancy e IDOR/BOLA, validação de input e
injeções (SQLi, SSRF, XSS, etc.), upload de arquivos, integrações de IA/LLM, banco de dados e
concorrência, regras de negócio, infraestrutura (Docker/Nginx/rede interna/TLS), rate
limiting, logs, supply chain, segredos vazados no histórico Git (atual e historicamente
removidos), CORS/CSRF, cache, webhooks, e mais — ver a lista completa de 41 categorias no
`PROMPT.md`.

## Regra mais importante: somente observacional

Esta auditoria é **read-only**. O agente investiga, confirma, classifica e documenta os
achados em `farmaura/04_Seguranca_Riscos/` (e demais categorias do cofre quando aplicável) —
nunca corrige, nunca altera código/infraestrutura/CI/CD, nunca revoga ou rotaciona segredos,
nunca cria commit/PR. Mesmo um achado crítico só é documentado, nunca corrigido automaticamente
nesta mesma execução. A decisão de corrigir e a implementação ficam para uma etapa futura,
acionada explicitamente pelo usuário a partir do que foi documentado aqui.

## Segredos: nunca copiar valor completo

Qualquer segredo encontrado (no código atual ou no histórico Git) é documentado mascarado
(ex.: `sk-proj-ABCD...WXYZ`), nunca replicado por inteiro em nenhuma nota do cofre — mesmo que
já pareça removido do HEAD, a existência histórica é documentada como risco a avaliar (rotação/
revogação), não como fato inofensivo.

## Ver também

- `padrao-ataques-defesas-e-limites-de-teste` (`_Compartilhado/Padroes_Politicas/`) — limites
  seguros de teste que esta auditoria também respeita (nunca contra produção/domínio público).
- [[../04_Seguranca_Riscos]] — destino dos achados confirmados/prováveis.
- [[../../_Compartilhado/Prompts/prompt-varredura-vulnerabilidades|prompt-varredura-vulnerabilidades]] — versão enxuta, focada numa mudança específica.

## Atualizações

- 2026-08-16: prompt criado, a partir de um pedido detalhado do usuário (41 categorias de
  auditoria, formato de achado com 16 campos, classificação CONFIRMADO/PROVÁVEL/POSSÍVEL/
  INFORMATIVO). Salvo em `farmaura/08_Skills_Agentes_Prompts/` (não em `_Compartilhado/Prompts/`)
  porque o prompt nomeia explicitamente `farmaura`/`farmaura-api`, não é genérico entre projetos.