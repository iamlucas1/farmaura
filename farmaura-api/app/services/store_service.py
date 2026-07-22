"""
farmaura-api/app/services/store_service.py

Store service for Farmaura.

Responsibilities:
- orchestrate physical store registration and updates for the admin console;
- resolve store coordinates from the postal address at creation time;
- shape store projections for internal and portal consumers.

Observations:
- geocoding failures are non-fatal; a store can exist without resolved
  coordinates and be corrected later by re-saving its address.
"""

import asyncio
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.store import Store
from app.repositories.store_repository import StoreRepository
from app.schemas.auth import TokenSubject
from app.schemas.store import StoreCreateRequest, StoreListResponse, StoreResponse, StoreUpdateRequest
from app.services.geocoding_client import GeocodingClient


# ============================================================================
# STORE SERVICE
# ============================================================================


class StoreService:
    """Provide store administration use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = StoreRepository(session)

    async def list_stores(self, *, active_only: bool = False) -> StoreListResponse:
        """Return every store registered for the tenant."""

        stores = await self.repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=active_only)
        return StoreListResponse(items=[self._serialize(store) for store in stores])

    async def create_store(self, payload: StoreCreateRequest) -> StoreResponse:
        """Register a new physical store, geocoding its address when possible."""

        existing = await self.repository.get_by_code(tenant_id=str(self.subject.tenant_id), code=payload.code)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A store with this code already exists.")
        latitude, longitude = await self._resolve_coordinates(payload.address_line, payload.district, payload.city, payload.state_code)
        store = Store(
            tenant_id=str(self.subject.tenant_id),
            code=payload.code,
            name=payload.name,
            address_line=payload.address_line,
            district=payload.district,
            city=payload.city,
            state_code=payload.state_code,
            postal_code=payload.postal_code,
            latitude=latitude,
            longitude=longitude,
            phone=payload.phone,
            cnpj=payload.cnpj,
            is_primary=payload.is_primary,
            is_active=True,
        )
        await self.repository.add(store)
        await self.session.commit()
        return self._serialize(store)

    async def update_store(self, store_id: str, payload: StoreUpdateRequest) -> StoreResponse:
        """Update an existing store, re-geocoding when the address changes."""

        store = await self.repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        address_changed = False
        for field in ("address_line", "district", "city", "state_code"):
            value = getattr(payload, field)
            if value is not None and value != getattr(store, field):
                setattr(store, field, value)
                address_changed = True
        for field in ("name", "postal_code", "phone", "cnpj", "is_primary", "is_active"):
            value = getattr(payload, field)
            if value is not None:
                setattr(store, field, value)
        if address_changed:
            store.latitude, store.longitude = await self._resolve_coordinates(store.address_line, store.district, store.city, store.state_code)
        await self.session.commit()
        return self._serialize(store)

    async def _resolve_coordinates(self, address_line: str, district: str, city: str, state_code: str) -> tuple[Decimal, Decimal]:
        """Resolve latitude/longitude for a store address, defaulting to zero on failure."""

        full_address = ", ".join(part for part in (address_line, district, city, state_code) if part.strip())
        if not full_address:
            return Decimal("0.0000000"), Decimal("0.0000000")
        result = await asyncio.to_thread(GeocodingClient().geocode, full_address)
        if result is None:
            return Decimal("0.0000000"), Decimal("0.0000000")
        return result.latitude, result.longitude

    def _serialize(self, store: Store) -> StoreResponse:
        """Convert one store ORM row into the response shape."""

        return StoreResponse(
            id=store.id,
            code=store.code,
            name=store.name,
            address_line=store.address_line,
            district=store.district,
            city=store.city,
            state_code=store.state_code,
            postal_code=store.postal_code,
            latitude=store.latitude,
            longitude=store.longitude,
            phone=store.phone,
            cnpj=store.cnpj,
            is_primary=store.is_primary,
            is_active=store.is_active,
        )
