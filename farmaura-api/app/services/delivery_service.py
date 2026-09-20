"""
farmaura-api/app/services/delivery_service.py

Delivery route planning, assignment, and live-tracking service for Farmaura.

Responsibilities:
- split every currently pending delivery stop into one route per driver, using
  a real graph search (bidirectional Dijkstra over a k-nearest-neighbor
  proximity graph, app/domain/geo.py) both to decide which stops go together
  (sweep clustering around the store) and the order each route visits them in;
- list every currently active route for a store — a store can have several
  running at once, one per driver currently out;
- assign a real delivery-route driver and cascade the assignment to every
  stop's fulfillment;
- expose a lightweight live-tracking payload combining route stop status and
  driver GPS, one entry per active route;
- expose the driver-facing route view, location pings, and stop-completion use-cases;

Observations:
- planning reassigns existing DeliveryRouteStop rows to their new route (route_id
  + stop_sequence) instead of recreating them, so picked/stop_status state on a
  stop already being worked survives a replan; a pending order that never had a
  stop row at all (a real gap, not just a seed-data artifact — see the
  2026-09-19 ADR on the deliveries screen) gets one created fresh;
- GPS pings upsert a single driver_locations row (only the live position matters);
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import apply_tenant_context
from app.domain.enums import OrderStatus, UserRole
from app.domain.geo import Coordinate, haversine_km, nearest_neighbor_order_via_graph, route_length_km, sweep_clusters
from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.driver_location import DriverLocation
from app.models.order import Order
from app.models.order_fulfillment import OrderFulfillment
from app.repositories.chat_repository import ChatRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.services.cashback_service import CashbackService
from app.services.delivery_pricing_service import DeliveryPricingService
from app.services.routing_client import RoutingClient
from app.schemas.auth import TokenSubject
from app.schemas.deliveries import (
    DeliveryDriverListResponse,
    DeliveryDriverResponse,
    DeliveryLiveResponse,
    DeliveryLiveStopResponse,
    DeliveryLocationPingRequest,
    DeliveryRouteGeometryPointResponse,
    DeliveryRouteLiveItemResponse,
    DeliveryRouteListResponse,
    DeliveryRouteResponse,
    DeliveryRouteStopResponse,
    DeliveryStopResponse,
    DriverAssignRequest,
    DriverAssignResponse,
    MyDeliveryRouteListResponse,
    MyDeliveryRouteResponse,
    PlanDeliveryRoutesRequest,
)

PENDING_ORDER_STATUSES = {OrderStatus.NEW.value, OrderStatus.SEPARATING.value, OrderStatus.READY.value}
AVG_CITY_SPEED_KMH = Decimal("22")  # motoboy/car average in city traffic, not highway
DWELL_MINUTES_PER_STOP = Decimal("5")  # parking + handoff at the door


def _has_real_coords(lat: Decimal | None, lng: Decimal | None) -> bool:
    """A coordinate that is present but pinned at (0,0) means geocoding silently failed (see
    dev-obsidian/farmaura/05_Integracoes_Infra/Geocoding_Nominatim.md) — treat that as missing."""

    if lat is None or lng is None:
        return False
    return lat != Decimal("0.0000000") or lng != Decimal("0.0000000")


def _estimate_minutes(total_km: Decimal, stop_count: int) -> int:
    """Real (if approximate) ETA from a route's real length: average city-traffic speed plus a
    fixed per-stop handoff allowance — not the flat "25 min x stop count" seed used to hardcode."""

    return int(total_km / AVG_CITY_SPEED_KMH * Decimal("60") + DWELL_MINUTES_PER_STOP * Decimal(stop_count))


@dataclass
class _PlannableOrder:
    """One pending delivery order being planned into a route, with its resolved coordinate (or
    None when geocoding never produced a real one)."""

    order: Order
    fulfillment: OrderFulfillment | None
    coordinate: Coordinate | None


def _geocoded_coordinate(plannable: _PlannableOrder) -> Coordinate:
    """Return `plannable.coordinate`, narrowed to non-optional for callers that already filtered
    to only geocoded entries (e.g. `[p for p in plannable_list if p.coordinate is not None]`)."""

    assert plannable.coordinate is not None  # guaranteed by the caller's filter
    return plannable.coordinate


# ============================================================================
# DELIVERY SERVICE
# ============================================================================


class DeliveryService:
    """Provide delivery-route planning, driver assignment, and live-tracking use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.order_repository = OrderRepository(session)
        self.user_repository = UserRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.store_repository = StoreRepository(session)

    async def list_drivers(self, *, requested_store_id: str = "") -> DeliveryDriverListResponse:
        """Return every driver based at the caller's store — deliberately narrower than
        `/team/members` (admin-only, whole-tenant roster): any of the roles that plan delivery
        routes (admin/manager/pharmacist) can call this to populate a driver picker, and it's
        pre-scoped to one store server-side so a multi-store tenant never mixes drivers across
        stores in the UI, on top of the same check being enforced again at plan/assign time."""

        tenant_id = str(self.subject.tenant_id)
        store_id = await self._resolve_store_id(requested_store_id=requested_store_id)
        drivers = await self.user_repository.list_by_tenant_roles(tenant_id=tenant_id, roles=[UserRole.DRIVER.value])
        store_drivers = [driver for driver in drivers if driver.store_id == store_id]
        return DeliveryDriverListResponse(items=[DeliveryDriverResponse(id=driver.id, name=driver.full_name) for driver in store_drivers])

    async def assign_driver(self, *, route_id: str, payload: DriverAssignRequest) -> DriverAssignResponse:
        """Assign (or clear) the driver responsible for one delivery route — the driver must be
        based at the same store as the route (multi-store tenants don't share drivers across
        stores)."""

        tenant_id = str(self.subject.tenant_id)
        route = await self.order_repository.get_delivery_route_by_id(tenant_id=tenant_id, route_id=route_id)
        if route is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery route not found.")

        driver_name = ""
        if payload.driver_user_id:
            driver = await self.user_repository.get_by_id_for_tenant(tenant_id=tenant_id, user_id=payload.driver_user_id)
            if driver is None or driver.role != UserRole.DRIVER.value:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
            if driver.store_id != route.store_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f'Driver "{driver.full_name}" is based at a different store and cannot be assigned to this route.',
                )
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

    # ------------------------------------------------------------------
    # Reading active routes
    # ------------------------------------------------------------------

    async def list_active_routes(self, *, requested_store_id: str = "") -> DeliveryRouteListResponse:
        """Return every currently active delivery route for the caller's store — a store can
        have several running at once, one per driver currently out.

        Each route's stops are reordered by a real bidirectional-Dijkstra graph search (not the
        order they happened to be inserted in), and its distance/ETA/savings are computed fresh
        from that search every time this is called — not trusted from a stored snapshot, so the
        numbers always match exactly what the stop list below them shows. A stop shows up here
        from the moment its order is dispatched (that is when a route stop is attached — see
        DeliveryPricingService.attach_route_stop) until the stop itself is marked delivered or its
        order is cancelled; the order's own status past dispatch (dispatched vs. delivered) does
        not hide it — a dispatched-but-not-yet-delivered stop is exactly what a driver still needs
        to see on their route.
        """

        tenant_id = str(self.subject.tenant_id)
        store_id = await self._resolve_store_id(requested_store_id=requested_store_id)
        store = await self.store_repository.get_by_id(tenant_id=tenant_id, store_id=store_id)
        hub_name = store.name if store else ""
        hub_address = store.address_line if store else ""
        hub_lat = store.latitude if store else None
        hub_lng = store.longitude if store else None

        routes = await self.order_repository.list_active_delivery_routes(tenant_id=tenant_id, store_id=store_id)
        if not routes:
            return DeliveryRouteListResponse(hub_name=hub_name, hub_address=hub_address, hub_lat=hub_lat, hub_lng=hub_lng)

        route_ids = [route.id for route in routes]
        all_stops = await self.order_repository.list_route_stops_for_routes(route_ids=route_ids)
        order_ids = [stop.order_id for stop in all_stops if stop.order_id]
        order_status_by_id: dict[str, tuple[str, str]] = {}
        if order_ids:
            # is_active excludes cancelled orders — everything else (including "dispatched") is
            # still a stop a driver needs to see; see the docstring above.
            statement = select(Order.id, Order.status, Order.order_code).where(
                Order.id.in_(order_ids), Order.is_active.is_(True)
            )
            for order_id, order_status, order_code in (await self.session.execute(statement)).all():
                order_status_by_id[order_id] = (order_status, order_code)

        stops_by_route: dict[str, list[DeliveryRouteStop]] = {}
        for stop in all_stops:
            if not stop.order_id:
                continue
            status_and_code = order_status_by_id.get(stop.order_id)
            if status_and_code is None or status_and_code[0] == OrderStatus.DELIVERED.value:
                continue
            if stop.stop_status == "delivered":
                continue
            stops_by_route.setdefault(stop.route_id, []).append(stop)

        items: list[DeliveryRouteResponse] = []
        for route in routes:
            route_stops = stops_by_route.get(route.id, [])
            origin = (route.origin_latitude, route.origin_longitude)
            has_origin = _has_real_coords(*origin)

            geocoded = [stop for stop in route_stops if _has_real_coords(stop.latitude, stop.longitude)]
            ungeocoded = [stop for stop in route_stops if stop not in geocoded]

            total_km = Decimal("0.00")
            saved_km = Decimal("0.00")
            geometry: list[DeliveryRouteGeometryPointResponse] = []
            real_total_minutes: int | None = None
            if has_origin and geocoded:
                points = [(stop.latitude, stop.longitude) for stop in geocoded]
                visiting_order, total_km = nearest_neighbor_order_via_graph(origin, points)
                geocoded = [geocoded[i] for i in visiting_order]
                naive_km = route_length_km(origin, points)
                saved_km = max(Decimal("0.00"), naive_km - total_km)

                # Visiting order above comes from the proximity-graph search (no real street
                # data). This asks OSRM for the real road-following geometry/distance/duration
                # of that same already-decided order — replaces the haversine estimate with the
                # real one when it succeeds, and leaves the haversine fallback untouched (still a
                # straight line on the map) when the routing service is unavailable.
                road_route = await asyncio.to_thread(
                    RoutingClient().route, [origin, *[(stop.latitude, stop.longitude) for stop in geocoded]]
                )
                if road_route is not None:
                    total_km = road_route.distance_km
                    real_total_minutes = int(road_route.duration_minutes)
                    geometry = [DeliveryRouteGeometryPointResponse(lat=lat, lng=lng) for lat, lng in road_route.coordinates]

            ordered_stops = geocoded + ungeocoded
            items.append(
                DeliveryRouteResponse(
                    id=route.id,
                    code=route.route_code,
                    status=route.route_status,
                    driver=route.driver_name_snapshot,
                    driver_user_id=route.driver_user_id or "",
                    vehicle=route.vehicle_label,
                    total_km=total_km,
                    total_min=real_total_minutes if real_total_minutes is not None else _estimate_minutes(total_km, len(ordered_stops)),
                    saved_km=saved_km,
                    provider=route.route_provider,
                    hub_name=route.origin_name or hub_name,
                    hub_address=route.origin_address or hub_address,
                    hub_lat=route.origin_latitude,
                    hub_lng=route.origin_longitude,
                    geometry=geometry,
                    stops=[
                        DeliveryRouteStopResponse(
                            id=stop.id,
                            order_id=stop.order_id or "",
                            order_code=(order_status_by_id.get(stop.order_id) or ("", ""))[1],
                            customer=stop.customer_name_snapshot,
                            address=stop.address_line_snapshot,
                            district=stop.district_snapshot,
                            cep=stop.postal_code_snapshot,
                            status=stop.stop_status,
                            lat=stop.latitude,
                            lng=stop.longitude,
                            dist=stop.distance_from_origin_km,
                            navigation_url=stop.navigation_url,
                        )
                        for stop in ordered_stops
                    ],
                )
            )

        # Routes with a driver assigned first, then by however many stops are left — the
        # operator cares most about routes that are actually staffed and busy right now.
        items.sort(key=lambda item: (not item.driver_user_id, -len(item.stops)))
        return DeliveryRouteListResponse(hub_name=hub_name, hub_address=hub_address, hub_lat=hub_lat, hub_lng=hub_lng, items=items)

    # ------------------------------------------------------------------
    # Planning routes for several drivers at once
    # ------------------------------------------------------------------

    async def plan_routes(self, payload: PlanDeliveryRoutesRequest, *, requested_store_id: str = "") -> DeliveryRouteListResponse:
        """(Re)plan every currently pending delivery stop into one route per driver in
        `payload.driver_user_ids` — real simultaneous multi-route dispatch, not just one route.

        1. Splits the pending stops into as many geographically coherent groups as there are
           drivers, sweeping an angular ray around the store (`sweep_clusters`) so each driver's
           patch of the map does not overlap another's.
        2. Orders each group into a real route with `nearest_neighbor_order_via_graph` — a
           bidirectional-Dijkstra search over a sparse proximity graph, not a raw straight-line
           nearest-neighbor pass, and not just the order stops happened to be inserted in.
        3. Reassigns each pending stop's existing DeliveryRouteStop row to its new route (so
           picked/stop_status state already recorded on it survives a replan) — creating one
           fresh only for a pending order that never had a stop row at all.

        Every driver in `payload.driver_user_ids` must actually belong to the store being
        planned for (`User.store_id`) — a multi-store tenant's drivers are not interchangeable
        across stores, so a driver home-based at another store is rejected rather than silently
        dispatched from a hub they don't work out of.
        """

        tenant_id = str(self.subject.tenant_id)
        store_id = await self._resolve_store_id(requested_store_id=requested_store_id)
        store = await self.store_repository.get_by_id(tenant_id=tenant_id, store_id=store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")

        driver_ids = list(dict.fromkeys(payload.driver_user_ids))  # dedupe, keep the given order
        drivers = []
        for driver_id in driver_ids:
            driver = await self.user_repository.get_by_id_for_tenant(tenant_id=tenant_id, user_id=driver_id)
            if driver is None or driver.role != UserRole.DRIVER.value:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f'Driver "{driver_id}" not found.')
            if driver.store_id != store_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f'Driver "{driver.full_name}" is based at a different store and cannot be planned for this one.',
                )
            drivers.append(driver)
        num_routes = len(drivers)

        existing_routes = await self.order_repository.list_active_delivery_routes(tenant_id=tenant_id, store_id=store_id)
        existing_stops = await self.order_repository.list_route_stops_for_routes(route_ids=[r.id for r in existing_routes])
        stop_by_order_id = {stop.order_id: stop for stop in existing_stops if stop.order_id and stop.stop_status != "delivered"}

        all_orders = await self.order_repository.list_for_operations(tenant_id=tenant_id, store_id=store_id)
        pending_orders = [o for o in all_orders if o.fulfillment_type == "delivery" and o.status in PENDING_ORDER_STATUSES]
        if not pending_orders:
            return await self.list_active_routes(requested_store_id=store_id)

        # Every pending stop any existing route had is about to be reassigned into a brand new
        # route below — so every existing route is left with nothing pending on it. Retire them
        # (instead of leaving them planned-but-empty) so replanning repeatedly doesn't pile up
        # empty route rows that would otherwise sit in list_active_routes()'s results forever.
        for route in existing_routes:
            route.route_status = "superseded"
            await self.order_repository.save_delivery_route(route)

        fulfillments = await self.order_repository.list_fulfillments(order_ids=[o.id for o in pending_orders])
        fulfillment_by_order_id = {f.order_id: f for f in fulfillments}

        plannable: list[_PlannableOrder] = []
        for order in pending_orders:
            fulfillment = fulfillment_by_order_id.get(order.id)
            coordinate: Coordinate | None = None
            if fulfillment is not None and _has_real_coords(fulfillment.latitude, fulfillment.longitude):
                coordinate = (fulfillment.latitude, fulfillment.longitude)
            plannable.append(_PlannableOrder(order=order, fulfillment=fulfillment, coordinate=coordinate))

        origin: Coordinate = (store.latitude, store.longitude)
        has_origin = _has_real_coords(*origin)
        geocoded = [p for p in plannable if p.coordinate is not None]
        ungeocoded = [p for p in plannable if p.coordinate is None]

        groups: list[list[_PlannableOrder]] = [[] for _ in range(num_routes)]
        if has_origin and geocoded:
            clusters = sweep_clusters(origin, [_geocoded_coordinate(p) for p in geocoded], num_routes)
            for group_index, point_indices in enumerate(clusters):
                for point_index in point_indices:
                    groups[group_index].append(geocoded[point_index])
        else:
            # No usable store coordinate or no geocoded stop at all — round-robin so driver
            # assignment still works even when geocoding failed across the board.
            for i, p in enumerate(geocoded):
                groups[i % num_routes].append(p)
        for p in ungeocoded:
            smallest = min(range(num_routes), key=lambda i: len(groups[i]))
            groups[smallest].append(p)

        now = datetime.now(UTC)
        pricing_service = DeliveryPricingService(self.session)
        origin_address = ", ".join(part for part in [store.address_line, store.district, store.city, store.state_code] if part)

        for driver, group in zip(drivers, groups, strict=True):
            route = DeliveryRoute(
                id=str(uuid4()),
                tenant_id=tenant_id,
                store_id=store_id,
                driver_user_id=driver.id,
                route_code=pricing_service.build_route_code(now),
                route_status="planned",
                driver_name_snapshot=driver.full_name,
                origin_name=store.name,
                origin_address=origin_address,
                origin_latitude=store.latitude,
                origin_longitude=store.longitude,
                route_provider="sweep+bidirectional-dijkstra",
                planned_at_label=now.strftime("%H:%M"),
            )
            route = await self.order_repository.add_delivery_route(route)

            group_geocoded = [p for p in group if p.coordinate is not None]
            group_ungeocoded = [p for p in group if p.coordinate is None]
            total_km = Decimal("0.00")
            if has_origin and group_geocoded:
                visiting_order, total_km = nearest_neighbor_order_via_graph(origin, [_geocoded_coordinate(p) for p in group_geocoded])
                ordered_group = [group_geocoded[i] for i in visiting_order] + group_ungeocoded
            else:
                ordered_group = group

            for sequence, plannable_order in enumerate(ordered_group, start=1):
                distance_from_origin = (
                    haversine_km(origin[0], origin[1], plannable_order.coordinate[0], plannable_order.coordinate[1])
                    if (has_origin and plannable_order.coordinate)
                    else Decimal("0.00")
                )
                existing_stop = stop_by_order_id.get(plannable_order.order.id)
                if existing_stop is not None:
                    existing_stop.route_id = route.id
                    existing_stop.stop_sequence = sequence
                    existing_stop.distance_from_origin_km = distance_from_origin
                    await self.order_repository.add_delivery_route_stop(existing_stop)
                else:
                    fulfillment = plannable_order.fulfillment
                    stop = DeliveryRouteStop(
                        id=str(uuid4()),
                        route_id=route.id,
                        order_id=plannable_order.order.id,
                        stop_sequence=sequence,
                        stop_status="planned",
                        customer_name_snapshot=plannable_order.order.customer_display_name,
                        address_line_snapshot=fulfillment.address_line if fulfillment else "",
                        district_snapshot=fulfillment.district if fulfillment else "",
                        postal_code_snapshot=fulfillment.postal_code if fulfillment else "",
                        latitude=plannable_order.coordinate[0] if plannable_order.coordinate else Decimal("0.0000000"),
                        longitude=plannable_order.coordinate[1] if plannable_order.coordinate else Decimal("0.0000000"),
                        distance_from_origin_km=distance_from_origin,
                    )
                    await self.order_repository.add_delivery_route_stop(stop)
                if plannable_order.fulfillment is not None:
                    plannable_order.fulfillment.driver_name = driver.full_name

            route.stop_count = len(ordered_group)
            route.total_distance_km = total_km
            route.estimated_duration_minutes = _estimate_minutes(total_km, len(ordered_group))
            await self.order_repository.save_delivery_route(route)

        await self.session.commit()
        # commit() ends the transaction and clears the transaction-local RLS session variables
        # set by apply_tenant_context() — re-apply before this post-commit read, or RLS silently
        # filters the routes/stops just committed back out (see
        # dev-obsidian/farmaura/04_Seguranca_Riscos/rls-pos-commit-quatro-servicos-nao-corrigidos.md;
        # same pattern already applied in crm_service.py, inventory_lot_service.py, pdv_service.py, etc.).
        await apply_tenant_context(self.session, self.subject)
        return await self.list_active_routes(requested_store_id=store_id)

    # ------------------------------------------------------------------
    # Live tracking
    # ------------------------------------------------------------------

    async def get_live_routes(self, *, requested_store_id: str = "") -> DeliveryLiveResponse:
        """Return a lightweight live-tracking snapshot for every active route at once — one
        entry per route/driver, since a store can have several deliveries running simultaneously."""

        tenant_id = str(self.subject.tenant_id)
        store_id = await self._resolve_store_id(requested_store_id=requested_store_id)
        routes = await self.order_repository.list_active_delivery_routes(tenant_id=tenant_id, store_id=store_id)
        if not routes:
            return DeliveryLiveResponse()

        route_ids = [route.id for route in routes]
        all_stops = await self.order_repository.list_route_stops_for_routes(route_ids=route_ids)
        stops_by_route: dict[str, list[DeliveryRouteStop]] = {}
        for stop in all_stops:
            stops_by_route.setdefault(stop.route_id, []).append(stop)

        items: list[DeliveryRouteLiveItemResponse] = []
        for route in routes:
            driver_lat = driver_lng = None
            driver_updated_label = ""
            if route.driver_user_id:
                location = await self._get_driver_location(route.driver_user_id)
                if location is not None:
                    driver_lat = location.latitude
                    driver_lng = location.longitude
                    driver_updated_label = location.recorded_at.strftime("%H:%M")
            items.append(
                DeliveryRouteLiveItemResponse(
                    route_id=route.id,
                    driver_user_id=route.driver_user_id or "",
                    driver_lat=driver_lat,
                    driver_lng=driver_lng,
                    driver_updated_label=driver_updated_label,
                    stops=[
                        DeliveryLiveStopResponse(id=stop.id, order_id=stop.order_id or "", status=stop.stop_status)
                        for stop in stops_by_route.get(route.id, [])
                    ],
                )
            )
        return DeliveryLiveResponse(revision=datetime.now(UTC).isoformat(), items=items)

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
        # A delivered order is a completed transaction — its pharmacist chat (if any) freezes,
        # same rule as pickup confirmation in order_service.py::confirm_internal_pickup.
        await ChatRepository(self.session).close_threads_for_order(tenant_id=tenant_id, order_id=order.id, reason="order_completed")
        # A completed delivery releases this order's pending cashback into the wallet.
        await CashbackService(self.session, self.subject).release_pending_for_order(order=order)
        await self.session.commit()

    async def _resolve_store_id(self, *, requested_store_id: str = "") -> str:
        """Resolve the active store for the current subject, honoring an admin-supplied override
        — the same rule OrderService._get_store_id uses for /orders/internal-board, so switching
        stores in the admin's store selector scopes delivery routes to that same store too.
        Manager/pharmacist/driver subjects always carry their own store and can't override it."""

        if requested_store_id and self.subject.role == UserRole.ADMIN:
            return requested_store_id
        if self.subject.store_id:
            return str(self.subject.store_id)
        return await self.inventory_repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))

    async def _get_driver_location(self, driver_user_id: str) -> DriverLocation | None:
        """Return the latest known GPS position for one driver, if any."""

        statement = select(DriverLocation).where(DriverLocation.driver_user_id == driver_user_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
