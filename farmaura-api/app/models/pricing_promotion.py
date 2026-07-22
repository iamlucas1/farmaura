"""
farmaura-api/app/models/pricing_promotion.py

Pricing promotion ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped automatic marketplace price promotions;
- store discount, scheduling, and customer-audience targeting rules;
- provide an authoritative backend source the catalog can evaluate server-side;

Observations:
- unlike coupon campaigns, this model is meant to be evaluated by code (not just
  displayed), so scheduling fields are real datetimes and targeting fields are
  native JSON lists rather than serialized text;
- an empty/null value on any targeting axis means "does not restrict on this axis";
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRICING PROMOTION MODEL
# ============================================================================


class PricingPromotion(Base, UuidModel, TimestampedModel):
    """Persist one tenant-scoped automatic marketplace pricing promotion."""

    __tablename__ = "pricing_promotions"
    __table_args__ = (
        CheckConstraint("discount_value >= 0", name="pricing_promotions_discount_value_non_negative"),
        CheckConstraint(
            "discount_type <> 'percent' OR discount_value <= 100",
            name="pricing_promotions_percent_discount_max_100",
        ),
        CheckConstraint("max_discount_value IS NULL OR max_discount_value >= 0", name="pricing_promotions_max_discount_non_negative"),
        CheckConstraint("min_age IS NULL OR min_age >= 0", name="pricing_promotions_min_age_non_negative"),
        CheckConstraint("max_age IS NULL OR max_age >= 0", name="pricing_promotions_max_age_non_negative"),
        CheckConstraint(
            "min_age IS NULL OR max_age IS NULL OR min_age <= max_age",
            name="pricing_promotions_age_range_valid",
        ),
        CheckConstraint("min_children IS NULL OR min_children >= 0", name="pricing_promotions_min_children_non_negative"),
        CheckConstraint("max_children IS NULL OR max_children >= 0", name="pricing_promotions_max_children_non_negative"),
        CheckConstraint(
            "min_children IS NULL OR max_children IS NULL OR min_children <= max_children",
            name="pricing_promotions_children_range_valid",
        ),
        CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at",
            name="pricing_promotions_schedule_window_valid",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    discount_type: Mapped[str] = mapped_column(String(16), default="percent", nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    max_discount_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    scope_type: Mapped[str] = mapped_column(String(24), default="all", nullable=False)
    target_categories: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    target_products: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    daily_start_time: Mapped[str] = mapped_column(String(5), default="", nullable=False)
    daily_end_time: Mapped[str] = mapped_column(String(5), default="", nullable=False)
    days_of_week: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)

    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    regions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    device_types: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    marital_statuses: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    min_children: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_children: Mapped[int | None] = mapped_column(Integer, nullable=True)
    customer_segment: Mapped[str] = mapped_column(String(24), default="all", nullable=False)

    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
