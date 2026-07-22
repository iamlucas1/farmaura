"""
farmaura-api/app/schemas/store.py

Store schemas for Farmaura.

Responsibilities:
- validate physical store create and update payloads for the admin console;
- expose store projections consumed by PDV, portal bootstrap, and delivery flows;

Observations:
- coordinates are resolved server-side from the address at creation time;
- clients never submit latitude/longitude directly.
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# STORE INPUT SCHEMAS
# ============================================================================


class StoreCreateRequest(StrictModel):
    """Validate a new store registration request."""

    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=255)
    address_line: str = Field(default="", max_length=255)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state_code: str = Field(default="", max_length=2)
    postal_code: str = Field(default="", max_length=12)
    phone: str = Field(default="", max_length=32)
    cnpj: str = Field(default="", max_length=18)
    is_primary: bool = False


class StoreUpdateRequest(StrictModel):
    """Validate a store update request."""

    name: str | None = Field(default=None, min_length=2, max_length=255)
    address_line: str | None = Field(default=None, max_length=255)
    district: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    state_code: str | None = Field(default=None, max_length=2)
    postal_code: str | None = Field(default=None, max_length=12)
    phone: str | None = Field(default=None, max_length=32)
    cnpj: str | None = Field(default=None, max_length=18)
    is_primary: bool | None = None
    is_active: bool | None = None


# ============================================================================
# STORE RESPONSE SCHEMAS
# ============================================================================


class StoreResponse(StrictModel):
    """Represent one physical store."""

    id: str
    code: str
    name: str
    address_line: str = ""
    district: str = ""
    city: str = ""
    state_code: str = ""
    postal_code: str = ""
    latitude: Decimal = Decimal("0.0000000")
    longitude: Decimal = Decimal("0.0000000")
    phone: str = ""
    cnpj: str = ""
    is_primary: bool = False
    is_active: bool = True


class StoreListResponse(StrictModel):
    """Represent the store list payload."""

    items: list[StoreResponse]
