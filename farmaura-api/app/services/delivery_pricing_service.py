"""
farmaura-api/app/services/delivery_pricing_service.py

Shared delivery pricing and route-attachment service for Farmaura.

Responsibilities:
- resolve real geocoding-based distance for one delivery address;
- compute the configured delivery fee (distance-tier or per-area) for one address;
- check delivery coverage for a typed address before checkout;
- attach a placed delivery (marketplace order or PDV sale) as a stop on the
  tenant's active delivery route.

Observations:
- this module was extracted from OrderService's marketplace-checkout-only
  delivery logic so the balcão (PDV) can reuse the exact same pricing and
  coverage rules instead of duplicating them; OrderService now delegates to
  this service and its own behavior is unchanged;
- every method here is store-agnostic — callers always pass tenant_id/store_id
  explicitly instead of relying on an ambient self.subject.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from math import atan2, cos, radians, sin, sqrt
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.delivery_route import DeliveryRoute
from app.models.delivery_route_stop import DeliveryRouteStop
from app.models.store import Store
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.store_repository import StoreRepository
from app.schemas.auth import TokenSubject
from app.schemas.orders import DeliveryCoverageResponse
from app.schemas.portal import (
    PortalDeliveryAreasResponse,
    PortalDeliveryFuelConfig,
    PortalDeliveryNeighborhood,
    PortalDeliveryPriceRule,
    PortalDeliveryPricingResponse,
    PortalDeliveryRadiusTier,
    PortalDeliveryStoreAreaConfig,
    PortalDeliveryVariation,
)
from app.services.geocoding_client import GeocodingClient
from app.services.marketplace_projection import build_marketplace_catalog_groups, quantize_money
from app.services.portal_service import PortalService


MAX_MOTOBOY_DISTANCE_KM = Decimal("15.00")


@dataclass(frozen=True, slots=True)
class OrderStoreResolution:
    """Represent the store chosen to fulfill one marketplace order."""

    store: Store
    distance_km: Decimal
    requires_shipping: bool


# ============================================================================
# DELIVERY PRICING SERVICE
# ============================================================================


class DeliveryPricingService:
    """Provide delivery fee, coverage, and route-attachment use-cases shared by checkout and balcão."""

    def __init__(self, session: AsyncSession) -> None:
        """Store repository dependencies."""

        self.session = session
        self.repository = OrderRepository(session)
        self.store_repository = StoreRepository(session)
        self.inventory_repository = InventoryRepository(session)

    # ------------------------------------------------------------------
    # Fee calculation
    # ------------------------------------------------------------------

    def resolve_fee_by_distance(self, pricing: PortalDeliveryPricingResponse, distance_km: Decimal) -> Decimal:
        """Return the configured delivery fee for one resolved distance."""

        for tier in sorted(pricing.tiers, key=lambda entry: entry.up_to_km):
            if distance_km <= tier.up_to_km:
                return quantize_money(Decimal(tier.fee))
        return quantize_money(Decimal(pricing.fee_beyond_last_tier))

    def resolve_distance_tier_fee(self, pricing: PortalDeliveryPricingResponse, distance_km: Decimal, subtotal_amount: Decimal) -> Decimal:
        """Return the base fee for the 'distance_tier' zone calculation mode."""

        if pricing.tiers:
            return (
                self.resolve_fee_by_distance(pricing, distance_km)
                if distance_km > Decimal("0.00")
                else quantize_money(Decimal(pricing.fee_beyond_last_tier))
            )
        return Decimal("0.00") if subtotal_amount >= pricing.free_above_subtotal else quantize_money(Decimal(pricing.fee_beyond_last_tier))

    def resolve_fuel_fee(self, fuel: PortalDeliveryFuelConfig, distance_km: Decimal) -> Decimal:
        """Return the fuel-cost-based fee: (km / km per liter) * price per liter * (1 + margin%)."""

        if Decimal(fuel.vehicle_km_per_liter) <= Decimal("0.00"):
            return Decimal("0.00")
        liters_needed = Decimal(distance_km) / Decimal(fuel.vehicle_km_per_liter)
        raw_fuel_cost = liters_needed * Decimal(fuel.fuel_price_per_liter)
        margin_multiplier = Decimal("1.00") + (Decimal(fuel.fuel_margin_percent) / Decimal("100"))
        return quantize_money(raw_fuel_cost * margin_multiplier)

    def compute_price_rule_fee(self, rule: PortalDeliveryPriceRule, *, distance_km: Decimal) -> Decimal:
        """Return the base delivery fee for one matched neighborhood or radius tier."""

        if rule.mode == "free":
            return Decimal("0.00")
        if rule.mode == "fixed":
            return quantize_money(Decimal(rule.fixed_fee))
        return self.resolve_fuel_fee(rule.fuel, distance_km)

    def resolve_variation_extra_fee(self, variations: list[PortalDeliveryVariation], variation_key: str) -> Decimal:
        """Return the configured extra fee for one delivery variation, defaulting to zero if unmatched."""

        for entry in variations:
            if entry.id == variation_key:
                return quantize_money(Decimal(entry.extra_fee))
        return Decimal("0.00")

    def find_store_area_config(self, areas: PortalDeliveryAreasResponse, *, store_id: str) -> PortalDeliveryStoreAreaConfig | None:
        """Return the delivery-area configuration for one store, if any has been saved."""

        return next((entry for entry in areas.stores if entry.store_id == store_id), None)

    def is_area_configured(self, store_config: PortalDeliveryStoreAreaConfig | None) -> bool:
        """Return whether a store has touched the delivery-area screen at all (turns on exclusion)."""

        return store_config is not None and bool(store_config.neighborhoods or store_config.radius_tiers)

    def match_delivery_area(
        self, store_config: PortalDeliveryStoreAreaConfig, *, distance_km: Decimal, district_text: str, city_text: str = "",
    ) -> tuple[str, PortalDeliveryNeighborhood | PortalDeliveryRadiusTier] | None:
        """Return ('neighborhood'|'radius', matched entry); a neighborhood match takes precedence over radius tiers.

        A neighborhood entry with no district set covers the whole city instead (matched by city name).
        """

        normalized_district = " ".join((district_text or "").strip().lower().split())
        normalized_city = " ".join((city_text or "").strip().lower().split())
        for neighborhood in store_config.neighborhoods:
            if not neighborhood.is_active:
                continue
            normalized_region = " ".join((neighborhood.district or "").strip().lower().split())
            if normalized_region:
                if normalized_district and (normalized_region in normalized_district or normalized_district in normalized_region):
                    return "neighborhood", neighborhood
                continue
            normalized_entry_city = " ".join((neighborhood.city or "").strip().lower().split())
            if normalized_entry_city and normalized_city and (normalized_entry_city in normalized_city or normalized_city in normalized_entry_city):
                return "neighborhood", neighborhood
        for tier in sorted((entry for entry in store_config.radius_tiers if entry.is_active), key=lambda entry: entry.up_to_km):
            if distance_km <= tier.up_to_km:
                return "radius", tier
        return None

    def resolve_fee_by_area(
        self,
        store_config: PortalDeliveryStoreAreaConfig,
        variations: list[PortalDeliveryVariation],
        *,
        distance_km: Decimal,
        district_text: str,
        city_text: str = "",
        subtotal_amount: Decimal = Decimal("0.00"),
        variation: str = "normal",
    ) -> Decimal | None:
        """Return the resolved delivery fee, or None when the address matches no configured area (excluded)."""

        match = self.match_delivery_area(store_config, distance_km=distance_km, district_text=district_text, city_text=city_text)
        if match is None:
            return None
        _, entry = match
        free_threshold = Decimal(store_config.free_above_subtotal)
        base_fee = (
            Decimal("0.00")
            if free_threshold > Decimal("0.00") and subtotal_amount >= free_threshold
            else self.compute_price_rule_fee(entry.price, distance_km=distance_km)
        )
        return quantize_money(base_fee + self.resolve_variation_extra_fee(variations, variation))

    # ------------------------------------------------------------------
    # Coverage check
    # ------------------------------------------------------------------

    async def check_coverage(
        self, *, subject: TokenSubject, district: str, city: str, state_code: str, postal_code: str,
    ) -> DeliveryCoverageResponse:
        """Return a best-effort delivery-coverage preview for one typed CEP/address.

        Resolves the nearest real store to the typed address first (not a fixed
        hub) — if it's beyond the motoboy radius, coverage is reported as requiring
        shipping instead of checking any area/neighborhood configuration, since
        those only apply to in-house delivery.
        """

        address_text = ", ".join(part for part in [district, city, state_code, postal_code, "Brasil"] if part)
        ranked = await self.rank_stores_by_distance(tenant_id=str(subject.tenant_id), address_text=address_text)
        if not ranked:
            return DeliveryCoverageResponse(configured=False, covered=True)
        nearest_store, distance_km = ranked[0]
        if distance_km > MAX_MOTOBOY_DISTANCE_KM:
            return DeliveryCoverageResponse(
                configured=True, covered=True, requires_shipping=True,
                estimated_distance_km=distance_km, nearest_store_name=nearest_store.name,
            )
        portal_service = PortalService(self.session)
        areas = await portal_service.get_delivery_areas(subject)
        store_config = self.find_store_area_config(areas, store_id=nearest_store.id)
        if not self.is_area_configured(store_config):
            return DeliveryCoverageResponse(configured=False, covered=True, estimated_distance_km=distance_km, nearest_store_name=nearest_store.name)
        match = self.match_delivery_area(store_config, distance_km=distance_km, district_text=district, city_text=city)
        if match is None:
            return DeliveryCoverageResponse(configured=True, covered=False, estimated_distance_km=distance_km, nearest_store_name=nearest_store.name)
        kind, entry = match
        label = (entry.district or entry.city) if kind == "neighborhood" else f"até {entry.up_to_km} km"
        return DeliveryCoverageResponse(
            configured=True, covered=True, match_kind=kind, match_label=label,
            estimated_distance_km=distance_km, nearest_store_name=nearest_store.name,
        )

    # ------------------------------------------------------------------
    # Store resolution
    # ------------------------------------------------------------------

    async def rank_stores_by_distance(self, *, tenant_id: str, address_text: str) -> list[tuple[Store, Decimal]]:
        """Return every active store for one tenant sorted by real distance to one address.

        Unlike resolve_geo (which measures against one fixed hub address from
        settings), this measures against each store's own real Store.latitude/
        longitude — the only way to tell which physical store is actually closest
        in a multi-store tenant.
        """

        client = GeocodingClient()
        customer_point = await asyncio.to_thread(client.geocode, address_text)
        if customer_point is None:
            return []
        stores = await self.store_repository.list_stores(tenant_id=tenant_id, active_only=True)
        ranked: list[tuple[Store, Decimal]] = []
        for store in stores:
            if store.latitude == Decimal("0.0000000") and store.longitude == Decimal("0.0000000"):
                continue
            distance = self.haversine_km(customer_point.latitude, customer_point.longitude, store.latitude, store.longitude)
            ranked.append((store, distance))
        ranked.sort(key=lambda entry: entry[1])
        return ranked

    async def resolve_order_store(
        self,
        *,
        tenant_id: str,
        address_text: str,
        requested_items: list[tuple[str, int]],
        max_motoboy_km: Decimal = MAX_MOTOBOY_DISTANCE_KM,
    ) -> OrderStoreResolution | None:
        """Return the nearest active store that has every requested item in stock.

        Walks candidates nearest-first; the first store with full stock for every
        (product_id, quantity) pair wins. If no store has everything, falls back to
        the nearest store anyway so the caller's existing per-item stock check raises
        its normal "Insufficient stock" error against a real candidate rather than
        silently picking an arbitrary one. Returns None only when the address itself
        can't be geocoded at all (no stores to rank against).
        """

        ranked = await self.rank_stores_by_distance(tenant_id=tenant_id, address_text=address_text)
        if not ranked:
            return None
        fallback_store, fallback_distance = ranked[0]
        for store, distance_km in ranked:
            items = await self.inventory_repository.list_items(tenant_id=tenant_id, store_id=store.id, active_only=True)
            grouped = {str(group["id"]): group for group in build_marketplace_catalog_groups(items)}
            if all(int(grouped.get(product_id, {}).get("stock", 0)) >= quantity for product_id, quantity in requested_items):
                return OrderStoreResolution(store=store, distance_km=distance_km, requires_shipping=distance_km > max_motoboy_km)
        return OrderStoreResolution(
            store=fallback_store, distance_km=fallback_distance, requires_shipping=fallback_distance > max_motoboy_km,
        )

    # ------------------------------------------------------------------
    # Geocoding
    # ------------------------------------------------------------------

    async def resolve_geo_from_store(self, *, tenant_id: str, store_id: str, address_text: str) -> tuple[Decimal, Decimal, Decimal]:
        """Return (latitude, longitude, distance_km) measured against one real store's own coordinates.

        Every delivery-fee and coverage calculation must measure distance from the store that
        will actually fulfill the order — there is no fixed hub address in this system anymore.
        """

        client = GeocodingClient()
        delivery_point = await asyncio.to_thread(client.geocode, address_text)
        if delivery_point is None:
            return Decimal("0.0000000"), Decimal("0.0000000"), Decimal("0.00")
        store = await self.store_repository.get_by_id(tenant_id=tenant_id, store_id=store_id)
        if store is None or (store.latitude == Decimal("0.0000000") and store.longitude == Decimal("0.0000000")):
            return delivery_point.latitude, delivery_point.longitude, Decimal("0.00")
        distance = self.haversine_km(store.latitude, store.longitude, delivery_point.latitude, delivery_point.longitude)
        return delivery_point.latitude, delivery_point.longitude, distance

    def haversine_km(self, lat1: Decimal, lng1: Decimal, lat2: Decimal, lng2: Decimal) -> Decimal:
        """Return the real great-circle distance in kilometers between two coordinates."""

        earth_radius_km = 6371.0
        phi1, phi2 = radians(float(lat1)), radians(float(lat2))
        delta_phi = radians(float(lat2) - float(lat1))
        delta_lambda = radians(float(lng2) - float(lng1))
        a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
        return quantize_money(Decimal(str(earth_radius_km * 2 * atan2(sqrt(a), sqrt(1 - a)))))

    # ------------------------------------------------------------------
    # Route stop attachment
    # ------------------------------------------------------------------

    def build_route_code(self, now: datetime) -> str:
        """Return a readable delivery route code."""

        return "ROTA-" + now.strftime("%Y%m%d") + "-" + uuid4().hex[:4].upper()

    async def attach_route_stop(
        self,
        *,
        tenant_id: str,
        store_id: str,
        now: datetime,
        recipient_name: str,
        address_line: str,
        district: str,
        postal_code: str,
        latitude: Decimal,
        longitude: Decimal,
        route_distance_km: Decimal,
        eta_label: str,
        order_id: str | None = None,
        pdv_sale_id: str | None = None,
        order_fulfillment_id: str | None = None,
        store_label: str = "",
    ) -> None:
        """Append one placed delivery (marketplace order or PDV sale) as a real stop on the tenant's active route."""

        route = await self.repository.get_active_delivery_route(tenant_id=tenant_id, store_id=store_id)
        if route is None:
            store = await self.store_repository.get_by_id(tenant_id=tenant_id, store_id=store_id)
            origin_name = (store.name if store else "") or store_label or "Farmácia Farmaura"
            origin_address = ", ".join(
                part for part in [store.address_line, store.district, store.city, store.state_code] if store and part
            ) if store else ""
            route = DeliveryRoute(
                id=str(uuid4()),
                tenant_id=tenant_id,
                store_id=store_id,
                route_code=self.build_route_code(now),
                route_status="planned",
                origin_name=origin_name,
                origin_address=origin_address,
                origin_latitude=store.latitude if store else Decimal("0.0000000"),
                origin_longitude=store.longitude if store else Decimal("0.0000000"),
                route_provider="store" if store else "",
                planned_at_label=now.strftime("%H:%M"),
            )
            route = await self.repository.add_delivery_route(route)
        next_sequence = await self.repository.get_next_route_stop_sequence(route_id=route.id)
        stop = DeliveryRouteStop(
            id=str(uuid4()),
            route_id=route.id,
            order_id=order_id,
            pdv_sale_id=pdv_sale_id,
            order_fulfillment_id=order_fulfillment_id,
            stop_sequence=next_sequence,
            stop_status="planned",
            customer_name_snapshot=recipient_name,
            address_line_snapshot=address_line,
            district_snapshot=district,
            postal_code_snapshot=postal_code,
            latitude=latitude,
            longitude=longitude,
            distance_from_origin_km=route_distance_km,
            estimated_arrival_label=eta_label,
        )
        await self.repository.add_delivery_route_stop(stop)
        route.stop_count = int(route.stop_count or 0) + 1
        route.total_distance_km = quantize_money(Decimal(route.total_distance_km or 0) + Decimal(route_distance_km or 0))
        await self.repository.save_delivery_route(route)
