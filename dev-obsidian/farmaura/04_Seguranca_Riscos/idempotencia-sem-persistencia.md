# Idempotência valida só o formato da chave, sem proteção real contra replay

**Tipo:** Risco identificado
**Severidade:** Alta
**Status:** Aberto
**Data de identificação:** 2026-07-18

## Descrição

`app/core/idempotency.py` valida apenas que a chave de idempotência tem formato UUID — não existe persistência que registre chaves já usadas e rejeite reprocessamento.

## Impacto

Fluxos críticos como criação de pedido, confirmação de pagamento (Asaas) e ajuste de estoque ficam expostos a duplo clique, retry de rede ou replay de webhook processarem a mesma operação duas vezes. Isso é especialmente sensível agora que pagamento real via Asaas está em produção (`../00_Decisoes/2026-07-12-pagamentos-pix-cartao-via-asaas.md`) — uma duplicata aqui é dinheiro real, não só um registro duplicado.

## Mitigação / Tratamento

Nenhuma ainda. Mesmo bloqueio que o rate limiting: depende de um backend de persistência (Valkey, já provisionado mas não usado para isto) para registrar chaves já vistas.

## Referências

Ver [[../05_Integracoes_Infra/Valkey|Valkey]] e [[rate-limiting-nao-aplicado]] (mesmo gap raiz). Seção "Concurrency and Idempotency" do `claude.md`/`agent.md` já exige isso como baseline — este achado documenta que a implementação ainda não fecha esse requisito.

## Ver também

- [[conectar-valkey-a-rate-limit-e-idempotencia]] — pendência que fecha este gap.
- [[2026-07-12-pagamentos-pix-cartao-via-asaas]] — decisão que torna este risco mais sensível (dinheiro real em jogo).
- [[secure-api-endpoint]] (`_Compartilhado/Skills/`) — checklist que já exige idempotência em rotas sensíveis.

## Atualizações

- 2026-07-20: infra renomeada de Redis para Valkey (backend ainda não conectado à idempotência — gap segue aberto) — ver [[../00_Decisoes/2026-07-20-migracao-redis-para-valkey-e-cache-de-catalogo|decisão]].
- 2026-07-19: nota criada.
