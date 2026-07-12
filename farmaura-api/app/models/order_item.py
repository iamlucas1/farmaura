"""
farmaura-api/app/models/order_item.py

Online order item ORM model for Farmaura.

Responsibilities:
- persist the line items that compose each marketplace order;
- keep product, pricing, and prescription snapshots stable after checkout;
- support picking and separation workflows in the pharmacy operation;

Observations:
- item snapshots intentionally duplicate listing data to preserve order history;
- inventory linkage remains nullable to support delisted or migrated products;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# ONLINE ORDER ITEM MODEL
# ============================================================================


class OrderItem(Base, UuidModel, TimestampedModel):
    """Persist a line item belonging to an online order."""

    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="order_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="order_items_unit_price_non_negative"),
        CheckConstraint("line_total >= 0", name="order_items_line_total_non_negative"),
    )

    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    item_sku: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    item_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    category_name_snapshot: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    ean_code_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    storage_location_snapshot: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    requires_prescription_upload: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prescription_status: Mapped[str] = mapped_column(String(24), default="none", nullable=False)
    picked_for_fulfillment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    picked_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
