"""
farmaura-api/app/schemas/brand.py

Brand schemas for Farmaura.

Responsibilities:
- define product brand (marca) create, update, and response contracts;
- validate internal console payloads for brand registration, including the
  many-to-many link to the suppliers that distribute the brand;

Observations:
- brands are soft-deleted via the is_active flag, never hard-deleted;
"""

from datetime import datetime

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# BRAND SCHEMAS
# ============================================================================


class BrandSupplierSummary(StrictModel):
    """Represent a supplier linked to a brand."""

    id: str
    legal_name: str
    trade_name: str


class BrandResponse(StrictModel):
    """Represent a brand record."""

    id: str
    name: str
    description: str
    logo_url: str
    is_active: bool
    is_discarded: bool = False
    suppliers: list[BrandSupplierSummary] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class BrandCreateRequest(StrictModel):
    """Validate a new brand registration request."""

    name: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=1000)
    logo_url: str = Field(default="", max_length=500)
    supplier_ids: list[str] = Field(default_factory=list, max_length=50)


class BrandUpdateRequest(StrictModel):
    """Validate a brand update request."""

    name: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=1000)
    logo_url: str = Field(default="", max_length=500)
    supplier_ids: list[str] = Field(default_factory=list, max_length=50)


class BrandStatusUpdateRequest(StrictModel):
    """Validate a brand activation/deactivation request."""

    is_active: bool


class BrandDiscardUpdateRequest(StrictModel):
    """Validate a brand discard/recovery request — distinct from is_active."""

    is_discarded: bool


class BrandListResponse(StrictModel):
    """Represent the brand list payload."""

    items: list[BrandResponse]
