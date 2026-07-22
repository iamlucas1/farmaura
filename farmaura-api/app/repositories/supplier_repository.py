"""
farmaura-api/app/repositories/supplier_repository.py

Supplier repository for Farmaura.

Responsibilities:
- persist tenant-scoped supplier records;
- expose filtered supplier read models for the internal console;

Observations:
- business validation remains in services even when repository queries are rich;
"""

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier


# ============================================================================
# SUPPLIER REPOSITORY
# ============================================================================


class SupplierRepository:
    """Provide supplier persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_suppliers(
        self,
        *,
        tenant_id: str,
        query: str = "",
        active_only: bool = False,
    ) -> list[Supplier]:
        """Return tenant suppliers, optionally filtered by query or activity."""

        statement: Select[tuple[Supplier]] = select(Supplier).where(Supplier.tenant_id == tenant_id)
        if active_only:
            statement = statement.where(Supplier.is_active.is_(True))
        if query:
            pattern = "%" + query.strip().lower() + "%"
            statement = statement.where(
                or_(
                    func.lower(Supplier.legal_name).like(pattern),
                    func.lower(Supplier.trade_name).like(pattern),
                    func.lower(Supplier.cnpj).like(pattern),
                    func.lower(Supplier.category).like(pattern),
                )
            )
        statement = statement.order_by(Supplier.legal_name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, supplier_id: str) -> Supplier | None:
        """Return a supplier by identifier for the tenant."""

        statement = select(Supplier).where(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_cnpj(self, *, tenant_id: str, cnpj: str) -> Supplier | None:
        """Return a supplier by CNPJ for the tenant."""

        statement = select(Supplier).where(Supplier.tenant_id == tenant_id, Supplier.cnpj == cnpj)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_supplier(self, supplier: Supplier) -> Supplier:
        """Persist a new supplier."""

        self.session.add(supplier)
        await self.session.flush()
        await self.session.refresh(supplier)
        return supplier
