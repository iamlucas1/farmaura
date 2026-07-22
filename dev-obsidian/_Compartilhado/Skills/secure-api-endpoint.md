# Skill: secure-api-endpoint

**Arquivo fonte:** `dev-obsidian/_Compartilhado/Skills/secure-api-endpoint/SKILL.md`

## Propósito

Checklist para criar ou alterar endpoints FastAPI com validação estrita de input, ownership, escopo de tenant, limites de abuso, idempotência e minimização de resposta.

## Quando usar

Toda vez que uma rota FastAPI for criada ou alterada, em qualquer stack do repositório (não só `farmaura-api`).

## Checklist por endpoint

1. Schema de request estrito.
2. Schema de response explícito.
3. Validar ator autenticado.
4. Resolver escopo de tenant/loja/ownership.
5. Rejeitar campos desconhecidos ou proibidos.
6. Chamar um service, nunca lógica de negócio inline na rota.
7. Mapear erros de domínio de forma consistente.
8. Controles de abuso se a rota for pública, de auth ou de upload.
9. Confirmar comportamento correto atrás do `lumos-gateway` (headers encaminhados, suposições de HTTPS, health-check).

## Padrões sensíveis (atenção redobrada)

Rotas de criação/atualização; fluxos de dinheiro, estoque, prescrição e arquivo; rotas que aceitam ID por path/query; listagens tenant-scoped; rotas chamáveis tanto por cliente quanto por staff; endpoints reusados por marketplace **e** portal interno (não podem vazar decisão de acesso interno para o fluxo de cliente).

## Anti-padrões

Confiar em ID da URL sem cross-check no backend; confiar em total/estado vindo do frontend; expor campo interno na resposta; paginação sem limite; handler de rota fazendo papel de service; devolver detalhe de debug ao cliente; assumir que o endpoint só será chamado através do gateway já existente sem validar isso.

## Teste mínimo

Caminho feliz, não-autenticado, proibido/cross-tenant, input inválido, abuso/duplo-submit quando relevante.

## Ver também

- [[../../farmaura/06_Pendencias/paginacao-inconsistente-entre-rotas|paginacao-inconsistente-entre-rotas]] — gap real no repositório do anti-padrão "paginação sem limite".
- [[../../farmaura/04_Seguranca_Riscos/idempotencia-sem-persistencia|idempotencia-sem-persistencia]] e [[../../farmaura/04_Seguranca_Riscos/rate-limiting-nao-aplicado|rate-limiting-nao-aplicado]] — gaps reais nos controles de abuso/idempotência exigidos aqui.

## Atualizações
- 2026-07-20: definição operacional movida para o diretório da skill neste cofre; esta nota permanece destinada à leitura humana.

- 2026-07-19: nota criada.
