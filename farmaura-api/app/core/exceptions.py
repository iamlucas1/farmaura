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

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.domain.errors import DomainError


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================


async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    """Map domain errors to structured JSON responses."""

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


async def handle_integrity_error(_: Request, __: IntegrityError) -> JSONResponse:
    """Map database constraint violations to a clean conflict response.

    A raw IntegrityError otherwise falls through to Starlette's default 500
    handler, leaking no useful detail while hiding a client-fixable problem
    (e.g. a uniqueness race or a check-constraint violation the app layer
    didn't pre-validate).
    """

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Não foi possível salvar: conflito de dados."},
    )


def register_exception_handlers(application: FastAPI) -> None:
    """Register custom application exception handlers."""

    application.add_exception_handler(DomainError, handle_domain_error)
    application.add_exception_handler(IntegrityError, handle_integrity_error)
