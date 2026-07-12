"""
farmaura-api/app/models/inventory_item.py

Inventory item ORM model for Farmaura.

Responsibilities:
- persist store-scoped inventory records;
- store operational stock, lot, expiry, pricing, class, and threshold fields;
- support pharmacist console inventory workflows;

Observations:
- this model reflects the current inventory screen contract;
- product normalization can be introduced later without losing these fields;
"""

from decimal import Decimal

from sqlalchemy import JSON, Boolean, CheckConstraint, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


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
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    category_name: Mapped[str] = mapped_column(String(120), default="Medicamentos", nullable=False)
    medication_class_name: Mapped[str] = mapped_column(String(120), default="Geral", nullable=False)
    ean_code: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
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
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_marketplace_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    marketplace_image_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    marketplace_gallery_urls: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
