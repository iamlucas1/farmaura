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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, get_subject_session, require_internal_subject
from app.core.rate_limit import PUBLIC_RATE_LIMIT, rate_limit
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.brand import (
    BrandCreateRequest,
    BrandDiscardUpdateRequest,
    BrandListResponse,
    BrandResponse,
    BrandStatusUpdateRequest,
    BrandUpdateRequest,
    PublicBrandResponse,
)
from app.services.brand_service import BrandService


# ============================================================================
# BRAND ROUTES
# ============================================================================


router = APIRouter()


@router.get(
    "/public/{brand_name}",
    response_model=PublicBrandResponse,
    dependencies=[Depends(rate_limit(PUBLIC_RATE_LIMIT))],
)
async def get_public_brand(
    brand_name: str,
    session: AsyncSession = Depends(get_session),
) -> PublicBrandResponse:
    """Return the public-safe subset of one brand, for the marketplace brand page."""

    service = BrandService(session=session)
    brand = await service.get_public_brand(name=brand_name)
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
    return brand


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
