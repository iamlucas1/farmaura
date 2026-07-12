"""
farmaura-api/app/core/pagination.py

Pagination helpers for Farmaura.

Responsibilities:
- define safe pagination parameters;
- enforce configured pagination ceilings;
- keep list endpoints bounded and predictable;

Observations:
- cursor pagination can be added for high-scale domains later;
- public list responses should always stay capped;
"""

from pydantic import BaseModel, Field


# ============================================================================
# PAGINATION SCHEMAS
# ============================================================================


class PageParams(BaseModel):
    """Bounded page query parameters."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class PageMeta(BaseModel):
    """Pagination metadata returned by list endpoints."""

    page: int
    page_size: int
    total: int
