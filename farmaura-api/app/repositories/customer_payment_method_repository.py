"""
farmaura-api/app/repositories/customer_payment_method_repository.py

Customer payment method repository for Farmaura.

Responsibilities:
- load and persist tokenized customer payment method metadata;
- keep payment method ownership queries scoped to one customer;
- support primary-method rotation without leaking cross-customer rows.

Observations:
- only tokenized, non-sensitive metadata ever passes through this repository;
- no raw PAN, CVV, or full card number field exists on the model or here.
"""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer_payment_method import CustomerPaymentMethod


# ============================================================================
# CUSTOMER PAYMENT METHOD REPOSITORY
# ============================================================================


class CustomerPaymentMethodRepository:
    """Provide customer payment method persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_customer(self, *, customer_id: str) -> list[CustomerPaymentMethod]:
        """Return every active payment method for one customer, primary first."""

        statement = (
            select(CustomerPaymentMethod)
            .where(CustomerPaymentMethod.customer_id == customer_id, CustomerPaymentMethod.is_active.is_(True))
            .order_by(CustomerPaymentMethod.is_primary.desc(), CustomerPaymentMethod.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_for_customer(self, *, customer_id: str, payment_method_id: str) -> CustomerPaymentMethod | None:
        """Return one payment method owned by the given customer."""

        statement = select(CustomerPaymentMethod).where(
            CustomerPaymentMethod.id == payment_method_id,
            CustomerPaymentMethod.customer_id == customer_id,
            CustomerPaymentMethod.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def clear_primary(self, *, customer_id: str) -> None:
        """Unset the primary flag on every payment method for one customer."""

        statement = (
            update(CustomerPaymentMethod)
            .where(CustomerPaymentMethod.customer_id == customer_id, CustomerPaymentMethod.is_primary.is_(True))
            .values(is_primary=False)
        )
        await self.session.execute(statement)

    async def add(self, payment_method: CustomerPaymentMethod) -> CustomerPaymentMethod:
        """Persist one new payment method."""

        self.session.add(payment_method)
        await self.session.flush()
        return payment_method

    async def save(self, payment_method: CustomerPaymentMethod) -> CustomerPaymentMethod:
        """Flush updates for one existing payment method."""

        self.session.add(payment_method)
        await self.session.flush()
        return payment_method

    async def delete(self, payment_method: CustomerPaymentMethod) -> None:
        """Hard-delete one payment method."""

        await self.session.delete(payment_method)
        await self.session.flush()
