"""
farmaura-api/app/repositories/order_repository.py

Order repository for Farmaura.

Responsibilities:
- load customer and operational order aggregates;
- persist checkout orders, lines, and fulfillment rows;
- isolate order, item, and fulfillment query patterns;

Observations:
- authoritative totals remain service-driven even when snapshots exist;
- repository methods assume tenant scoping has already been enforced upstream.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.models.order_item import OrderItem


# ============================================================================
# ORDER REPOSITORY
# ============================================================================


class OrderRepository:
    """Provide order persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_by_customer(self, *, tenant_id: str, customer_id: str) -> list[Order]:
        """Return orders scoped to a tenant and customer."""

        statement = (
            select(Order)
            .where(Order.tenant_id == tenant_id, Order.customer_id == customer_id)
            .order_by(Order.created_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_for_operations(self, *, tenant_id: str, store_id: str = "") -> list[Order]:
        """Return orders for the internal operations console."""

        statement = select(Order).where(Order.tenant_id == tenant_id, Order.is_active.is_(True))
        if store_id:
            statement = statement.where(Order.store_id == store_id)
        statement = statement.order_by(Order.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id(self, *, tenant_id: str, order_id: str, store_id: str = "") -> Order | None:
        """Return one tenant-scoped order by identifier."""

        statement = select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id, Order.is_active.is_(True))
        if store_id:
            statement = statement.where(Order.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_items(self, *, order_ids: list[str]) -> list[OrderItem]:
        """Return order items for the requested parent orders."""

        if not order_ids:
            return []
        statement = select(OrderItem).where(OrderItem.order_id.in_(order_ids)).order_by(OrderItem.created_at.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_items_by_customer(self, *, tenant_id: str, customer_id: str) -> list[OrderItem]:
        """Return every marketplace order line ever purchased by one customer."""

        statement = (
            select(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.tenant_id == tenant_id, Order.customer_id == customer_id)
            .order_by(OrderItem.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_item_by_id(self, *, tenant_id: str, order_id: str, item_id: str, store_id: str = "") -> OrderItem | None:
        """Return one tenant-scoped order item by identifier."""

        statement = (
            select(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                OrderItem.id == item_id,
                OrderItem.order_id == order_id,
                Order.tenant_id == tenant_id,
                Order.is_active.is_(True),
            )
        )
        if store_id:
            statement = statement.where(Order.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_fulfillments(self, *, order_ids: list[str]) -> list[OrderFulfillment]:
        """Return fulfillment rows for the requested orders."""

        if not order_ids:
            return []
        statement = select(OrderFulfillment).where(OrderFulfillment.order_id.in_(order_ids))
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_fulfillment_by_order_id(self, *, order_id: str) -> OrderFulfillment | None:
        """Return the one-to-one fulfillment row for an order."""

        statement = select(OrderFulfillment).where(OrderFulfillment.order_id == order_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_latest_board_revision(self, *, tenant_id: str, store_id: str = "") -> datetime | None:
        """Return the latest operational order update timestamp."""

        statement = select(func.max(Order.updated_at)).where(Order.tenant_id == tenant_id, Order.is_active.is_(True))
        if store_id:
            statement = statement.where(Order.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_latest_customer_revision(self, *, tenant_id: str, customer_id: str) -> datetime | None:
        """Return the latest update timestamp for one marketplace customer order set."""

        statement = select(func.max(Order.updated_at)).where(
            Order.tenant_id == tenant_id,
            Order.customer_id == customer_id,
            Order.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_order(self, order: Order) -> Order:
        """Persist one online order."""

        self.session.add(order)
        await self.session.flush()
        await self.session.refresh(order)
        return order

    async def add_order_item(self, item: OrderItem) -> OrderItem:
        """Persist one order line."""

        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def add_fulfillment(self, fulfillment: OrderFulfillment) -> OrderFulfillment:
        """Persist one order fulfillment row."""

        self.session.add(fulfillment)
        await self.session.flush()
        await self.session.refresh(fulfillment)
        return fulfillment

    async def get_active_delivery_route(self, *, tenant_id: str, store_id: str) -> DeliveryRoute | None:
        """Return the current open delivery route for one tenant-scoped store, if any."""

        statement = (
            select(DeliveryRoute)
            .where(
                DeliveryRoute.tenant_id == tenant_id,
                DeliveryRoute.store_id == store_id,
                DeliveryRoute.route_status.in_(["planned", "dispatched"]),
            )
            .order_by(DeliveryRoute.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_delivery_route(self, route: DeliveryRoute) -> DeliveryRoute:
        """Persist one delivery route row."""

        self.session.add(route)
        await self.session.flush()
        await self.session.refresh(route)
        return route

    async def save_delivery_route(self, route: DeliveryRoute) -> DeliveryRoute:
        """Flush updates for one existing delivery route row."""

        self.session.add(route)
        await self.session.flush()
        return route

    async def get_next_route_stop_sequence(self, *, route_id: str) -> int:
        """Return the next ordinal stop sequence for one delivery route."""

        statement = select(func.max(DeliveryRouteStop.stop_sequence)).where(DeliveryRouteStop.route_id == route_id)
        result = await self.session.execute(statement)
        current_max = result.scalar_one_or_none()
        return int(current_max or 0) + 1

    async def add_delivery_route_stop(self, stop: DeliveryRouteStop) -> DeliveryRouteStop:
        """Persist one delivery route stop row."""

        self.session.add(stop)
        await self.session.flush()
        await self.session.refresh(stop)
        return stop

    async def get_delivery_route_by_id(self, *, tenant_id: str, route_id: str) -> DeliveryRoute | None:
        """Return one tenant-scoped delivery route by identifier."""

        statement = select(DeliveryRoute).where(DeliveryRoute.id == route_id, DeliveryRoute.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_route_stops(self, *, route_id: str) -> list[DeliveryRouteStop]:
        """Return the ordered stops belonging to one delivery route."""

        statement = select(DeliveryRouteStop).where(DeliveryRouteStop.route_id == route_id).order_by(DeliveryRouteStop.stop_sequence)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_active_routes_for_driver(self, *, tenant_id: str, driver_user_id: str) -> list[DeliveryRoute]:
        """Return the open routes currently assigned to one driver."""

        statement = (
            select(DeliveryRoute)
            .where(
                DeliveryRoute.tenant_id == tenant_id,
                DeliveryRoute.driver_user_id == driver_user_id,
                DeliveryRoute.route_status.in_(["planned", "dispatched"]),
            )
            .order_by(DeliveryRoute.created_at.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_route_stop_by_id(self, *, stop_id: str) -> DeliveryRouteStop | None:
        """Return one delivery route stop by identifier, unscoped (caller must verify route ownership)."""

        statement = select(DeliveryRouteStop).where(DeliveryRouteStop.id == stop_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
