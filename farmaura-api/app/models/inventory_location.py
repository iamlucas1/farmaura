"""
farmaura-api/app/models/inventory_location.py

Inventory storage location ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped storage locations for inventory operations;
- describe internal shelves, cabinets, and controlled storage areas;
- support stock allocation and transfer workflows;

Observations:
- location codes remain stable operational identifiers for the internal console;
- inventory items keep a denormalized current location label for fast reads;
"""

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# INVENTORY LOCATION MODEL
# ============================================================================


class InventoryLocation(Base, UuidModel, TimestampedModel):
    """Persist an inventory storage location."""

    __tablename__ = "inventory_locations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "store_id", "code", name="uq_inventory_locations_store_code"),
        CheckConstraint("char_length(code) >= 2", name="inventory_locations_code_min_length"),
        CheckConstraint(
            "location_type IN ('estoque', 'prateleira', 'gondola', 'caixa', 'outro')",
            name="inventory_locations_type_allowed",
        ),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="RESTRICT"), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    zone: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    temperature_range: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    location_type: Mapped[str] = mapped_column(String(24), default="estoque", nullable=False)
    is_controlled_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
