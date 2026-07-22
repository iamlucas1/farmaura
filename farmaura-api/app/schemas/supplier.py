"""
farmaura-api/app/schemas/supplier.py

Supplier schemas for Farmaura.

Responsibilities:
- define supplier (fornecedor) create, update, and response contracts;
- validate internal console payloads for supplier registration;

Observations:
- suppliers are soft-deleted via the is_active flag, never hard-deleted;
"""

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# SUPPLIER SCHEMAS
# ============================================================================


class SupplierResponse(StrictModel):
    """Represent a supplier record."""

    id: str
    legal_name: str
    trade_name: str
    cnpj: str
    email: str
    phone: str
    website: str
    category: str
    contact_person_name: str
    uf: str
    city: str
    address_line: str
    lead_time_days: int
    minimum_order_amount: Decimal
    freight_policy: str
    payment_terms: str
    notes: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SupplierCreateRequest(StrictModel):
    """Validate a new supplier registration request."""

    legal_name: str = Field(min_length=2, max_length=255)
    trade_name: str = Field(default="", max_length=255)
    cnpj: str = Field(min_length=11, max_length=18)
    email: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=32)
    website: str = Field(default="", max_length=255)
    category: str = Field(default="", max_length=120)
    contact_person_name: str = Field(default="", max_length=120)
    uf: str = Field(default="", min_length=0, max_length=2)
    city: str = Field(default="", max_length=120)
    address_line: str = Field(default="", max_length=255)
    lead_time_days: int = Field(ge=0, default=0)
    minimum_order_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    freight_policy: str = Field(default="", max_length=120)
    payment_terms: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=1000)


class SupplierUpdateRequest(StrictModel):
    """Validate a supplier update request."""

    legal_name: str = Field(min_length=2, max_length=255)
    trade_name: str = Field(default="", max_length=255)
    cnpj: str = Field(min_length=11, max_length=18)
    email: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=32)
    website: str = Field(default="", max_length=255)
    category: str = Field(default="", max_length=120)
    contact_person_name: str = Field(default="", max_length=120)
    uf: str = Field(default="", min_length=0, max_length=2)
    city: str = Field(default="", max_length=120)
    address_line: str = Field(default="", max_length=255)
    lead_time_days: int = Field(ge=0, default=0)
    minimum_order_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    freight_policy: str = Field(default="", max_length=120)
    payment_terms: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=1000)


class SupplierStatusUpdateRequest(StrictModel):
    """Validate a supplier activation/deactivation request."""

    is_active: bool


class SupplierListResponse(StrictModel):
    """Represent the supplier list payload."""

    items: list[SupplierResponse]
