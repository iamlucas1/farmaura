"""
farmaura-api/app/api/v1/stores.py

Store routes for Farmaura.

Responsibilities:
- expose store administration endpoints for the internal console;
- enforce admin-only mutation access while allowing broader internal reads;
- keep transport logic thin and service-driven.

Observations:
- store reads are used by PDV to populate the operating-store selector;
- store writes stay admin-only since they affect fiscal and delivery data.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.store import StoreCreateRequest, StoreListResponse, StoreResponse, StoreUpdateRequest
from app.services.store_service import StoreService


# ============================================================================
# STORE ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=StoreListResponse)
async def list_stores(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session: AsyncSession = Depends(get_subject_session),
) -> StoreListResponse:
    """Return every active store for the tenant."""

    service = StoreService(session=session, subject=subject)
    return await service.list_stores(active_only=True)


@router.post("", response_model=StoreResponse)
async def create_store(
    payload: StoreCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> StoreResponse:
    """Register a new physical store."""

    service = StoreService(session=session, subject=subject)
    return await service.create_store(payload)


@router.patch("/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: str,
    payload: StoreUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> StoreResponse:
    """Update an existing store."""

    service = StoreService(session=session, subject=subject)
    return await service.update_store(store_id, payload)
