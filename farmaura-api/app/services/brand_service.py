"""
farmaura-api/app/services/brand_service.py

Brand service for Farmaura.

Responsibilities:
- execute product brand (marca) registration and maintenance use-cases;
- validate brand payloads before they reach persistence, including the
  many-to-many link to the suppliers that distribute the brand;
- assemble internal console responses from repository models;

Observations:
- brands are tenant-scoped and never hard-deleted, only deactivated, to
  preserve product references;
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.core.tenant_context import apply_tenant_context
from app.models.brand import Brand
from app.repositories.brand_repository import BrandRepository
from app.repositories.supplier_repository import SupplierRepository
from app.schemas.auth import TokenSubject
from app.schemas.brand import (
    BrandCreateRequest,
    BrandDiscardUpdateRequest,
    BrandListResponse,
    BrandResponse,
    BrandStatusUpdateRequest,
    BrandSupplierSummary,
    BrandUpdateRequest,
)
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE


# ============================================================================
# BRAND SERVICE
# ============================================================================


class BrandService:
    """Provide brand use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = BrandRepository(session)
        self.supplier_repository = SupplierRepository(session)

    async def list_brands(self, *, active_only: bool = False) -> BrandListResponse:
        """Return tenant brands."""

        brands = await self.repository.list_brands(tenant_id=str(self.subject.tenant_id), active_only=active_only)
        return BrandListResponse(items=[self._serialize(brand) for brand in brands])

    async def create_brand(self, payload: BrandCreateRequest) -> BrandResponse:
        """Create a new brand."""

        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Brand name already registered.")
        await self._ensure_suppliers_exist(payload.supplier_ids)
        brand = Brand(
            tenant_id=str(self.subject.tenant_id),
            name=payload.name,
            description=payload.description,
            logo_url=payload.logo_url,
            is_active=True,
        )
        brand = await self.repository.add_brand(brand)
        await self.repository.replace_suppliers(
            tenant_id=str(self.subject.tenant_id), brand_id=brand.id, supplier_ids=payload.supplier_ids,
        )
        await self.session.commit()
        # replace_suppliers() rewrites the join table directly, bypassing the
        # ORM relationship, so brand.suppliers needs an explicit reload — and
        # RLS context must be reapplied first: apply_tenant_context() sets
        # Postgres session variables as transaction-local, so commit() above
        # silently cleared them (see app/core/tenant_context.py).
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(brand, attribute_names=["suppliers"])
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(brand)

    async def update_brand(self, brand_id: str, payload: BrandUpdateRequest) -> BrandResponse:
        """Update an existing brand."""

        brand = await self._require_brand(brand_id)
        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None and existing.id != brand.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Brand name already registered.")
        await self._ensure_suppliers_exist(payload.supplier_ids)
        brand.name = payload.name
        brand.description = payload.description
        brand.logo_url = payload.logo_url
        await self.repository.replace_suppliers(
            tenant_id=str(self.subject.tenant_id), brand_id=brand.id, supplier_ids=payload.supplier_ids,
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(brand, attribute_names=["suppliers"])
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(brand)

    async def update_brand_status(self, brand_id: str, payload: BrandStatusUpdateRequest) -> BrandResponse:
        """Activate or deactivate a brand."""

        brand = await self._require_brand(brand_id)
        brand.is_active = payload.is_active
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(brand)

    async def update_brand_discard(self, brand_id: str, payload: BrandDiscardUpdateRequest) -> BrandResponse:
        """Discard a brand (soft-delete) or recover it — independent of is_active."""

        brand = await self._require_brand(brand_id)
        brand.is_discarded = payload.is_discarded
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(brand)

    async def _ensure_suppliers_exist(self, supplier_ids: list[str]) -> None:
        """Validate every referenced supplier belongs to the tenant."""

        for supplier_id in dict.fromkeys(supplier_ids):
            supplier = await self.supplier_repository.get_by_id(
                tenant_id=str(self.subject.tenant_id), supplier_id=supplier_id,
            )
            if supplier is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")

    async def _require_brand(self, brand_id: str) -> Brand:
        """Return an existing brand or fail with not found."""

        brand = await self.repository.get_by_id(tenant_id=str(self.subject.tenant_id), brand_id=brand_id)
        if brand is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
        return brand

    def _serialize(self, brand: Brand) -> BrandResponse:
        """Serialize a brand for API responses."""

        return BrandResponse(
            id=brand.id,
            name=brand.name,
            description=brand.description,
            logo_url=brand.logo_url,
            is_active=brand.is_active,
            is_discarded=brand.is_discarded,
            suppliers=[
                BrandSupplierSummary(id=supplier.id, legal_name=supplier.legal_name, trade_name=supplier.trade_name)
                for supplier in brand.suppliers
            ],
            created_at=brand.created_at,
            updated_at=brand.updated_at,
        )
