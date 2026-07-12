"""
farmaura-api/app/core/idempotency.py

Idempotency helpers for Farmaura.

Responsibilities:
- define idempotency key semantics for critical writes;
- validate caller-provided idempotency tokens;
- prepare the codebase for replay-safe operations;

Observations:
- persistence-backed enforcement should be added per write flow;
- the helper intentionally keeps the contract narrow;
"""

from uuid import UUID

from fastapi import HTTPException, status


# ============================================================================
# IDEMPOTENCY VALIDATION
# ============================================================================


def validate_idempotency_key(raw_value: str) -> UUID:
    """Parse and validate an idempotency key value."""

    try:
        return UUID(raw_value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid idempotency key.") from exc
