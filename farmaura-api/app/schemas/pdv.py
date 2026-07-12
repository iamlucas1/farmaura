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


class PdvCustomerLiteRequest(StrictModel):
    """Validate a lightweight PDV customer snapshot."""

    id: str | None = None
    name: str = Field(default="", max_length=255)
    doc: str = Field(default="", max_length=20)
    phone: str = Field(default="", max_length=32)
    avatar: str = Field(default="", max_length=8)
    recurring: bool = False
    cashback: Decimal = Field(default=Decimal("0.00"), ge=0)


class PdvQueueCreateRequest(StrictModel):
    """Validate a pharmacist handoff request to the cashier queue."""

    customer: PdvCustomerLiteRequest | None = None
    items: list[PdvOrderItemRequest] = Field(min_length=1, max_length=100)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    notes: str = Field(default="", max_length=255)


class PdvSaleCreateRequest(StrictModel):
    """Validate a PDV sale finalization request."""

    payment_method: str = Field(pattern="^(cash|pix|debit|credit)$")
    include_cpf_on_invoice: bool = True
    cashback_applied: Decimal = Field(default=Decimal("0.00"), ge=0)
    cashback_earned: Decimal = Field(default=Decimal("0.00"), ge=0)
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
    customer: PdvCustomerLiteResponse | None = None
    items: list[PdvLineResponse]
    fiscal_document: FiscalDocumentResponse | None = None


class PdvQueueResponse(StrictModel):
    """Represent the cashier queue payload."""

    items: list[PdvOrderResponse]


class PdvSaleResponse(StrictModel):
    """Represent one finalized PDV sale."""

    id: str
    sale_code: str
    payment_method: str
    total: Decimal
    completed_at: str
    customer: PdvCustomerLiteResponse | None = None
    items: list[PdvLineResponse]
    fiscal_document: FiscalDocumentResponse | None = None


class PdvSaleListResponse(StrictModel):
    """Represent the finalized PDV sales payload."""

    items: list[PdvSaleResponse]

