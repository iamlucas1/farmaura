"""
farmaura-api/app/models/cashback_transaction_line.py

Cashback transaction line ORM model for Farmaura.

Responsibilities:
- persist per-product cashback traceability within each wallet movement;
- link credited or redeemed cashback to the originating sellable item rule;
- keep the ledger auditable down to quantity, base amount, and applied percentage;

Observations:
- line items preserve product-level explainability for CRM and finance;
- redemption movements can also reference the consumed origin when needed later;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CASHBACK TRANSACTION LINE MODEL
# ============================================================================


class CashbackTransactionLine(Base, UuidModel, TimestampedModel):
    """Persist a product-level cashback detail line."""

    __tablename__ = "cashback_transaction_lines"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="cashback_transaction_lines_quantity_non_negative"),
        CheckConstraint("base_amount >= 0", name="cashback_transaction_lines_base_amount_non_negative"),
        CheckConstraint("cashback_percent >= 0", name="cashback_transaction_lines_percent_non_negative"),
        CheckConstraint("cashback_percent <= 100", name="cashback_transaction_lines_percent_max_100"),
        CheckConstraint("cashback_amount >= 0", name="cashback_transaction_lines_amount_non_negative"),
    )

    transaction_id: Mapped[str] = mapped_column(
        ForeignKey("cashback_transactions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    cashback_rule_id: Mapped[str | None] = mapped_column(
        ForeignKey("cashback_rules.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    product_reference: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False, default=0)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cashback_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    cashback_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
