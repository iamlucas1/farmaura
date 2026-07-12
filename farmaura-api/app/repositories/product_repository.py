"""
farmaura-api/app/repositories/product_repository.py

Product repository for Farmaura.

Responsibilities:
- list active catalog products by tenant;
- keep catalog queries isolated from route handlers;
- prepare persistence hooks for future filters;

Observations:
- pagination is applied explicitly at the query layer;
- tenant scope is mandatory for catalog data;
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product


# ============================================================================
# PRODUCT REPOSITORY
# ============================================================================


class ProductRepository:
    """Provide product persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_active(self, *, tenant_id: str, limit: int, offset: int) -> list[Product]:
        """Return a bounded list of active tenant products."""

        statement = (
            select(Product)
            .where(Product.tenant_id == tenant_id, Product.is_active.is_(True))
            .order_by(Product.name.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())
