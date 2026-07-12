"""
farmaura-api/app/models/customer_address.py

Customer address ORM model for Farmaura.

Responsibilities:
- persist customer delivery and pickup-related addresses;
- support account management and checkout address selection;
- keep primary address designation explicit per customer;

Observations:
- address snapshots on orders should still be persisted independently;
- this table stores reusable customer addresses only;
"""

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CUSTOMER ADDRESS MODEL
# ============================================================================


class CustomerAddress(Base, UuidModel, TimestampedModel):
    """Persist a reusable customer address."""

    __tablename__ = "customer_addresses"

    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(60), default="Casa", nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    street_line: Mapped[str] = mapped_column(String(255), nullable=False)
    district: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    state_code: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    complement: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    reference_note: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
