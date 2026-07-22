"""
farmaura-api/app/schemas/inventory_lot.py

Inventory stock lot schemas for Farmaura.

Responsibilities:
- define per-batch, per-location stock balance and movement contracts;
- validate goods-receipt, transfer, and adjustment payloads for stock lots;
- shape the product traceability/audit lookup response for the admin console;

Observations:
- prices stay out of this module on purpose — pricing lives in the Precificador flow;
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# STOCK LOT SCHEMAS
# ============================================================================


class StockLotResponse(StrictModel):
    """Represent the current balance of one batch at one storage location."""

    id: str
    store_id: str
    inventory_item_id: str
    location_id: str
    location_code: str
    location_name: str
    location_type: str
    supplier_id: str
    supplier_name: str
    batch_code: str
    expiry_date: date | None
    quantity: int
    status: str
    unit_cost_snapshot: Decimal
    received_at: datetime | None
    reference_code: str
    created_at: datetime
    updated_at: datetime


class StockLotListResponse(StrictModel):
    """Represent a stock lot list response."""

    items: list[StockLotResponse]


class LotReceiptRequest(StrictModel):
    """Validate a goods-receipt request for one batch at one location."""

    inventory_item_id: str = Field(min_length=1, max_length=36)
    location_id: str = Field(min_length=1, max_length=36)
    supplier_id: str = Field(default="", max_length=36)
    batch_code: str = Field(min_length=1, max_length=64)
    expiry_date: date | None = None
    quantity: int = Field(gt=0)
    unit_cost_snapshot: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    reference_code: str = Field(default="", max_length=64)
    note: str = Field(default="", max_length=500)


class LotTransferRequest(StrictModel):
    """Validate a transfer request moving part of a lot to another location."""

    to_location_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(gt=0)
    reason: str = Field(default="Transferência interna", max_length=120)
    note: str = Field(default="", max_length=500)
    reference_code: str = Field(default="", max_length=64)


class LotAdjustmentRequest(StrictModel):
    """Validate a manual adjustment request for one stock lot (loss, breakage, count fix)."""

    quantity_delta: int
    reason: str = Field(min_length=2, max_length=120)
    note: str = Field(default="", max_length=500)


# ============================================================================
# TRACEABILITY SEARCH SCHEMAS
# ============================================================================


class TraceCandidateResponse(StrictModel):
    """Represent one candidate item matched by the traceability search."""

    id: str
    sku: str
    name: str
    brand_name: str
    ean_code: str
    medication_class_name: str
    controlled_category: str
    quantity: int


class TraceCandidateListResponse(StrictModel):
    """Represent the traceability search result list."""

    items: list[TraceCandidateResponse]


# ============================================================================
# LOT MOVEMENT / TRACEABILITY SCHEMAS
# ============================================================================


class LotMovementResponse(StrictModel):
    """Represent one fine-grained stock lot movement event."""

    id: str
    inventory_item_id: str
    stock_lot_id: str
    performed_by_user_id: str
    performed_by_user_name: str
    movement_type: str
    quantity_delta: int
    quantity_before: int
    resulting_quantity: int
    from_location_code: str
    to_location_code: str
    batch_code: str
    expiry_date: date | None
    reason: str
    note: str
    reference_code: str
    source_type: str
    source_id: str
    created_at: datetime


class ItemTraceSummaryResponse(StrictModel):
    """Represent the item identity shown at the top of the traceability lookup."""

    id: str
    sku: str
    name: str
    brand_name: str
    ean_code: str
    medication_class_name: str
    controlled_category: str
    total_available_quantity: int


class ItemTraceResponse(StrictModel):
    """Represent the full traceability payload for one item."""

    item: ItemTraceSummaryResponse
    lots: list[StockLotResponse]
    movements: list[LotMovementResponse]
