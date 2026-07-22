"""
farmaura-api/app/repositories/category_repository.py

Category repository for Farmaura.

Responsibilities:
- persist tenant-scoped product category records;
- expose filtered category read models for the internal console;

Observations:
- business validation remains in services even when repository queries are rich;
"""

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category


# ============================================================================
# CATEGORY REPOSITORY
# ============================================================================


class CategoryRepository:
    """Provide category persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_categories(self, *, tenant_id: str, active_only: bool = False) -> list[Category]:
        """Return tenant categories, optionally filtered by activity."""

        statement: Select[tuple[Category]] = select(Category).where(Category.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(Category.is_active.is_(True))
        statement = statement.order_by(Category.name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, category_id: str) -> Category | None:
        """Return a category by identifier for the tenant."""

        statement = select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_name(self, *, tenant_id: str, name: str) -> Category | None:
        """Return a category by exact name (case-insensitive) for the tenant."""

        statement = select(Category).where(
            Category.tenant_id == tenant_id, func.lower(Category.name) == name.strip().lower(),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_category(self, category: Category) -> Category:
        """Persist a new category."""

        self.session.add(category)
        await self.session.flush()
        await self.session.refresh(category)
        return category
