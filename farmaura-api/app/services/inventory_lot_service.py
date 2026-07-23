"""
farmaura-api/app/services/inventory_lot_service.py

Inventory stock lot service for Farmaura.

Responsibilities:
- execute goods-receipt, transfer, and adjustment use-cases for per-batch,
  per-location stock balances;
- keep the InventoryItem aggregate quantity in sync with the sum of its lots;
- assemble the product traceability/audit lookup for the internal console;

Observations:
- pricing stays out of this service on purpose — pricing lives in the Precificador flow;
- every mutation writes a fine-grained InventoryLotMovement and, where the aggregate
  quantity changes, also a legacy InventoryMovement so existing dashboards keep working;
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import apply_tenant_context
from app.domain.enums import UserRole
from app.models.inventory_lot_movement import InventoryLotMovement
from app.models.inventory_movement import InventoryMovement
from app.models.inventory_stock_lot import InventoryStockLot
from app.repositories.inventory_lot_repository import InventoryLotRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.supplier_repository import SupplierRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.inventory_lot import (
    ItemTraceResponse,
    ItemTraceSummaryResponse,
    LotAdjustmentRequest,
    LotMovementResponse,
    LotReceiptRequest,
    LotTransferRequest,
    StockLotListResponse,
    StockLotResponse,
    TraceCandidateListResponse,
    TraceCandidateResponse,
)


# ============================================================================
# INVENTORY LOT SERVICE
# ============================================================================


class InventoryLotService:
    """Provide per-batch, per-location stock use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = InventoryLotRepository(session)
        self.inventory_repository = InventoryRepository(session)
        self.supplier_repository = SupplierRepository(session)
        self.user_repository = UserRepository(session)
        self.store_id: str | None = None

    async def list_lots(
        self,
        *,
        item_id: str = "",
        location_id: str = "",
        location_type: str = "",
        status_filter: str = "",
        batch_code: str = "",
        expiry_from: date | None = None,
        expiry_to: date | None = None,
        supplier_id: str = "",
        only_positive: bool = True,
        requested_store_id: str = "",
    ) -> StockLotListResponse:
        """Return filtered stock lots for the segregated stock screen."""

        lots = await self.repository.list_stock_lots(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(requested_store_id=requested_store_id, allow_all_stores=True),
            item_id=item_id,
            location_id=location_id,
            location_type=location_type,
            status=status_filter,
            batch_code=batch_code,
            expiry_from=expiry_from,
            expiry_to=expiry_to,
            supplier_id=supplier_id,
            only_positive=only_positive,
        )
        return StockLotListResponse(items=[await self._serialize_lot(lot) for lot in lots])

    async def receive_stock(self, payload: LotReceiptRequest, *, requested_store_id: str = "") -> StockLotResponse:
        """Register a goods-receipt event for one batch at one storage location."""

        store_id = await self._get_store_id(requested_store_id=requested_store_id)
        item = await self._require_item(payload.inventory_item_id)
        await self._require_location(payload.location_id, store_id=store_id)
        if payload.supplier_id:
            supplier = await self.supplier_repository.get_by_id(
                tenant_id=str(self.subject.tenant_id), supplier_id=payload.supplier_id,
            )
            if supplier is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found.")

        existing_lot = await self.repository.get_matching_lot_for_update(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            item_id=item.id,
            location_id=payload.location_id,
            batch_code=payload.batch_code,
            status="available",
        )
        if existing_lot is not None:
            quantity_before = existing_lot.quantity
            existing_lot.quantity += payload.quantity
            existing_lot.expiry_date = payload.expiry_date or existing_lot.expiry_date
            existing_lot.unit_cost_snapshot = payload.unit_cost_snapshot or existing_lot.unit_cost_snapshot
            existing_lot.supplier_id = payload.supplier_id or existing_lot.supplier_id
            existing_lot.reference_code = payload.reference_code or existing_lot.reference_code
            lot = existing_lot
        else:
            lot = await self.repository.add_lot(
                InventoryStockLot(
                    tenant_id=str(self.subject.tenant_id),
                    store_id=store_id,
                    inventory_item_id=item.id,
                    location_id=payload.location_id,
                    supplier_id=payload.supplier_id or None,
                    batch_code=payload.batch_code,
                    expiry_date=payload.expiry_date,
                    quantity=payload.quantity,
                    status="available",
                    unit_cost_snapshot=payload.unit_cost_snapshot,
                    received_at=datetime.now(tz=UTC),
                    reference_code=payload.reference_code,
                )
            )
            quantity_before = 0
        await self.repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=store_id,
                inventory_item_id=item.id,
                stock_lot_id=lot.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="receipt",
                quantity_delta=payload.quantity,
                quantity_before=quantity_before,
                resulting_quantity=lot.quantity,
                to_location_id=payload.location_id,
                batch_code=payload.batch_code,
                expiry_date=payload.expiry_date,
                reason="Recebimento de mercadoria",
                note=payload.note,
                reference_code=payload.reference_code,
                source_type="manual",
                unit_cost_snapshot=payload.unit_cost_snapshot,
            )
        )
        item_quantity_before = item.quantity
        item.quantity = item.quantity + payload.quantity
        await self.inventory_repository.add_movement(
            InventoryMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=store_id,
                inventory_item_id=item.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="entry",
                quantity_delta=payload.quantity,
                quantity_before=item_quantity_before,
                resulting_quantity=item.quantity,
                reason="Recebimento de mercadoria (lote " + payload.batch_code + ")",
                note=payload.note,
                reference_code=payload.reference_code,
                to_location_code=payload.location_id,
                unit_cost_snapshot=payload.unit_cost_snapshot,
            )
        )
        await self.session.commit()
        # lot's own fields are already correct in memory (set above), but
        # _serialize_lot() below issues fresh location/supplier lookups —
        # reapply RLS context first, since commit() cleared the
        # transaction-local set_config from apply_tenant_context()
        # (see app/core/tenant_context.py).
        await apply_tenant_context(self.session, self.subject)
        return await self._serialize_lot(lot)

    async def transfer_lot(self, lot_id: str, payload: LotTransferRequest, *, requested_store_id: str = "") -> StockLotListResponse:
        """Move part (or all) of one stock lot to another storage location."""

        store_id = await self._get_store_id(requested_store_id=requested_store_id)
        source_lot = await self.repository.get_lot_for_update(tenant_id=str(self.subject.tenant_id), lot_id=lot_id)
        if source_lot is None or source_lot.store_id != store_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock lot not found.")
        if payload.quantity > source_lot.quantity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Transfer quantity exceeds the available lot balance.",
            )
        if payload.to_location_id == source_lot.location_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stock lot is already stored in the requested location.",
            )
        await self._require_location(payload.to_location_id, store_id=store_id)

        source_quantity_before = source_lot.quantity
        source_lot.quantity -= payload.quantity

        destination_lot = await self.repository.get_matching_lot_for_update(
            tenant_id=str(self.subject.tenant_id),
            store_id=source_lot.store_id,
            item_id=source_lot.inventory_item_id,
            location_id=payload.to_location_id,
            batch_code=source_lot.batch_code,
            status=source_lot.status,
        )
        if destination_lot is not None:
            destination_quantity_before = destination_lot.quantity
            destination_lot.quantity += payload.quantity
        else:
            destination_lot = await self.repository.add_lot(
                InventoryStockLot(
                    tenant_id=str(self.subject.tenant_id),
                    store_id=source_lot.store_id,
                    inventory_item_id=source_lot.inventory_item_id,
                    location_id=payload.to_location_id,
                    supplier_id=source_lot.supplier_id,
                    batch_code=source_lot.batch_code,
                    expiry_date=source_lot.expiry_date,
                    quantity=payload.quantity,
                    status=source_lot.status,
                    unit_cost_snapshot=source_lot.unit_cost_snapshot,
                    received_at=source_lot.received_at,
                    reference_code=payload.reference_code,
                )
            )
            destination_quantity_before = 0

        await self.repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=source_lot.store_id,
                inventory_item_id=source_lot.inventory_item_id,
                stock_lot_id=source_lot.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="transfer_out",
                quantity_delta=-payload.quantity,
                quantity_before=source_quantity_before,
                resulting_quantity=source_lot.quantity,
                from_location_id=source_lot.location_id,
                to_location_id=payload.to_location_id,
                batch_code=source_lot.batch_code,
                expiry_date=source_lot.expiry_date,
                reason=payload.reason,
                note=payload.note,
                reference_code=payload.reference_code,
                source_type="manual",
                unit_cost_snapshot=source_lot.unit_cost_snapshot,
            )
        )
        await self.repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=source_lot.store_id,
                inventory_item_id=source_lot.inventory_item_id,
                stock_lot_id=destination_lot.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="transfer_in",
                quantity_delta=payload.quantity,
                quantity_before=destination_quantity_before,
                resulting_quantity=destination_lot.quantity,
                from_location_id=source_lot.location_id,
                to_location_id=payload.to_location_id,
                batch_code=source_lot.batch_code,
                expiry_date=source_lot.expiry_date,
                reason=payload.reason,
                note=payload.note,
                reference_code=payload.reference_code,
                source_type="manual",
                unit_cost_snapshot=destination_lot.unit_cost_snapshot,
            )
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        return StockLotListResponse(
            items=[await self._serialize_lot(source_lot), await self._serialize_lot(destination_lot)],
        )

    async def adjust_lot(self, lot_id: str, payload: LotAdjustmentRequest, *, requested_store_id: str = "") -> StockLotResponse:
        """Apply a manual adjustment (loss, breakage, count correction) to one stock lot."""

        if payload.quantity_delta == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Adjustment delta must be non-zero.",
            )
        store_id = await self._get_store_id(requested_store_id=requested_store_id)
        lot = await self.repository.get_lot_for_update(tenant_id=str(self.subject.tenant_id), lot_id=lot_id)
        if lot is None or lot.store_id != store_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock lot not found.")
        quantity_after = lot.quantity + payload.quantity_delta
        if quantity_after < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Adjustment would result in a negative lot balance.",
            )
        item = await self.inventory_repository.get_item_by_id_for_update(
            tenant_id=str(self.subject.tenant_id), item_id=lot.inventory_item_id,
        )
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        item_quantity_after = item.quantity + payload.quantity_delta
        if item_quantity_after < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Adjustment would result in a negative item balance.",
            )
        quantity_before = lot.quantity
        lot.quantity = quantity_after
        await self.repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=lot.store_id,
                inventory_item_id=lot.inventory_item_id,
                stock_lot_id=lot.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="adjustment",
                quantity_delta=payload.quantity_delta,
                quantity_before=quantity_before,
                resulting_quantity=quantity_after,
                to_location_id=lot.location_id,
                batch_code=lot.batch_code,
                expiry_date=lot.expiry_date,
                reason=payload.reason,
                note=payload.note,
                source_type="manual",
                unit_cost_snapshot=lot.unit_cost_snapshot,
            )
        )
        item_quantity_before = item.quantity
        item.quantity = item_quantity_after
        await self.inventory_repository.add_movement(
            InventoryMovement(
                tenant_id=str(self.subject.tenant_id),
                store_id=lot.store_id,
                inventory_item_id=item.id,
                performed_by_user_id=str(self.subject.user_id),
                movement_type="adjustment",
                quantity_delta=payload.quantity_delta,
                quantity_before=item_quantity_before,
                resulting_quantity=item.quantity,
                reason=payload.reason + " (lote " + lot.batch_code + ")",
                note=payload.note,
                unit_cost_snapshot=lot.unit_cost_snapshot,
            )
        )
        await self.session.commit()
        await apply_tenant_context(self.session, self.subject)
        return await self._serialize_lot(lot)

    async def search_candidates(self, query: str) -> TraceCandidateListResponse:
        """Return candidate items matching a SKU, EAN, name, or batch code search."""

        store_id = await self._get_store_id()
        tenant_id = str(self.subject.tenant_id)
        matched_ids: list[str] = []
        candidates = []

        text_matches = await self.inventory_repository.list_items(
            tenant_id=tenant_id, store_id=store_id, query=query, stock_status="all",
        )
        for item in text_matches[:20]:
            if item.id in matched_ids:
                continue
            matched_ids.append(item.id)
            candidates.append(item)

        if query.strip():
            lot_matches = await self.repository.list_stock_lots(
                tenant_id=tenant_id, store_id=store_id, batch_code=query.strip(), only_positive=False,
            )
            for lot in lot_matches:
                if lot.inventory_item_id in matched_ids:
                    continue
                item = await self.inventory_repository.get_item_by_id(
                    tenant_id=tenant_id, store_id=store_id, item_id=lot.inventory_item_id,
                )
                if item is None:
                    continue
                matched_ids.append(item.id)
                candidates.append(item)

        return TraceCandidateListResponse(
            items=[
                TraceCandidateResponse(
                    id=item.id,
                    sku=item.sku,
                    name=item.name,
                    brand_name=item.brand_name,
                    ean_code=item.ean_code,
                    medication_class_name=item.medication_class_name,
                    controlled_category=item.controlled_category,
                    quantity=item.quantity,
                )
                for item in candidates[:20]
            ]
        )

    async def get_item_trace(self, item_id: str) -> ItemTraceResponse:
        """Return the full current breakdown and movement history for one item."""

        item = await self._require_item(item_id)
        lots = await self.repository.list_stock_lots(
            tenant_id=str(self.subject.tenant_id),
            store_id=await self._get_store_id(),
            item_id=item.id,
            only_positive=True,
        )
        movements = await self.repository.list_lot_movements(
            tenant_id=str(self.subject.tenant_id), item_id=item.id, limit=300,
        )
        return ItemTraceResponse(
            item=ItemTraceSummaryResponse(
                id=item.id,
                sku=item.sku,
                name=item.name,
                brand_name=item.brand_name,
                ean_code=item.ean_code,
                medication_class_name=item.medication_class_name,
                controlled_category=item.controlled_category,
                total_available_quantity=item.quantity,
            ),
            lots=[await self._serialize_lot(lot) for lot in lots],
            movements=[await self._serialize_movement(movement) for movement in movements],
        )

    async def _require_item(self, item_id: str):
        """Return an existing inventory item or fail with not found."""

        item = await self.inventory_repository.get_item_by_id(
            tenant_id=str(self.subject.tenant_id), store_id=await self._get_store_id(), item_id=item_id,
        )
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found.")
        return item

    async def _require_location(self, location_id: str, *, store_id: str):
        """Return an existing storage location for the active store or fail with not found."""

        location = await self.repository.get_location_by_id(tenant_id=str(self.subject.tenant_id), location_id=location_id)
        if location is None or location.store_id != store_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage location not found.")
        return location

    async def _serialize_lot(self, lot: InventoryStockLot) -> StockLotResponse:
        """Serialize a stock lot for API responses, joining location and supplier names."""

        location = await self.repository.get_location_by_id(tenant_id=str(self.subject.tenant_id), location_id=lot.location_id)
        supplier_name = ""
        if lot.supplier_id:
            supplier = await self.supplier_repository.get_by_id(tenant_id=str(self.subject.tenant_id), supplier_id=lot.supplier_id)
            supplier_name = supplier.legal_name if supplier is not None else ""
        return StockLotResponse(
            id=lot.id,
            store_id=lot.store_id,
            inventory_item_id=lot.inventory_item_id,
            location_id=lot.location_id,
            location_code=location.code if location is not None else "",
            location_name=location.name if location is not None else "",
            location_type=location.location_type if location is not None else "",
            supplier_id=lot.supplier_id or "",
            supplier_name=supplier_name,
            batch_code=lot.batch_code,
            expiry_date=lot.expiry_date,
            quantity=lot.quantity,
            status=lot.status,
            unit_cost_snapshot=lot.unit_cost_snapshot,
            received_at=lot.received_at,
            reference_code=lot.reference_code,
            created_at=lot.created_at,
            updated_at=lot.updated_at,
        )

    async def _serialize_movement(self, movement: InventoryLotMovement) -> LotMovementResponse:
        """Serialize a stock lot movement for API responses, joining location and user names."""

        from_location = (
            await self.repository.get_location_by_id(tenant_id=str(self.subject.tenant_id), location_id=movement.from_location_id)
            if movement.from_location_id
            else None
        )
        to_location = (
            await self.repository.get_location_by_id(tenant_id=str(self.subject.tenant_id), location_id=movement.to_location_id)
            if movement.to_location_id
            else None
        )
        performed_by_user_name = ""
        if movement.performed_by_user_id:
            user = await self.user_repository.get_by_id_for_tenant(
                tenant_id=str(self.subject.tenant_id), user_id=movement.performed_by_user_id,
            )
            performed_by_user_name = user.full_name if user is not None else ""
        return LotMovementResponse(
            id=movement.id,
            inventory_item_id=movement.inventory_item_id,
            stock_lot_id=movement.stock_lot_id,
            performed_by_user_id=movement.performed_by_user_id or "",
            performed_by_user_name=performed_by_user_name,
            movement_type=movement.movement_type,
            quantity_delta=movement.quantity_delta,
            quantity_before=movement.quantity_before,
            resulting_quantity=movement.resulting_quantity,
            from_location_code=from_location.code if from_location is not None else "",
            to_location_code=to_location.code if to_location is not None else "",
            batch_code=movement.batch_code,
            expiry_date=movement.expiry_date,
            reason=movement.reason,
            note=movement.note,
            reference_code=movement.reference_code,
            source_type=movement.source_type,
            source_id=movement.source_id,
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
            self.store_id = await self.inventory_repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))
        return self.store_id
