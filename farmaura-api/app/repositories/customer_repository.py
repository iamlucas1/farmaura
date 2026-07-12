"""
farmaura-api/app/repositories/customer_repository.py

Customer repository for Farmaura.

Responsibilities:
- load marketplace customer identities for checkout and account flows;
- keep customer lookup queries out of route and service layers;
- provide minimal persistence hooks for customer-linked commerce workflows;

Observations:
- marketplace checkout resolves the customer by authenticated user email;
- richer customer writes can expand here without changing transport contracts.
"""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer


# ============================================================================
# CUSTOMER REPOSITORY
# ============================================================================


class CustomerRepository:
    """Provide customer persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def get_by_email(self, *, tenant_id: str, email: str) -> Customer | None:
        """Return one tenant-scoped customer by email."""

        statement = select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.email == email,
            Customer.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_cpf(self, *, tenant_id: str, cpf: str) -> Customer | None:
        """Return one tenant-scoped customer by CPF."""

        statement = select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.cpf == cpf,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_or_create(self, *, tenant_id: str, user_id: str, email: str, full_name: str) -> Customer:
        """Return the tenant-scoped customer linked to one user, provisioning a minimal profile when absent."""

        customer = await self.get_by_email(tenant_id=tenant_id, email=email)
        if customer is not None:
            return customer
        customer = Customer(
            id=str(uuid4()),
            tenant_id=tenant_id,
            external_code="usr-" + user_id,
            full_name=full_name or "Cliente Farmaura",
            email=email,
            phone="",
            cpf=None,
            birth_date="",
            gender="",
            avatar_url="",
            loyalty_tier="Novo",
            is_recurring=False,
            two_factor_enabled=False,
            member_since_label="Agora",
            city_label="",
            district_label="",
        )
        return await self.add(customer)

    async def add(self, customer: Customer) -> Customer:
        """Persist one customer aggregate."""

        self.session.add(customer)
        await self.session.flush()
        return customer

    async def save(self, customer: Customer) -> Customer:
        """Flush updates for one existing customer aggregate."""

        self.session.add(customer)
        await self.session.flush()
        return customer
