"""
farmaura-api/app/models/driver_location.py

Driver live location ORM model for Farmaura.

Responsibilities:
- persist the single latest known GPS position reported by one delivery driver;
- keep the position scoped to the driver's tenant and store for RLS and dashboards;

Observations:
- one row per driver (unique driver_user_id) — every location ping upserts this
  row in place rather than appending history, since only the live position matters;
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# DRIVER LOCATION MODEL
# ============================================================================


class DriverLocation(Base, UuidModel, TimestampedModel):
    """Persist the latest reported GPS position for one delivery driver."""

    __tablename__ = "driver_locations"
    __table_args__ = (
        UniqueConstraint("driver_user_id", name="uq_driver_locations_driver_user_id"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), index=True, nullable=False)
    driver_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), default=Decimal("0.0000000"), nullable=False)
    accuracy_meters: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
