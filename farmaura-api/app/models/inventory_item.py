"""
farmaura-api/app/models/inventory_item.py

Inventory item ORM model for Farmaura.

Responsibilities:
- persist store-scoped inventory records;
- store operational stock, lot, expiry, pricing, and threshold fields;
- support pharmacist console inventory workflows;

Observations:
- product identity/classification (name, SKU, brand, category, therapeutic class,
  EAN, controlled/generic flags, marketplace images) lives on InventoryProduct and
  is shared by every store carrying the same product; the read-only properties
  below proxy to it so existing call sites that read item.name/item.sku/etc. keep
  working unchanged. Writes to those fields must go through item.product instead.
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampedModel, UuidModel
from app.models.inventory_product import InventoryProduct


# ============================================================================
# INVENTORY ITEM MODEL
# ============================================================================


class InventoryItem(Base, UuidModel, TimestampedModel):
    """Persist a store-scoped inventory item."""

    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="inventory_items_quantity_non_negative"),
        CheckConstraint("minimum_quantity >= 0", name="inventory_items_minimum_quantity_non_negative"),
        CheckConstraint("low_stock_threshold >= 0", name="inventory_items_low_stock_threshold_non_negative"),
        CheckConstraint("attention_stock_threshold >= 0", name="inventory_items_attention_stock_threshold_non_negative"),
        CheckConstraint("normal_stock_threshold >= 0", name="inventory_items_normal_stock_threshold_non_negative"),
        CheckConstraint("low_stock_threshold <= attention_stock_threshold", name="inventory_items_low_threshold_lte_attention_threshold"),
        CheckConstraint("attention_stock_threshold <= normal_stock_threshold", name="inventory_items_attention_threshold_lte_normal_threshold"),
        CheckConstraint("promotional_discount_percent >= 0", name="inventory_items_promo_non_negative"),
        CheckConstraint("promotional_discount_percent <= 100", name="inventory_items_promo_max_100"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(ForeignKey("inventory_products.id", ondelete="RESTRICT"), index=True, nullable=False)
    product: Mapped[InventoryProduct] = relationship(lazy="joined")
    storage_location: Mapped[str] = mapped_column(String(64), nullable=False)
    batch_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    expiry_label: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    minimum_quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(nullable=False, default=0)
    attention_stock_threshold: Mapped[int] = mapped_column(nullable=False, default=0)
    normal_stock_threshold: Mapped[int] = mapped_column(nullable=False, default=0)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    acquisition_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    market_reference_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    promotional_discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_marketplace_visible: Mapped[bool] = mapped_column(default=True, nullable=False)
    # Per-product override of the CNAE's default ICMS-ST status (Configurações do sistema).
    # Null inherits the CNAE default; true/false forces this item specifically — some products
    # under the same CNAE aren't necessarily taxed identically under substituicao tributaria.
    is_subject_to_icms_st: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    @property
    def name(self) -> str:
        """Proxy the shared product's name."""

        return self.product.name

    @property
    def sku(self) -> str:
        """Proxy the shared product's SKU."""

        return self.product.sku

    @property
    def brand_name(self) -> str:
        """Proxy the shared product's brand name."""

        return self.product.brand_name

    @property
    def category_name(self) -> str:
        """Proxy the shared product's category name."""

        return self.product.category_name

    @property
    def medication_class_name(self) -> str:
        """Proxy the shared product's medication class name."""

        return self.product.medication_class_name

    @property
    def ean_code(self) -> str:
        """Proxy the shared product's EAN code."""

        return self.product.ean_code

    @property
    def is_controlled(self) -> bool:
        """Proxy the shared product's controlled flag."""

        return self.product.is_controlled

    @property
    def controlled_category(self) -> str:
        """Proxy the shared product's controlled category."""

        return self.product.controlled_category

    @property
    def is_generic(self) -> bool:
        """Proxy the shared product's generic flag."""

        return self.product.is_generic

    @property
    def cnae_code(self) -> str:
        """Proxy the shared product's CNAE code."""

        return self.product.cnae_code

    @property
    def marketplace_image_url(self) -> str:
        """Proxy the shared product's marketplace image URL."""

        return self.product.marketplace_image_url

    @property
    def marketplace_gallery_urls(self) -> list[str]:
        """Proxy the shared product's marketplace gallery URLs."""

        return self.product.marketplace_gallery_urls
