"""
farmaura-api/app/services/inventory_service.py

Inventory service for Farmaura.

Responsibilities:
- execute inventory item, storage, and movement workflows;
- validate stock operations before they reach persistence;
- assemble internal console responses from repository models;

Observations:
- inventory writes are server-authoritative and update both item state and movement history;
- export payloads are generated from the same filtered queries used by the console;
"""

from __future__ import annotations

import csv
from decimal import Decimal
from io import StringIO
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.inventory_repository import InventoryRepository
from app.schemas.auth import TokenSubject
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    InventoryDashboardResponse,
    InventoryExportResponse,
    InventoryItemCreateRequest,
    InventoryItemUpdateRequest,
    InventoryItemResponse,
    InventoryListResponse,
    InventoryLocationCreateRequest,
    InventoryLocationResponse,
    InventoryMovementListResponse,
    InventoryMovementResponse,
    InventorySummaryResponse,
    InventoryTransferRequest,
)


# ============================================================================
# INVENTORY SERVICE
# ============================================================================


class InventoryService:
    """Provide inventory use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = InventoryRepository(session)
        self.store_id = ""

    async def get_dashboard(self, *, limit_movements: int = 20) -> InventoryDashboardResponse:
        """Return the inventory dashboard payload."""

        store_id = await self._get_store_id()
        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
        )
        locations = await self.repository.list_locations(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
        )
        movements = await self.repository.list_movements(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            limit=limit_movements,
        )
        summary = await self._build_summary()
        location_counts = await self.repository.count_items_by_location(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
        )
        return InventoryDashboardResponse(
            summary=summary,
            items=[self._serialize_item(item) for item in items],
            locations=[self._serialize_location(location, location_counts.get(location.code, 0)) for location in locations],
            recent_movements=[self._serialize_movement(movement) for movement in movements],
        )

    async def list_items(
        self,
        *,
        query: str,
        stock_status: str,
        controlled_only: bool,
        location_code: str,
        medication_class_name: str = "",
    ) -> InventoryListResponse:
        """Return filtered inventory items."""

        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            query=query,
            stock_status=stock_status,
            controlled_only=controlled_only,
            location_code=location_code,
            medication_class_name=medication_class_name,
        )
        summary = await self._build_summary()
        return InventoryListResponse(
            summary=summary,
            items=[self._serialize_item(item) for item in items],
        )

    async def list_locations(self) -> list[InventoryLocationResponse]:
        """Return inventory storage locations."""

        locations = await self.repository.list_locations(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
        )
        location_counts = await self.repository.count_items_by_location(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
        )
        return [self._serialize_location(location, location_counts.get(location.code, 0)) for location in locations]

    async def list_movements(
        self,
        *,
        item_id: str,
        movement_type: str,
        limit: int,
    ) -> InventoryMovementListResponse:
        """Return recent inventory movements."""

        movements = await self.repository.list_movements(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            item_id=item_id,
            movement_type=movement_type,
            limit=limit,
        )
        return InventoryMovementListResponse(
            items=[self._serialize_movement(movement) for movement in movements],
        )

    async def create_location(self, payload: InventoryLocationCreateRequest) -> InventoryLocationResponse:
        """Create a new storage location."""

        existing = await self.repository.get_location_by_code(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            code=payload.code,
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Storage location code already exists.",
            )
        location = await self.repository.add_location(self._build_location_model(payload))
        await self.session.commit()
        return self._serialize_location(location, 0)

    async def create_item(self, payload: InventoryItemCreateRequest) -> InventoryItemResponse:
        """Create a new inventory item and its initial movement when needed."""

        await self._ensure_location_exists(payload.storage_location_code)
        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        prepared_payload = payload.model_copy(update=thresholds)
        item = await self.repository.add_item(self._build_item_model(prepared_payload))
        if prepared_payload.initial_quantity > 0:
            await self.repository.add_movement(
                self._build_movement_model(
                    item_id=item.id,
                    movement_type="initial",
                    quantity_delta=prepared_payload.initial_quantity,
                    quantity_before=0,
                    resulting_quantity=prepared_payload.initial_quantity,
                    reason="Initial stock registration",
                    note=prepared_payload.note,
                    reference_code="ITEM-CREATE",
                    from_location_code="",
                    to_location_code=prepared_payload.storage_location_code,
                    unit_cost_snapshot=item.acquisition_cost,
                )
            )
        await self.session.commit()
        await self.session.refresh(item)
        return self._serialize_item(item)

    async def update_item(self, item_id: str, payload: InventoryItemUpdateRequest) -> InventoryItemResponse:
        """Update an existing inventory item without changing its quantity."""

        item = await self._require_item(item_id)
        await self._ensure_location_exists(payload.storage_location_code)
        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        item.sku = payload.sku or item.sku or self._generate_sku(payload.name)
        item.name = payload.name
        item.brand_name = payload.brand_name
        item.category_name = payload.category_name
        item.medication_class_name = payload.medication_class_name
        item.ean_code = payload.ean_code
        item.storage_location = payload.storage_location_code
        item.batch_code = payload.batch_code
        item.expiry_label = payload.expiry_label
        item.minimum_quantity = thresholds['minimum_quantity']
        item.low_stock_threshold = thresholds['low_stock_threshold']
        item.attention_stock_threshold = thresholds['attention_stock_threshold']
        item.normal_stock_threshold = thresholds['normal_stock_threshold']
        item.sale_price = payload.sale_price
        item.acquisition_cost = payload.acquisition_cost
        item.market_reference_price = payload.market_reference_price
        item.promotional_discount_percent = payload.promotional_discount_percent
        item.is_controlled = payload.is_controlled
        item.is_active = payload.is_active
        item.is_marketplace_visible = payload.is_marketplace_visible
        item.marketplace_image_url = payload.marketplace_image_url
        item.marketplace_gallery_urls = payload.marketplace_gallery_urls
        await self.session.commit()
        await self.session.refresh(item)
        return self._serialize_item(item)


    async def adjust_item(self, item_id: str, payload: InventoryAdjustmentRequest) -> InventoryItemResponse:
        """Apply a stock adjustment to an existing item."""

        item = await self._require_item(item_id)
        previous_location_code = item.storage_location
        self._validate_adjustment(payload.movement_type, payload.quantity_delta)
        quantity_after = item.quantity + payload.quantity_delta
        if quantity_after < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stock adjustment would result in a negative quantity.",
            )
        quantity_before = item.quantity
        item.quantity = quantity_after
        if payload.storage_location_code:
            await self._ensure_location_exists(payload.storage_location_code)
            item.storage_location = payload.storage_location_code
        await self.repository.add_movement(
            self._build_movement_model(
                item_id=item.id,
                movement_type=payload.movement_type,
                quantity_delta=payload.quantity_delta,
                quantity_before=quantity_before,
                resulting_quantity=quantity_after,
                reason=payload.reason,
                note=payload.note,
                reference_code=payload.reference_code,
                from_location_code=previous_location_code if payload.quantity_delta < 0 else "",
                to_location_code=payload.storage_location_code or item.storage_location,
                unit_cost_snapshot=item.acquisition_cost,
            )
        )
        await self.session.commit()
        await self.session.refresh(item)
        return self._serialize_item(item)

    async def transfer_item(self, item_id: str, payload: InventoryTransferRequest) -> InventoryItemResponse:
        """Transfer an item allocation between storage locations."""

        item = await self._require_item(item_id)
        await self._ensure_location_exists(payload.to_location_code)
        if item.storage_location == payload.to_location_code:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Item is already stored in the requested location.",
            )
        quantity_before = item.quantity
        origin_code = item.storage_location
        item.storage_location = payload.to_location_code
        await self.repository.add_movement(
            self._build_movement_model(
                item_id=item.id,
                movement_type="transfer",
                quantity_delta=0,
                quantity_before=quantity_before,
                resulting_quantity=quantity_before,
                reason=payload.reason,
                note=payload.note,
                reference_code=payload.reference_code,
                from_location_code=origin_code,
                to_location_code=payload.to_location_code,
                unit_cost_snapshot=item.acquisition_cost,
            )
        )
        await self.session.commit()
        await self.session.refresh(item)
        return self._serialize_item(item)

    async def export_items(
        self,
        *,
        query: str,
        stock_status: str,
        controlled_only: bool,
        location_code: str,
        medication_class_name: str = "",
    ) -> InventoryExportResponse:
        """Generate a CSV export for the current inventory filter."""

        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            query=query,
            stock_status=stock_status,
            controlled_only=controlled_only,
            location_code=location_code,
            medication_class_name=medication_class_name,
        )
        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(
            [
                "sku",
                "name",
                "brand_name",
                "category_name",
                "medication_class_name",
                "ean_code",
                "storage_location",
                "batch_code",
                "expiry_label",
                "quantity",
                "minimum_quantity",
                "low_stock_threshold",
                "attention_stock_threshold",
                "normal_stock_threshold",
                "sale_price",
                "acquisition_cost",
                "market_reference_price",
                "promotional_discount_percent",
                "is_controlled",
            ]
        )
        for item in items:
            writer.writerow(
                [
                    item.sku,
                    item.name,
                    item.brand_name,
                    item.category_name,
                    item.medication_class_name,
                    item.ean_code,
                    item.storage_location,
                    item.batch_code,
                    item.expiry_label,
                    item.quantity,
                    item.minimum_quantity,
                    item.low_stock_threshold,
                    item.attention_stock_threshold,
                    item.normal_stock_threshold,
                    str(item.sale_price),
                    str(item.acquisition_cost),
                    str(item.market_reference_price),
                    str(item.promotional_discount_percent),
                    "yes" if item.is_controlled else "no",
                ]
            )
        return InventoryExportResponse(
            filename="inventory_export.csv",
            content_type="text/csv; charset=utf-8",
            body=csv_buffer.getvalue(),
        )

    async def _build_summary(self) -> InventorySummaryResponse:
        """Return the inventory summary counters."""

        total_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
        )
        normal_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            stock_status="normal",
        )
        attention_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            stock_status="attention",
        )
        low_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            stock_status="low",
        )
        out_of_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            stock_status="out",
        )
        controlled_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            controlled_only=True,
        )
        return InventorySummaryResponse(
            total_items=total_items,
            normal_stock_items=normal_stock_items,
            attention_stock_items=attention_stock_items,
            low_stock_items=low_stock_items,
            out_of_stock_items=out_of_stock_items,
            controlled_items=controlled_items,
        )

    async def _require_item(self, item_id: str):
        """Return an existing inventory item or fail with not found."""

        item = await self.repository.get_item_by_id(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            item_id=item_id,
        )
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        return item

    async def _ensure_location_exists(self, code: str) -> None:
        """Validate that a location code exists for the current store."""

        location = await self.repository.get_location_by_code(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            code=code,
        )
        if location is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage location not found.")

    def _build_item_model(self, payload: InventoryItemCreateRequest):
        """Create an inventory item ORM model from the request payload."""

        from app.models.inventory_item import InventoryItem

        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        return InventoryItem(
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id or str(self.subject.tenant_id),
            sku=payload.sku or self._generate_sku(payload.name),
            name=payload.name,
            brand_name=payload.brand_name,
            category_name=payload.category_name,
            medication_class_name=payload.medication_class_name,
            ean_code=payload.ean_code,
            storage_location=payload.storage_location_code,
            batch_code=payload.batch_code,
            expiry_label=payload.expiry_label,
            quantity=payload.initial_quantity,
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=thresholds["low_stock_threshold"],
            attention_stock_threshold=thresholds["attention_stock_threshold"],
            normal_stock_threshold=thresholds["normal_stock_threshold"],
            sale_price=payload.sale_price,
            acquisition_cost=payload.acquisition_cost,
            market_reference_price=payload.market_reference_price,
            promotional_discount_percent=payload.promotional_discount_percent,
            is_controlled=payload.is_controlled,
            is_active=True,
            is_marketplace_visible=True,
        )

    def _build_location_model(self, payload: InventoryLocationCreateRequest):
        """Create an inventory location ORM model from the request payload."""

        from app.models.inventory_location import InventoryLocation

        return InventoryLocation(
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id or str(self.subject.tenant_id),
            code=payload.code,
            name=payload.name,
            zone=payload.zone,
            description=payload.description,
            temperature_range=payload.temperature_range,
            is_controlled_only=payload.is_controlled_only,
            is_active=True,
        )

    def _build_movement_model(
        self,
        *,
        item_id: str,
        movement_type: str,
        quantity_delta: int,
        quantity_before: int,
        resulting_quantity: int,
        reason: str,
        note: str,
        reference_code: str,
        from_location_code: str,
        to_location_code: str,
        unit_cost_snapshot: Decimal,
    ):
        """Create an inventory movement ORM model."""

        from app.models.inventory_movement import InventoryMovement

        return InventoryMovement(
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id or str(self.subject.tenant_id),
            inventory_item_id=item_id,
            performed_by_user_id=str(self.subject.user_id),
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            quantity_before=quantity_before,
            resulting_quantity=resulting_quantity,
            reason=reason,
            note=note,
            reference_code=reference_code,
            from_location_code=from_location_code,
            to_location_code=to_location_code,
            unit_cost_snapshot=unit_cost_snapshot,
        )

    def _serialize_item(self, item) -> InventoryItemResponse:
        """Serialize an inventory item for API responses."""

        return InventoryItemResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            brand_name=item.brand_name,
            category_name=item.category_name,
            medication_class_name=item.medication_class_name,
            ean_code=item.ean_code,
            storage_location_code=item.storage_location,
            batch_code=item.batch_code,
            expiry_label=item.expiry_label,
            quantity=item.quantity,
            minimum_quantity=item.minimum_quantity,
            low_stock_threshold=item.low_stock_threshold,
            attention_stock_threshold=item.attention_stock_threshold,
            normal_stock_threshold=item.normal_stock_threshold,
            sale_price=item.sale_price,
            acquisition_cost=item.acquisition_cost,
            market_reference_price=item.market_reference_price,
            promotional_discount_percent=item.promotional_discount_percent,
            is_controlled=item.is_controlled,
            is_active=item.is_active,
            is_marketplace_visible=item.is_marketplace_visible,
            marketplace_image_url=item.marketplace_image_url,
            marketplace_gallery_urls=list(item.marketplace_gallery_urls or []),
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    def _serialize_location(self, location, allocated_items: int) -> InventoryLocationResponse:
        """Serialize an inventory location for API responses."""

        return InventoryLocationResponse(
            id=location.id,
            code=location.code,
            name=location.name,
            zone=location.zone,
            description=location.description,
            temperature_range=location.temperature_range,
            is_controlled_only=location.is_controlled_only,
            is_active=location.is_active,
            allocated_items=allocated_items,
            created_at=location.created_at,
            updated_at=location.updated_at,
        )

    def _serialize_movement(self, movement) -> InventoryMovementResponse:
        """Serialize an inventory movement for API responses."""

        return InventoryMovementResponse(
            id=movement.id,
            inventory_item_id=movement.inventory_item_id,
            performed_by_user_id=movement.performed_by_user_id or "",
            movement_type=movement.movement_type,
            quantity_delta=movement.quantity_delta,
            quantity_before=movement.quantity_before,
            resulting_quantity=movement.resulting_quantity,
            reason=movement.reason,
            note=movement.note,
            reference_code=movement.reference_code,
            from_location_code=movement.from_location_code,
            to_location_code=movement.to_location_code,
            unit_cost_snapshot=movement.unit_cost_snapshot,
            created_at=movement.created_at,
        )

    def _generate_sku(self, name: str) -> str:
        """Generate a readable fallback SKU."""

        cleaned = "".join(character if character.isalnum() else "-" for character in name.upper())
        compact = "-".join(segment for segment in cleaned.split("-") if segment)
        return "INV-" + compact[:36] + "-" + uuid4().hex[:6].upper()

    async def _get_store_id(self) -> str:
        """Resolve the active store identifier for the current tenant."""

        if not self.store_id:
            self.store_id = await self.repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))
        return self.store_id

    def _validate_adjustment(self, movement_type: str, quantity_delta: int) -> None:
        """Validate a stock adjustment delta against the movement type."""

        if quantity_delta == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stock adjustment delta must be non-zero.",
            )
        if movement_type == "entry" and quantity_delta < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Entry movements must use a positive quantity delta.",
            )
        if movement_type == "exit" and quantity_delta > 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Exit movements must use a negative quantity delta.",
            )

    def _normalize_thresholds(
        self,
        *,
        minimum_quantity: int,
        low_stock_threshold: int,
        attention_stock_threshold: int,
        normal_stock_threshold: int,
    ) -> dict[str, int]:
        """Return validated thresholds for inventory status classification."""

        minimum = max(0, int(minimum_quantity))
        low = max(0, int(low_stock_threshold))
        attention = max(0, int(attention_stock_threshold))
        normal = max(0, int(normal_stock_threshold))
        if low == 0 and attention == 0 and normal == 0:
            low = minimum
            attention = low + (minimum if minimum > 0 else 5)
            normal = attention + (minimum if minimum > 0 else 10)
        if attention < low:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attention stock threshold must be greater than or equal to the low stock threshold.",
            )
        if normal < attention:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Normal stock threshold must be greater than or equal to the attention stock threshold.",
            )
        return {
            "minimum_quantity": minimum,
            "low_stock_threshold": low,
            "attention_stock_threshold": attention,
            "normal_stock_threshold": normal,
        }
