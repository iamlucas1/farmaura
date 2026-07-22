# Dois idiomas concorrentes para levantar erro nos services (DomainError vs HTTPException)

**Status:** Aberto
**Prioridade:** Média
**Registrado em:** 2026-07-19

## Descrição

Existe uma hierarquia central de erro de domínio (`app/domain/errors.py`, mapeada em `app/core/exceptions.py`), mas 18 dos ~29 arquivos de `app/services/` a ignoram e levantam `HTTPException` diretamente: `order_service.py` (20 ocorrências), `pdv_service.py` (18), `inventory_service.py` (17), `customer_service.py` (16), `ai_service.py` (12), `portal_service.py` (9), entre outros. Só `AuthenticationError`/`AuthorizationError` (embutidos em `deps.py`) usam `DomainError` de forma consistente.

## Contexto

Achado em auditoria de qualidade de código de 2026-07-19. Ver padrão documentado em [[padrao-camadas-backend-di-fastapi]]. Não é um bug funcional — os dois idiomas produzem resposta HTTP correta — mas é inconsistência que dificulta manutenção (dois lugares para entender "como um erro de negócio vira resposta"). Decidir qual dos dois é o padrão daqui pra frente e migrar o outro, em vez de deixar crescerem em paralelo.
