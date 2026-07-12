"""
farmaura-api/app/models/product.py

Product ORM model for Farmaura.

Responsibilities:
- persist catalog products by tenant and store;
- store public catalog metadata and stock-related flags;
- support customer and pharmacist catalog views;

Observations:
- price validation belongs to service and schema layers;
- tenant-scoped indexes should be expanded with migrations;
"""

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRODUCT MODEL
# ============================================================================


class Product(Base, UuidModel, TimestampedModel):
    """Persist a sellable product."""

    __tablename__ = "products"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    requires_prescription: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
