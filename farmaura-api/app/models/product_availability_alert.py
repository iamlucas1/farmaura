"""
farmaura-api/app/models/product_availability_alert.py

Product availability alert ORM model for Farmaura.

Responsibilities:
- persist a customer's request to be notified when an unavailable product returns;
- link one alert to the same grouped marketplace product reference the cart uses;
- track whether the alert has already been fulfilled by a notification.

Observations:
- product_ref matches the grouped marketplace product identifier used by cart_items
  and the catalog (see marketplace_projection.py) — not a foreign key, since one
  group can span several concrete inventory rows;
- notified_at stays null until the product becomes purchasable again and an e-mail
  is actually sent; once set, the alert is considered fulfilled and is not re-fired.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRODUCT AVAILABILITY ALERT MODEL
# ============================================================================


class ProductAvailabilityAlert(Base, UuidModel, TimestampedModel):
    """Persist one customer's back-in-stock notification request."""

    __tablename__ = "product_availability_alerts"
    __table_args__ = (
        UniqueConstraint("customer_id", "product_ref", name="uq_availability_alerts_customer_product_ref"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    product_ref: Mapped[str] = mapped_column(String(140), index=True, nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
