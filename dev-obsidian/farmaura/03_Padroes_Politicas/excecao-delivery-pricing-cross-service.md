# Exceção: delivery_pricing_service acessa repositórios e compõe outro serviço diretamente

**Tipo:** Padrão técnico (exceção deliberada)

## Descrição

`app/services/delivery_pricing_service.py` foi extraído de `OrderService` para ser reaproveitado tanto pelo checkout do marketplace quanto pelo PDV (balcão). Para isso, ele compõe `PortalService` internamente e acessa `DeliveryRoute`/`DeliveryRouteStop` e `OrderRepository` diretamente, em vez de só ser chamado por um único serviço "dono".

## Motivo

Evita duplicar a lógica de precificação por distância em dois lugares (marketplace e PDV). O documento próprio do serviço registra essa decisão no docstring.

## Exceções conhecidas

Isso quebra a regra estática do `claude.md`/`agent.md` de "services chamam repositórios, não outros services livremente" — tratado aqui como exceção documentada e intencional, não como desvio acidental. Qualquer nova composição de serviços cross-domain deve seguir o mesmo padrão de justificar no docstring, não apenas fazer silenciosamente.

## Ver também

- [[2026-07-12-precificacao-entrega-por-distancia]] — decisão de produto que originou esta exceção.
- [[padrao-camadas-backend-di-fastapi]] — regra geral de camadas da qual esta é uma exceção deliberada.
- [[excecao-fiscal-scheduler-sessao-propria]] — outra exceção deliberada à mesma regra de camadas.

## Atualizações

- 2026-07-19: nota criada.
