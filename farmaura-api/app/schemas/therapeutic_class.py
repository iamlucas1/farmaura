"""
farmaura-api/app/schemas/therapeutic_class.py

Therapeutic class schemas for Farmaura.

Responsibilities:
- define therapeutic class (classe terapeutica) create, update, and response
  contracts;
- validate internal console payloads for therapeutic class registration;

Observations:
- therapeutic classes are soft-deleted via the is_active flag, never
  hard-deleted;
"""

from datetime import datetime

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# THERAPEUTIC CLASS SCHEMAS
# ============================================================================


class TherapeuticClassResponse(StrictModel):
    """Represent a therapeutic class record."""

    id: str
    name: str
    description: str
    is_active: bool
    is_discarded: bool = False
    category_id: str | None = None
    category_name: str = ""
    created_at: datetime
    updated_at: datetime


class TherapeuticClassCreateRequest(StrictModel):
    """Validate a new therapeutic class registration request."""

    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    category_id: str | None = None


class TherapeuticClassUpdateRequest(StrictModel):
    """Validate a therapeutic class update request."""

    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    category_id: str | None = None


class TherapeuticClassStatusUpdateRequest(StrictModel):
    """Validate a therapeutic class activation/deactivation request."""

    is_active: bool


class TherapeuticClassDiscardUpdateRequest(StrictModel):
    """Validate a therapeutic class discard/recovery request — distinct from is_active."""

    is_discarded: bool


class TherapeuticClassListResponse(StrictModel):
    """Represent the therapeutic class list payload."""

    items: list[TherapeuticClassResponse]
