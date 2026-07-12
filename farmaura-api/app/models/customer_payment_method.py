"""
farmaura-api/app/models/customer_payment_method.py

Customer payment method ORM model for Farmaura.

Responsibilities:
- persist tokenized reusable payment method metadata for customers;
- support account card management and checkout selection;
- avoid storing raw PAN and security code data in application tables;

Observations:
- only non-sensitive card metadata is stored here;
- token and gateway references should point to a PCI-compliant payment provider;
"""

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CUSTOMER PAYMENT METHOD MODEL
# ============================================================================


class CustomerPaymentMethod(Base, UuidModel, TimestampedModel):
    """Persist tokenized customer payment method metadata."""

    __tablename__ = "customer_payment_methods"

    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    provider_name: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    provider_token: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    brand_name: Mapped[str] = mapped_column(String(40), default="Cartão", nullable=False)
    last_four_digits: Mapped[str] = mapped_column(String(4), default="0000", nullable=False)
    holder_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    expiration_month: Mapped[str] = mapped_column(String(2), default="00", nullable=False)
    expiration_year: Mapped[str] = mapped_column(String(4), default="0000", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
