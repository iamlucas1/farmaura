"""
farmaura-api/app/models/pdv_sale.py

PDV sale ORM model for Farmaura.

Responsibilities:
- persist finalized in-store sales after payment confirmation;
- store payment, discount, cashback, and customer snapshot fields;
- link the completed sale back to the originating PDV order;

Observations:
- this entity represents paid and finalized balcão sales only;
- fiscal issuance metadata should be linked in a dedicated document record;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PDV SALE MODEL
# ============================================================================


class PdvSale(Base, UuidModel, TimestampedModel):
    """Persist a finalized PDV sale."""

    __tablename__ = "pdv_sales"
    __table_args__ = (
        CheckConstraint("subtotal_amount >= 0", name="pdv_sales_subtotal_non_negative"),
        CheckConstraint("discount_amount >= 0", name="pdv_sales_discount_non_negative"),
        CheckConstraint("cashback_applied_amount >= 0", name="pdv_sales_cashback_applied_non_negative"),
        CheckConstraint("cashback_earned_amount >= 0", name="pdv_sales_cashback_earned_non_negative"),
        CheckConstraint("total_amount >= 0", name="pdv_sales_total_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    sale_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    pdv_order_id: Mapped[str | None] = mapped_column(ForeignKey("pdv_orders.id", ondelete="SET NULL"), index=True, nullable=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    cashier_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    pharmacist_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    payment_method: Mapped[str] = mapped_column(String(24), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(24), nullable=False)
    sale_status: Mapped[str] = mapped_column(String(24), nullable=False)
    include_cpf_on_invoice: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    customer_display_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    customer_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    cashback_applied_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    cashback_earned_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    completed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    fulfillment_type: Mapped[str] = mapped_column(String(24), default="pickup", nullable=False)
    delivery_address_line: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    delivery_district: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    delivery_city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    delivery_state_code: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    delivery_postal_code: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    delivery_fee_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    delivery_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    delivery_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
