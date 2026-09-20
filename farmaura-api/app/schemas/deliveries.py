"""
farmaura-api/app/schemas/deliveries.py

Delivery route planning, assignment, and live-tracking schemas for Farmaura.

Responsibilities:
- validate multi-driver route planning and single-driver assignment requests;
- shape the admin console's active-routes payload — a store can have several
  routes running at once (one per driver currently out), not just one;
- shape the lightweight live-tracking payload the admin console polls, one
  entry per active route/driver;
- shape the driver-facing route and stop-completion contracts;

Observations:
- location pings are intentionally minimal (lat/lng/accuracy) since the driver
  screen calls this on a tight interval from the browser Geolocation API.
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# DRIVER ASSIGNMENT SCHEMAS
# ============================================================================


class DriverAssignRequest(StrictModel):
    """Validate a delivery-route driver assignment request."""

    driver_user_id: str | None = Field(default=None, max_length=36)


class DriverAssignResponse(StrictModel):
    """Represent the outcome of a driver assignment."""

    route_id: str
    driver_user_id: str = ""
    driver_name: str = ""


# ============================================================================
# ROUTE PLANNING AND LISTING (admin console) SCHEMAS
# ============================================================================


class DeliveryDriverResponse(StrictModel):
    """Represent one driver eligible for delivery-route planning at the caller's store —
    intentionally minimal (not the full team roster, which stays admin-only): just enough to
    populate a driver picker."""

    id: str
    name: str


class DeliveryDriverListResponse(StrictModel):
    """Represent every driver based at the caller's store."""

    items: list[DeliveryDriverResponse] = Field(default_factory=list)


class PlanDeliveryRoutesRequest(StrictModel):
    """Validate a request to (re)plan every currently pending delivery stop into one route per
    driver — one entry per driver going out right now; order of the list does not matter."""

    driver_user_ids: list[str] = Field(min_length=1, max_length=20)


class DeliveryRouteStopResponse(StrictModel):
    """Represent one ordered stop inside an active delivery route, for the admin console."""

    id: str
    order_id: str
    order_code: str = ""
    customer: str = ""
    address: str = ""
    district: str = ""
    cep: str = ""
    status: str = "planned"
    lat: Decimal | None = None
    lng: Decimal | None = None
    dist: Decimal | None = None
    navigation_url: str = ""


class DeliveryRouteGeometryPointResponse(StrictModel):
    """Represent one point of a route's real road-following polyline."""

    lat: Decimal
    lng: Decimal


class DeliveryRouteResponse(StrictModel):
    """Represent one active delivery route for the admin console — a store can have several of
    these running at once, one per driver currently dispatched."""

    id: str = ""
    code: str = ""
    status: str = "planned"
    driver: str = ""
    driver_user_id: str = ""
    vehicle: str = ""
    total_km: Decimal = Decimal("0.00")
    total_min: int = 0
    saved_km: Decimal = Decimal("0.00")
    provider: str = ""
    hub_name: str = ""
    hub_address: str = ""
    hub_lat: Decimal | None = None
    hub_lng: Decimal | None = None
    stops: list[DeliveryRouteStopResponse] = Field(default_factory=list)
    # Real road-following polyline from the routing provider; empty when routing was
    # unavailable, in which case the frontend falls back to straight lines between stops.
    geometry: list[DeliveryRouteGeometryPointResponse] = Field(default_factory=list)


class DeliveryRouteListResponse(StrictModel):
    """Represent every currently active delivery route for one store."""

    hub_name: str = ""
    hub_address: str = ""
    hub_lat: Decimal | None = None
    hub_lng: Decimal | None = None
    items: list[DeliveryRouteResponse] = Field(default_factory=list)


# ============================================================================
# LIVE TRACKING SCHEMAS
# ============================================================================


class DeliveryLiveStopResponse(StrictModel):
    """Represent one stop's live status for the polling admin console."""

    id: str
    order_id: str
    status: str


class DeliveryRouteLiveItemResponse(StrictModel):
    """Live snapshot for one active route: its driver's last known GPS position and its stops'
    current status."""

    route_id: str = ""
    driver_user_id: str = ""
    driver_lat: Decimal | None = None
    driver_lng: Decimal | None = None
    driver_updated_label: str = ""
    stops: list[DeliveryLiveStopResponse] = Field(default_factory=list)


class DeliveryLiveResponse(StrictModel):
    """Represent a lightweight live-tracking sync payload covering every active route at once —
    one entry per route/driver, since a store can have several deliveries running simultaneously."""

    revision: str = ""
    items: list[DeliveryRouteLiveItemResponse] = Field(default_factory=list)


class DeliveryLocationPingRequest(StrictModel):
    """Validate one driver GPS location ping."""

    latitude: Decimal = Field(ge=Decimal("-90"), le=Decimal("90"))
    longitude: Decimal = Field(ge=Decimal("-180"), le=Decimal("180"))
    accuracy_meters: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


# ============================================================================
# DRIVER-FACING ROUTE SCHEMAS
# ============================================================================


class DeliveryStopResponse(StrictModel):
    """Represent one stop for the driver's own route view."""

    id: str
    order_id: str
    order_code: str = ""
    customer: str = ""
    address: str = ""
    district: str = ""
    cep: str = ""
    status: str = "planned"
    lat: Decimal | None = None
    lng: Decimal | None = None
    navigation_url: str = ""


class MyDeliveryRouteResponse(StrictModel):
    """Represent the authenticated driver's assigned route."""

    id: str = ""
    code: str = ""
    status: str = "planned"
    hub_name: str = ""
    hub_address: str = ""
    hub_lat: Decimal | None = None
    hub_lng: Decimal | None = None
    stops: list[DeliveryStopResponse] = Field(default_factory=list)


class MyDeliveryRouteListResponse(StrictModel):
    """Represent every route currently assigned to the authenticated driver."""

    items: list[MyDeliveryRouteResponse] = Field(default_factory=list)
