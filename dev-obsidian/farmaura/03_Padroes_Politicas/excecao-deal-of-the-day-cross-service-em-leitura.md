# Exceção: PortalService chama DealSuggestionService de dentro de um método de leitura do bootstrap

**Tipo:** Padrão técnico (exceção deliberada)

## Descrição

`PortalService._resolve_deal_of_the_day` (chamado pelos 3 métodos de bootstrap) pode, quando
`mode="auto"` e o ciclo diário já virou, instanciar `DealSuggestionService` e rodar um sorteio novo
— persistindo (`_upsert_setting_payload` + `commit()`) antes de devolver a resposta. Um método cujo
nome e uso em todo o resto do arquivo são de leitura pura ganhou um caminho de escrita condicional.

## Motivo

Reset automático de "ofertas do dia" precisa rodar sem o admin precisar abrir o console — a
alternativa seria um scheduler de processo (mesmo padrão de `fiscal_scheduler.py`), rejeitada por
ser infraestrutura nova para um caso que a invalidação lazy já resolve (mesmo princípio do TTL do
cache de catálogo, `core/cache.py`): checar "isso está desatualizado?" no momento da leitura e
recalcular ali, sem processo separado.

## Exceções conhecidas

Só para o par `PortalService`/`DealSuggestionService`, e só para este método. Consequência que
precisou de correção própria: como o método pode comitar, qualquer resolver chamado **depois** dele
na mesma construção de bootstrap perde o contexto de RLS a menos que seja reaplicado logo em
seguida — `_resolve_deal_of_the_day` já faz isso (`apply_tenant_context`/
`apply_public_marketplace_context`, conforme o subject disponível), mas qualquer nova exceção
parecida (outro "resolve que também escreve") precisa repetir esse cuidado, não só copiar a chamada
ao outro serviço.

## Ver também

- [[excecao-delivery-pricing-cross-service]] e [[excecao-fiscal-scheduler-sessao-propria]] — outras
  exceções deliberadas à mesma regra geral de camadas.
- [[padrao-camadas-backend-di-fastapi]] — regra geral da qual esta é uma exceção.
- [[feedback_farmaura_rls_context_after_commit|feedback: RLS limpo após commit]] (memória de sessão)
  — a classe de bug que motivou o cuidado extra aqui.
- [[../00_Decisoes/2026-08-03-ofertas-do-dia-ciclos-automaticos-e-sorteio-por-parametros|ADR que
  introduziu esta exceção]].

## Atualizações

- 2026-08-03: nota criada.
