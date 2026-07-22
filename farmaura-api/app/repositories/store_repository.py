"""
farmaura-api/app/repositories/store_repository.py

Store repository for Farmaura.

Responsibilities:
- persist tenant-scoped physical store records;
- expose store lookups consumed by PDV, portal bootstrap, and delivery flows;

Observations:
- business validation remains in services even when repository queries are rich;
- repository methods assume tenant context has already been enforced upstream.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.store import Store


# ============================================================================
# STORE REPOSITORY
# ============================================================================


class StoreRepository:
    """Provide store persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_stores(self, *, tenant_id: str, active_only: bool = True) -> list[Store]:
        """Return tenant stores ordered by primary status then name."""

        statement = select(Store).where(Store.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(Store.is_active.is_(True))
        statement = statement.order_by(Store.is_primary.desc(), Store.name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, store_id: str) -> Store | None:
        """Return one store by identifier."""

        statement = select(Store).where(Store.id == store_id, Store.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_code(self, *, tenant_id: str, code: str) -> Store | None:
        """Return one store by its tenant-scoped code."""

        statement = select(Store).where(Store.tenant_id == tenant_id, Store.code == code)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_primary(self, *, tenant_id: str) -> Store | None:
        """Return the tenant's primary store, or the first active store as a fallback."""

        statement = (
            select(Store)
            .where(Store.tenant_id == tenant_id, Store.is_active.is_(True))
            .order_by(Store.is_primary.desc(), Store.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add(self, store: Store) -> Store:
        """Persist a new store."""

        self.session.add(store)
        await self.session.flush()
        await self.session.refresh(store)
        return store
