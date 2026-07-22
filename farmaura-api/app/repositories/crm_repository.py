"""
farmaura-api/app/repositories/crm_repository.py

CRM repository for Farmaura.

Responsibilities:
- load tenant-scoped customer relationship snapshots;
- keep CRM read access explicit and query-focused;
- isolate customer projections used by the pharmacist console;

Observations:
- CRM reads are denormalized because the current UI expects ready-to-render aggregates;
- future segmentation or campaign flows can extend this repository safely;
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer


# ============================================================================
# CRM REPOSITORY
# ============================================================================


class CrmRepository:
    """Provide CRM persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_customers(self, *, tenant_id: str) -> list[Customer]:
        """Return active customers for a tenant."""

        statement = (
            select(Customer)
            .where(Customer.tenant_id == tenant_id, Customer.is_active.is_(True))
            .order_by(Customer.full_name.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_cpf(self, *, tenant_id: str, cpf: str) -> Customer | None:
        """Return one tenant-scoped customer by CPF."""

        statement = select(Customer).where(Customer.tenant_id == tenant_id, Customer.cpf == cpf)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_email(self, *, tenant_id: str, email: str) -> Customer | None:
        """Return one tenant-scoped customer by e-mail."""

        statement = select(Customer).where(Customer.tenant_id == tenant_id, Customer.email == email)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add(self, customer: Customer) -> Customer:
        """Persist one new customer aggregate."""

        self.session.add(customer)
        await self.session.flush()
        await self.session.refresh(customer)
        return customer

