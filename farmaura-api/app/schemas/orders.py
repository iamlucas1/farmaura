"""
farmaura-api/app/schemas/orders.py

Order schemas for Farmaura.

Responsibilities:
- define marketplace checkout and order-history contracts;
- keep order validation and operational projections explicit;
- support customer checkout and pharmacist workflow state transitions;

Observations:
- marketplace totals remain server-authoritative;
- internal responses are shaped to feed the operations console directly.
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel
from app.schemas.fiscal import FiscalDocumentResponse


# ============================================================================
# MARKETPLACE ORDER SCHEMAS
# ============================================================================


class CheckoutOrderItemRequest(StrictModel):
    """Validate one marketplace checkout line."""

    product_id: str
    quantity: int = Field(ge=1, le=100)


class CheckoutDeliveryRequest(StrictModel):
    """Validate marketplace fulfillment input."""

    method: str = Field(pattern="^(express|standard|pickup)$")
    recipient_name: str = Field(default="", max_length=255)
    recipient_phone: str = Field(default="", max_length=32)
    postal_code: str = Field(default="", max_length=12)
    address_line: str = Field(default="", max_length=255)
    address_number: str = Field(default="", max_length=32)
    address_complement: str = Field(default="", max_length=120)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state_code: str = Field(default="", max_length=2)
    reference_note: str = Field(default="", max_length=500)
    store_id: str = Field(default="", max_length=64)
    store_name: str = Field(default="", max_length=255)


class CheckoutPaymentRequest(StrictModel):
    """Validate the selected payment method."""

    method: str = Field(pattern="^(pix|credit_card|debit_card)$")
    payment_method_id: str = Field(default="", max_length=64)


class CheckoutPrescriptionRequest(StrictModel):
    """Validate the prescription submission state."""

    sent: bool = False


class CheckoutOrderRequest(StrictModel):
    """Validate a marketplace checkout request."""

    channel: str = Field(default="app", max_length=24)
    items: list[CheckoutOrderItemRequest] = Field(min_length=1, max_length=50)
    coupon_code: str = Field(default="", max_length=64)
    coupon_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    coupon_amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    coupon_type: str = Field(default="", max_length=24)
    delivery: CheckoutDeliveryRequest
    payment: CheckoutPaymentRequest
    prescription: CheckoutPrescriptionRequest = CheckoutPrescriptionRequest()


class MarketplaceOrderItemResponse(StrictModel):
    """Represent one customer-facing order line."""

    product_id: str
    name: str
    brand: str
    qty: int
    unit_price: Decimal
    line_total: Decimal
    rx: bool


class MarketplaceOrderResponse(StrictModel):
    """Represent one marketplace order."""

    id: str
    code: str
    status: str
    fulfillment: str
    payment_method: str
    payment_status: str
    placed_at: str
    eta: str
    total_amount: Decimal
    subtotal_amount: Decimal
    delivery_fee_amount: Decimal
    discount_amount: Decimal
    address: str = ""
    store: str = ""
    pickup_code: str = ""
    rx_status: str = "none"
    items: list[MarketplaceOrderItemResponse]
    fiscal_document: FiscalDocumentResponse | None = None


class MarketplaceOrderListResponse(StrictModel):
    """Represent a marketplace order history payload."""

    revision: str = ""
    items: list[MarketplaceOrderResponse]


class MarketplaceOrderChangeResponse(StrictModel):
    """Represent a lightweight marketplace order sync response."""

    revision: str = ""
    has_changes: bool = False
    items: list[MarketplaceOrderResponse] = Field(default_factory=list)


class OrderItemRequest(StrictModel):
    """Validate an incoming marketplace draft item."""

    product_id: str
    quantity: int = Field(ge=1, le=100)
    unit_price: Decimal = Field(ge=0)


class OrderCreateRequest(StrictModel):
    """Validate a draft marketplace order creation request."""

    customer_id: str
    items: list[OrderItemRequest] = Field(min_length=1, max_length=50)


class OrderResponse(StrictModel):
    """Represent a conservative draft marketplace order response."""

    id: str
    customer_id: str
    status: str
    total_amount: Decimal


# ============================================================================
# INTERNAL ORDER SCHEMAS
# ============================================================================


class InternalOrderItemResponse(StrictModel):
    """Represent one order line for the internal console."""

    id: str
    name: str
    qty: int
    loc: str
    rx: bool


class InternalOrderResponse(StrictModel):
    """Represent one operational order card."""

    record_id: str
    id: str
    customer: str
    phone: str
    doc: str
    status: str
    fulfillment: str
    fulfillment_label: str = ""
    priority: str
    placed: str
    payment: str
    channel: str
    total: Decimal
    address: str = ""
    district: str = ""
    cep: str = ""
    store: str = ""
    pickup_code: str = ""
    pickup_code_required: bool = False
    note: str = ""
    rx: bool = False
    rx_status: str = "none"
    done_min: int | None = None
    lat: Decimal | None = None
    lng: Decimal | None = None
    dist: Decimal | None = None
    sla: int | None = None
    eta: str = ""
    items: list[InternalOrderItemResponse]
    fiscal_document: FiscalDocumentResponse | None = None


class InternalOrderBoardResponse(StrictModel):
    """Represent the internal order kanban payload."""

    revision: str = ""
    items: list[InternalOrderResponse]


class InternalOrderBoardChangeResponse(StrictModel):
    """Represent a lightweight board sync response."""

    revision: str = ""
    has_changes: bool = False
    items: list[InternalOrderResponse] = Field(default_factory=list)


class OrderAdvanceRequest(StrictModel):
    """Validate an internal order status transition request."""

    next_status: str = Field(pattern="^(separating|ready|dispatched)$")


class OrderItemLocationUpdateRequest(StrictModel):
    """Validate a picked item source-location change."""

    location_code: str = Field(min_length=1, max_length=64)


class PickupCodeConfirmRequest(StrictModel):
    """Validate a customer-provided pickup code."""

    code: str = Field(min_length=3, max_length=32)
