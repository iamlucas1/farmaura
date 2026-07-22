"""
farmaura-api/app/models/brand_supplier.py

Brand-supplier association ORM model for Farmaura.

Responsibilities:
- persist which suppliers distribute a given brand (many-to-many);

Observations:
- rows are hard-deleted on unlink — this is a pure association, no history
  needs to be preserved here (unlike stock lots, which keep supplier_id);
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# BRAND SUPPLIER MODEL
# ============================================================================


class BrandSupplier(Base, UuidModel, TimestampedModel):
    """Persist one brand-to-supplier link."""

    __tablename__ = "brand_suppliers"
    __table_args__ = (UniqueConstraint("brand_id", "supplier_id", name="uq_brand_suppliers_brand_supplier"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"), index=True, nullable=False)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True, nullable=False)
