"""
farmaura-api/app/models/inventory_movement.py

Inventory movement ORM model for Farmaura.

Responsibilities:
- persist auditable inventory stock movements;
- record adjustments, transfers, receipts, and write-offs;
- capture before-and-after stock state for the internal console;

Observations:
- quantity_delta stores the signed stock impact for each movement;
- transfer movements may keep zero delta while updating origin and destination;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY MOVEMENT MODEL
# ============================================================================


class InventoryMovement(Base, UuidModel, TimestampedModel):
    """Persist an inventory movement event."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('initial', 'entry', 'exit', 'adjustment', 'transfer')",
            name="inventory_movements_type_allowed",
        ),
        CheckConstraint(
            "resulting_quantity >= 0",
            name="inventory_movements_resulting_quantity_non_negative",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    inventory_item_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
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
    reason: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reference_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    from_location_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    to_location_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    unit_cost_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
