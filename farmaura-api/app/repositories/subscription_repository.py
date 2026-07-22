"""
farmaura-api/app/repositories/subscription_repository.py

Subscription repository for Farmaura.

Responsibilities:
- persist and load recurring purchase agreements for a customer;
- expose active subscription lookups used to avoid repeat recurrence suggestions;

Observations:
- product matching uses the denormalized product_name_snapshot since a
  subscription may outlive the inventory item it was created against.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Subscription


# ============================================================================
# SUBSCRIPTION REPOSITORY
# ============================================================================


class SubscriptionRepository:
    """Provide subscription persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_active_for_customer(self, *, tenant_id: str, customer_id: str) -> list[Subscription]:
        """Return every active (non-paused, non-cancelled) subscription for a customer."""

        statement = select(Subscription).where(
            Subscription.tenant_id == tenant_id,
            Subscription.customer_id == customer_id,
            Subscription.subscription_status == "active",
            Subscription.is_paused.is_(False),
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add(self, subscription: Subscription) -> Subscription:
        """Persist one new subscription."""

        self.session.add(subscription)
        await self.session.flush()
        await self.session.refresh(subscription)
        return subscription
