"""
farmaura-api/app/schemas/pdv.py

PDV schemas for Farmaura.

Responsibilities:
- define operational point-of-sale contracts;
- validate pharmacist-to-cashier handoff payloads;
- expose queue and sale projections for the internal console;

Observations:
- totals are recomputed on the backend from inventory snapshots;
- fiscal metadata remains lightweight for the current console integration;
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel
from app.schemas.fiscal import FiscalDocumentResponse


# ============================================================================
# PDV INPUT SCHEMAS
# ============================================================================


class PdvOrderItemRequest(StrictModel):
    """Validate one PDV order line request."""

    id: str
    qty: int = Field(ge=1, le=100)
    location_id: str = Field(default="", max_length=36)


class PdvCustomerLiteRequest(StrictModel):
    """Validate a lightweight PDV customer snapshot."""

    id: str | None = None
    name: str = Field(default="", max_length=255)
    doc: str = Field(default="", max_length=20)
    phone: str = Field(default="", max_length=32)
    avatar: str = Field(default="", max_length=8)
    recurring: bool = False
    cashback: Decimal = Field(default=Decimal("0.00"), ge=0)


class PdvDeliveryRequest(StrictModel):
    """Validate balcão fulfillment input — pickup in store or delivery to the customer's address."""

    fulfillment_type: str = Field(default="pickup", pattern="^(pickup|delivery)$")
    recipient_name: str = Field(default="", max_length=255)
    recipient_phone: str = Field(default="", max_length=32)
    postal_code: str = Field(default="", max_length=12)
    address_line: str = Field(default="", max_length=255)
    address_number: str = Field(default="", max_length=32)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state_code: str = Field(default="", max_length=2)
    reference_note: str = Field(default="", max_length=500)


class PdvQueueCreateRequest(StrictModel):
    """Validate a pharmacist handoff request to the cashier queue."""

    customer: PdvCustomerLiteRequest | None = None
    items: list[PdvOrderItemRequest] = Field(min_length=1, max_length=100)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    notes: str = Field(default="", max_length=255)
    delivery: PdvDeliveryRequest | None = None
    draft_id: str | None = None


class PdvDraftCartLineRequest(StrictModel):
    """Validate one PDV draft cart line snapshot (denormalized so recovery never needs a re-fetch)."""

    id: str
    qty: int = Field(ge=1, le=100)
    name: str = Field(default="", max_length=255)
    brand: str = Field(default="", max_length=255)
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    loc: str = Field(default="", max_length=64)
    controlled: bool = False
    store_id: str = Field(default="", max_length=36)
    store_name: str = Field(default="", max_length=255)
    location_id: str = Field(default="", max_length=36)
    location_code: str = Field(default="", max_length=64)


class PdvDraftSessionUpsertRequest(StrictModel):
    """Validate an autosave snapshot of one in-progress PDV atendimento."""

    id: str | None = None
    customer: PdvCustomerLiteRequest | None = None
    items: list[PdvDraftCartLineRequest] = Field(default_factory=list, max_length=100)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    cash_wanted: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_method: str = Field(default="pix", max_length=16)
    include_cpf_on_invoice: bool = True
    delivery: PdvDeliveryRequest | None = None
    started_at_ms: int | None = None
    operator: str = Field(default="pharm", pattern="^(pharm|caixa)$")


class PdvDiscountLimitRequest(StrictModel):
    """Validate a discount-limit preview request for the cart being built."""

    items: list[PdvOrderItemRequest] = Field(min_length=1, max_length=100)
    customer_id: str | None = None


class PdvDiscountLimitResponse(StrictModel):
    """Return the maximum discount percent the current cart can absorb without breaching margin protection."""

    max_discount_percent: Decimal


class PdvSaleCreateRequest(StrictModel):
    """Validate a PDV sale finalization request."""

    payment_method: str = Field(pattern="^(cash|pix|debit|credit)$")
    include_cpf_on_invoice: bool = True
    cashback_applied: Decimal = Field(default=Decimal("0.00"), ge=0)
    recipient_email: str = Field(default="", max_length=320)


# ============================================================================
# PDV RESPONSE SCHEMAS
# ============================================================================


class PdvLineResponse(StrictModel):
    """Represent one PDV order or sale line."""

    id: str
    inventory_item_id: str | None = None
    name: str
    brand: str
    loc: str
    location_id: str = ""
    qty: int
    unit_price: Decimal
    line_total: Decimal
    controlled: bool = False


class PdvCustomerLiteResponse(StrictModel):
    """Represent a lightweight customer projection for PDV."""

    id: str | None = None
    name: str
    doc: str
    phone: str = ""
    avatar: str = ""
    recurring: bool = False
    cashback: Decimal = Decimal("0.00")


class PdvOrderResponse(StrictModel):
    """Represent one PDV queue order."""

    id: str
    sent_at: str
    sent_by: str
    status: str
    discount: Decimal
    subtotal: Decimal
    total: Decimal
    has_controlled: bool
    fulfillment_type: str = "pickup"
    delivery_fee: Decimal = Decimal("0.00")
    customer: PdvCustomerLiteResponse | None = None
    items: list[PdvLineResponse]
    fiscal_document: FiscalDocumentResponse | None = None
    is_reservation: bool = False


class PdvQueueResponse(StrictModel):
    """Represent the cashier queue payload."""

    items: list[PdvOrderResponse]


