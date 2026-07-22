"""
farmaura-api/app/repositories/product_availability_alert_repository.py

Product availability alert repository for Farmaura.

Responsibilities:
- load and persist one customer's back-in-stock notification requests;
- keep alert ownership queries scoped to one customer;
- look up pending (not yet notified) alerts for one product across a tenant.

Observations:
- every query is scoped by customer_id/tenant_id in addition to RLS enforcement.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_availability_alert import ProductAvailabilityAlert


# ============================================================================
# PRODUCT AVAILABILITY ALERT REPOSITORY
# ============================================================================


class ProductAvailabilityAlertRepository:
    """Provide availability alert persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_customer(self, *, customer_id: str) -> list[ProductAvailabilityAlert]:
        """Return every alert requested by one customer."""

        statement = (
            select(ProductAvailabilityAlert)
            .where(ProductAvailabilityAlert.customer_id == customer_id)
            .order_by(ProductAvailabilityAlert.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_for_customer(self, *, customer_id: str, product_ref: str) -> ProductAvailabilityAlert | None:
        """Return one alert owned by the given customer, if any."""

        statement = select(ProductAvailabilityAlert).where(
            ProductAvailabilityAlert.customer_id == customer_id,
            ProductAvailabilityAlert.product_ref == product_ref,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_pending_for_product(self, *, tenant_id: str, product_ref: str) -> list[ProductAvailabilityAlert]:
        """Return every not-yet-notified alert for one product across a tenant."""

        statement = select(ProductAvailabilityAlert).where(
            ProductAvailabilityAlert.tenant_id == tenant_id,
            ProductAvailabilityAlert.product_ref == product_ref,
            ProductAvailabilityAlert.notified_at.is_(None),
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add(self, alert: ProductAvailabilityAlert) -> ProductAvailabilityAlert:
        """Persist one new alert."""

        self.session.add(alert)
        await self.session.flush()
        return alert

    async def delete(self, alert: ProductAvailabilityAlert) -> None:
        """Remove one alert."""

        await self.session.delete(alert)
        await self.session.flush()
