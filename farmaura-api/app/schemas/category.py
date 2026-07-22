"""
farmaura-api/app/schemas/category.py

Category schemas for Farmaura.

Responsibilities:
- define product category create, update, and response contracts;
- validate internal console payloads for category registration;

Observations:
- categories are soft-deleted via the is_active flag, never hard-deleted;
"""

from datetime import datetime

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# CATEGORY SCHEMAS
# ============================================================================


class CategoryResponse(StrictModel):
    """Represent a category record."""

    id: str
    name: str
    description: str
    is_active: bool
    is_discarded: bool = False
    created_at: datetime
    updated_at: datetime


class CategoryCreateRequest(StrictModel):
    """Validate a new category registration request."""

    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)


class CategoryUpdateRequest(StrictModel):
    """Validate a category update request."""

    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)


class CategoryStatusUpdateRequest(StrictModel):
    """Validate a category activation/deactivation request."""

    is_active: bool


class CategoryDiscardUpdateRequest(StrictModel):
    """Validate a category discard/recovery request — distinct from is_active."""

    is_discarded: bool


class CategoryListResponse(StrictModel):
    """Represent the category list payload."""

    items: list[CategoryResponse]
