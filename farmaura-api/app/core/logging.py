"""
farmaura-api/app/core/logging.py

Structured logging bootstrap for Farmaura.

Responsibilities:
- configure structured process logging;
- keep log output consistent across environments;
- avoid leaking sensitive data by default;

Observations:
- request-scoped enrichment can be added later through middleware;
- log masking rules should evolve with sensitive domains;
"""

import logging
from collections.abc import MutableMapping
from typing import Any

import structlog
from structlog.types import EventDict


# ============================================================================
# LOG SANITIZATION
# ============================================================================


SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "provider_token",
    "jwt",
    "secret",
}


def _sanitize_value(value: Any) -> Any:
    """Redact sensitive values recursively before log emission."""

    if isinstance(value, MutableMapping):
        return {key: ("[REDACTED]" if key.lower() in SENSITIVE_KEYS else _sanitize_value(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_value(item) for item in value)
    return value


def sanitize_log_event(_: Any, __: str, event_dict: EventDict) -> EventDict:
    """Redact sensitive fields in structured logs."""

    return {key: ("[REDACTED]" if key.lower() in SENSITIVE_KEYS else _sanitize_value(value)) for key, value in event_dict.items()}


# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================


def configure_logging() -> None:
    """Configure structured application logging."""

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            sanitize_log_event,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
    )


def get_logger(name: str) -> Any:
    """Return a structured logger instance."""

    return structlog.get_logger(name)
