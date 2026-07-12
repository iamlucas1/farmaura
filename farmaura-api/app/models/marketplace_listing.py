"""
farmaura-api/app/models/marketplace_listing.py

Marketplace listing ORM model for Farmaura.

Responsibilities:
- persist online marketplace publication records linked to inventory items;
- store marketplace-specific pricing, promotion, and visibility fields;
- expose the product data that is shown to customers in the online channel;

Observations:
- inventory remains the operational source of stock and lot data;
- listing fields intentionally mirror selected inventory fields for stable online publication;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# MARKETPLACE LISTING MODEL
# ============================================================================


class MarketplaceListing(Base, UuidModel, TimestampedModel):
    """Persist an online marketplace listing linked to an inventory item."""

    __tablename__ = "marketplace_listings"
    __table_args__ = (
        UniqueConstraint("inventory_item_id", name="uq_marketplace_listings_inventory_item_id"),
        CheckConstraint("published_price >= 0", name="marketplace_listings_published_price_non_negative"),
        CheckConstraint("acquisition_cost >= 0", name="marketplace_listings_acquisition_cost_non_negative"),
        CheckConstraint("reference_market_price >= 0", name="marketplace_listings_reference_price_non_negative"),
        CheckConstraint("promotional_discount_percent >= 0", name="marketplace_listings_promo_non_negative"),
        CheckConstraint("promotional_discount_percent <= 100", name="marketplace_listings_promo_max_100"),
        CheckConstraint("target_margin_percent >= 0", name="marketplace_listings_target_margin_non_negative"),
        CheckConstraint("commission_percent >= 0", name="marketplace_listings_commission_non_negative"),
        CheckConstraint("payment_fee_percent >= 0", name="marketplace_listings_payment_fee_non_negative"),
        CheckConstraint("fixed_fee >= 0", name="marketplace_listings_fixed_fee_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    inventory_item_id: Mapped[str] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    marketplace_name: Mapped[str] = mapped_column(String(120), default="Marketplace Farmaura", nullable=False)
    listing_sku: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    brand_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    category_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    ean_code: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
    published_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    acquisition_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    reference_market_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    promotional_discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    commission_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))
    payment_fee_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))
    fixed_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    target_margin_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0.00"))
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_prescription_upload: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
