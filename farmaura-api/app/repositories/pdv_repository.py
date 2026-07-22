"""
farmaura-api/app/repositories/pdv_repository.py

PDV repository for Farmaura.

Responsibilities:
- persist and load tenant-scoped PDV queue orders and finalized sales;
- isolate point-of-sale snapshots from UI logic;
- support pharmacist handoff and cashier completion flows;

Observations:
- inventory authority stays in services even when line snapshots are persisted here;
- PDV reads are optimized for the current console workflow rather than generic reuse;
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pdv_order import PdvOrder
from app.models.pdv_order_item import PdvOrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem


# ============================================================================
# PDV REPOSITORY
# ============================================================================


class PdvRepository:
    """Provide PDV persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_queue_orders(self, *, tenant_id: str, store_id: str = "") -> list[PdvOrder]:
        """Return queued or claimed PDV orders for the cashier flow."""

        statement = select(PdvOrder).where(PdvOrder.tenant_id == tenant_id, PdvOrder.order_status.in_(("queued", "claimed")))
        if store_id:
            statement = statement.where(PdvOrder.store_id == store_id)
        statement = statement.order_by(PdvOrder.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_order_by_id(self, *, tenant_id: str, order_id: str, store_id: str = "") -> PdvOrder | None:
        """Return one tenant-scoped PDV order."""

        statement = select(PdvOrder).where(PdvOrder.id == order_id, PdvOrder.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(PdvOrder.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_order_items(self, *, order_ids: list[str]) -> list[PdvOrderItem]:
        """Return line items for the requested PDV orders."""

        if not order_ids:
            return []
        statement = select(PdvOrderItem).where(PdvOrderItem.pdv_order_id.in_(order_ids)).order_by(PdvOrderItem.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_sale_items_by_customer(self, *, tenant_id: str, customer_id: str) -> list[PdvSaleItem]:
        """Return every balcão sale line ever purchased by one customer."""

        statement = (
            select(PdvSaleItem)
            .join(PdvSale, PdvSale.id == PdvSaleItem.pdv_sale_id)
            .where(PdvSale.tenant_id == tenant_id, PdvSale.customer_id == customer_id)
            .order_by(PdvSaleItem.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_order(self, order: PdvOrder) -> PdvOrder:
        """Persist a PDV queue order."""

        self.session.add(order)
        await self.session.flush()
        await self.session.refresh(order)
        return order

    async def add_order_item(self, item: PdvOrderItem) -> PdvOrderItem:
        """Persist one PDV queue line item."""

        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def list_sales(self, *, tenant_id: str, store_id: str = "") -> list[PdvSale]:
        """Return finalized PDV sales."""

        statement = select(PdvSale).where(PdvSale.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(PdvSale.store_id == store_id)
        statement = statement.order_by(PdvSale.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_sale_items(self, *, sale_ids: list[str]) -> list[PdvSaleItem]:
        """Return line items for the requested PDV sales."""

        if not sale_ids:
            return []
        statement = select(PdvSaleItem).where(PdvSaleItem.pdv_sale_id.in_(sale_ids)).order_by(PdvSaleItem.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_sale(self, sale: PdvSale) -> PdvSale:
        """Persist one finalized PDV sale."""

        self.session.add(sale)
        await self.session.flush()
        await self.session.refresh(sale)
        return sale

    async def add_sale_item(self, item: PdvSaleItem) -> PdvSaleItem:
        """Persist one finalized PDV sale line."""

        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

