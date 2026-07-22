# 2026-07-20 — Migração Redis → Valkey e cache de listagem de catálogo

## Contexto

Pedido explícito do usuário: migrar a infra de Redis para Valkey e, de quebra, usar esse backend como cache real de leitura para "liberar consumo do backend" — reduzir carga no Postgres nos endpoints mais lidos, com validação e invalidação corretas.

Antes desta mudança, Redis era usado só por [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|rate limit e bloqueio de login]] (decisão do mesmo dia, mais cedo). Não existia nenhuma camada de cache — toda leitura de catálogo, incluindo `GET /catalog/public` (sem autenticação, chamável por qualquer visitante), batia direto no Postgres, refazendo o agrupamento completo do inventário do tenant a cada request.

O usuário foi explícito sobre o risco a evitar: cache não pode nunca causar venda duplicada de um produto, nem servir promoção por período/cupom vencido, nem ignorar a divisão de estoque por loja.

## Alternativas consideradas

- **Cachear a resposta final já personalizada (com promoção aplicada)** — descartado; promoções são resolvidas por cliente (endereço, tipo de dispositivo, segmento) e por janela de tempo, então cachear o resultado já misturado exigiria invalidar a cada mudança de perfil de cliente ou a cada tick do relógio. Manter a personalização sempre ao vivo, por cima do cache, é mais simples e elimina esse risco por construção.
- **Invalidação por `SCAN`/`KEYS` de um padrão de chave** — descartado; não é atômico sob concorrência e é desaconselhado em produção pelo próprio Valkey/Redis (bloqueia o event loop em bases grandes).
- **Cachear também o resultado do checkout (preço/estoque no momento da compra)** — descartado terminantemente; é exatamente o cenário que causaria overselling. O checkout (marketplace e PDV) já usa `SELECT … FOR UPDATE` (`InventoryRepository.get_item_by_id_for_update`) para travar a linha e reconferir estoque dentro da própria transação antes de decrementar — isso é o que impede vender a mesma unidade duas vezes, independente de qualquer cache. Essa trava não foi tocada; o cache nunca é consultado por ali.
- **Invalidação explícita em todo write path que toca estoque** (PDV incluindo reservas/filas/cancelamentos, lote, sincronização de estoque, importação de nota) — descartado como exigência total; a superfície é grande (10+ pontos de escrita) e a maioria é batch/baixa frequência. Optou-se por invalidar explicitamente só os caminhos de alto valor/alta frequência e deixar o TTL curto (20s) como rede de segurança para o resto — nenhum deles pode causar overselling (a trava de estoque já cobre isso), só limita por quanto tempo uma *listagem* pode ficar defasada.

## Decisão

**1. Infra: Redis → Valkey, rename completo.** Imagem `redis:8.2.6-bookworm` → `valkey/valkey:9.1-trixie` (Valkey não publica tag `-bookworm`; `-trixie` é o equivalente "full" em Debian). Client Python `redis==8.0.0` → `valkey==6.1.1` (`valkey-py`, fork com a mesma API, protocolo RESP compatível). Rename de ponta a ponta: `redis_client.py`→`valkey_client.py`, `redis_url`→`valkey_url`, `APP_REDIS_URL`→`APP_VALKEY_URL`, serviço `farmaura-redis`→`farmaura-valkey`. Sem mudança de comportamento em rate limit/login guard — ver [[../05_Integracoes_Infra/Valkey|Valkey]].

**2. Cache de catálogo (`app/core/cache.py`), novo.** Invalidação por contador de geração por tenant (`INCR` atômico, sem `SCAN`), TTL de 20s como rede de segurança, fail-open em qualquer erro do Valkey (cache indisponível nunca derruba a listagem, só remove o ganho de performance). Serialização JSON com `Decimal` convertido para string (`default=str`) — seguro porque todo consumidor já faz `Decimal(str(...))` ou atribui direto num campo Pydantic `Decimal`, que faz coerção automática de string numérica.

**3. Onde o cache entra: só `CatalogService._list_grouped_products`.** É o único passo caro (query + agrupamento de todo o inventário marketplace-visível do tenant) compartilhado pela listagem pública e pela autenticada, antes de qualquer personalização. Tudo que vem depois — promoções personalizadas (`_apply_personalized_promotions`), resumo de avaliações — continua calculado ao vivo, sem cache algum, a cada request. Isso é o que garante que promoção por período, cupom e afins nunca fiquem desatualizados: eles nunca são cacheados, só o catálogo-base (nome, marca, preço-base, estoque agregado) é.

**4. Invalidação explícita** (depois do commit da escrita, nunca antes — evita corrida com um leitor concorrente recriando o cache a partir de estado pré-commit): `InventoryService.create_item`/`update_item`/`adjust_item` (edição de preço, visibilidade, estoque), `OrderService.create_marketplace_order` (checkout marketplace), `PdvService.create_queue_order`/`_return_stock_and_cancel` (reserva e cancelamento de PDV — é na fila que o PDV decrementa estoque de fato, não na finalização da venda, conforme o próprio docstring do serviço). `transfer_item` ficou de fora deliberadamente: só muda localização de armazenamento, que não aparece no payload cacheado.

## Consequências

- `GET /catalog/public` e `GET /catalog` passam a servir a maioria das requisições sem tocar o Postgres, dentro de uma janela de até 20s por tenant.
- Nenhuma mudança de comportamento em checkout, promoções, cupons ou rate limit/login guard — só troca de tecnologia (Valkey) e uma camada de cache nova, isolada, que nunca é consultada por write paths.
- `app/core/idempotency.py` segue sem backend de persistência — não fazia parte deste pedido. Ver [[../06_Pendencias/conectar-valkey-a-rate-limit-e-idempotencia|conectar-valkey-a-rate-limit-e-idempotencia]].
- Testado: suíte de testes (22/25 — as 3 falhas são uma corrida pré-existente de schema SQLite na inicialização do `fiscal_scheduler`, reproduzível isoladamente e sem relação com esta mudança), `docker compose config` validado, imagem `valkey/valkey:9.1-trixie` baixada/rodando, e round-trip completo do `cache.py` (fail-open sem servidor, serialização `Decimal`, invalidação por geração) contra um container Valkey real.

## Ver também

- [[../05_Integracoes_Infra/Valkey|Valkey]] — contrato de infra atualizado.
- [[../00_Decisoes/2026-07-20-rate-limit-e-bloqueio-exponencial|Rate limit e bloqueio exponencial]] — primeiro uso real do Redis/Valkey, mesmo dia, mais cedo.
- [[../06_Pendencias/conectar-valkey-a-rate-limit-e-idempotencia|conectar-valkey-a-rate-limit-e-idempotencia]] — gap de idempotência, ainda aberto, não tocado por esta decisão.
