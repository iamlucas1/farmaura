"""
farmaura-api/app/models/inventory_lot_movement.py

Inventory lot movement ORM model for Farmaura.

Responsibilities:
- persist a fine-grained, per-batch, per-location audit trail;
- capture receipts, transfers, adjustments, and sale exits for one stock lot;
- link a sale exit back to the pdv sale or marketplace order that consumed the stock;

Observations:
- this table is additive: the existing aggregate InventoryMovement keeps being written
  in parallel so nothing that already reads the item-level dashboard breaks;
- batch_code and expiry_date are denormalized here so history survives even if the
  originating stock lot row is later merged, zeroed, or removed;
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY LOT MOVEMENT MODEL
# ============================================================================


class InventoryLotMovement(Base, UuidModel, TimestampedModel):
    """Persist one auditable movement event for a stock lot."""

    __tablename__ = "inventory_lot_movements"
    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('receipt', 'transfer_out', 'transfer_in', 'adjustment', 'sale_exit')",
            name="inventory_lot_movements_type_allowed",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    inventory_item_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    stock_lot_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_stock_lots.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    performed_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    movement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    quantity_delta: Mapped[int] = mapped_column(nullable=False)
    quantity_before: Mapped[int] = mapped_column(nullable=False, default=0)
    resulting_quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    from_location_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_locations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    to_location_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_locations.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    batch_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=True)
    reason: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reference_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    source_type: Mapped[str] = mapped_column(String(24), default="", nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), default="", nullable=False)
    unit_cost_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
