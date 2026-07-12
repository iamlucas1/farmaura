"""
farmaura-api/app/models/order.py

Online order ORM model for Farmaura.

Responsibilities:
- persist marketplace orders for delivery and pickup flows;
- keep customer, payment, prescription, and financial snapshots explicit;
- expose a stable parent aggregate for items, fulfillment, and status history;

Observations:
- this entity stores both marketplace-visible and backoffice-operational fields;
- fulfillment-specific address and pickup data live in a dedicated child table;
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import OrderStatus
from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# ONLINE ORDER MODEL
# ============================================================================


class Order(Base, UuidModel, TimestampedModel):
    """Persist an online order for pickup or delivery."""

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("subtotal_amount >= 0", name="orders_subtotal_non_negative"),
        CheckConstraint("delivery_fee_amount >= 0", name="orders_delivery_fee_non_negative"),
        CheckConstraint("discount_amount >= 0", name="orders_discount_non_negative"),
        CheckConstraint("cashback_applied_amount >= 0", name="orders_cashback_applied_non_negative"),
        CheckConstraint("cashback_earned_amount >= 0", name="orders_cashback_earned_non_negative"),
        CheckConstraint("total_amount >= 0", name="orders_total_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    selected_address_id: Mapped[str | None] = mapped_column(
        ForeignKey("customer_addresses.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    selected_payment_method_id: Mapped[str | None] = mapped_column(
        ForeignKey("customer_payment_methods.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    order_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(24), default="app", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default=OrderStatus.NEW.value, nullable=False)
    fulfillment_type: Mapped[str] = mapped_column(String(24), nullable=False)
    priority: Mapped[str] = mapped_column(String(24), default="normal", nullable=False)
    payment_method_label: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    payment_status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    gateway_payment_id: Mapped[str] = mapped_column(String(64), default="", index=True, nullable=False)
    payment_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    customer_display_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    customer_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    customer_phone_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    customer_email_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    requires_prescription_review: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prescription_status: Mapped[str] = mapped_column(String(24), default="none", nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    delivery_fee_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    cashback_applied_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    cashback_earned_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    placed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    estimated_ready_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    estimated_delivery_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    completed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    marketplace_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    internal_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
