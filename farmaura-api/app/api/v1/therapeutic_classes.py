"""
farmaura-api/app/api/v1/therapeutic_classes.py

Therapeutic class routes for Farmaura.

Responsibilities:
- expose therapeutic class (classe terapeutica) registration and
  maintenance endpoints for the internal console;
- enforce authenticated internal access for therapeutic class workflows;

Observations:
- therapeutic classes are never hard-deleted, only deactivated via the
  status endpoint;
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.therapeutic_class import (
    TherapeuticClassCreateRequest,
    TherapeuticClassDiscardUpdateRequest,
    TherapeuticClassListResponse,
    TherapeuticClassResponse,
    TherapeuticClassStatusUpdateRequest,
    TherapeuticClassUpdateRequest,
)
from app.services.therapeutic_class_service import TherapeuticClassService


# ============================================================================
# THERAPEUTIC CLASS ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=TherapeuticClassListResponse)
async def list_therapeutic_classes(
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> TherapeuticClassListResponse:
    """Return tenant therapeutic classes."""

    service = TherapeuticClassService(session=session, subject=subject)
    return await service.list_therapeutic_classes(active_only=active_only)


@router.post("", response_model=TherapeuticClassResponse, status_code=201)
async def create_therapeutic_class(
    payload: TherapeuticClassCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> TherapeuticClassResponse:
    """Create a new therapeutic class."""

    service = TherapeuticClassService(session=session, subject=subject)
    return await service.create_therapeutic_class(payload)


@router.put("/{therapeutic_class_id}", response_model=TherapeuticClassResponse)
async def update_therapeutic_class(
    therapeutic_class_id: str,
    payload: TherapeuticClassUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> TherapeuticClassResponse:
    """Update an existing therapeutic class."""

    service = TherapeuticClassService(session=session, subject=subject)
    return await service.update_therapeutic_class(therapeutic_class_id, payload)


@router.patch("/{therapeutic_class_id}/status", response_model=TherapeuticClassResponse)
async def update_therapeutic_class_status(
    therapeutic_class_id: str,
    payload: TherapeuticClassStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> TherapeuticClassResponse:
    """Activate or deactivate a therapeutic class."""

    service = TherapeuticClassService(session=session, subject=subject)
    return await service.update_therapeutic_class_status(therapeutic_class_id, payload)


@router.patch("/{therapeutic_class_id}/discard", response_model=TherapeuticClassResponse)
async def update_therapeutic_class_discard(
    therapeutic_class_id: str,
    payload: TherapeuticClassDiscardUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> TherapeuticClassResponse:
    """Discard a therapeutic class (soft-delete) or recover it — independent of activation status."""

    service = TherapeuticClassService(session=session, subject=subject)
    return await service.update_therapeutic_class_discard(therapeutic_class_id, payload)
