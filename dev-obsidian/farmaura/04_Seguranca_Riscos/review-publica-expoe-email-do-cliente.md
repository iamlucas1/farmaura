---
cssclasses: ia-nota
---

# Review pública de produto expõe o e-mail do cliente como "nome do avaliador" quando o cadastro não tem nome preenchido

**Tipo:** Vulnerabilidade (exposição indevida de PII)
**Status:** CONFIRMADO
**Severidade:** MÉDIO
**Sistema afetado:** `farmaura-api`
**Categoria:** Exposição de dado pessoal / privacidade
**Data de identificação:** 2026-08-17 (auditoria completa de segurança)

## Descrição

Ao criar uma review de produto, o backend decide o nome de exibição do avaliador com este fallback:

```python
# app/services/portal_service.py:916
reviewer_name = str(customer.name or customer.email or 'Cliente Farmaura').strip()
```

Esse `reviewer_name_snapshot` é devolvido sem qualquer redação por `GET /portal/products/{product_ref}/reviews` — rota **pública, sem autenticação** (só `PUBLIC_RATE_LIMIT`). O cliente não tem nenhum campo para escolher um nome de exibição (`PortalProductReviewCreateRequest` só aceita `product_ref`, `rating`, `title`, `body`) — o nome exibido é decidido 100% pelo backend a partir do cadastro da conta, no momento da criação da review.

## Evidência

`app/services/portal_service.py:916` (criação) + `app/services/portal_service.py:1831` e `app/api/v1/portal.py:588-600` (listagem pública, sem autenticação).

## Cenário de risco

Se o cliente nunca preencheu o campo "nome" no cadastro (`customer.name` vazio/nulo), o e-mail completo dele é publicado permanentemente e sem aviso na página pública do produto — visível a qualquer visitante não autenticado, inclusive raspadores/scrapers e indexação por motores de busca.

## Impacto

Exposição involuntária de PII (e-mail completo) associada a um comportamento de compra específico (qual produto o cliente comprou/avaliou) — habilita phishing direcionado, correlação de identidade, ou simples constrangimento (ex.: reviews de produtos de uso íntimo/saúde sensível).

## Pré-condições

Cliente com conta sem o campo `name` preenchido publica uma review de produto.

## Escopo afetado

`app/services/portal_service.py` (criação e serialização de review), `app/api/v1/portal.py` (rota pública de listagem), tabela `product_reviews` (que também não tem RLS — ver [[rls-ausente-em-tabelas-de-varios-dominios]], gap independente deste achado).

## Causa raiz

O fallback de exibição usa dado de contato (e-mail) em vez de um placeholder anônimo/genérico quando o nome de exibição preferido está ausente — a ordem dos operandos do `or` deveria pular direto para o fallback genérico (`'Cliente Farmaura'`) sem passar pelo e-mail.

## Correção sugerida para análise futura

Nunca usar `customer.email` como fallback de exibição pública — usar diretamente `'Cliente Farmaura'` (o fallback final já existe na mesma linha, só está na posição errada da cadeia `or`) ou derivar um nome curto/inicial a partir do e-mail sem expor o endereço completo (ex.: primeira letra + asteriscos).

## Dependências da correção

Nenhuma migration necessária para novas reviews (mudança de uma linha). Avaliar se é preciso um backfill/correção retroativa das reviews já publicadas com e-mail exposto (`reviewer_name_snapshot` já persistido) — decisão de produto/dado, fora do escopo desta auditoria observacional.

## Riscos de regressão

Muito baixo — a mudança só afeta o texto de exibição de um fallback, não a lógica de negócio da review em si.

## Como validar futuramente que a correção funcionou

Criar uma review de teste com uma conta sem `name` preenchido e confirmar, via `GET /portal/products/{product_ref}/reviews` (chamada anônima), que o nome exibido é o placeholder genérico, não o e-mail.

## Referências

- [[rls-ausente-em-tabelas-de-varios-dominios]] — `product_reviews` também sem RLS (gap independente).
- [[auditoria-2026-08-17-resumo-consolidado]] — visão consolidada desta auditoria.

## Atualizações

- 2026-08-17: achado registrado via auditoria completa de segurança.