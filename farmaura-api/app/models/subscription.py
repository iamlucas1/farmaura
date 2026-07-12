"""
farmaura-api/app/models/subscription.py

Subscription ORM model for Farmaura.

Responsibilities:
- persist recurring purchase agreements for customer products;
- store delivery cadence, pause state, and next cycle planning data explicitly;
- support account, CRM, and order-generation flows for recurring medications;

Observations:
- listing linkage is preferred because subscriptions represent an online commercial offer;
- financial values are stored as snapshots so historical subscription terms remain auditable;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# SUBSCRIPTION MODEL
# ============================================================================


class Subscription(Base, UuidModel, TimestampedModel):
    """Persist a recurring product subscription."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="subscriptions_quantity_positive"),
        CheckConstraint("frequency_days > 0", name="subscriptions_frequency_positive"),
        CheckConstraint("discount_percent >= 0", name="subscriptions_discount_non_negative"),
        CheckConstraint("discount_percent <= 100", name="subscriptions_discount_max_100"),
        CheckConstraint("unit_price_snapshot >= 0", name="subscriptions_unit_price_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    subscription_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    subscription_status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    frequency_days: Mapped[int] = mapped_column(default=30, nullable=False)
    next_cycle_in_days: Mapped[int] = mapped_column(default=0, nullable=False)
    next_cycle_date_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    started_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    paused_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    cancelled_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    unit_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("15.00"), nullable=False)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
