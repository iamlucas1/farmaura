"""
farmaura-api/app/services/delivery_service.py

Delivery assignment and live-tracking service for Farmaura.

Responsibilities:
- assign a real delivery-route driver and cascade the assignment to every stop's fulfillment;
- expose a lightweight live-tracking payload combining route stop status and driver GPS;
- expose the driver-facing route view, location pings, and stop-completion use-cases;

Observations:
- assignment cascades driver_name onto OrderFulfillment so that field stops being
  permanently empty; driver_phone stays empty since User has no phone column today;
- GPS pings upsert a single driver_locations row (only the live position matters);
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import OrderStatus, UserRole
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.driver_location import DriverLocation
from app.models.order import Order
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.deliveries import (
    DeliveryLiveStopResponse,
    DeliveryLocationPingRequest,
    DeliveryRouteLiveResponse,
    DeliveryStopResponse,
    DriverAssignRequest,
    DriverAssignResponse,
    MyDeliveryRouteListResponse,
    MyDeliveryRouteResponse,
)


# ============================================================================
# DELIVERY SERVICE
# ============================================================================


class DeliveryService:
    """Provide delivery-route driver assignment and live-tracking use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.order_repository = OrderRepository(session)
        self.user_repository = UserRepository(session)
        self.inventory_repository = InventoryRepository(session)

    async def assign_driver(self, *, route_id: str, payload: DriverAssignRequest) -> DriverAssignResponse:
        """Assign (or clear) the driver responsible for one delivery route."""

        tenant_id = str(self.subject.tenant_id)
        route = await self.order_repository.get_delivery_route_by_id(tenant_id=tenant_id, route_id=route_id)
        if route is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery route not found.")

        driver_name = ""
        if payload.driver_user_id:
            driver = await self.user_repository.get_by_id_for_tenant(tenant_id=tenant_id, user_id=payload.driver_user_id)
            if driver is None or driver.role != UserRole.DRIVER.value:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
            driver_name = driver.full_name
            route.driver_user_id = driver.id
        else:
            route.driver_user_id = None
        route.driver_name_snapshot = driver_name

        stops = await self.order_repository.list_route_stops(route_id=route.id)
        for stop in stops:
            if not stop.order_id:
                continue
            fulfillment = await self.order_repository.get_fulfillment_by_order_id(order_id=stop.order_id)
            if fulfillment is not None:
                fulfillment.driver_name = driver_name

        await self.session.commit()
        return DriverAssignResponse(route_id=route.id, driver_user_id=route.driver_user_id or "", driver_name=driver_name)

    async def get_live_route(self) -> DeliveryRouteLiveResponse:
        """Return a lightweight live-tracking snapshot for the active delivery route."""

        tenant_id = str(self.subject.tenant_id)
        store_id = await self._resolve_store_id()
        route = await self.order_repository.get_active_delivery_route(tenant_id=tenant_id, store_id=store_id)
        if route is None:
            return DeliveryRouteLiveResponse()

        stops = await self.order_repository.list_route_stops(route_id=route.id)
        driver_lat = driver_lng = None
        driver_updated_label = ""
        if route.driver_user_id:
            location = await self._get_driver_location(route.driver_user_id)
            if location is not None:
                driver_lat = location.latitude
                driver_lng = location.longitude
                driver_updated_label = location.recorded_at.strftime("%H:%M")

        return DeliveryRouteLiveResponse(
            revision=datetime.now(UTC).isoformat(),
            route_id=route.id,
            driver_user_id=route.driver_user_id or "",
            driver_lat=driver_lat,
            driver_lng=driver_lng,
            driver_updated_label=driver_updated_label,
            stops=[DeliveryLiveStopResponse(id=stop.id, order_id=stop.order_id or "", status=stop.stop_status) for stop in stops],
        )

    async def get_my_routes(self) -> MyDeliveryRouteListResponse:
        """Return every route currently assigned to the authenticated driver."""

        tenant_id = str(self.subject.tenant_id)
        driver_user_id = str(self.subject.user_id)
        routes = await self.order_repository.list_active_routes_for_driver(tenant_id=tenant_id, driver_user_id=driver_user_id)
        items = []
        for route in routes:
            stop_rows = (
                await self.session.execute(
                    select(DeliveryRouteStop, Order.order_code)
                    .join(Order, Order.id == DeliveryRouteStop.order_id)
                    .where(DeliveryRouteStop.route_id == route.id)
                    .order_by(DeliveryRouteStop.stop_sequence)
                )
            ).all()
            items.append(
                MyDeliveryRouteResponse(
                    id=route.id,
                    code=route.route_code,
                    status=route.route_status,
                    hub_name=route.origin_name,
                    hub_address=route.origin_address,
                    hub_lat=route.origin_latitude,
                    hub_lng=route.origin_longitude,
                    stops=[
                        DeliveryStopResponse(
                            id=stop.id,
                            order_id=stop.order_id or "",
                            order_code=order_code or "",
                            customer=stop.customer_name_snapshot,
                            address=stop.address_line_snapshot,
                            district=stop.district_snapshot,
                            cep=stop.postal_code_snapshot,
                            status=stop.stop_status,
                            lat=stop.latitude,
                            lng=stop.longitude,
                            navigation_url=stop.navigation_url,
                        )
                        for stop, order_code in stop_rows
                    ],
                )
            )
        return MyDeliveryRouteListResponse(items=items)

    async def ping_location(self, payload: DeliveryLocationPingRequest) -> None:
        """Upsert the authenticated driver's latest GPS position."""

        if not self.subject.store_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Entregador sem loja atribuída.")
        driver_user_id = str(self.subject.user_id)
        location = await self._get_driver_location(driver_user_id)
        now = datetime.now(UTC)
        if location is None:
            location = DriverLocation(
                id=str(uuid4()),
                tenant_id=str(self.subject.tenant_id),
                store_id=str(self.subject.store_id),
                driver_user_id=driver_user_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                accuracy_meters=payload.accuracy_meters,
                recorded_at=now,
            )
            self.session.add(location)
        else:
            location.latitude = payload.latitude
            location.longitude = payload.longitude
            location.accuracy_meters = payload.accuracy_meters
            location.recorded_at = now
        await self.session.commit()

    async def mark_stop_delivered(self, stop_id: str) -> None:
        """Mark one of the driver's own route stops as delivered and complete its order."""

        tenant_id = str(self.subject.tenant_id)
        driver_user_id = str(self.subject.user_id)
        stop = await self.order_repository.get_route_stop_by_id(stop_id=stop_id)
        if stop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery stop not found.")
        route = await self.order_repository.get_delivery_route_by_id(tenant_id=tenant_id, route_id=stop.route_id)
        if route is None or route.driver_user_id != driver_user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery stop not found.")
        if not stop.order_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="This stop has no linked order.")
        order = await self.order_repository.get_by_id(tenant_id=tenant_id, order_id=stop.order_id)
        if order is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
        if order.status != OrderStatus.DISPATCHED.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Order has not been dispatched yet.")

        now = datetime.now(UTC)
        stop.stop_status = "delivered"
        stop.delivered_at_label = now.strftime("%H:%M")
        order.status = OrderStatus.DELIVERED.value
        order.completed_at_label = "Entregue"
        order.updated_at = now
        fulfillment = await self.order_repository.get_fulfillment_by_order_id(order_id=order.id)
        if fulfillment is not None:
            fulfillment.delivered_at_label = now.strftime("%H:%M")
        await self.session.commit()

    async def _resolve_store_id(self) -> str:
        """Resolve the active store for the current admin/manager/pharmacist subject."""

        if self.subject.store_id:
            return str(self.subject.store_id)
        return await self.inventory_repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))

    async def _get_driver_location(self, driver_user_id: str) -> DriverLocation | None:
        """Return the latest known GPS position for one driver, if any."""

        statement = select(DriverLocation).where(DriverLocation.driver_user_id == driver_user_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
