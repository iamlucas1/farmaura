"""
farmaura-api/app/models/inventory_invoice_record.py

Inventory invoice record ORM model for Farmaura.

Responsibilities:
- persist supplier invoices (nota fiscal) attached to inventory items;
- keep the uploaded file metadata linked to the item it justifies the cost for;
- preserve a full history of invoices per item for reconciliation;

Observations:
- raw file bytes stay outside the database, written under the private storage root;
- unit_cost is derived server-side from product_total_amount and quantity;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY INVOICE RECORD MODEL
# ============================================================================


class InventoryInvoiceRecord(Base, UuidModel, TimestampedModel):
    """Persist a supplier invoice (nota fiscal) attached to an inventory item."""

    __tablename__ = "inventory_invoice_records"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="inventory_invoice_records_quantity_positive"),
        CheckConstraint("invoice_total_amount >= 0", name="inventory_invoice_records_invoice_total_non_negative"),
        CheckConstraint("product_total_amount > 0", name="inventory_invoice_records_product_total_positive"),
        CheckConstraint("unit_cost >= 0", name="inventory_invoice_records_unit_cost_non_negative"),
        CheckConstraint("tax_cost_amount IS NULL OR tax_cost_amount >= 0", name="inventory_invoice_records_tax_cost_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    inventory_item_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    uploaded_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    invoice_total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    product_total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Informative breakdown of unit_cost: how much of it is tax, and whether ICMS-ST applied to
    # this specific purchase. Both nullable — most invoices won't split this out.
    tax_cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_subject_to_icms_st: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