class PdvSaleResponse(StrictModel):
    """Represent one finalized PDV sale."""

    id: str
    sale_code: str
    payment_method: str
    total: Decimal
    cashback_applied: Decimal = Decimal("0.00")
    cashback_earned: Decimal = Decimal("0.00")
    completed_at: str
    fulfillment_type: str = "pickup"
    delivery_fee: Decimal = Decimal("0.00")
    customer: PdvCustomerLiteResponse | None = None
    items: list[PdvLineResponse]
    fiscal_document: FiscalDocumentResponse | None = None


class PdvSaleListResponse(StrictModel):
    """Represent the finalized PDV sales payload."""

    items: list[PdvSaleResponse]


class PdvDraftCartLineResponse(PdvDraftCartLineRequest):
    """Represent one PDV draft cart line snapshot."""


class PdvDraftSessionResponse(StrictModel):
    """Represent one in-progress PDV atendimento draft, recoverable by the pharmacist who owns it."""

    id: str
    customer: PdvCustomerLiteResponse | None = None
    items: list[PdvDraftCartLineResponse] = Field(default_factory=list)
    discount: Decimal = Decimal("0.00")
    cash_wanted: Decimal = Decimal("0.00")
    payment_method: str = "pix"
    include_cpf_on_invoice: bool = True
    delivery: PdvDeliveryRequest | None = None
    started_at_ms: int | None = None
    operator: str = "pharm"
    updated_at_label: str = ""


class PdvDraftSessionListResponse(StrictModel):
    """Represent the pharmacist's own in-progress PDV atendimentos."""

    items: list[PdvDraftSessionResponse]


# ============================================================================
# PDV PRODUCT SEARCH SCHEMAS
# ============================================================================


class PdvProductComponentResponse(StrictModel):
    """Represent one store-level stock component of a searched product."""

    inventory_item_id: str
    store_id: str
    store_name: str
    quantity: int
    storage_location: str
    unit_price: Decimal
    is_controlled: bool


class PdvProductSearchResultResponse(StrictModel):
    """Represent one logical product grouped across store stock components."""

    id: str
    name: str
    brand: str
    ean: str
    total_stock: int
    is_controlled: bool
    components: list[PdvProductComponentResponse]
    own_store_component: PdvProductComponentResponse | None = None


class PdvProductSearchResponse(StrictModel):
    """Represent the PDV product search payload."""

    items: list[PdvProductSearchResultResponse]


class PdvItemLocationResponse(StrictModel):
    """Represent one storage location with available stock for a PDV product pick."""

    location_id: str
    location_code: str
    location_name: str
    location_type: str
    quantity: int


class PdvItemLocationListResponse(StrictModel):
    """Represent the storage locations an operator can pick this item from."""

    items: list[PdvItemLocationResponse]


# ============================================================================
# PDV CROSS-STORE RESERVATION SCHEMAS
# ============================================================================


class PdvReservationCreateRequest(StrictModel):
    """Validate a request to reserve stock held at another store for customer pickup there."""

    inventory_item_id: str
    store_id: str
    quantity: int = Field(default=1, ge=1, le=100)
    customer: PdvCustomerLiteRequest
    notes: str = Field(default="", max_length=255)


class PdvReservationResponse(StrictModel):
    """Represent a confirmed cross-store reservation."""

    order_id: str
    order_code: str
    store_id: str
    store_name: str
    expires_at_label: str
    customer: PdvCustomerLiteResponse | None = None


# ============================================================================
# PDV PRESCRIPTION VALIDATION SCHEMAS
# ============================================================================


class PdvPrescriptionCreateRequest(StrictModel):
    """Validate a request to record or request prescription validation for one controlled item."""

    customer_id: str | None = None
    inventory_item_id: str
    medication_name: str = Field(default="", max_length=255)
    delivery_method: str = Field(pattern="^(physical|digital)$")
    digital_reference_url: str = Field(default="", max_length=500)
    decision: str | None = Field(default=None, pattern="^(approved|rejected)$")
    pharmacist_notes: str = Field(default="", max_length=2000)
    rejection_reason: str = Field(default="", max_length=2000)


class PdvPrescriptionResponse(StrictModel):
    """Represent one prescription validation record created from the PDV."""

    id: str
    inventory_item_id: str
    status: str
    delivery_method: str
    digital_reference_url: str = ""
    requires_retention: bool = False


class PdvPrescriptionCartStatusResponse(StrictModel):
    """Represent one cart line's current prescription validation state."""

    inventory_item_id: str
    prescription_id: str | None = None
    status: str = "missing"
    delivery_method: str = ""


class PdvPrescriptionStatusResponse(StrictModel):
    """Represent the prescription validation state for every controlled line in the current cart."""

    items: list[PdvPrescriptionCartStatusResponse]


# ============================================================================
# PDV RECURRENCE CONFIRMATION SCHEMAS
# ============================================================================


class PdvRecurrenceConfirmRequest(StrictModel):
    """Validate a pharmacist's recurrence confirmation for an identified customer.

    Not tied to any PdvOrder — the pharmacist confirms this while still building
    the cart, before an order is ever sent to the cashier queue.
    """

    customer_id: str
    inventory_item_id: str
    quantity: int = Field(ge=1, le=100)
    frequency_days: int = Field(default=30, ge=1, le=365)
    payment_method_id: str


class PdvRecurrenceConfirmResponse(StrictModel):
    """Represent the result of confirming and charging a recurrence."""

    subscription_id: str
    discount_percent: Decimal
    charge_status: str
    total_charged: Decimal

