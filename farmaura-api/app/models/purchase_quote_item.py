"""
farmaura-api/app/models/purchase_quote_item.py

Purchase quote item ORM model for Farmaura.

Responsibilities:
- persist one quoted product line (description, price, comodato terms) on a
  purchase quote;

Observations:
- product_id is an optional, read-only cross-reference into the tenant's
  product catalog (InventoryProduct) used only to help compare/sugest — this
  table must never be the trigger for creating or mutating a catalog product;
- is_comodato/comodato_notes cover supplier-owned equipment tied to purchase
  volume (e.g. a Red Bull branded fridge), which is not a purchase cost line;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel

# ============================================================================
# PURCHASE QUOTE ITEM MODEL
# ============================================================================


class PurchaseQuoteItem(Base, UuidModel, TimestampedModel):
    """Persist one quoted product line on a purchase quote."""

    __tablename__ = "purchase_quote_items"
    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="purchase_quote_items_unit_price_non_negative"),
        CheckConstraint(
            "quantity_reference IS NULL OR quantity_reference >= 0",
            name="purchase_quote_items_quantity_reference_non_negative",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    quote_id: Mapped[str] = mapped_column(
        ForeignKey("purchase_quotes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_products.id", ondelete="SET NULL"), index=True, nullable=True
    )

    description: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    sku_snapshot: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    ean_code_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="un", nullable=False)

    quantity_reference: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    is_comodato: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comodato_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
