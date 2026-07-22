"""
farmaura-api/app/models/brand.py

Brand ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped product brand (marca) records;
- support linking a brand to the suppliers that distribute it, through
  BrandSupplier;

Observations:
- brands are soft-deleted via is_active, never hard-deleted, since products
  keep referencing them;
"""

from sqlalchemy import Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampedModel, UuidModel
from app.models.supplier import Supplier


# ============================================================================
# BRAND MODEL
# ============================================================================


class Brand(Base, UuidModel, TimestampedModel):
    """Persist a tenant-scoped product brand."""

    __tablename__ = "brands"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_brands_tenant_name"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    logo_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    suppliers: Mapped[list[Supplier]] = relationship(
        secondary="brand_suppliers", lazy="selectin", order_by=Supplier.legal_name.asc(),
    )
