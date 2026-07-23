"""
farmaura-api/app/schemas/inventory.py

Inventory schemas for Farmaura.

Responsibilities:
- define inventory item, storage, and movement contracts;
- validate internal console payloads for stock workflows;
- keep inventory responses explicit and transport-safe;

Observations:
- prices remain decimal values because they are reused by marketplace pricing flows;
- stock mutations encode signed quantity deltas and audit-friendly metadata;
"""

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# INVENTORY STATUS
# ============================================================================


class InventoryStatusResponse(StrictModel):
    """Represent the inventory module readiness state."""

    status: str
    detail: str


# ============================================================================
# INVENTORY SUMMARY
# ============================================================================


class InventorySummaryResponse(StrictModel):
    """Represent inventory counters for the internal console."""

    total_items: int
    normal_stock_items: int
    attention_stock_items: int
    low_stock_items: int
    out_of_stock_items: int
    controlled_items: int


# ============================================================================
# INVENTORY ITEMS
# ============================================================================


class InventoryItemResponse(StrictModel):
    """Represent an inventory item."""

    id: str
    store_id: str
    product_id: str
    sku: str
    name: str
    brand_name: str
    category_name: str
    medication_class_name: str
    ean_code: str
    storage_location_code: str
    batch_code: str
    expiry_label: str
    quantity: int
    minimum_quantity: int
    low_stock_threshold: int
    attention_stock_threshold: int
    normal_stock_threshold: int
    sale_price: Decimal
    acquisition_cost: Decimal
    market_reference_price: Decimal
    promotional_discount_percent: Decimal
    is_controlled: bool
    controlled_category: str = "none"
    is_generic: bool = False
    is_active: bool
    is_marketplace_visible: bool
    marketplace_image_url: str
    marketplace_gallery_urls: list[str]
    cnae_code: str = ""
    is_subject_to_icms_st: bool | None = None
    created_at: datetime
    updated_at: datetime


class InventoryItemCreateRequest(StrictModel):
    """Validate a new inventory item request.

    Product identity/configuration (name, SKU, brand, category, therapeutic
    class, EAN, controlled/generic flags, marketplace images) is created and
    edited exclusively through /products; this only links an existing
    product to a store with its store-scoped stock fields.
    """

    product_id: str = Field(min_length=1)
    storage_location_code: str = Field(min_length=2, max_length=64)
    batch_code: str = Field(default="", max_length=64)
    expiry_label: str = Field(default="", max_length=16)
    initial_quantity: int = Field(ge=0, default=0)
    minimum_quantity: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=0)
    attention_stock_threshold: int = Field(ge=0, default=0)
    normal_stock_threshold: int = Field(ge=0, default=0)
    sale_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    acquisition_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    market_reference_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    promotional_discount_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    note: str = Field(default="", max_length=500)


class InventoryItemUpdateRequest(StrictModel):
    """Validate an inventory item update request.

    Only store-scoped operational fields are editable here; product
    identity/configuration is edited through /products instead.
    """

    storage_location_code: str = Field(min_length=2, max_length=64)
    batch_code: str = Field(default="", max_length=64)
    expiry_label: str = Field(default="", max_length=16)
    minimum_quantity: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=0)
    attention_stock_threshold: int = Field(ge=0, default=0)
    normal_stock_threshold: int = Field(ge=0, default=0)
    sale_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    acquisition_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    market_reference_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    promotional_discount_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    is_active: bool = True
    is_marketplace_visible: bool = True
    note: str = Field(default="", max_length=500)


class InventoryListResponse(StrictModel):
    """Represent an inventory item list response."""

    summary: InventorySummaryResponse
    items: list[InventoryItemResponse]


# ============================================================================
# INVENTORY LOCATIONS
# ============================================================================


class InventoryLocationResponse(StrictModel):
    """Represent an inventory storage location."""

    id: str
    store_id: str
    store_name: str = ""
    code: str
    name: str
    zone: str
    description: str
    temperature_range: str
    location_type: str = "estoque"
    is_controlled_only: bool
    is_active: bool
    allocated_items: int
    created_at: datetime
    updated_at: datetime


class InventoryLocationCreateRequest(StrictModel):
    """Validate a new inventory location request."""

    store_id: str = Field(min_length=1, max_length=36)
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    zone: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=255)
    temperature_range: str = Field(default="", max_length=64)
    location_type: str = Field(default="estoque", pattern="^(estoque|prateleira|gondola|caixa|outro)$")
    is_controlled_only: bool = False


