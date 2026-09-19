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

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String
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
    # Links to the real recurring subscription on Asaas's side (their "sub_..." id) — Asaas
    # itself generates and charges a new payment every cycle against it, not a job of ours.
    # Empty for subscriptions created before this linkage existed, or without a live charge.
    provider_subscription_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
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
    # Real, computable due date for the first charge — distinct from next_cycle_date_label
    # (a display-only string). Only meaningfully set for "pending_card" subscriptions today
    # (scheduled without a saved card), so the reminder scheduler has something to compare
    # against; null for a subscription that already charged immediately.
    next_charge_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    # Short machine-readable reason, set only when subscription_status becomes "cancelled"
    # this way (e.g. "no_card_by_due_date") — cancelled_at_label stays the human date/time.
    cancel_reason: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    # Smallest reminder threshold (in days-until-due) already emailed, from
    # SUBSCRIPTION_CARD_REMINDER_THRESHOLDS_DAYS; -1 means no reminder sent yet. Prevents
    # re-sending the same day's reminder on every scheduler tick.
    card_reminder_last_threshold_days: Mapped[int] = mapped_column(Integer, default=-1, nullable=False)
