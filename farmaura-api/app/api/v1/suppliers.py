"""
farmaura-api/app/api/v1/suppliers.py

Supplier routes for Farmaura.

Responsibilities:
- expose supplier registration and maintenance endpoints for the internal console;
- enforce authenticated internal access for supplier workflows;

Observations:
- suppliers are never hard-deleted, only deactivated via the status endpoint;
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.supplier import (
    SupplierCreateRequest,
    SupplierListResponse,
    SupplierResponse,
    SupplierStatusUpdateRequest,
    SupplierUpdateRequest,
)
from app.services.supplier_service import SupplierService


# ============================================================================
# SUPPLIER ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=SupplierListResponse)
async def list_suppliers(
    query: str = Query(default="", max_length=120),
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> SupplierListResponse:
    """Return tenant suppliers."""

    service = SupplierService(session=session, subject=subject)
    return await service.list_suppliers(query=query, active_only=active_only)


@router.post("", response_model=SupplierResponse, status_code=201)
async def create_supplier(
    payload: SupplierCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> SupplierResponse:
    """Create a new supplier."""

    service = SupplierService(session=session, subject=subject)
    return await service.create_supplier(payload)


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str,
    payload: SupplierUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> SupplierResponse:
    """Update an existing supplier."""

    service = SupplierService(session=session, subject=subject)
    return await service.update_supplier(supplier_id, payload)


@router.patch("/{supplier_id}/status", response_model=SupplierResponse)
async def update_supplier_status(
    supplier_id: str,
    payload: SupplierStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> SupplierResponse:
    """Activate or deactivate a supplier."""

    service = SupplierService(session=session, subject=subject)
    return await service.update_supplier_status(supplier_id, payload)
