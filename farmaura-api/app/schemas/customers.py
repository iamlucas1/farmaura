"""
farmaura-api/app/schemas/customers.py

Customer schemas for Farmaura.

Responsibilities:
- define customer profile transport contracts;
- keep subject-derived profile responses explicit;
- prepare the customer API surface for future expansion;

Observations:
- profile data is intentionally minimal in this bootstrap;
- richer customer fields should remain tenant-scoped;
"""

from uuid import UUID

from pydantic import Field

from app.domain.enums import AccessScope, UserRole
from app.schemas.common import StrictModel


# ============================================================================
# CUSTOMER SCHEMAS
# ============================================================================


class CustomerProfileResponse(StrictModel):
    """Represent a basic customer profile."""

    user_id: UUID
    tenant_id: UUID
    role: UserRole
    access_scope: AccessScope
    full_name: str = ""
    email: str = ""
    phone: str = ""
    cpf: str = ""
    birth_date: str = ""
    gender: str = ""
    avatar_url: str = ""
    two_factor_enabled: bool = False
    member_since_label: str = ""


class CustomerAvatarUpdateRequest(StrictModel):
    """Validate a customer avatar update payload."""

    avatar_url: str = Field(default="", max_length=600_000)


class CustomerProfileUpdateRequest(StrictModel):
    """Validate a customer profile update payload."""

    full_name: str = Field(min_length=1, max_length=255)
    cpf: str = Field(min_length=11, max_length=14)
    phone: str = Field(default="", max_length=32)
    birth_date: str = Field(default="", max_length=10)
    gender: str = Field(default="", max_length=40)


# ============================================================================
# CUSTOMER ADDRESS SCHEMAS
# ============================================================================


class CustomerAddressResponse(StrictModel):
    """Represent one reusable customer address."""

    id: UUID
    label: str = "Casa"
    postal_code: str = ""
    street_line: str = ""
    district: str = ""
    city: str = ""
    state_code: str = ""
    complement: str = ""
    reference_note: str = ""
    recipient_name: str = ""
    recipient_phone: str = ""
    is_primary: bool = False


class CustomerAddressUpsertRequest(StrictModel):
    """Validate a customer address create or update payload."""

    label: str = Field(default="Casa", max_length=60)
    postal_code: str = Field(default="", max_length=12)
    street_line: str = Field(min_length=1, max_length=255)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state_code: str = Field(default="", max_length=2)
    complement: str = Field(default="", max_length=120)
    reference_note: str = Field(default="", max_length=255)
    recipient_name: str = Field(default="", max_length=255)
    recipient_phone: str = Field(default="", max_length=32)
    is_primary: bool = False


# ============================================================================
# CUSTOMER PAYMENT METHOD SCHEMAS
# ============================================================================


class CustomerPaymentMethodResponse(StrictModel):
    """Represent one tokenized customer payment method."""

    id: UUID
    provider_name: str = ""
    brand_name: str = "Cartão"
    last_four_digits: str = "0000"
    holder_name: str = ""
    expiration_month: str = "00"
    expiration_year: str = "0000"
    is_primary: bool = False


class CustomerPaymentMethodCreateRequest(StrictModel):
    """Validate a tokenized payment method registration payload.

    Only non-sensitive, already-tokenized card metadata is accepted here.
    No raw card number or security code field exists on this contract, and
    none should ever be added — that data must never reach this backend.
    """

    provider_name: str = Field(min_length=1, max_length=80)
    provider_token: str = Field(min_length=1, max_length=255)
    brand_name: str = Field(default="Cartão", max_length=40)
    last_four_digits: str = Field(pattern=r"^\d{4}$")
    holder_name: str = Field(default="", max_length=255)
    expiration_month: str = Field(pattern=r"^(0[1-9]|1[0-2])$")
    expiration_year: str = Field(pattern=r"^\d{4}$")
    is_primary: bool = False


class CustomerPaymentMethodUpdateRequest(StrictModel):
    """Validate a payment method primary-flag update payload."""

    is_primary: bool = True


# ============================================================================
# CART SCHEMAS
# ============================================================================


class CartItemResponse(StrictModel):
    """Represent one persisted cart line."""

    product_ref: str
    quantity: int = 1
    is_subscription: bool = False


class CartItemUpsertRequest(StrictModel):
    """Validate a cart line create or update payload."""

    quantity: int = Field(default=1, ge=1, le=99)
    is_subscription: bool = False
