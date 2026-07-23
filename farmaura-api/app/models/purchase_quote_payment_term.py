"""
farmaura-api/app/models/purchase_quote_payment_term.py

Purchase quote payment term ORM model for Farmaura.

Responsibilities:
- persist the payment methods a supplier offered on one purchase quote
  (pix, boleto à vista/a prazo, cartão, consignado, etc.), each with its own
  discount/surcharge and installment/due-day terms;

Observations:
- one quote can carry several payment terms at once (e.g. 5% off on pix,
  no discount on 30-day boleto) — this table is intentionally 1:N off
  PurchaseQuote rather than a single column on the header;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel

PAYMENT_METHODS = (
    "pix",
    "boleto_avista",
    "boleto_prazo",
    "cartao_credito",
    "cartao_debito",
    "consignado",
    "dinheiro",
    "transferencia",
    "outro",
)


# ============================================================================
# PURCHASE QUOTE PAYMENT TERM MODEL
# ============================================================================


class PurchaseQuotePaymentTerm(Base, UuidModel, TimestampedModel):
    """Persist one payment method/condition offered on a purchase quote."""

    __tablename__ = "purchase_quote_payment_terms"
    __table_args__ = (
        CheckConstraint(
            "method IN ('pix', 'boleto_avista', 'boleto_prazo', 'cartao_credito', 'cartao_debito', "
            "'consignado', 'dinheiro', 'transferencia', 'outro')",
            name="purchase_quote_payment_terms_method_valid",
        ),
        CheckConstraint(
            "discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)",
            name="purchase_quote_payment_terms_discount_range",
        ),
        CheckConstraint(
            "surcharge_percent IS NULL OR (surcharge_percent >= 0 AND surcharge_percent <= 100)",
            name="purchase_quote_payment_terms_surcharge_range",
        ),
        CheckConstraint(
            "installment_count IS NULL OR installment_count >= 1",
            name="purchase_quote_payment_terms_installments_positive",
        ),
        CheckConstraint(
            "days_to_pay IS NULL OR days_to_pay >= 0",
            name="purchase_quote_payment_terms_days_non_negative",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    quote_id: Mapped[str] = mapped_column(
        ForeignKey("purchase_quotes.id", ondelete="CASCADE"), index=True, nullable=False
    )

    method: Mapped[str] = mapped_column(String(24), nullable=False)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    surcharge_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    installment_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    days_to_pay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
