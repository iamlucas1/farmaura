"""
farmaura-api/app/main.py

FastAPI application bootstrap for Farmaura.

Responsibilities:
- create and configure the FastAPI application;
- register middleware and routers;
- expose health-friendly startup metadata;

Observations:
- the API is intended to run behind lumos-gateway;
- security headers are additive and gateway-compatible;
"""

import asyncio
import contextlib
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.middleware.body_limits import BodyLimitMiddleware
from app.api.middleware.request_logging import RequestLoggingMiddleware
from app.api.middleware.request_id import RequestIdMiddleware
from app.api.middleware.security_headers import SecurityHeadersMiddleware
from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.services.fiscal_scheduler import run_fiscal_scheduler_forever


# ============================================================================
# APPLICATION LIFECYCLE
# ============================================================================


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize application resources."""

    configure_logging()
    scheduler_task = asyncio.create_task(run_fiscal_scheduler_forever())
    try:
        yield
    finally:
        scheduler_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await scheduler_task


# ============================================================================
# APPLICATION FACTORY
# ============================================================================


def create_application() -> FastAPI:
    """Build the FastAPI application instance."""

    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(BodyLimitMiddleware, max_body_bytes=settings.max_request_body_bytes)
    application.add_middleware(RequestIdMiddleware)
    application.add_middleware(RequestLoggingMiddleware)
    application.add_middleware(SecurityHeadersMiddleware)
    if settings.allowed_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key"],
            expose_headers=["X-Request-Id"],
        )
    static_dir = Path(__file__).resolve().parent / "static"
    application.mount("/static", StaticFiles(directory=str(static_dir), check_dir=False), name="static")
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    register_exception_handlers(application)
    return application


app = create_application()
