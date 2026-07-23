"""
farmaura-api/app/schemas/purchase_quote.py

Purchase quote schemas for Farmaura.

Responsibilities:
- define purchase quote (orçamento) list/detail/create/update contracts;
- define the AI import preview/confirm contracts used to turn a supplier
  document (PDF/image/XLSX/DOCX) into a reviewable, then persisted, quote;

Observations:
- quotes are never turned into sellable inventory by these schemas — product_id
  on an item is an optional cross-reference only;
- quote_date is always a required, explicit date, independent from upload time.
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel

PAYMENT_METHOD_PATTERN = (
    "^(pix|boleto_avista|boleto_prazo|cartao_credito|cartao_debito|"
    "consignado|dinheiro|transferencia|outro)$"
)
QUOTE_STATUS_PATTERN = "^(draft|confirmed|archived)$"
FREIGHT_TYPE_PATTERN = "^(|FOB|CIF)$"


# ============================================================================
# PAYMENT TERM SCHEMAS
# ============================================================================


class PurchaseQuotePaymentTermRequest(StrictModel):
    """Validate one payment method/condition offered on a quote."""

    method: str = Field(pattern=PAYMENT_METHOD_PATTERN)
    discount_percent: Decimal | None = Field(default=None, ge=Decimal("0.00"), le=Decimal("100.00"))
    surcharge_percent: Decimal | None = Field(
        default=None, ge=Decimal("0.00"), le=Decimal("100.00")
    )
    installment_count: int | None = Field(default=None, ge=1)
    days_to_pay: int | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=500)


class PurchaseQuotePaymentTermResponse(PurchaseQuotePaymentTermRequest):
    """Represent one persisted payment term."""

    id: str


# ============================================================================
# ITEM SCHEMAS
# ============================================================================


class PurchaseQuoteItemRequest(StrictModel):
    """Validate one quoted product line."""

    product_id: str = Field(default="", max_length=36)
    description: str = Field(min_length=1, max_length=255)
    brand_name: str = Field(default="", max_length=255)
    sku_snapshot: str = Field(default="", max_length=64)
    ean_code_snapshot: str = Field(default="", max_length=32)
    unit: str = Field(default="un", max_length=16)
    quantity_reference: Decimal | None = Field(default=None, ge=Decimal("0"))
    unit_price: Decimal = Field(ge=Decimal("0.00"))
    is_comodato: bool = False
    comodato_notes: str = Field(default="", max_length=1000)
    notes: str = Field(default="", max_length=500)


class PurchaseQuoteItemResponse(PurchaseQuoteItemRequest):
    """Represent one persisted quoted product line."""

    id: str


# ============================================================================
# QUOTE HEADER SCHEMAS
# ============================================================================


class PurchaseQuoteResponse(StrictModel):
    """Represent a full purchase quote, header plus payment terms and items."""

    id: str
    supplier_id: str
    supplier_name_snapshot: str
    supplier_document_snapshot: str
    quote_date: date
    valid_until: date | None
    status: str
    freight_type: str
    freight_cost: Decimal | None
    delivery_time_days: int | None
    source_provider: str
    source_model: str
    file_name: str
    has_file: bool
    notes: str
    created_at: datetime
    updated_at: datetime
    payment_terms: list[PurchaseQuotePaymentTermResponse]
    items: list[PurchaseQuoteItemResponse]


class PurchaseQuoteListResponse(StrictModel):
    """Represent a list of purchase quotes."""

    items: list[PurchaseQuoteResponse]


class PurchaseQuoteCreateRequest(StrictModel):
    """Validate a manually entered purchase quote."""

    supplier_id: str = Field(default="", max_length=36)
    supplier_name: str = Field(min_length=1, max_length=255)
    supplier_document: str = Field(default="", max_length=18)
    quote_date: date
    valid_until: date | None = None
    freight_type: str = Field(default="", pattern=FREIGHT_TYPE_PATTERN)
    freight_cost: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    delivery_time_days: int | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=1000)
    payment_terms: list[PurchaseQuotePaymentTermRequest] = Field(default_factory=list)
    items: list[PurchaseQuoteItemRequest] = Field(min_length=1)


class PurchaseQuoteUpdateRequest(PurchaseQuoteCreateRequest):
    """Validate an edit of an existing purchase quote (header, terms, and items are replaced)."""


class PurchaseQuoteStatusUpdateRequest(StrictModel):
    """Validate a purchase quote status transition."""

    status: str = Field(pattern=QUOTE_STATUS_PATTERN)


# ============================================================================
# AI IMPORT SCHEMAS
# ============================================================================


class PurchaseQuoteProductCandidateResponse(StrictModel):
    """Represent a candidate catalog product match for a quoted line, for reference only."""

    id: str
    name: str
    brand_name: str
    sku: str
    ean_code: str


class PurchaseQuoteImportPreviewLineResponse(StrictModel):
    """Represent one extracted quote line ready for review."""

    line_id: str
    description: str
    brand_name: str
    sku: str
    ean_code: str
    unit: str
    quantity_reference: Decimal | None
    unit_price: Decimal
    is_comodato: bool
    comodato_notes: str
    match_candidates: list[PurchaseQuoteProductCandidateResponse]


class PurchaseQuoteImportPreviewPaymentTermResponse(StrictModel):
    """Represent one extracted payment term suggestion."""

    method: str
    discount_percent: Decimal | None
    surcharge_percent: Decimal | None
    installment_count: int | None
    days_to_pay: int | None
    notes: str


class PurchaseQuoteImportPreviewHeaderResponse(StrictModel):
    """Represent extracted quote header data."""

    supplier_name: str
    supplier_document: str
    matched_supplier_id: str
    quote_date: str
    valid_until: str
    freight_type: str
    freight_cost: Decimal | None
    delivery_time_days: int | None
    notes: str


class PurchaseQuoteImportPreviewResponse(StrictModel):
    """Represent the extracted quote review payload."""

    provider: str
    model: str
    source_file_name: str
    header: PurchaseQuoteImportPreviewHeaderResponse
    payment_terms: list[PurchaseQuoteImportPreviewPaymentTermResponse]
    items: list[PurchaseQuoteImportPreviewLineResponse]


class PurchaseQuoteImportConfirmRequest(PurchaseQuoteCreateRequest):
    """Validate the human-reviewed payload persisted after AI extraction."""

    source_provider: str = Field(default="", max_length=24)
    source_model: str = Field(default="", max_length=64)


# ============================================================================
# COMPARISON SCHEMAS
# ============================================================================


class PurchaseQuoteCompareEntryResponse(StrictModel):
    """Represent one supplier's offer for a compared product."""

    quote_id: str
    quote_item_id: str
    supplier_id: str
    supplier_name: str
    quote_date: date
    valid_until: date | None
    product_id: str
    item_description: str
    brand_name: str
    unit: str
    quantity_reference: Decimal | None
    unit_price: Decimal
    best_effective_price: Decimal
    best_payment_method: str
    best_payment_discount_percent: Decimal
    payment_methods: list[str]
    freight_type: str
    freight_cost: Decimal | None
    delivery_time_days: int | None
    is_comodato: bool
    comodato_notes: str


class PurchaseQuoteCompareResponse(StrictModel):
    """Represent the side-by-side comparison for one searched product."""

    query: str
    entries: list[PurchaseQuoteCompareEntryResponse]
