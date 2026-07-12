"""
farmaura-api/app/models/cart_item.py

Cart item ORM model for Farmaura.

Responsibilities:
- persist the authenticated customer's marketplace cart across sessions and devices;
- link one cart line to a stable marketplace product reference;
- track requested quantity and subscription intent per line.

Observations:
- product_ref matches the grouped marketplace product identifier the catalog and
  favorites/subscriptions flows already use (see marketplace_projection.py); it is
  not a foreign key because one group can span several concrete inventory rows
  (batches, expiry lots) across the store, resolved only at checkout time;
- cart pricing is never stored here; checkout must re-derive price and stock server-side;
- one row per (customer, product_ref) pair, enforced by a unique constraint.
"""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CART ITEM MODEL
# ============================================================================


class CartItem(Base, UuidModel, TimestampedModel):
    """Persist one marketplace cart line for a customer."""

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("customer_id", "product_ref", name="uq_cart_items_customer_product_ref"),
        CheckConstraint("quantity > 0", name="cart_items_quantity_positive"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    product_ref: Mapped[str] = mapped_column(String(140), index=True, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_subscription: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
