"""
farmaura-api/app/schemas/crm.py

CRM schemas for Farmaura.

Responsibilities:
- define tenant-scoped CRM transport contracts;
- expose customer relationship projections for the internal console;
- keep loyalty, preference, and activity snapshots explicit;

Observations:
- payloads are denormalized for the current pharmacist UI needs;
- write-side CRM mutations can be added later without changing these reads;
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# CRM REQUEST SCHEMAS
# ============================================================================


class CrmCustomerCreateRequest(StrictModel):
    """Validate a walk-in customer registration payload from the internal console."""

    full_name: str = Field(default="", max_length=255)
    doc: str = Field(default="", max_length=14)
    phone: str = Field(default="", max_length=32)


# ============================================================================
# CRM RESPONSE SCHEMAS
# ============================================================================


class CrmTopProductResponse(StrictModel):
    """Represent one top product entry."""

    name: str
    quantity: int


class CrmCategoryMixResponse(StrictModel):
    """Represent one category mix slice."""

    name: str
    value: int


class CrmCustomerResponse(StrictModel):
    """Represent one CRM customer profile."""

    id: str
    name: str
    email: str
    phone: str
    doc: str
    avatar: str
    tier: str
    recurring: bool
    city: str
    district: str
    cashback: Decimal
    orders: int
    total_spent: Decimal
    avg_ticket: Decimal
    last_days: int | None = None
    freq_days: int | None = None
    since: str
    tenure_months: int
    subscriptions: list[str]
    favorites: list[str]
    top_products: list[CrmTopProductResponse]
    interests: list[str]
    category_mix: list[CrmCategoryMixResponse]
    monthly: list[int]


class CrmCustomerListResponse(StrictModel):
    """Represent the CRM customer list payload."""

    items: list[CrmCustomerResponse]