class InventoryLocationUpdateRequest(StrictModel):
    """Validate an inventory location update request."""

    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    zone: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=255)
    temperature_range: str = Field(default="", max_length=64)
    location_type: str = Field(default="estoque", pattern="^(estoque|prateleira|gondola|caixa|outro)$")
    is_controlled_only: bool = False


class InventoryLocationStatusUpdateRequest(StrictModel):
    """Validate an inventory location activation toggle request."""

    is_active: bool


# ============================================================================
# INVENTORY MOVEMENTS
# ============================================================================


class InventoryMovementResponse(StrictModel):
    """Represent an inventory movement."""

    id: str
    inventory_item_id: str
    performed_by_user_id: str
    movement_type: str
    quantity_delta: int
    quantity_before: int
    resulting_quantity: int
    reason: str
    note: str
    reference_code: str
    from_location_code: str
    to_location_code: str
    unit_cost_snapshot: Decimal
    created_at: datetime


class InventoryAdjustmentRequest(StrictModel):
    """Validate a stock adjustment request."""

    movement_type: str = Field(pattern="^(entry|exit|adjustment)$")
    quantity_delta: int
    reason: str = Field(min_length=2, max_length=120)
    note: str = Field(default="", max_length=500)
    reference_code: str = Field(default="", max_length=64)
    storage_location_code: str = Field(default="", max_length=64)


class InventoryTransferRequest(StrictModel):
    """Validate an inventory transfer request."""

    to_location_code: str = Field(min_length=2, max_length=64)
    reason: str = Field(min_length=2, max_length=120, default="Internal transfer")
    note: str = Field(default="", max_length=500)
    reference_code: str = Field(default="", max_length=64)


class InventoryMovementListResponse(StrictModel):
    """Represent a movement list response."""

    items: list[InventoryMovementResponse]


# ============================================================================
# INVENTORY INVOICE IMPORT
# ============================================================================


class InventoryInvoiceMatchCandidateResponse(StrictModel):
    """Represent a candidate inventory item match for an invoice line."""

    id: str
    sku: str
    name: str
    brand_name: str
    medication_class_name: str
    ean_code: str
    storage_location_code: str
    current_quantity: int
    minimum_quantity: int
    low_stock_threshold: int
    attention_stock_threshold: int
    normal_stock_threshold: int
    is_controlled: bool


class InventoryInvoiceHeaderResponse(StrictModel):
    """Represent extracted invoice header data."""

    supplier_name: str
    supplier_document: str
    invoice_number: str
    invoice_series: str
    issue_date: str
    total_amount: Decimal
    notes: str


class InventoryInvoicePreviewLineResponse(StrictModel):
    """Represent one extracted invoice line ready for review."""

    line_id: str
    description: str
    brand_name: str
    ean_code: str
    batch_code: str
    expiry_label: str
    quantity: int
    unit_cost: Decimal
    total_cost: Decimal
    suggested_sku: str
    suggested_name: str
    suggested_brand_name: str
    suggested_category_name: str
    suggested_medication_class_name: str
    suggested_storage_location_code: str
    suggested_minimum_quantity: int
    suggested_low_stock_threshold: int
    suggested_attention_stock_threshold: int
    suggested_normal_stock_threshold: int
    suggested_sale_price: Decimal
    suggested_acquisition_cost: Decimal
    suggested_market_reference_price: Decimal
    suggested_promotional_discount_percent: Decimal
    suggested_is_controlled: bool
    suggested_tax_cost_amount: Decimal | None = None
    suggested_is_subject_to_icms_st: bool | None = None
    is_comodato: bool = False
    match_candidates: list[InventoryInvoiceMatchCandidateResponse]


class InventoryInvoicePreviewResponse(StrictModel):
    """Represent the extracted invoice review payload."""

    provider: str
    model: str
    source_file_name: str
    header: InventoryInvoiceHeaderResponse
    items: list[InventoryInvoicePreviewLineResponse]


