# Padrão confirmado: camadas + injeção de dependência no backend

**Tipo:** Padrão técnico (documentação de convenção real, não aspiracional)

## Descrição

Auditoria de 2026-07-19 confirmou que o backend segue de forma consistente:

- **Repository pattern**: 20 classes independentes em `app/repositories/*.py`, cada uma recebendo `session: AsyncSession` no `__init__`. Sem `BaseRepository` compartilhado.
- **Service layer**: 29 arquivos em `app/services/`, instanciados por request (`OrderService(session=session, subject=subject)`), rotas praticamente sem lógica de negócio.
- **DI via `Depends`**: `app/api/deps.py` define fábricas compostas (`require_scope`, `require_portal_access`) especializadas em `require_marketplace_subject(*roles)` / `require_internal_subject(*roles)` — praticamente toda rota segue a assinatura `subject = Depends(...)`, `session = Depends(get_subject_session)`.
- **Hierarquia de erro de domínio**: `app/domain/errors.py` (`DomainError` + subclasses), mapeada centralmente em `app/core/exceptions.py`.

## Motivo

Documentar o que já está em uso de fato, para que qualquer código novo siga a mesma convenção em vez de inventar uma abordagem paralela.

## Exceções conhecidas

A hierarquia `DomainError` é **minoritária na prática** — 18 dos ~29 arquivos de service levantam `HTTPException` diretamente em vez de usar `DomainError`. Ver [[padronizar-tratamento-erros-domainerror-vs-httpexception]] — é uma inconsistência real a resolver, não um padrão a copiar.

## Ver também

- [[excecao-delivery-pricing-cross-service]] e [[excecao-fiscal-scheduler-sessao-propria]] — exceções deliberadas a esta regra de camadas.
- [[secure-python-backend]] (`_Compartilhado/Skills/`) — baseline de segurança que assume esta mesma estrutura em camadas.

## Atualizações

- 2026-07-19: nota criada.
