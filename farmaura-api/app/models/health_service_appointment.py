"""
farmaura-api/app/models/health_service_appointment.py

Health service appointment ORM model for Farmaura.

Responsibilities:
- persist customer bookings for pharmacy health services;
- link the booked service to the customer, store, and assigned professional;
- store the scheduling and attendance lifecycle used by account and operations views;

Observations:
- a dedicated store entity can be introduced later without breaking the current snapshots;
- appointment timestamps are currently stored as explicit labels to match the prototype flows;
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# HEALTH SERVICE APPOINTMENT MODEL
# ============================================================================


class HealthServiceAppointment(Base, UuidModel, TimestampedModel):
    """Persist a health service booking."""

    __tablename__ = "health_service_appointments"
    __table_args__ = (
        CheckConstraint("price_amount >= 0", name="health_service_appointments_price_non_negative"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    service_id: Mapped[str] = mapped_column(ForeignKey("health_services.id", ondelete="CASCADE"), index=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    appointment_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), default="marketplace", nullable=False)
    appointment_status: Mapped[str] = mapped_column(String(24), default="scheduled", nullable=False)
    service_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    professional_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    store_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    store_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    scheduled_date_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    scheduled_time_label: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    completed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    cancelled_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    price_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
