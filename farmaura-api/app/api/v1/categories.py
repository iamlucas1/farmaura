"""
farmaura-api/app/api/v1/categories.py

Category routes for Farmaura.

Responsibilities:
- expose product category registration and maintenance endpoints for the
  internal console;
- enforce authenticated internal access for category workflows;

Observations:
- categories are never hard-deleted, only deactivated via the status endpoint;
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.category import (
    CategoryCreateRequest,
    CategoryDiscardUpdateRequest,
    CategoryListResponse,
    CategoryResponse,
    CategoryStatusUpdateRequest,
    CategoryUpdateRequest,
)
from app.services.category_service import CategoryService


# ============================================================================
# CATEGORY ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=CategoryListResponse)
async def list_categories(
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CategoryListResponse:
    """Return tenant categories."""

    service = CategoryService(session=session, subject=subject)
    return await service.list_categories(active_only=active_only)


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(
    payload: CategoryCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CategoryResponse:
    """Create a new category."""

    service = CategoryService(session=session, subject=subject)
    return await service.create_category(payload)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    payload: CategoryUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CategoryResponse:
    """Update an existing category."""

    service = CategoryService(session=session, subject=subject)
    return await service.update_category(category_id, payload)


@router.patch("/{category_id}/status", response_model=CategoryResponse)
async def update_category_status(
    category_id: str,
    payload: CategoryStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CategoryResponse:
    """Activate or deactivate a category."""

    service = CategoryService(session=session, subject=subject)
    return await service.update_category_status(category_id, payload)


@router.patch("/{category_id}/discard", response_model=CategoryResponse)
async def update_category_discard(
    category_id: str,
    payload: CategoryDiscardUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> CategoryResponse:
    """Discard a category (soft-delete) or recover it — independent of activation status."""

    service = CategoryService(session=session, subject=subject)
    return await service.update_category_discard(category_id, payload)
