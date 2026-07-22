"""
farmaura-api/app/api/v1/products.py

Product routes for Farmaura.

Responsibilities:
- expose product identity/configuration endpoints for the internal console
  (SKU, brand, category, therapeutic class, EAN, controlled/generic flags,
  marketplace images);
- expose linking a product to a store as a zero-stock inventory item;

Observations:
- store-scoped stock operations (quantity, movements, transfers, pricing)
  stay under /inventory — see app/api/v1/inventory.py;
- products are never hard-deleted;
- is_active (status endpoint) and is_discarded (discard endpoint) are
  independent flags — deactivating a product never discards it, and
  discarding never changes its activation status.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.inventory import InventoryItemResponse
from app.schemas.product import (
    ProductCreateRequest,
    ProductDiscardUpdateRequest,
    ProductListResponse,
    ProductResponse,
    ProductStatusUpdateRequest,
    ProductStoreLinkRequest,
    ProductStoreLinksResponse,
    ProductUpdateRequest,
)
from app.services.product_service import ProductService


# ============================================================================
# PRODUCT ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=ProductListResponse)
async def list_products(
    query: str = Query(default="", max_length=120),
    active_only: bool = Query(default=False),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductListResponse:
    """Return tenant products with their store/stock summary."""

    service = ProductService(session=session, subject=subject)
    return await service.list_products(query=query, active_only=active_only)


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductResponse:
    """Create a new product."""

    service = ProductService(session=session, subject=subject)
    return await service.create_product(payload)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductResponse:
    """Update an existing product's configuration."""

    service = ProductService(session=session, subject=subject)
    return await service.update_product(product_id, payload)


@router.patch("/{product_id}/status", response_model=ProductResponse)
async def update_product_status(
    product_id: str,
    payload: ProductStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductResponse:
    """Activate or deactivate a product."""

    service = ProductService(session=session, subject=subject)
    return await service.update_product_status(product_id, payload)


@router.patch("/{product_id}/discard", response_model=ProductResponse)
async def update_product_discard(
    product_id: str,
    payload: ProductDiscardUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductResponse:
    """Discard a product (soft-delete) or recover it — independent of activation status."""

    service = ProductService(session=session, subject=subject)
    return await service.update_product_discard(product_id, payload)


@router.get("/{product_id}/stores", response_model=ProductStoreLinksResponse)
async def list_product_store_links(
    product_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> ProductStoreLinksResponse:
    """Return every store link (stock record) for a product."""

    service = ProductService(session=session, subject=subject)
    return await service.list_store_links(product_id)


@router.post("/{product_id}/stores", response_model=InventoryItemResponse, status_code=201)
async def link_product_to_store(
    product_id: str,
    payload: ProductStoreLinkRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
) -> InventoryItemResponse:
    """Link a product to a store by creating a zero-stock inventory item."""

    service = ProductService(session=session, subject=subject)
    return await service.link_store(product_id, payload)
