"""
farmaura-api/app/models/saved_product.py

Saved product ORM model for Farmaura.

Responsibilities:
- persist marketplace products favorited by the customer;
- link the customer to the preferred listing or inventory reference;
- support wishlist-style account and CRM projections from authoritative data;

Observations:
- saved items are operational records and should not be represented only as customer snapshots;
- listing linkage remains nullable to tolerate publication turnover without losing history;
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# SAVED PRODUCT MODEL
# ============================================================================


class SavedProduct(Base, UuidModel, TimestampedModel):
    """Persist a product saved by a customer."""

    __tablename__ = "saved_products"
    __table_args__ = (
        UniqueConstraint("customer_id", "marketplace_listing_id", name="uq_saved_products_customer_listing"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    marketplace_listing_id: Mapped[str | None] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    inventory_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("inventory_items.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    saved_from_channel: Mapped[str] = mapped_column(String(24), default="marketplace", nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
