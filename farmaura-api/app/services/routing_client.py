"""
farmaura-api/app/services/routing_client.py

OSRM (Open Source Routing Machine) driving-directions client for Farmaura.

Responsibilities:
- resolve the real road-following geometry, distance and duration for an
  ordered sequence of waypoints (store + delivery stops, already ordered by
  app/domain/geo.py's graph search) via OSRM's public routing API;
- fail closed with no geometry instead of fabricating a path when routing
  fails, so the caller can fall back to a straight line between stops — same
  posture as geocoding_client.py.

Observations:
- same "no API key, public OpenStreetMap-ecosystem service" trade-off already
  accepted for geocoding (see geocoding_client.py and
  dev-obsidian/farmaura/05_Integracoes_Infra/Geocoding_Nominatim.md) applies
  here: no SLA, public demo server, fine for this system's request volume;
- this client only asks OSRM for the geometry/distance/duration of a route
  whose stop order was already decided elsewhere — it does not solve
  visiting-order itself (that stays the bidirectional-Dijkstra graph search
  in app/domain/geo.py, which has no real road data to work with either way).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from urllib import error, parse, request

from app.core.config import get_settings


# ============================================================================
# ROUTING TYPES
# ============================================================================


@dataclass(frozen=True, slots=True)
class RouteGeometryResult:
    """Represent one real driving route: road-following coordinates, distance and duration."""

    coordinates: list[tuple[Decimal, Decimal]]  # (lat, lng), in path order
    distance_km: Decimal
    duration_minutes: Decimal


# ============================================================================
# ROUTING CLIENT
# ============================================================================


class RoutingClient:
    """Provide best-effort real road-route geometry backed by OSRM."""

    def __init__(self) -> None:
        """Load the current routing settings snapshot."""

        settings = get_settings()
        self.enabled = bool(settings.routing_enabled)
        self.base_url = str(settings.routing_base_url or "").rstrip("/")
        self.timeout_seconds = int(settings.routing_timeout_seconds or 10)

    def route(self, waypoints: list[tuple[Decimal, Decimal]]) -> RouteGeometryResult | None:
        """Return the real driving route through `waypoints` (lat, lng, in visiting order), or
        None when routing is disabled, there are fewer than two waypoints, or the request fails."""

        if not self.enabled or not self.base_url or len(waypoints) < 2:
            return None
        coords_param = ";".join(f"{parse.quote(str(lng))},{parse.quote(str(lat))}" for lat, lng in waypoints)
        url = f"{self.base_url}/route/v1/driving/{coords_param}?overview=full&geometries=geojson"
        req = request.Request(url, headers={"accept": "application/json"})
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8") or "{}")
        except (error.URLError, error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError, OSError):
            return None
        return self._parse_response(payload)

    def _parse_response(self, payload: object) -> RouteGeometryResult | None:
        """Return the parsed best route from an OSRM `/route` response, or None if malformed."""

        if not isinstance(payload, dict) or payload.get("code") != "Ok":
            return None
        routes = payload.get("routes")
        if not isinstance(routes, list) or not routes:
            return None
        best = routes[0]
        if not isinstance(best, dict):
            return None
        geometry = best.get("geometry")
        raw_coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
        if not isinstance(raw_coordinates, list) or len(raw_coordinates) < 2:
            return None
        try:
            coordinates = [(Decimal(str(lat)), Decimal(str(lng))) for lng, lat in raw_coordinates]
            distance_km = Decimal(str(best["distance"])) / Decimal("1000")
            duration_minutes = Decimal(str(best["duration"])) / Decimal("60")
        except (KeyError, TypeError, ValueError, ArithmeticError):
            return None
        return RouteGeometryResult(coordinates=coordinates, distance_km=distance_km, duration_minutes=duration_minutes)
