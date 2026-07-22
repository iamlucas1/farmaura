"""
farmaura-api/app/models/inventory_stock_lot.py

Inventory stock lot ORM model for Farmaura.

Responsibilities:
- persist the current balance of one batch/lot of one item at one physical location;
- support per-location, per-batch traceability without requiring per-unit serialization;

Observations:
- InventoryItem.quantity remains the fast aggregate total, kept equal to the sum of
  this item's 'available' lot rows — existing PDV/order/threshold code keeps reading
  the aggregate unchanged;
- receiving more of the same batch at the same location and status increments the
  matching row instead of creating a duplicate one, per the unique constraint below;
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY STOCK LOT MODEL
# ============================================================================


class InventoryStockLot(Base, UuidModel, TimestampedModel):
    """Persist the current balance of one batch at one storage location."""

    __tablename__ = "inventory_stock_lots"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "inventory_item_id", "location_id", "batch_code", "status",
            name="uq_inventory_stock_lots_item_location_batch_status",
        ),
        CheckConstraint("quantity >= 0", name="inventory_stock_lots_quantity_non_negative"),
        CheckConstraint(
            "status IN ('available', 'reserved', 'quarantine', 'expired', 'written_off')",
            name="inventory_stock_lots_status_allowed",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    inventory_item_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    location_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_locations.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    supplier_id: Mapped[str] = mapped_column(
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    batch_code: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=True)
    quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), default="available", nullable=False)
    unit_cost_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    reference_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
