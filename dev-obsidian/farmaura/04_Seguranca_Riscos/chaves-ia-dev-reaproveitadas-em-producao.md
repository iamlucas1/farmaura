# Chaves de API de IA (Gemini/OpenAI) de dev reaproveitadas em produção

**Tipo:** Exceção aceita conscientemente
**Severidade:** Baixa
**Status:** Aceito (com justificativa)
**Data de identificação:** 2026-07-24

## Descrição

Ao investigar por que a importação de orçamento por IA nunca funcionava em produção (503 imediato —
ver [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA — Gemini e OpenAI]]), descobriu-se que `ai_enabled`
nunca tinha sido configurado em produção (`APP_AI_ENABLED` ausente do `.env` de
`/opt/farmaura`, caindo no default `false`). Para destravar o recurso, `APP_AI_GEMINI_API_KEY` e
`APP_AI_OPENAI_API_KEY` de produção foram configurados com **as mesmas chaves usadas no ambiente de
desenvolvimento local**, por escolha explícita do usuário quando questionado (opção "usar as mesmas
chaves do ambiente local" entre as alternativas oferecidas).

## Impacto

- Cota/billing de dev e produção compartilhados na mesma chave — uso pesado em dev (testes,
  iteração) pode consumir cota que produção precisaria, e vice-versa; não há como distinguir custo
  de dev vs. produção no billing do provedor.
- Se a chave de dev precisar ser revogada/rotacionada por qualquer motivo (vazamento, teste
  destrutivo), produção quebra junto.
- Não há isolamento de blast radius: um teste malformado em dev que gere volume anômalo de
  chamadas pode disparar rate-limit/abuse-detection do provedor (Gemini/OpenAI) e derrubar a
  funcionalidade em produção também.

## Mitigação / Tratamento

Aceito conscientemente pelo usuário como solução temporária para destravar o recurso rapidamente.
Não tratado agora. Tratamento recomendado quando houver tempo: gerar chaves de API dedicadas de
produção (Gemini e/ou OpenAI) e substituir no `.env` de `/opt/farmaura/farmaura-api/.env` — troca
de duas variáveis, sem mudança de código.

## Referências

- [[../05_Integracoes_Infra/IA_Gemini_OpenAI|IA — Gemini e OpenAI]] — contrato da integração e o
  bug de `ai_enabled` que motivou esta decisão.
- [[../02_Documentacao/Modulo_Orcamentos|Módulo Orçamentos]] — funcionalidade que dependia disso.

## Atualizações

- 2026-07-24: nota criada.
