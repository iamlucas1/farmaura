# Exceção: fiscal_scheduler gerencia sua própria sessão de banco fora do DI por request

**Tipo:** Padrão técnico (exceção deliberada)

## Descrição

`app/services/fiscal_scheduler.py` roda como tarefa `asyncio` em processo, iniciada no `lifespan()` da aplicação, e acessa `SessionFactory`/models diretamente a cada tick — em vez de depender de uma sessão injetada por request, como o resto da aplicação.

## Motivo

Isolamento de sessão por tick documentado no próprio serviço: como não há um "request" por trás do scheduler, cada execução periódica precisa abrir/fechar sua própria sessão de banco.

## Exceções conhecidas

Padrão aceito apenas para tarefas de background que rodam fora do ciclo de request/response. Não deve ser copiado para código de rota ou serviço acionado por request — nesse caso a sessão deve continuar vindo da injeção de dependência padrão do FastAPI.

## Ver também

- [[2026-07-12-diferir-emissao-fiscal-7-dias]] — decisão de negócio que faz este scheduler existir.
- [[padrao-camadas-backend-di-fastapi]] — regra geral de camadas/DI da qual esta é uma exceção deliberada.
- [[excecao-delivery-pricing-cross-service]] — outra exceção deliberada à mesma regra de camadas.

## Atualizações

- 2026-07-19: nota criada.
