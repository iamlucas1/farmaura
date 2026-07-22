"""
farmaura-api/app/api/v1/brands.py

Brand routes for Farmaura.

Responsibilities:
- expose product brand (marca) registration and maintenance endpoints for
  the internal console, including the link to distributing suppliers;
- enforce authenticated internal access for brand workflows;

Observations:
- brands are never hard-deleted, only deactivated via the status endpoint;
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.brand import (
    BrandCreateRequest,
    BrandDiscardUpdateRequest,
    BrandListResponse,
    BrandResponse,
    BrandStatusUpdateRequest,
    BrandUpdateRequest,
)
from app.services.brand_service import BrandService


# ============================================================================
# BRAND ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=BrandListResponse)
async def list_brands(
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> BrandListResponse:
    """Return tenant brands."""

    service = BrandService(session=session, subject=subject)
    return await service.list_brands(active_only=active_only)


@router.post("", response_model=BrandResponse, status_code=201)
async def create_brand(
    payload: BrandCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> BrandResponse:
    """Create a new brand."""

    service = BrandService(session=session, subject=subject)
    return await service.create_brand(payload)


@router.put("/{brand_id}", response_model=BrandResponse)
async def update_brand(
    brand_id: str,
    payload: BrandUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> BrandResponse:
    """Update an existing brand."""

    service = BrandService(session=session, subject=subject)
    return await service.update_brand(brand_id, payload)


@router.patch("/{brand_id}/status", response_model=BrandResponse)
async def update_brand_status(
    brand_id: str,
    payload: BrandStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> BrandResponse:
    """Activate or deactivate a brand."""

    service = BrandService(session=session, subject=subject)
    return await service.update_brand_status(brand_id, payload)


@router.patch("/{brand_id}/discard", response_model=BrandResponse)
async def update_brand_discard(
    brand_id: str,
    payload: BrandDiscardUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> BrandResponse:
    """Discard a brand (soft-delete) or recover it — independent of activation status."""

    service = BrandService(session=session, subject=subject)
    return await service.update_brand_discard(brand_id, payload)
