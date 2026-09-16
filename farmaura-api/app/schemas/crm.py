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
    """Validate a walk-in customer registration payload from the internal console (PDV).

    `email` is mandatory — every customer registered here gets marketplace login access
    provisioned automatically (see CrmService.create_customer), so an e-mail to deliver the
    first-access credentials to is a hard requirement, not just a nice-to-have field.
    """

    full_name: str = Field(default="", max_length=255)
    doc: str = Field(default="", max_length=14)
    phone: str = Field(default="", max_length=32)
    email: str = Field(min_length=5, max_length=320)


# ============================================================================
# CRM RESPONSE SCHEMAS
# ============================================================================


class CrmTopProductResponse(StrictModel):
    """Represent one top product entry.

    category and continuous_use let the console show a rounded picture of what the customer
    buys (spread across Medicamentos/Bem-estar/Perfumaria/Fitoterápicos/etc. and whether it's a
    recurring, continuous-use item) instead of just the raw purchase-count ranking, which tends
    to over-represent whichever single product the customer happens to buy most often.
    """

    name: str
    quantity: int
    category: str = ""
    continuous_use: bool = False


class CrmCategoryMixResponse(StrictModel):
    """Represent one category mix slice."""

    name: str
    value: int


class CrmChildResponse(StrictModel):
    """Represent one child recorded on a customer's profile (marketplace account form)."""

    name: str
    # Derived at read time from the stored birth year (current_year - birth_year), same
    # principle as the marketplace's own childAgeFromBirthYear — never a frozen number.
    age: int | None = None


class CrmCustomerResponse(StrictModel):
    """Represent one CRM customer profile."""

    id: str
    name: str
    email: str
    phone: str
    doc: str
    birth_date: str
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
    children: list[CrmChildResponse]


class CrmCustomerListResponse(StrictModel):
    """Represent the CRM customer list payload."""

    items: list[CrmCustomerResponse]


# ============================================================================
# CRM PURCHASE INSIGHTS SCHEMAS
# ============================================================================


class CrmTopProductInsightResponse(StrictModel):
    """Represent one product a customer purchases often."""

    product_key: str
    name: str
    brand: str
    total_quantity: int
    last_price: Decimal


class CrmRecurrenceCandidateResponse(StrictModel):
    """Represent one product worth suggesting as a recurring subscription.

    frequency_days is the customer's own detected purchase cadence (interval_detected
    True), or a clinical default for a continuous-use medication with too little
    purchase history yet (interval_detected False) — never a fixed calendar bucket.
    """

    product_key: str
    name: str
    brand: str
    frequency_days: int
    occurrences: int
    interval_detected: bool
    continuous_use: bool
    avg_quantity: int
    last_unit_price: Decimal
    suggested_discount_percent: Decimal
    savings_amount: Decimal


class CrmPurchaseInsightsResponse(StrictModel):
    """Represent the purchase-insights payload for one customer."""

    top_products: list[CrmTopProductInsightResponse]
    recurrence_candidates: list[CrmRecurrenceCandidateResponse]


# ============================================================================
# CRM PAYMENT METHOD SCHEMAS
# ============================================================================


class CrmPaymentMethodResponse(StrictModel):
    """Represent one saved customer payment method for the internal console."""

    id: str
    brand_name: str
    last_four_digits: str
    holder_name: str
    is_primary: bool


class CrmPaymentMethodListResponse(StrictModel):
    """Represent the saved payment methods payload for one customer."""

    items: list[CrmPaymentMethodResponse]


class CrmAddressResponse(StrictModel):
    """Represent one saved customer address for the internal console."""

    id: str
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


class CrmAddressListResponse(StrictModel):
    """Represent the saved addresses payload for one customer."""

    items: list[CrmAddressResponse]


class CrmAddressCreateRequest(StrictModel):
    """Validate a new saved-address payload captured at the point of sale."""

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

