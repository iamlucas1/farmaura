"""
farmaura-api/app/models/cashback_transaction.py

Cashback transaction ORM model for Farmaura.

Responsibilities:
- persist every cashback wallet movement in an auditable ledger;
- link movements to customers, wallets, orders, and source channels;
- keep lifecycle status explicit for pending, available, redeemed, and expired values;

Observations:
- this table is the source of truth for cashback reconciliation;
- order-level transactions can be detailed further through transaction lines;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CASHBACK TRANSACTION MODEL
# ============================================================================


class CashbackTransaction(Base, UuidModel, TimestampedModel):
    """Persist a cashback wallet movement."""

    __tablename__ = "cashback_transactions"
    __table_args__ = (
        CheckConstraint("gross_amount >= 0", name="cashback_transactions_gross_non_negative"),
        CheckConstraint("net_amount >= 0", name="cashback_transactions_net_non_negative"),
        CheckConstraint("wallet_balance_after >= 0", name="cashback_transactions_balance_after_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    wallet_id: Mapped[str] = mapped_column(
        ForeignKey("customer_cashback_wallets.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    transaction_type: Mapped[str] = mapped_column(String(24), nullable=False)
    transaction_status: Mapped[str] = mapped_column(String(24), nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), nullable=False)
    source_reference: Mapped[str] = mapped_column(String(120), default="", index=True, nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    sale_reference: Mapped[str] = mapped_column(String(120), default="", index=True, nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    wallet_balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    granted_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    available_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    expires_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    notes: Mapped[str] = mapped_column(String(255), default="", nullable=False)
