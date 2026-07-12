"""
farmaura-api/app/models/prescription.py

Prescription ORM model for Farmaura.

Responsibilities:
- persist the prescription submission sent by the customer through the marketplace;
- link the prescription to the customer, order, and pharmacist validation workflow;
- store the medical and operational snapshots required for secure dispensing;

Observations:
- uploaded files are linked through a dedicated child table to support multiple pages or attachments;
- validation details are modeled separately so the pharmacist checklist remains auditable;
"""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRESCRIPTION MODEL
# ============================================================================


class Prescription(Base, UuidModel, TimestampedModel):
    """Persist a customer prescription submission."""

    __tablename__ = "prescriptions"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), index=True, nullable=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True, nullable=True)
    reviewed_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    prescription_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    source_channel: Mapped[str] = mapped_column(String(24), default="marketplace", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    patient_name_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    patient_document_snapshot: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    patient_age_years: Mapped[int | None] = mapped_column(nullable=True)
    patient_phone_snapshot: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    doctor_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    doctor_license_number: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    prescription_type: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    issued_on_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    remaining_validity_days: Mapped[int | None] = mapped_column(nullable=True)
    submitted_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    reviewed_at_label: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    pharmacist_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    rejection_reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    has_controlled_medication: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_retention: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
