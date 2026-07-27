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
- units_per_package is optional metadata for package-like units (caixa, fardo,
  pacote, etc.) — how many sellable units one package contains, when the
  supplier states it. Purchase receiving uses it to convert a quoted package
  quantity into a sellable-unit stock quantity; nothing else derives from it.
- ncm_code/ipi_percentage/icms_st_value/final_unit_price are optional tax
  metadata some supplier price lists include (fiscal classification, IPI rate,
  ICMS-ST amount, and the tax-inclusive unit price). unit_price stays the base
  price used everywhere else in the module (comparison, receiving); these
  fields are recorded purely for review/reference and are never derived from
  or substituted for unit_price automatically.
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
        CheckConstraint(
            "units_per_package IS NULL OR units_per_package > 0",
            name="purchase_quote_items_units_per_package_positive",
        ),
        CheckConstraint(
            "ipi_percentage IS NULL OR ipi_percentage >= 0",
            name="purchase_quote_items_ipi_percentage_non_negative",
        ),
        CheckConstraint(
            "icms_st_value IS NULL OR icms_st_value >= 0",
            name="purchase_quote_items_icms_st_value_non_negative",
        ),
        CheckConstraint(
            "final_unit_price IS NULL OR final_unit_price >= 0",
            name="purchase_quote_items_final_unit_price_non_negative",
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
    brand_id: Mapped[str | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), index=True, nullable=True
    )
    brand_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    sku_snapshot: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    ean_code_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="un", nullable=False)
    units_per_package: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)

    quantity_reference: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    ncm_code: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    ipi_percentage: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    icms_st_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    final_unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    is_comodato: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comodato_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
