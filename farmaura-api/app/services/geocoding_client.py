"""
farmaura-api/app/services/geocoding_client.py

Nominatim (OpenStreetMap) geocoding client for Farmaura.

Responsibilities:
- resolve a free-form Brazilian address into real latitude/longitude coordinates;
- respect the Nominatim usage policy (identifying user agent, request throttling, caching);
- fail closed with no coordinates instead of fabricating a location when geocoding fails.

Observations:
- this client intentionally covers only the single-address lookup Farmaura needs;
- lookups are process-local cached and throttled to at most ~1 request per second,
  matching the public Nominatim usage policy without requiring an API key.
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from decimal import Decimal
from urllib import error, parse, request

from app.core.config import get_settings


# ============================================================================
# GEOCODING TYPES
# ============================================================================


@dataclass(frozen=True, slots=True)
class GeocodeResult:
    """Represent one resolved geographic coordinate."""

    latitude: Decimal
    longitude: Decimal


@dataclass(frozen=True, slots=True)
class GeocodeSearchResult:
    """Represent one free-text address search match, classified by locality kind."""

    label: str
    district: str
    city: str
    state_code: str
    kind: str
    latitude: Decimal
    longitude: Decimal


_BR_STATE_NAME_TO_CODE = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA",
    "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO",
    "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
    "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI",
    "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
    "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
    "sergipe": "SE", "tocantins": "TO",
}
_CITY_LOCALITY_ADDRESS_TYPES = {"city", "town", "village", "municipality"}
_NEIGHBORHOOD_ADDRESS_TYPES = {"suburb", "neighbourhood", "city_district", "quarter"}

_CACHE: dict[str, GeocodeResult | None] = {}
_CACHE_LOCK = threading.Lock()
_LAST_REQUEST_MONOTONIC = 0.0
_MIN_REQUEST_INTERVAL_SECONDS = 1.05


def _strip_accents(value: str) -> str:
    """Return a lowercase, accent-free copy of one string for lookup normalization."""

    replacements = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüçñ", "aaaaaeeeeiiiiooooouuuucn")
    return value.strip().lower().translate(replacements)


# ============================================================================
# GEOCODING CLIENT
# ============================================================================


class GeocodingClient:
    """Provide best-effort address geocoding backed by Nominatim."""

    def __init__(self) -> None:
        """Load the current geocoding settings snapshot."""

        settings = get_settings()
        self.enabled = bool(settings.geocoding_enabled)
        self.base_url = str(settings.geocoding_base_url or "").rstrip("/")
        self.user_agent = str(settings.geocoding_user_agent or "").strip()
        self.timeout_seconds = int(settings.geocoding_timeout_seconds or 10)

    def geocode(self, address: str) -> GeocodeResult | None:
        """Return the resolved coordinate for one free-form address, or None when unavailable."""

        normalized = " ".join(str(address or "").split()).strip()
        if not normalized or not self.enabled or not self.base_url or not self.user_agent:
            return None
        with _CACHE_LOCK:
            if normalized in _CACHE:
                return _CACHE[normalized]
        result = self._lookup(normalized)
        with _CACHE_LOCK:
            _CACHE[normalized] = result
        return result

    def search(self, query: str, *, limit: int = 8) -> list[GeocodeSearchResult]:
        """Return up to `limit` free-text address matches, classified as neighborhood/city/other."""

        normalized = " ".join((query or "").split()).strip()
        if not normalized or not self.enabled or not self.base_url or not self.user_agent:
            return []
        payload = self._request_search(normalized, limit=limit, addressdetails=True)
        if not isinstance(payload, list):
            return []
        results: list[GeocodeSearchResult] = []
        for entry in payload:
            parsed = self._parse_search_entry(entry)
            if parsed is not None:
                results.append(parsed)
        return results

    def _parse_search_entry(self, entry: object) -> GeocodeSearchResult | None:
        """Return one parsed search result, or None when the entry lacks usable coordinates."""

        if not isinstance(entry, dict):
            return None
        address = entry.get("address") if isinstance(entry.get("address"), dict) else {}
        district = str(address.get("suburb") or address.get("neighbourhood") or address.get("city_district") or address.get("quarter") or "").strip()
        city = str(address.get("city") or address.get("town") or address.get("village") or address.get("municipality") or "").strip()
        state_name = _strip_accents(str(address.get("state") or ""))
        state_code = _BR_STATE_NAME_TO_CODE.get(state_name, "")
        address_type = str(entry.get("addresstype") or "")
        if address_type in _CITY_LOCALITY_ADDRESS_TYPES:
            kind = "city"
            city = city or str(entry.get("name") or "").strip()
        elif address_type in _NEIGHBORHOOD_ADDRESS_TYPES or district:
            kind = "neighborhood"
            district = district or str(entry.get("name") or "").strip()
        else:
            kind = "other"
        try:
            return GeocodeSearchResult(
                label=str(entry.get("display_name") or ""),
                district=district,
                city=city,
                state_code=state_code,
                kind=kind,
                latitude=Decimal(str(entry["lat"])),
                longitude=Decimal(str(entry["lon"])),
            )
        except (KeyError, TypeError, ValueError, ArithmeticError):
            return None

    def _lookup(self, address: str) -> GeocodeResult | None:
        """Execute one throttled Nominatim lookup, returning None on any failure."""

        payload = self._request_search(address, limit=1, addressdetails=False)
        if not isinstance(payload, list) or not payload:
            return None
        entry = payload[0]
        try:
            return GeocodeResult(latitude=Decimal(str(entry["lat"])), longitude=Decimal(str(entry["lon"])))
        except (KeyError, TypeError, ValueError, ArithmeticError):
            return None

    def _request_search(self, query: str, *, limit: int, addressdetails: bool) -> list | None:
        """Execute one throttled Nominatim /search request, returning the parsed JSON list or None."""

        global _LAST_REQUEST_MONOTONIC
        with _CACHE_LOCK:
            elapsed = time.monotonic() - _LAST_REQUEST_MONOTONIC
            if elapsed < _MIN_REQUEST_INTERVAL_SECONDS:
                time.sleep(_MIN_REQUEST_INTERVAL_SECONDS - elapsed)
            _LAST_REQUEST_MONOTONIC = time.monotonic()
        params = {"q": query, "format": "jsonv2", "limit": limit, "countrycodes": "br"}
        if addressdetails:
            params["addressdetails"] = 1
        req = request.Request(
            f"{self.base_url}/search?{parse.urlencode(params)}",
            headers={"user-agent": self.user_agent, "accept": "application/json"},
        )
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8") or "[]")
        except (error.URLError, error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError, OSError):
            return None
