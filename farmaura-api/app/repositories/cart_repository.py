"""
farmaura-api/app/repositories/cart_repository.py

Cart repository for Farmaura.

Responsibilities:
- load and persist one customer's cart lines;
- keep cart ownership queries scoped to one customer;
- provide upsert semantics for quantity and subscription updates.

Observations:
- every query is scoped by customer_id in addition to RLS enforcement;
- price and stock are never read or written here; checkout revalidates both.
"""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart_item import CartItem


# ============================================================================
# CART REPOSITORY
# ============================================================================


class CartRepository:
    """Provide cart persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_for_customer(self, *, customer_id: str) -> list[CartItem]:
        """Return every cart line for one customer."""

        statement = (
            select(CartItem)
            .where(CartItem.customer_id == customer_id)
            .order_by(CartItem.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_for_customer(self, *, customer_id: str, product_ref: str) -> CartItem | None:
        """Return one cart line owned by the given customer."""

        statement = select(CartItem).where(
            CartItem.customer_id == customer_id,
            CartItem.product_ref == product_ref,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add(self, item: CartItem) -> CartItem:
        """Persist one new cart line."""

        self.session.add(item)
        await self.session.flush()
        return item

    async def save(self, item: CartItem) -> CartItem:
        """Flush updates for one existing cart line."""

        self.session.add(item)
        await self.session.flush()
        return item

    async def delete(self, item: CartItem) -> None:
        """Remove one cart line."""

        await self.session.delete(item)
        await self.session.flush()

    async def clear_for_customer(self, *, customer_id: str) -> None:
        """Remove every cart line for one customer."""

        statement = delete(CartItem).where(CartItem.customer_id == customer_id)
        await self.session.execute(statement)
