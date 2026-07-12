"""
farmaura-api/app/api/v1/prescriptions.py

Prescription routes for Farmaura.

Responsibilities:
- expose marketplace-safe and internal pharmacist prescription endpoints;
- keep medical-document handlers explicit and tenant-scoped;
- delegate review decisions to the dedicated service layer;

Observations:
- review actions are restricted to internal pharmacist roles;
- customer upload and retrieval flows can extend this router later;
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject, require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.prescriptions import (
    PrescriptionDecisionRequest,
    PrescriptionQueueItemResponse,
    PrescriptionQueueResponse,
    PrescriptionStatusResponse,
)
from app.services.operations_service import OperationsService
from app.services.prescription_service import PrescriptionService


# ============================================================================
# PRESCRIPTION ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=PrescriptionStatusResponse)
async def get_prescription_status(
    _: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
) -> PrescriptionStatusResponse:
    """Return the marketplace-visible prescription module readiness state."""

    service = OperationsService()
    return await service.get_status("Prescription workflows scaffolded.")


@router.get("/review-queue", response_model=PrescriptionQueueResponse)
async def list_prescription_review_queue(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PrescriptionQueueResponse:
    """Return the pharmacist prescription review queue."""

    service = PrescriptionService(session=session, subject=subject)
    return await service.list_review_queue()


@router.post("/{prescription_id}/decision", response_model=PrescriptionQueueItemResponse)
async def decide_prescription(
    prescription_id: str,
    payload: PrescriptionDecisionRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> PrescriptionQueueItemResponse:
    """Persist a pharmacist prescription decision."""

    service = PrescriptionService(session=session, subject=subject)
    return await service.decide(prescription_id, payload)

