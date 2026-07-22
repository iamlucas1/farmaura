"""
farmaura-api/app/models/inventory_product.py

Inventory product ORM model for Farmaura.

Responsibilities:
- persist the tenant-scoped, store-independent identity of one product;
- hold classification fields (name, SKU, brand, category, therapeutic class,
  EAN, controlled/generic flags, marketplace images) shared by every store
  that carries this product;

Observations:
- store-scoped operational data (quantity, thresholds, storage, batch,
  pricing) stays on InventoryItem, which references this model through
  product_id;
- the unique EAN index is partial (empty EAN rows are never merged together);
- brand_name/category_name/medication_class_name are read-only proxies over
  the linked Brand/Category/TherapeuticClass rows so existing call sites
  (catalog, PDV, pricing, marketplace projection) that read
  product.brand_name/etc. keep working unchanged after those became FKs;
  writes must go through brand_id/category_id/therapeutic_class_id instead.
"""

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampedModel, UuidModel
from app.models.brand import Brand
from app.models.category import Category
from app.models.therapeutic_class import TherapeuticClass


# ============================================================================
# INVENTORY PRODUCT MODEL
# ============================================================================


class InventoryProduct(Base, UuidModel, TimestampedModel):
    """Persist the store-independent identity of one product."""

    __tablename__ = "inventory_products"
    __table_args__ = (
        Index(
            "uq_inventory_products_tenant_ean",
            "tenant_id",
            "ean_code",
            unique=True,
            postgresql_where=text("ean_code <> ''"),
        ),
        Index("uq_inventory_products_tenant_sku", "tenant_id", "sku", unique=True),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    ean_code: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), index=True, nullable=True)
    brand: Mapped[Brand | None] = relationship(lazy="joined")
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), index=True, nullable=True)
    category: Mapped[Category | None] = relationship(lazy="joined")
    therapeutic_class_id: Mapped[str] = mapped_column(
        ForeignKey("therapeutic_classes.id", ondelete="SET NULL"), index=True, nullable=True,
    )
    therapeutic_class: Mapped[TherapeuticClass | None] = relationship(lazy="joined")
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    controlled_category: Mapped[str] = mapped_column(String(24), default="none", nullable=False)
    is_generic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cnae_code: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    marketplace_image_url: Mapped[str] = mapped_column(Text, default="", nullable=False)
    marketplace_gallery_urls: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    @property
    def brand_name(self) -> str:
        """Proxy the linked brand's name, or blank when unassigned."""

        return self.brand.name if self.brand is not None else ""

    @property
    def category_name(self) -> str:
        """Proxy the linked category's name, or the legacy default when unassigned."""

        return self.category.name if self.category is not None else "Medicamentos"

    @property
    def medication_class_name(self) -> str:
        """Proxy the linked therapeutic class's name, or the legacy default when unassigned/deactivated.

        A deactivated therapeutic class must stop showing up as a "Tipo" filter option
        on the marketplace — that filter is derived straight from this value on
        whatever products are already visible, not from an admin-curated list, so the
        only way to hide a deactivated class from it is to stop returning its name here.
        """

        if self.therapeutic_class is not None and self.therapeutic_class.is_active and not self.therapeutic_class.is_discarded:
            return self.therapeutic_class.name
        return "Geral"
