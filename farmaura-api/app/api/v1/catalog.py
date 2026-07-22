"""
farmaura-api/app/api/v1/catalog.py

Catalog routes for Farmaura.

Responsibilities:
- expose bounded catalog reads;
- validate caller scope through authenticated subject context when required;
- delegate catalog logic to the service layer;

Observations:
- the public catalog route exposes only the minimum product fields required by the marketplace;
- authenticated catalog reads remain tenant-scoped.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session, get_subject_session, require_marketplace_subject
from app.core.rate_limit import PUBLIC_RATE_LIMIT, rate_limit
from app.schemas.auth import TokenSubject
from app.schemas.catalog import CatalogListResponse, PublicCatalogListResponse
from app.services.catalog_service import CatalogService


# ============================================================================
# CATALOG ROUTES
# ============================================================================


router = APIRouter()


@router.get("", response_model=CatalogListResponse)
async def list_catalog(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session: AsyncSession = Depends(get_subject_session),
) -> CatalogListResponse:
    """Return the tenant-scoped authenticated catalog listing, personalized by active promotions."""

    service = CatalogService(session=session)
    return await service.list_products(
        tenant_id=str(subject.tenant_id),
        page=page,
        page_size=page_size,
        subject=subject,
        user_agent=request.headers.get("user-agent", ""),
    )


@router.get("/public", response_model=PublicCatalogListResponse, dependencies=[Depends(rate_limit(PUBLIC_RATE_LIMIT))])
async def list_public_catalog(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> PublicCatalogListResponse:
    """Return a public catalog listing with limited marketplace-safe fields."""

    service = CatalogService(session=session)
    return await service.list_public_products(page=page, page_size=page_size)
