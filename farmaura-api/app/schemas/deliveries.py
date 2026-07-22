"""
farmaura-api/app/schemas/deliveries.py

Delivery assignment and live-tracking schemas for Farmaura.

Responsibilities:
- validate driver assignment and GPS location-ping requests;
- shape the lightweight live-tracking payload the admin console polls;
- shape the driver-facing route and stop-completion contracts.

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
# LIVE TRACKING SCHEMAS
# ============================================================================


class DeliveryLiveStopResponse(StrictModel):
    """Represent one stop's live status for the polling admin console."""

    id: str
    order_id: str
    status: str


class DeliveryRouteLiveResponse(StrictModel):
    """Represent a lightweight live-tracking sync payload for one delivery route."""

    revision: str = ""
    route_id: str = ""
    driver_user_id: str = ""
    driver_lat: Decimal | None = None
    driver_lng: Decimal | None = None
    driver_updated_label: str = ""
    stops: list[DeliveryLiveStopResponse] = Field(default_factory=list)


class DeliveryLocationPingRequest(StrictModel):
    """Validate one driver GPS location ping."""

    latitude: Decimal = Field(ge=Decimal("-90"), le=Decimal("90"))
    longitude: Decimal = Field(ge=Decimal("-180"), le=Decimal("180"))
    accuracy_meters: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


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
