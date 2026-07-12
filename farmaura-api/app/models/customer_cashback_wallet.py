"""
farmaura-api/app/models/customer_cashback_wallet.py

Customer cashback wallet ORM model for Farmaura.

Responsibilities:
- persist the current cashback balances for each customer;
- separate available, pending, redeemed, and expired totals;
- provide a stable wallet anchor for cashback ledger reconciliation;

Observations:
- wallet balances should always be derivable from the cashback ledger;
- this table exists for fast reads and operational summaries;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CUSTOMER CASHBACK WALLET MODEL
# ============================================================================


class CustomerCashbackWallet(Base, UuidModel, TimestampedModel):
    """Persist the current cashback wallet totals for a customer."""

    __tablename__ = "customer_cashback_wallets"
    __table_args__ = (
        CheckConstraint("available_balance >= 0", name="customer_cashback_wallets_available_non_negative"),
        CheckConstraint("pending_balance >= 0", name="customer_cashback_wallets_pending_non_negative"),
        CheckConstraint("redeemed_total >= 0", name="customer_cashback_wallets_redeemed_non_negative"),
        CheckConstraint("expired_total >= 0", name="customer_cashback_wallets_expired_non_negative"),
        CheckConstraint("lifetime_earned_total >= 0", name="customer_cashback_wallets_lifetime_non_negative"),
    )

    customer_id: Mapped[str] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    available_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    pending_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    redeemed_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    expired_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    lifetime_earned_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
