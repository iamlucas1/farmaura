"""
farmaura-api/app/core/exceptions.py

Exception mapping for Farmaura.

Responsibilities:
- convert domain errors into API responses;
- keep client-facing error bodies consistent;
- avoid leaking internal implementation details;

Observations:
- HTTPExceptions still pass through FastAPI defaults when suitable;
- domain errors remain explicit in app.domain.errors;
"""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.logging import get_logger
from app.domain.errors import DomainError

logger = get_logger("unhandled_exception")

# Maps an HTTP status code to the Portuguese category label the frontend shows as the
# error modal's title, for the many endpoints that still raise a plain HTTPException
# instead of a typed DomainError (see the "padronizar-tratamento-erros" backlog item in
# dev-obsidian) — every response gets a consistent, safe shape and a clear category even
# before each individual raise site's message text has been reviewed/translated.
_STATUS_CATEGORY = {
    400: "validacao",
    401: "autenticacao",
    403: "permissao",
    404: "nao_encontrado",
    409: "conflito",
    413: "arquivo",
    415: "arquivo",
    422: "validacao",
    429: "limite_de_taxa",
}


def _category_for_status(status_code: int) -> str:
    """Return the safe Portuguese category label for one HTTP status code."""

    if status_code in _STATUS_CATEGORY:
        return _STATUS_CATEGORY[status_code]
    return "servidor" if status_code >= 500 else "erro"


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================


async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    """Map domain errors to structured JSON responses."""

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "category": exc.category})


async def handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
    """Attach a safe Portuguese category to every plain HTTPException response.

    Does not translate `exc.detail` itself — hundreds of call sites across
    `app/services/` still raise HTTPException directly with an ad-hoc message
    (tracked in dev-obsidian as technical debt to migrate to DomainError); this
    handler only guarantees every response has the same `{detail, category}`
    shape the frontend result modal expects, regardless of which style a given
    route uses today.
    """

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "category": _category_for_status(exc.status_code)}, headers=exc.headers)


async def handle_validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    """Map FastAPI/Pydantic request-validation failures to a safe Portuguese response."""

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Confira os campos preenchidos — algum valor está inválido ou faltando.", "category": "validacao"},
    )


async def handle_integrity_error(_: Request, __: IntegrityError) -> JSONResponse:
    """Map database constraint violations to a clean conflict response.

    A raw IntegrityError otherwise falls through to the generic handler below,
    which is also safe but returns a less specific 500 — this one is a genuine
    409 (a uniqueness race or a check-constraint violation the app layer didn't
    pre-validate), not an unexpected server failure.
    """

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Não foi possível salvar: conflito de dados.", "category": "banco_de_dados"},
    )


async def handle_database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Map any other database-layer failure (connection lost, timeout, bad query) safely.

    Full exception detail (which can include table/column names, or in rare
    cases fragments of the failing statement) is logged server-side only —
    never sent to the client. See "Logging, Errors, and Exposure Control" in
    claude.md/agent.md.
    """

    logger.error("database_error", path=str(request.url.path), method=request.method, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "O banco de dados está indisponível no momento. Tente novamente em instantes.", "category": "banco_de_dados"},
    )


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for anything not already mapped above — never leaks exception detail.

    This is the backstop for the "no stack traces, SQL, file paths, or secrets in
    client-facing errors" rule (claude.md/agent.md § Logging, Errors, and Exposure
    Control): whatever real, possibly-sensitive detail the exception carries goes
    to the structured server log only, with a traceback; the client only ever
    sees a fixed, generic, Portuguese message.
    """

    logger.error("unhandled_exception", path=str(request.url.path), method=request.method, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Ocorreu um erro inesperado no servidor. Tente novamente em instantes.", "category": "servidor"},
    )


def register_exception_handlers(application: FastAPI) -> None:
    """Register custom application exception handlers.

    Order does not affect dispatch — Starlette always picks the most specific
    matching exception type — but is kept specific-to-generic here for readability.
    """

    application.add_exception_handler(DomainError, handle_domain_error)
    application.add_exception_handler(RequestValidationError, handle_validation_error)
    application.add_exception_handler(IntegrityError, handle_integrity_error)
    application.add_exception_handler(SQLAlchemyError, handle_database_error)
    application.add_exception_handler(HTTPException, handle_http_exception)
    application.add_exception_handler(Exception, handle_unexpected_error)
