"""
farmaura-api/app/models/cashback_rule.py

Cashback rule ORM model for Farmaura.

Responsibilities:
- persist cashback percentage rules per sellable item;
- link cashback policy to marketplace listings and inventory items;
- support future campaign windows and rule versioning;

Observations:
- the rule is intentionally explicit instead of implicit global math;
- pricing and cashback should evolve independently over time;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CASHBACK RULE MODEL
# ============================================================================


class CashbackRule(Base, UuidModel, TimestampedModel):
    """Persist a cashback rule for a sellable item."""

    __tablename__ = "cashback_rules"
    __table_args__ = (
        CheckConstraint("cashback_percent >= 0", name="cashback_rules_percent_non_negative"),
        CheckConstraint("cashback_percent <= 100", name="cashback_rules_percent_max_100"),
        CheckConstraint("minimum_order_amount >= 0", name="cashback_rules_minimum_order_amount_non_negative"),
        CheckConstraint("maximum_cashback_amount >= 0", name="cashback_rules_maximum_amount_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    rule_name: Mapped[str] = mapped_column(String(120), default="Cashback padrão", nullable=False)
    cashback_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    minimum_order_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    maximum_cashback_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    release_after_delivery: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    validity_days: Mapped[int] = mapped_column(default=90, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