class InventoryInvoiceConfirmLineRequest(StrictModel):
    """Validate one confirmed invoice line for stock import."""

    line_id: str = Field(min_length=1, max_length=32)
    action: str = Field(pattern="^(existing|new|skip)$")
    matched_item_id: str = Field(default="", max_length=36)
    sku: str = Field(default="", max_length=64)
    name: str = Field(default="", max_length=255)
    brand_name: str = Field(default="", max_length=255)
    category_name: str = Field(default="Medicamentos", max_length=120)
    medication_class_name: str = Field(default="Geral", max_length=120)
    ean_code: str = Field(default="", max_length=32)
    storage_location_code: str = Field(default="", max_length=64)
    batch_code: str = Field(default="", max_length=64)
    expiry_label: str = Field(default="", max_length=16)
    quantity: int = Field(ge=0, default=0)
    minimum_quantity: int = Field(ge=0, default=0)
    low_stock_threshold: int = Field(ge=0, default=0)
    attention_stock_threshold: int = Field(ge=0, default=0)
    normal_stock_threshold: int = Field(ge=0, default=0)
    sale_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    acquisition_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    market_reference_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    promotional_discount_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    is_controlled: bool = False
    tax_cost_amount: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    is_subject_to_icms_st: bool | None = None
    note: str = Field(default="", max_length=500)


class InventoryInvoiceConfirmRequest(StrictModel):
    """Validate a confirmed invoice import request."""

    invoice_number: str = Field(default="", max_length=64)
    invoice_series: str = Field(default="", max_length=32)
    supplier_name: str = Field(default="", max_length=255)
    reference_code: str = Field(default="", max_length=64)
    note: str = Field(default="", max_length=500)
    items: list[InventoryInvoiceConfirmLineRequest]


class InventoryInvoiceCommittedLineResponse(StrictModel):
    """Represent the persisted result of one invoice line."""

    line_id: str
    action: str
    inventory_item_id: str
    item_name: str
    quantity_delta: int
    storage_location_code: str


class InventoryInvoiceConfirmResponse(StrictModel):
    """Represent the final result of an invoice import."""

    created_count: int
    updated_count: int
    skipped_count: int
    reference_code: str
    items: list[InventoryInvoiceCommittedLineResponse]


# ============================================================================
# INVENTORY INVOICE RECORDS (STORED SUPPLIER INVOICES)
# ============================================================================


class InventoryInvoiceRecordResponse(StrictModel):
    """Represent a stored supplier invoice (nota fiscal) attached to an inventory item."""

    id: str
    inventory_item_id: str
    invoice_total_amount: Decimal
    product_total_amount: Decimal
    quantity: int
    unit_cost: Decimal
    file_name: str
    content_type: str
    size_bytes: int
    uploaded_by_user_id: str
    note: str
    tax_cost_amount: Decimal | None = None
    is_subject_to_icms_st: bool | None = None
    created_at: datetime


class InventoryInvoiceRecordListResponse(StrictModel):
    """Represent the stored invoice history for one inventory item."""

    items: list[InventoryInvoiceRecordResponse]


class InventoryInvoiceApplyResponse(StrictModel):
    """Represent the result of attaching a supplier invoice to an inventory item."""

    item: InventoryItemResponse
    invoice: InventoryInvoiceRecordResponse


# ============================================================================
# INVENTORY DASHBOARD AND EXPORT
# ============================================================================


class InventoryDashboardResponse(StrictModel):
    """Represent the inventory dashboard payload."""

    summary: InventorySummaryResponse
    items: list[InventoryItemResponse]
    locations: list[InventoryLocationResponse]
    recent_movements: list[InventoryMovementResponse]


class InventoryExportResponse(StrictModel):
    """Represent an inventory export payload."""

    filename: str
    content_type: str
    body: str


# ============================================================================
# INVENTORY AUDIT TRAIL
# ============================================================================


class InventoryAuditChangeResponse(StrictModel):
    """Represent one changed field within an audit entry."""

    field: str
    old: str
    new: str


class InventoryAuditEntryResponse(StrictModel):
    """Represent one audit trail entry (field edit, creation, or stock movement)."""

    id: str
    entity_type: str
    entity_id: str
    entity_label: str
    action: str
    changes: list[InventoryAuditChangeResponse]
    actor_user_id: str
    actor_name: str
    actor_email: str
    actor_role: str
    ip_address: str
    user_agent: str
    created_at: datetime


class InventoryAuditListResponse(StrictModel):
    """Represent a paginated inventory audit trail response."""

    items: list[InventoryAuditEntryResponse]
    page: int
    page_size: int
    total: int
