"""
farmaura-api/app/models/pdv_order_item.py

PDV order item ORM model for Farmaura.

Responsibilities:
- persist the product lines of a shared PDV order;
- snapshot product, quantity, and unit price before payment;
- preserve in-store service traceability for each selected item;

Observations:
- order items are mutable until the cashier finalizes the sale;
- finalized fiscal lines should also be stored on the PDV sale entity;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PDV ORDER ITEM MODEL
# ============================================================================


class PdvOrderItem(Base, UuidModel, TimestampedModel):
    """Persist a product line of a PDV order."""

    __tablename__ = "pdv_order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="pdv_order_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="pdv_order_items_unit_price_non_negative"),
        CheckConstraint("line_total >= 0", name="pdv_order_items_line_total_non_negative"),
    )

    pdv_order_id: Mapped[str] = mapped_column(ForeignKey("pdv_orders.id", ondelete="CASCADE"), index=True, nullable=False)
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
    source_store_id: Mapped[str | None] = mapped_column(
        ForeignKey("stores.id", ondelete="RESTRICT"),
        index=True,
        nullable=True,
    )
    item_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    ean_code_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    storage_location_snapshot: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
