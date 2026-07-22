"""
farmaura-api/app/repositories/therapeutic_class_repository.py

Therapeutic class repository for Farmaura.

Responsibilities:
- persist tenant-scoped therapeutic class (classe terapeutica) records;
- expose filtered therapeutic class read models for the internal console;

Observations:
- business validation remains in services even when repository queries are rich;
"""

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.therapeutic_class import TherapeuticClass


# ============================================================================
# THERAPEUTIC CLASS REPOSITORY
# ============================================================================


class TherapeuticClassRepository:
    """Provide therapeutic class persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_therapeutic_classes(self, *, tenant_id: str, active_only: bool = False) -> list[TherapeuticClass]:
        """Return tenant therapeutic classes, optionally filtered by activity."""

        statement: Select[tuple[TherapeuticClass]] = select(TherapeuticClass).where(
            TherapeuticClass.tenant_id == tenant_id,
        )
        if active_only:
            statement = statement.where(TherapeuticClass.is_active.is_(True))
        statement = statement.order_by(TherapeuticClass.name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, therapeutic_class_id: str) -> TherapeuticClass | None:
        """Return a therapeutic class by identifier for the tenant."""

        statement = select(TherapeuticClass).where(
            TherapeuticClass.id == therapeutic_class_id, TherapeuticClass.tenant_id == tenant_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_name(self, *, tenant_id: str, name: str) -> TherapeuticClass | None:
        """Return a therapeutic class by exact name (case-insensitive) for the tenant."""

        statement = select(TherapeuticClass).where(
            TherapeuticClass.tenant_id == tenant_id, func.lower(TherapeuticClass.name) == name.strip().lower(),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_therapeutic_class(self, therapeutic_class: TherapeuticClass) -> TherapeuticClass:
        """Persist a new therapeutic class."""

        self.session.add(therapeutic_class)
        await self.session.flush()
        await self.session.refresh(therapeutic_class)
        return therapeutic_class
