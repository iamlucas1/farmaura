"""
farmaura-api/app/models/prescription_check.py

Prescription validation check ORM model for Farmaura.

Responsibilities:
- persist the pharmacist checklist used to approve or reject a prescription;
- keep each validation rule explicit and independently auditable;
- support future expansion of medical validation criteria without schema churn on the parent entity;

Observations:
- check definitions are stored as snapshots because the validation rubric may evolve over time;
- one prescription can be reopened and rechecked while preserving the last stored checklist state;
"""

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampedModel, UuidModel


# ============================================================================
# PRESCRIPTION CHECK MODEL
# ============================================================================


class PrescriptionCheck(Base, UuidModel, TimestampedModel):
    """Persist one pharmacist validation check for a prescription."""

    __tablename__ = "prescription_checks"

    prescription_id: Mapped[str] = mapped_column(ForeignKey("prescriptions.id", ondelete="CASCADE"), index=True, nullable=False)
    check_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    check_label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_passed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
