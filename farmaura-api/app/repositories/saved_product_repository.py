"""
farmaura-api/app/repositories/saved_product_repository.py

Saved product (favorites) repository for Farmaura.

Responsibilities:
- load a customer's favorited products for the PDV upsell engine.

Observations:
- portal_service.py owns favorite creation/removal directly against the model
  (product_ref resolution lives there); this repository only adds the
  read-side lookup PurchaseHistoryService needs, to keep that write logic in
  one place.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_product import SavedProduct


# ============================================================================
# SAVED PRODUCT REPOSITORY
# ============================================================================


class SavedProductRepository:
    """Provide saved-product read operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_customer(self, *, tenant_id: str, customer_id: str) -> list[SavedProduct]:
        """Return every product favorited by one customer."""

        statement = select(SavedProduct).where(
            SavedProduct.tenant_id == tenant_id, SavedProduct.customer_id == customer_id,
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())
