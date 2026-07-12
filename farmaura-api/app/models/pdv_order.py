"""
farmaura-api/app/models/pdv_order.py

PDV order ORM model for Farmaura.

Responsibilities:
- persist the shared balcão order assembled before checkout completion;
- support the pharmacist-to-cashier handoff workflow;
- keep customer, operator, discount, and fulfillment state traceable;

Observations:
- this entity represents the in-store service flow before fiscal completion;
- finalized orders should be linked to a PDV sale record after payment;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PDV ORDER MODEL
# ============================================================================


class PdvOrder(Base, UuidModel, TimestampedModel):
    """Persist a shared in-store PDV order."""

    __tablename__ = "pdv_orders"
    __table_args__ = (
        CheckConstraint("discount_percent >= 0", name="pdv_orders_discount_non_negative"),
        CheckConstraint("discount_percent <= 100", name="pdv_orders_discount_max_100"),
        CheckConstraint("cashback_applied_amount >= 0", name="pdv_orders_cashback_applied_non_negative"),
        CheckConstraint("subtotal_amount >= 0", name="pdv_orders_subtotal_non_negative"),
        CheckConstraint("discount_amount >= 0", name="pdv_orders_discount_amount_non_negative"),
        CheckConstraint("total_amount >= 0", name="pdv_orders_total_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    order_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    pharmacist_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    cashier_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    order_status: Mapped[str] = mapped_column(String(24), nullable=False)
    service_role: Mapped[str] = mapped_column(String(24), default="pharmacist", nullable=False)
    customer_display_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    customer_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    customer_phone_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    includes_controlled_items: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_cpf_on_invoice: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), nullable=False)
    cashback_applied_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    queued_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    claimed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    completed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    notes: Mapped[str] = mapped_column(String(255), default="", nullable=False)
