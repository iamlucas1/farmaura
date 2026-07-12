"""
farmaura-api/app/repositories/customer_address_repository.py

Customer address repository for Farmaura.

Responsibilities:
- load and persist reusable customer addresses;
- keep address ownership queries scoped to one customer;
- support primary-address rotation without leaking cross-customer rows.

Observations:
- every query is scoped by customer_id in addition to RLS enforcement;
- soft-deactivation is not used here; addresses are hard-deleted on request.
"""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer_address import CustomerAddress


# ============================================================================
# CUSTOMER ADDRESS REPOSITORY
# ============================================================================


class CustomerAddressRepository:
    """Provide customer address persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_customer(self, *, customer_id: str) -> list[CustomerAddress]:
        """Return every active address for one customer, primary first."""

        statement = (
            select(CustomerAddress)
            .where(CustomerAddress.customer_id == customer_id, CustomerAddress.is_active.is_(True))
            .order_by(CustomerAddress.is_primary.desc(), CustomerAddress.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_for_customer(self, *, customer_id: str, address_id: str) -> CustomerAddress | None:
        """Return one address owned by the given customer."""

        statement = select(CustomerAddress).where(
            CustomerAddress.id == address_id,
            CustomerAddress.customer_id == customer_id,
            CustomerAddress.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def clear_primary(self, *, customer_id: str) -> None:
        """Unset the primary flag on every address for one customer."""

        statement = (
            update(CustomerAddress)
            .where(CustomerAddress.customer_id == customer_id, CustomerAddress.is_primary.is_(True))
            .values(is_primary=False)
        )
        await self.session.execute(statement)

    async def add(self, address: CustomerAddress) -> CustomerAddress:
        """Persist one new address."""

        self.session.add(address)
        await self.session.flush()
        return address

    async def save(self, address: CustomerAddress) -> CustomerAddress:
        """Flush updates for one existing address."""

        self.session.add(address)
        await self.session.flush()
        return address

    async def delete(self, address: CustomerAddress) -> None:
        """Hard-delete one address."""

        await self.session.delete(address)
        await self.session.flush()
