"""
farmaura-api/app/models/therapeutic_class.py

Therapeutic class ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped product therapeutic class (classe terapeutica)
  records;

Observations:
- therapeutic classes are soft-deleted via is_active, never hard-deleted,
  since products keep referencing them;
- each therapeutic class belongs to at most one category, so the marketplace's
  "Tipo" filter (which groups by therapeutic class within a category) only
  ever shows classes that make sense there.
"""

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampedModel, UuidModel
from app.models.category import Category


# ============================================================================
# THERAPEUTIC CLASS MODEL
# ============================================================================


class TherapeuticClass(Base, UuidModel, TimestampedModel):
    """Persist a tenant-scoped product therapeutic class."""

    __tablename__ = "therapeutic_classes"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_therapeutic_classes_tenant_name"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True)
    category: Mapped[Category | None] = relationship(lazy="joined")

    @property
    def category_name(self) -> str:
        """Proxy the linked category's name, or blank when unassigned."""

        return self.category.name if self.category is not None else ""
