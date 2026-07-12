"""
farmaura-api/app/models/health_service.py

Health service ORM model for Farmaura.

Responsibilities:
- persist the service catalog offered by the pharmacy health desk;
- store pricing, duration, grouping, and presentation metadata for booking flows;
- provide the authoritative source for appointment selection in the marketplace;

Observations:
- store availability can be expanded later without changing the core service identity;
- display-oriented fields remain explicit because the service catalog is customer-facing;
"""

from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# HEALTH SERVICE MODEL
# ============================================================================


class HealthService(Base, UuidModel, TimestampedModel):
    """Persist a bookable health service."""

    __tablename__ = "health_services"
    __table_args__ = (
        CheckConstraint("price_amount >= 0", name="health_services_price_non_negative"),
        CheckConstraint("duration_minutes >= 0", name="health_services_duration_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    service_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    service_group: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    icon_name: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    duration_minutes: Mapped[int] = mapped_column(default=0, nullable=False)
    duration_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    price_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
