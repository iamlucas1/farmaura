"""
farmaura-api/app/schemas/prescriptions.py

Prescription schemas for Farmaura.

Responsibilities:
- define protected prescription review contracts;
- keep pharmacist decisions explicit and auditable;
- provide console-ready payloads for the prescription queue;

Observations:
- document parsing remains outside these transport contracts;
- sensitive clinical responses stay minimal and tenant-scoped;
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# STATUS SCHEMAS
# ============================================================================


class PrescriptionStatusResponse(StrictModel):
    """Represent the prescription module readiness state."""

    status: str
    detail: str


# ============================================================================
# INTERNAL REVIEW SCHEMAS
# ============================================================================


class PrescriptionMedicationResponse(StrictModel):
    """Represent one prescribed medication line."""

    name: str
    dose: str
    qty: str
    match: bool


class PrescriptionCheckResponse(StrictModel):
    """Represent one pharmacist review check."""

    key: str
    label: str
    passed: bool
    note: str = ""


class PrescriptionQueueItemResponse(StrictModel):
    """Represent one prescription in the review queue."""

    id: str
    order: str
    patient: str
    age: int | None = None
    doctor: str
    crm: str
    type: str
    issued: str
    valid_days: int | None = None
    sent_at: str
    status: str
    meds: list[PrescriptionMedicationResponse]
    checks: list[PrescriptionCheckResponse]
    pharmacist_notes: str = ""
    rejection_reason: str = ""


class PrescriptionQueueResponse(StrictModel):
    """Represent the internal prescription queue."""

    items: list[PrescriptionQueueItemResponse]


class PrescriptionDecisionRequest(StrictModel):
    """Validate a pharmacist prescription decision."""

    status: str = Field(pattern="^(pending|approved|rejected)$")
    pharmacist_notes: str = Field(default="", max_length=2000)
    rejection_reason: str = Field(default="", max_length=2000)

