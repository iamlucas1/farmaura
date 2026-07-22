"""
farmaura-api/app/models/category.py

Category ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped product category records;

Observations:
- categories are soft-deleted via is_active, never hard-deleted, since
  products keep referencing them;
"""

from sqlalchemy import Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# CATEGORY MODEL
# ============================================================================


class Category(Base, UuidModel, TimestampedModel):
    """Persist a tenant-scoped product category."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_categories_tenant_name"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
