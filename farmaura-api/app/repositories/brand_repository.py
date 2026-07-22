"""
farmaura-api/app/repositories/brand_repository.py

Brand repository for Farmaura.

Responsibilities:
- persist tenant-scoped product brand records;
- manage the many-to-many link between a brand and its distributing suppliers;

Observations:
- business validation remains in services even when repository queries are rich;
"""

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.brand_supplier import BrandSupplier


# ============================================================================
# BRAND REPOSITORY
# ============================================================================


class BrandRepository:
    """Provide brand persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_brands(self, *, tenant_id: str, active_only: bool = False) -> list[Brand]:
        """Return tenant brands, optionally filtered by activity."""

        statement: Select[tuple[Brand]] = select(Brand).where(Brand.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(Brand.is_active.is_(True))
        statement = statement.order_by(Brand.name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, brand_id: str) -> Brand | None:
        """Return a brand by identifier for the tenant."""

        statement = select(Brand).where(Brand.id == brand_id, Brand.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_name(self, *, tenant_id: str, name: str) -> Brand | None:
        """Return a brand by exact name (case-insensitive) for the tenant."""

        statement = select(Brand).where(Brand.tenant_id == tenant_id, func.lower(Brand.name) == name.strip().lower())
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_brand(self, brand: Brand) -> Brand:
        """Persist a new brand."""

        self.session.add(brand)
        await self.session.flush()
        await self.session.refresh(brand)
        return brand

    async def replace_suppliers(self, *, tenant_id: str, brand_id: str, supplier_ids: list[str]) -> None:
        """Replace the full set of suppliers linked to a brand."""

        await self.session.execute(delete(BrandSupplier).where(BrandSupplier.brand_id == brand_id))
        for supplier_id in dict.fromkeys(supplier_ids):
            self.session.add(BrandSupplier(tenant_id=tenant_id, brand_id=brand_id, supplier_id=supplier_id))
        await self.session.flush()
