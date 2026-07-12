"""
farmaura-api/app/core/security.py

Shared security policies for Farmaura.

Responsibilities:
- centralize HTTP-layer security constants;
- provide baseline validation helpers;
- keep security-sensitive defaults explicit;

Observations:
- domain-specific authorization still belongs to services;
- upload and rate-limit rules build on these primitives;
"""

from collections.abc import Iterable

from fastapi import HTTPException, status


# ============================================================================
# SECURITY HELPERS
# ============================================================================


def ensure_known_fields(received_fields: Iterable[str], allowed_fields: set[str]) -> None:
    """Reject unknown fields for sensitive payloads."""

    unknown_fields = set(received_fields) - allowed_fields
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown fields: {', '.join(sorted(unknown_fields))}.",
        )
