"""
farmaura-api/app/models/pdv_sale_item.py

PDV sale item ORM model for Farmaura.

Responsibilities:
- persist the fiscal and financial lines of a finalized PDV sale;
- snapshot sold products, quantities, and final amounts;
- preserve item-level traceability after the order is closed;

Observations:
- sale item records should remain immutable after fiscal completion;
- controlled item handling can be audited through these snapshots;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PDV SALE ITEM MODEL
# ============================================================================


class PdvSaleItem(Base, UuidModel, TimestampedModel):
    """Persist a finalized PDV sale line."""

    __tablename__ = "pdv_sale_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="pdv_sale_items_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="pdv_sale_items_unit_price_non_negative"),
        CheckConstraint("line_total >= 0", name="pdv_sale_items_line_total_non_negative"),
    )

    pdv_sale_id: Mapped[str] = mapped_column(ForeignKey("pdv_sales.id", ondelete="CASCADE"), index=True, nullable=False)
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
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
    storage_location_snapshot: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
