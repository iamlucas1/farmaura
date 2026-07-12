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

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.domain.errors import DomainError


# ============================================================================
# EXCEPTION HANDLERS
# ============================================================================


async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    """Map domain errors to structured JSON responses."""

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


def register_exception_handlers(application: FastAPI) -> None:
    """Register custom application exception handlers."""

    application.add_exception_handler(DomainError, handle_domain_error)
