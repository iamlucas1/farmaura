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
import json
from datetime import datetime
from decimal import Decimal
from io import StringIO
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.core.config import Settings
from app.core.file_storage import read_private_file, write_private_file
from app.core.file_validation import validate_invoice_upload
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE
from app.domain.enums import UserRole
from app.repositories.inventory_repository import InventoryRepository
from app.core.tenant_context import apply_tenant_context
from app.repositories.store_repository import StoreRepository
from app.services.product_availability_notifier import notify_if_product_became_available
from app.schemas.auth import TokenSubject
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    InventoryAuditChangeResponse,
    InventoryAuditEntryResponse,
    InventoryAuditListResponse,
    InventoryDashboardResponse,
    InventoryExportResponse,
    InventoryInvoiceApplyResponse,
    InventoryInvoiceRecordListResponse,
    InventoryInvoiceRecordResponse,
    InventoryItemCreateRequest,
    InventoryItemUpdateRequest,
    InventoryItemResponse,
    InventoryListResponse,
    InventoryLocationCreateRequest,
    InventoryLocationResponse,
    InventoryLocationStatusUpdateRequest,
    InventoryLocationUpdateRequest,
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

    # Product identity/configuration (name, sku, brand, category, therapeutic class, ean,
    # controlled/generic flags, marketplace images) lives on InventoryItem.product and is edited
    # exclusively through ProductService; only store-scoped operational fields are audited here.
    _ITEM_AUDIT_FIELDS = (
        "storage_location", "batch_code", "expiry_label", "minimum_quantity", "low_stock_threshold",
        "attention_stock_threshold", "normal_stock_threshold", "sale_price", "acquisition_cost",
        "market_reference_price", "promotional_discount_percent", "is_active", "is_marketplace_visible",
        "is_subject_to_icms_st",
    )
    _LOCATION_AUDIT_FIELDS = (
        "code", "name", "zone", "description", "temperature_range", "location_type",
        "is_controlled_only", "is_active",
    )

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = InventoryRepository(session)
        self.store_repository = StoreRepository(session)
        self.store_id: str | None = None

    async def get_dashboard(self, *, limit_movements: int = 20, requested_store_id: str = "") -> InventoryDashboardResponse:
        """Return the inventory dashboard payload."""

        store_id = await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True)
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
        requested_store_id: str = "",
    ) -> InventoryListResponse:
        """Return filtered inventory items."""

        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True),
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

    async def list_locations(
        self,
        *,
        store_id: str = "",
        location_type: str = "",
        active_only: bool = False,
    ) -> list[InventoryLocationResponse]:
        """Return the storage locations for one store (unit), defaulting to the primary store."""

        resolved_store_id = store_id or await self._get_store_id()
        locations = await self.repository.list_locations(
            tenant_id=str(self.subject.tenant_id),
            store_id=resolved_store_id,
            location_type=location_type,
            active_only=active_only,
        )
        location_counts = await self.repository.count_items_by_location(
            tenant_id=str(self.subject.tenant_id),
            store_id=resolved_store_id,
        )
        store_name = await self._get_store_name(resolved_store_id)
        return [
            self._serialize_location(location, location_counts.get(location.code, 0), store_name)
            for location in locations
        ]

    async def list_movements(
        self,
        *,
        item_id: str,
        movement_type: str,
        limit: int,
        requested_store_id: str = "",
    ) -> InventoryMovementListResponse:
        """Return recent inventory movements."""

        movements = await self.repository.list_movements(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True),
            item_id=item_id,
            movement_type=movement_type,
            limit=limit,
        )
        return InventoryMovementListResponse(
            items=[self._serialize_movement(movement) for movement in movements],
        )

    async def create_location(
        self,
        payload: InventoryLocationCreateRequest,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryLocationResponse:
        """Create a new storage location for one store (unit)."""

        store = await self.store_repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=payload.store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        existing = await self.repository.get_location_by_code(
            tenant_id=str(self.subject.tenant_id),
            store_id=payload.store_id,
            code=payload.code,
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Storage location code already exists for this store.",
            )
        location = await self.repository.add_location(self._build_location_model(payload))
        await self._write_audit_entry(
            entity_type="location",
            entity_id=location.id,
            entity_label=location.code + " · " + location.name,
            action="create",
            changes=self._diff_fields({}, {field: getattr(location, field) for field in self._LOCATION_AUDIT_FIELDS}),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        return self._serialize_location(location, 0, store.name)

    async def update_location(
        self,
        location_id: str,
        payload: InventoryLocationUpdateRequest,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryLocationResponse:
        """Update an existing storage location, keeping it in its original store."""

        location = await self._require_location(location_id)
        if payload.code != location.code:
            existing = await self.repository.get_location_by_code(
                tenant_id=str(self.subject.tenant_id),
                store_id=location.store_id,
                code=payload.code,
            )
            if existing is not None and existing.id != location.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Storage location code already exists for this store.",
                )
        new_values = {
            "code": payload.code,
            "name": payload.name,
            "zone": payload.zone,
            "description": payload.description,
            "temperature_range": payload.temperature_range,
            "location_type": payload.location_type,
            "is_controlled_only": payload.is_controlled_only,
        }
        old_values = {field: getattr(location, field) for field in new_values}
        for field, value in new_values.items():
            setattr(location, field, value)
        await self._write_audit_entry(
            entity_type="location",
            entity_id=location.id,
            entity_label=new_values["code"] + " · " + new_values["name"],
            action="update",
            changes=self._diff_fields(old_values, new_values),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        await self.session.refresh(location)
        location_counts = await self.repository.count_items_by_location(
            tenant_id=str(self.subject.tenant_id), store_id=location.store_id,
        )
        store_name = await self._get_store_name(location.store_id)
        return self._serialize_location(location, location_counts.get(location.code, 0), store_name)

    async def update_location_status(
        self,
        location_id: str,
        payload: InventoryLocationStatusUpdateRequest,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryLocationResponse:
        """Activate or deactivate a storage location."""

        location = await self._require_location(location_id)
        old_active = location.is_active
        location.is_active = payload.is_active
        await self._write_audit_entry(
            entity_type="location",
            entity_id=location.id,
            entity_label=location.code + " · " + location.name,
            action="status_change",
            changes=self._diff_fields({"is_active": old_active}, {"is_active": payload.is_active}),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        await self.session.refresh(location)
        location_counts = await self.repository.count_items_by_location(
            tenant_id=str(self.subject.tenant_id), store_id=location.store_id,
        )
        store_name = await self._get_store_name(location.store_id)
        return self._serialize_location(location, location_counts.get(location.code, 0), store_name)

    async def _require_location(self, location_id: str):
        """Return an existing storage location or fail with not found."""

        location = await self.repository.get_location_by_id(
            tenant_id=str(self.subject.tenant_id), location_id=location_id,
        )
        if location is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage location not found.")
        return location

    async def _get_store_name(self, store_id: str) -> str:
        """Resolve a store's display name, or an empty string if it can't be found."""

        if not store_id:
            return ""
        store = await self.store_repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=store_id)
        return store.name if store is not None else ""

    async def _get_actor_identity(self) -> tuple[str, str]:
        """Resolve the acting user's display name and email for audit records."""

        from app.models.user import User

        result = await self.session.execute(
            select(User.full_name, User.email).where(User.id == str(self.subject.user_id))
        )
        row = result.first()
        return (str(row[0]), str(row[1])) if row is not None else ("", "")

    @staticmethod
    def _stringify_audit_value(value: object) -> str:
        """Render an audited field value as a plain string for storage."""

        if value is None:
            return ""
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, list):
            return ", ".join(str(entry) for entry in value)
        return str(value)

    def _diff_fields(self, old_values: dict[str, Any], new_values: dict[str, Any]) -> list[dict[str, str]]:
        """Return the list of fields whose value actually changed."""

        changes: list[dict[str, str]] = []
        for field, new_value in new_values.items():
            old_value = old_values.get(field)
            if old_value == new_value:
                continue
            changes.append({
                "field": field,
                "old": self._stringify_audit_value(old_value),
                "new": self._stringify_audit_value(new_value),
            })
        return changes

    async def _write_audit_entry(
        self,
        *,
        entity_type: str,
        entity_id: str,
        entity_label: str,
        action: str,
        changes: list[dict[str, str]],
        ip_address: str = "",
        user_agent: str = "",
    ) -> None:
        """Stage an inventory audit entry for the current unit of work."""

        if not changes:
            return
        from app.models.inventory_audit_entry import InventoryAuditEntry

        actor_name, actor_email = await self._get_actor_identity()
        await self.repository.add_audit_entry(
            InventoryAuditEntry(
                tenant_id=str(self.subject.tenant_id),
                store_id=self.store_id or str(self.subject.tenant_id),
                entity_type=entity_type,
                entity_id=entity_id,
                entity_label=entity_label,
                action=action,
                changes_json=json.dumps(changes),
                actor_user_id=str(self.subject.user_id),
                actor_name=actor_name,
                actor_email=actor_email,
                actor_role=str(self.subject.role),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )

    async def create_item(
        self,
        payload: InventoryItemCreateRequest,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryItemResponse:
        """Create a new inventory item and its initial movement when needed."""

        await self._ensure_location_exists(payload.storage_location_code)
        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        prepared_payload = payload.model_copy(update=thresholds)
        item = await self.repository.add_item(await self._build_item_model(prepared_payload))
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
        await self._write_audit_entry(
            entity_type="item",
            entity_id=item.id,
            entity_label=item.name,
            action="create",
            changes=self._diff_fields({}, {field: getattr(item, field) for field in self._ITEM_AUDIT_FIELDS}),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(item)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize_item(item)

    async def update_item(
        self,
        item_id: str,
        payload: InventoryItemUpdateRequest,
        *,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryItemResponse:
        """Update an existing inventory item without changing its quantity."""

        item = await self._require_item(item_id)
        await self._ensure_location_exists(payload.storage_location_code)
        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        new_values = {
            "storage_location": payload.storage_location_code,
            "batch_code": payload.batch_code,
            "expiry_label": payload.expiry_label,
            "minimum_quantity": thresholds['minimum_quantity'],
            "low_stock_threshold": thresholds['low_stock_threshold'],
            "attention_stock_threshold": thresholds['attention_stock_threshold'],
            "normal_stock_threshold": thresholds['normal_stock_threshold'],
            "sale_price": payload.sale_price,
            "acquisition_cost": payload.acquisition_cost,
            "market_reference_price": payload.market_reference_price,
            "promotional_discount_percent": payload.promotional_discount_percent,
            "is_active": payload.is_active,
            "is_marketplace_visible": payload.is_marketplace_visible,
        }
        old_values = {field: getattr(item, field) for field in new_values}
        became_visible = not old_values["is_marketplace_visible"] and new_values["is_marketplace_visible"]
        for field, value in new_values.items():
            setattr(item, field, value)
        await self._write_audit_entry(
            entity_type="item",
            entity_id=item.id,
            entity_label=str(item.name),
            action="update",
            changes=self._diff_fields(old_values, new_values),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(item)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        if became_visible:
            await self._notify_availability_if_restocked(item)
        return self._serialize_item(item)


    async def adjust_item(self, item_id: str, payload: InventoryAdjustmentRequest, *, requested_store_id: str = "") -> InventoryItemResponse:
        """Apply a stock adjustment to an existing item."""

        await self._get_store_id(requested_store_id=requested_store_id)
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
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(item)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        if quantity_before <= 0 < quantity_after:
            await self._notify_availability_if_restocked(item)
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
        await apply_tenant_context(self.session, self.subject)
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
        requested_store_id: str = "",
    ) -> InventoryExportResponse:
        """Generate a CSV export for the current inventory filter."""

        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True),
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
        """Return an existing inventory item or fail with not found.

        Looked up by id alone (tenant-scoped), not narrowed to one store: an admin
        managing inventory across every store must be able to reach an item that lives
        in any of them, not just whichever store `_get_store_id()` would otherwise
        default to. Non-admin roles remain implicitly restricted to their own store,
        since `_get_store_id()` still resolves to `self.subject.store_id` for them
        before it ever considers `allow_all_stores`.
        """

        item = await self.repository.get_item_by_id(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(allow_all_stores=True),
            item_id=item_id,
        )
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        return item

    async def _notify_availability_if_restocked(self, item) -> None:
        """Fire back-in-stock alerts for one item's product, best-effort.

        Called after a write that could have flipped a product from unavailable to
        available (publish toggle or stock replenishment) — never allowed to fail the
        inventory write that triggered it.
        """

        try:
            await notify_if_product_became_available(
                self.session,
                tenant_id=str(self.subject.tenant_id),
                product_name=item.name,
                brand_name=item.brand_name,
                fallback_id=item.id,
            )
        except Exception:
            await self.session.rollback()

    async def _ensure_location_exists(self, code: str) -> None:
        """Validate that a location code exists for the current store."""

        location = await self.repository.get_location_by_code(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            code=code,
        )
        if location is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage location not found.")

    async def _require_product(self, product_id: str):
        """Return an existing tenant product or fail with not found."""

        product = await self.repository.get_product_by_id(tenant_id=str(self.subject.tenant_id), product_id=product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
        return product

    async def _build_item_model(self, payload: InventoryItemCreateRequest):
        """Create an inventory item ORM model from the request payload."""

        from app.models.inventory_item import InventoryItem

        thresholds = self._normalize_thresholds(
            minimum_quantity=payload.minimum_quantity,
            low_stock_threshold=payload.low_stock_threshold,
            attention_stock_threshold=payload.attention_stock_threshold,
            normal_stock_threshold=payload.normal_stock_threshold,
        )
        product = await self._require_product(payload.product_id)
        return InventoryItem(
            tenant_id=str(self.subject.tenant_id),
            store_id=self.store_id or str(self.subject.tenant_id),
            product_id=product.id,
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
            is_active=True,
            is_marketplace_visible=True,
        )

    def _build_location_model(self, payload: InventoryLocationCreateRequest):
        """Create an inventory location ORM model from the request payload."""

        from app.models.inventory_location import InventoryLocation

        return InventoryLocation(
            tenant_id=str(self.subject.tenant_id),
            store_id=payload.store_id,
            code=payload.code,
            name=payload.name,
            zone=payload.zone,
            description=payload.description,
            temperature_range=payload.temperature_range,
            location_type=payload.location_type,
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
            store_id=item.store_id,
            product_id=item.product_id,
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
            controlled_category=item.controlled_category,
            is_generic=item.is_generic,
            is_active=item.is_active,
            is_marketplace_visible=item.is_marketplace_visible,
            marketplace_image_url=item.marketplace_image_url,
            marketplace_gallery_urls=list(item.marketplace_gallery_urls or []),
            cnae_code=item.cnae_code,
            is_subject_to_icms_st=item.is_subject_to_icms_st,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    def _serialize_location(self, location, allocated_items: int, store_name: str = "") -> InventoryLocationResponse:
        """Serialize an inventory location for API responses."""

        return InventoryLocationResponse(
            id=location.id,
            store_id=location.store_id,
            store_name=store_name,
            code=location.code,
            name=location.name,
            zone=location.zone,
            description=location.description,
            temperature_range=location.temperature_range,
            location_type=location.location_type,
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

    async def apply_invoice_edit(
        self,
        item_id: str,
        *,
        invoice_total_amount: Decimal,
        product_total_amount: Decimal,
        quantity: int,
        note: str,
        file: UploadFile,
        settings: Settings,
        tax_cost_amount: Decimal | None = None,
        is_subject_to_icms_st: bool | None = None,
        ip_address: str = "",
        user_agent: str = "",
    ) -> InventoryInvoiceApplyResponse:
        """Attach a supplier invoice to an item, recompute its unit cost, and receive stock. Admin only."""

        if quantity <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quantity must be greater than zero.")
        if product_total_amount <= Decimal("0.00"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Product total amount must be greater than zero.")

        from app.models.inventory_invoice_record import InventoryInvoiceRecord

        item = await self._require_item(item_id)
        await validate_invoice_upload(file, settings)
        content = await file.read(settings.max_upload_bytes + 1)
        await file.seek(0)
        if not content:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice file is empty.")

        unit_cost = (product_total_amount / Decimal(quantity)).quantize(Decimal("0.01"))
        # Not self._get_store_id(): _require_item() above already resolved with
        # allow_all_stores=True (so admins can reach an item in any store) and cached that
        # result on self.store_id, so a plain _get_store_id() here would return the cached
        # "" (all stores) instead of a concrete one. The item's own store is what this
        # invoice/movement actually belongs to; re-set the cache too since
        # _build_movement_model() below reads self.store_id directly.
        store_id = item.store_id
        self.store_id = store_id
        extension = Path(file.filename or "").suffix.lower()
        storage_key = f"{self.subject.tenant_id}/invoices/{item.id}/{uuid4()}{extension}"
        await write_private_file(settings=settings, storage_key=storage_key, content=content)

        old_values = {"acquisition_cost": item.acquisition_cost, "is_subject_to_icms_st": item.is_subject_to_icms_st}
        quantity_before = item.quantity
        resulting_quantity = quantity_before + quantity
        item.acquisition_cost = unit_cost
        item.quantity = resulting_quantity
        if is_subject_to_icms_st is not None:
            item.is_subject_to_icms_st = is_subject_to_icms_st

        record = InventoryInvoiceRecord(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            inventory_item_id=item.id,
            uploaded_by_user_id=str(self.subject.user_id),
            invoice_total_amount=invoice_total_amount,
            product_total_amount=product_total_amount,
            quantity=quantity,
            unit_cost=unit_cost,
            file_name=file.filename or "nota-fiscal",
            content_type=file.content_type or "application/octet-stream",
            size_bytes=len(content),
            storage_key=storage_key,
            note=note,
            tax_cost_amount=tax_cost_amount,
            is_subject_to_icms_st=is_subject_to_icms_st,
        )
        await self.repository.add_invoice_record(record)
        await self.repository.add_movement(
            self._build_movement_model(
                item_id=item.id,
                movement_type="entry",
                quantity_delta=quantity,
                quantity_before=quantity_before,
                resulting_quantity=resulting_quantity,
                reason="Nota fiscal anexada via Precificador",
                note=("Nota: " + (file.filename or "")).strip()[:500],
                reference_code=("NF-" + record.id[:8]),
                from_location_code="",
                to_location_code=item.storage_location,
                unit_cost_snapshot=unit_cost,
            )
        )
        await self._write_audit_entry(
            entity_type="item",
            entity_id=item.id,
            entity_label=item.name,
            action="update",
            changes=self._diff_fields(old_values, {"acquisition_cost": unit_cost, "is_subject_to_icms_st": item.is_subject_to_icms_st}),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        await self.session.refresh(item)
        await self.session.refresh(record)
        if quantity_before <= 0:
            await self._notify_availability_if_restocked(item)
        return InventoryInvoiceApplyResponse(item=self._serialize_item(item), invoice=self._serialize_invoice_record(record))

    async def list_item_invoice_records(self, item_id: str) -> InventoryInvoiceRecordListResponse:
        """Return the stored invoice history for one inventory item."""

        await self._require_item(item_id)
        records = await self.repository.list_invoice_records(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            item_id=item_id,
        )
        return InventoryInvoiceRecordListResponse(items=[self._serialize_invoice_record(record) for record in records])

    async def get_invoice_file(self, invoice_id: str, *, settings: Settings):
        """Return an invoice record and its stored file bytes for download."""

        record = await self.repository.get_invoice_record_by_id(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            invoice_id=invoice_id,
        )
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice record not found.")
        content = await read_private_file(settings=settings, storage_key=record.storage_key)
        return record, content

    def _serialize_invoice_record(self, record) -> InventoryInvoiceRecordResponse:
        """Serialize a stored invoice record for API responses."""

        return InventoryInvoiceRecordResponse(
            id=record.id,
            inventory_item_id=record.inventory_item_id,
            invoice_total_amount=record.invoice_total_amount,
            product_total_amount=record.product_total_amount,
            quantity=record.quantity,
            unit_cost=record.unit_cost,
            file_name=record.file_name,
            content_type=record.content_type,
            size_bytes=record.size_bytes,
            uploaded_by_user_id=record.uploaded_by_user_id or "",
            note=record.note,
            tax_cost_amount=record.tax_cost_amount,
            is_subject_to_icms_st=record.is_subject_to_icms_st,
            created_at=record.created_at,
        )

    async def list_audit_trail(
        self,
        *,
        page: int,
        page_size: int,
        entity_type: str = "",
        action: str = "",
        actor_query: str = "",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        q: str = "",
    ) -> InventoryAuditListResponse:
        """Return a merged, paginated audit trail combining field edits and stock movements."""

        tenant_id = str(self.subject.tenant_id)
        fetch_count = min(page * page_size, 5000)
        movement_actions = ("stock_movement", "pdv_sale")
        include_entries = action not in movement_actions
        include_movements = action in ("", *movement_actions) and entity_type in ("", "item")
        movement_reason = "pdv_sale" if action == "pdv_sale" else ""
        movement_exclude_reason = "pdv_sale" if action == "stock_movement" else ""

        entry_rows: list = []
        entry_total = 0
        if include_entries:
            entry_action = "" if action in movement_actions else action
            entry_rows = await self.repository.list_audit_entries(
                tenant_id=tenant_id, entity_type=entity_type, action=entry_action, actor_query=actor_query,
                date_from=date_from, date_to=date_to, q=q, limit=fetch_count, offset=0,
            )
            entry_total = await self.repository.count_audit_entries(
                tenant_id=tenant_id, entity_type=entity_type, action=entry_action, actor_query=actor_query,
                date_from=date_from, date_to=date_to, q=q,
            )

        movement_rows: list = []
        movement_total = 0
        if include_movements:
            movement_rows = await self.repository.list_movements_with_actor(
                tenant_id=tenant_id, actor_query=actor_query, date_from=date_from, date_to=date_to, q=q,
                reason=movement_reason, exclude_reason=movement_exclude_reason, limit=fetch_count, offset=0,
            )
            movement_total = await self.repository.count_movements_with_actor(
                tenant_id=tenant_id, actor_query=actor_query, date_from=date_from, date_to=date_to, q=q,
                reason=movement_reason, exclude_reason=movement_exclude_reason,
            )

        merged = [self._serialize_audit_entry(row) for row in entry_rows]
        merged.extend(self._serialize_audit_movement(row) for row in movement_rows)
        merged.sort(key=lambda entry: entry.created_at, reverse=True)

        start = (page - 1) * page_size
        return InventoryAuditListResponse(
            items=merged[start:start + page_size],
            page=page,
            page_size=page_size,
            total=entry_total + movement_total,
        )

    def _serialize_audit_entry(self, entry) -> InventoryAuditEntryResponse:
        """Serialize a field-level audit trail entry for API responses."""

        raw_changes = json.loads(entry.changes_json or "[]")
        return InventoryAuditEntryResponse(
            id=entry.id,
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            entity_label=entry.entity_label,
            action=entry.action,
            changes=[InventoryAuditChangeResponse(**change) for change in raw_changes],
            actor_user_id=entry.actor_user_id,
            actor_name=entry.actor_name,
            actor_email=entry.actor_email,
            actor_role=entry.actor_role,
            ip_address=entry.ip_address,
            user_agent=entry.user_agent,
            created_at=entry.created_at,
        )

    def _serialize_audit_movement(self, row: tuple) -> InventoryAuditEntryResponse:
        """Represent a stock movement as an audit trail entry for the merged feed."""

        movement, actor_name, actor_email, actor_role, item_name = row
        changes = [
            {"field": "quantity", "old": str(movement.quantity_before), "new": str(movement.resulting_quantity)},
        ]
        if movement.from_location_code or movement.to_location_code:
            changes.append({
                "field": "storage_location",
                "old": movement.from_location_code,
                "new": movement.to_location_code,
            })
        if movement.reason:
            changes.append({"field": "reason", "old": "", "new": movement.reason})
        if movement.reference_code:
            changes.append({"field": "reference_code", "old": "", "new": movement.reference_code})
        action = "pdv_sale" if movement.reason == "pdv_sale" else "stock_movement"
        return InventoryAuditEntryResponse(
            id=movement.id,
            entity_type="item",
            entity_id=movement.inventory_item_id,
            entity_label=item_name,
            action=action,
            changes=[InventoryAuditChangeResponse(**change) for change in changes],
            actor_user_id=movement.performed_by_user_id or "",
            actor_name=actor_name,
            actor_email=actor_email,
            actor_role=actor_role,
            ip_address="",
            user_agent="",
            created_at=movement.created_at,
        )

    async def _get_store_id(self, *, requested_store_id: str = "", allow_all_stores: bool = False) -> str:
        """Resolve the active store identifier, honoring an admin-supplied override.

        Admins have no store of their own: for read/list use-cases (allow_all_stores=True)
        they default to seeing every store in the tenant (empty string, unfiltered) unless
        they pick one. Writes always resolve to a concrete store.
        """

        if self.store_id is not None:
            return self.store_id
        if requested_store_id and self.subject.role == UserRole.ADMIN:
            self.store_id = requested_store_id
        elif self.subject.store_id:
            self.store_id = str(self.subject.store_id)
        elif allow_all_stores and self.subject.role == UserRole.ADMIN:
            self.store_id = ""
        else:
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
