"""
farmaura-api/app/repositories/product_view_event_repository.py

Product view event repository for Farmaura.

Responsibilities:
- persist one customer's product-detail page view;
- load a customer's view history for the PDV upsell engine.

Observations:
- every query is scoped by customer_id/tenant_id in addition to RLS enforcement.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product_view_event import ProductViewEvent


# ============================================================================
# PRODUCT VIEW EVENT REPOSITORY
# ============================================================================


class ProductViewEventRepository:
    """Provide product view event persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def add(self, event: ProductViewEvent) -> ProductViewEvent:
        """Persist one new view event."""

        self.session.add(event)
        await self.session.flush()
        return event

    async def list_for_customer(self, *, tenant_id: str, customer_id: str) -> list[ProductViewEvent]:
        """Return every product view logged by one customer."""

        statement = select(ProductViewEvent).where(
            ProductViewEvent.tenant_id == tenant_id, ProductViewEvent.customer_id == customer_id,
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())
