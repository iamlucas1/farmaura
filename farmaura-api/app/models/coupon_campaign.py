"""
farmaura-api/app/models/coupon_campaign.py

Coupon campaign ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped marketplace coupon campaigns;
- store coupon targeting, scheduling, and usage-limit metadata;
- provide an authoritative backend source for marketplace discount rules;

Observations:
- target collections are stored as JSON text for database portability;
- usage counters remain server-authoritative even when cached by the frontend;
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# COUPON CAMPAIGN MODEL
# ============================================================================


class CouponCampaign(Base, UuidModel, TimestampedModel):
    """Persist one tenant-scoped marketplace coupon campaign."""

    __tablename__ = "coupon_campaigns"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_coupon_campaigns_tenant_code"),
        CheckConstraint("discount_value >= 0", name="coupon_campaigns_discount_value_non_negative"),
        CheckConstraint("minimum_order_value >= 0", name="coupon_campaigns_minimum_order_non_negative"),
        CheckConstraint("usage_count >= 0", name="coupon_campaigns_usage_count_non_negative"),
        CheckConstraint("per_customer_limit >= 0", name="coupon_campaigns_per_customer_limit_non_negative"),
        CheckConstraint(
            "discount_type <> 'percent' OR discount_value <= 100",
            name="coupon_campaigns_percent_discount_max_100",
        ),
        CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at",
            name="coupon_campaigns_schedule_window_valid",
        ),
        CheckConstraint(
            "channel_scope IN ('all', 'online', 'pdv')",
            name="coupon_campaigns_channel_scope_valid",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(24), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    discount_type: Mapped[str] = mapped_column(String(24), default="percent", nullable=False)
    shipping_discount_mode: Mapped[str] = mapped_column(String(24), default="full", nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    minimum_order_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    max_discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(nullable=True)
    usage_count: Mapped[int] = mapped_column(default=0, nullable=False)
    per_customer_limit: Mapped[int] = mapped_column(default=1, nullable=False)
    audience: Mapped[str] = mapped_column(String(32), default="all", nullable=False)
    channel_scope: Mapped[str] = mapped_column(String(16), default="all", nullable=False)
    scope_type: Mapped[str] = mapped_column(String(24), default="all", nullable=False)
    target_categories_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    target_products_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    # "services": targets HealthService.service_name entries — same deliberately-isolated
    # scope axis as PricingPromotion.target_services (see coupon_service.resolve_coupon's
    # allow_service_scope guard); a scope_type="all" coupon is never redeemable at booking.
    target_services_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    first_purchase_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stackable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
