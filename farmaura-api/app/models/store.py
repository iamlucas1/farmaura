"""
farmaura-api/app/models/store.py

Physical store ORM model for Farmaura.

Responsibilities:
- persist tenant-scoped physical store/filial records;
- carry the address and coordinates other services key stock, orders, and
  delivery routing off of;
- replace the ad hoc store_id strings and derived store projections used
  before a real store registry existed.

Observations:
- inventory, PDV, and order rows reference stores.id once this model lands;
  existing rows are backfilled through a documented manual migration rather
  than an Alembic migration, consistent with this project's dev-phase policy.
"""

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# STORE MODEL
# ============================================================================


class Store(Base, UuidModel, TimestampedModel):
    """Persist one physical store/filial for a tenant."""

    __tablename__ = "stores"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_stores_tenant_code"),)

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    district: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    state_code: Mapped[str] = mapped_column(String(2), default="", nullable=False)
    postal_code: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    cnpj: Mapped[str] = mapped_column(String(18), default="", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
