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

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.domain.enums import AccessScope, UserRole
from app.domain.profile_nudge import ProfileNudgeField
from app.schemas.common import StrictModel


# ============================================================================
# CUSTOMER SCHEMAS
# ============================================================================


class ProfileNudgeResponse(StrictModel):
    """Server-side verdict on the "complete your profile" popup: show it, and which fields are still missing."""

    should_show: bool = False
    missing_fields: list[ProfileNudgeField] = Field(default_factory=list)


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
    marital_status: str = ""
    children_count: int | None = None
    # Birth years, not ages — see Customer.children_birth_years; the frontend derives each
    # child's current age from these so it advances every year without re-entry.
    children_birth_years: list[int] = Field(default_factory=list)
    # Parallel to children_birth_years by index (same slot = same child).
    children_names: list[str] = Field(default_factory=list)
    avatar_url: str = ""
    two_factor_enabled: bool = False
    member_since_label: str = ""
    marketing_program_preferences: list[dict[str, bool | str]] = Field(default_factory=list)
    communication_channel_preferences: list[dict[str, bool | str]] = Field(default_factory=list)
    profile_nudge: ProfileNudgeResponse = Field(default_factory=ProfileNudgeResponse)


class CustomerAvatarUpdateRequest(StrictModel):
    """Validate a customer avatar update payload."""

    avatar_url: str = Field(default="", max_length=600_000)


class CustomerProfileUpdateRequest(StrictModel):
    """Validate a customer profile update payload."""

    full_name: str = Field(min_length=1, max_length=255)
    cpf: str = Field(default="", max_length=14)
    phone: str = Field(default="", max_length=32)
    birth_date: str = Field(default="", max_length=10)
    gender: str = Field(default="", max_length=40)
    marital_status: str = Field(default="", max_length=16)
    children_count: int | None = Field(default=None, ge=0, le=20)
    children_birth_years: list[Annotated[int, Field(ge=1900, le=2100)]] = Field(default_factory=list, max_length=20)
    children_names: list[Annotated[str, Field(max_length=160)]] = Field(default_factory=list, max_length=20)
    marketing_program_preferences: list[dict[str, bool | str]] = Field(default_factory=list)
    communication_channel_preferences: list[dict[str, bool | str]] = Field(default_factory=list)


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
    # Set only once the customer confirmed a pin on the marketplace map picker — None for an
    # address that was only ever typed (or created before this feature existed).
    latitude: Decimal | None = None
    longitude: Decimal | None = None


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
    latitude: Decimal | None = Field(default=None, ge=Decimal("-90"), le=Decimal("90"))
    longitude: Decimal | None = Field(default=None, ge=Decimal("-180"), le=Decimal("180"))


class CustomerAddressSearchResult(StrictModel):
    """Represent one free-text address search match, for the marketplace map picker."""

    label: str = ""
    district: str = ""
    city: str = ""
    state_code: str = ""
    kind: str = "other"
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class CustomerAddressSearchResponse(StrictModel):
    """Represent the results of one free-text address search."""

    results: list[CustomerAddressSearchResult] = Field(default_factory=list)


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


class CardTokenizeRequest(StrictModel):
    """Validate one raw card capture for immediate provider tokenization.

    This is the single, intentional entry point where raw card data is allowed
    to reach the backend. The fields here exist only in memory for the duration
    of the tokenize request to Asaas and are never persisted, logged, or echoed
    back — only the resulting provider token/brand/last-4 survive, through the
    existing CustomerPaymentMethodResponse contract.
    """

    holder_name: str = Field(min_length=1, max_length=255)
    number: str = Field(pattern=r"^\d{12,19}$")
    cvv: str = Field(pattern=r"^\d{3,4}$")
    expiration_month: str = Field(pattern=r"^(0[1-9]|1[0-2])$")
    expiration_year: str = Field(pattern=r"^\d{4}$")
    is_primary: bool = False


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


# ============================================================================
# PRODUCT AVAILABILITY ALERT SCHEMAS
# ============================================================================


class ProductAvailabilityAlertResponse(StrictModel):
    """Represent one back-in-stock notification request."""

    product_ref: str
    product_name: str = ""
    notified: bool = False


class ProductAvailabilityAlertCreateRequest(StrictModel):
    """Validate a back-in-stock notification request payload."""

    product_name: str = Field(default="", max_length=255)


class CustomerPrescriptionStatusResponse(StrictModel):
    """Represent the customer's most recent pre-order prescription submission.

    Gates the marketplace checkout payment step: 'none' means the customer hasn't sent one yet
    for the prescription item(s) in their cart, 'pending' means it's awaiting pharmacist review,
    'approved' clears payment, 'rejected' carries the pharmacist's reason for another attempt.
    """

    status: str = "none"
    prescription_id: str = ""
    rejection_reason: str = ""
    submitted_at_label: str = ""


class CustomerCashbackLedgerEntry(StrictModel):
    """Represent one movement in the customer's cashback ledger."""

    id: str
    type: str
    status: str
    amount: Decimal
    order_id: str = ""
    reference: str = ""
    notes: str = ""
    created_at_label: str = ""


class CustomerCashbackSummaryResponse(StrictModel):
    """Represent the customer's cashback wallet and its recent ledger."""

    available_balance: Decimal = Decimal("0.00")
    pending_balance: Decimal = Decimal("0.00")
    lifetime_earned_total: Decimal = Decimal("0.00")
    redeemed_total: Decimal = Decimal("0.00")
    redeem_max_percent: Decimal = Decimal("25.00")
    entries: list[CustomerCashbackLedgerEntry] = Field(default_factory=list)


class CustomerAnniversaryOfferResponse(StrictModel):
    """Represent one birthday/customer-anniversary discount the customer may claim.

    Only listed at all when the admin has that kind enabled (app/schemas/portal.py's
    birthday_discount_enabled / customer_anniversary_discount_enabled) — a disabled kind never
    appears, rather than showing up greyed out.
    """

    kind: str
    label: str
    percent: Decimal
    month_label: str = ""
    eligible: bool = False
    already_claimed: bool = False
    code: str = ""
    valid_until_label: str = ""


class CustomerAnniversaryOffersResponse(StrictModel):
    """Represent every anniversary discount currently offered to the customer."""

    offers: list[CustomerAnniversaryOfferResponse] = Field(default_factory=list)


class CustomerAnniversaryClaimRequest(StrictModel):
    """Validate a request to claim one anniversary discount coupon."""

    kind: str = Field(max_length=24)
