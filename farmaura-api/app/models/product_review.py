"""
farmaura-api/app/models/product_review.py

Product review ORM model for Farmaura.

Responsibilities:
- persist marketplace product ratings and comments from customers;
- link reviews to tenant, customer, order, and product references when available;
- provide the authoritative source for catalog review summaries and comments;

Observations:
- reviews remain publishable even if the linked inventory item is later delisted;
- verified-purchase and reviewer snapshots are stored to preserve review history;
"""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRODUCT REVIEW MODEL
# ============================================================================


class ProductReview(Base, UuidModel, TimestampedModel):
    """Persist one tenant-scoped marketplace product review."""

    __tablename__ = "product_reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1", name="product_reviews_rating_min_1"),
        CheckConstraint("rating <= 5", name="product_reviews_rating_max_5"),
        CheckConstraint("helpful_count >= 0", name="product_reviews_helpful_count_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)
    inventory_item_id: Mapped[str | None] = mapped_column(ForeignKey("inventory_items.id", ondelete="SET NULL"), index=True, nullable=True)
    marketplace_listing_id: Mapped[str | None] = mapped_column(ForeignKey("marketplace_listings.id", ondelete="SET NULL"), index=True, nullable=True)
    product_ref: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    reviewer_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    reviewer_avatar_initials: Mapped[str] = mapped_column(String(8), default="", nullable=False)
    title: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    helpful_count: Mapped[int] = mapped_column(default=0, nullable=False)
    is_verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    submitted_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
