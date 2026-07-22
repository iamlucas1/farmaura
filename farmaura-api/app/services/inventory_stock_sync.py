"""
farmaura-api/app/services/inventory_stock_sync.py

Inventory stock lot synchronization helper for Farmaura.

Responsibilities:
- decrement per-batch, per-location stock lots on a sale exit, oldest-expiry-first
  (FEFO), so every sale is traceable back to the exact lot and location it left from;

Observations:
- this is a thin, additive helper called from the existing PDV and marketplace order
  exit points — it does not replace or gate the aggregate InventoryItem.quantity checks
  those flows already perform, so a lot-data mismatch never blocks a checkout;
- if the tracked lot balance runs short of the requested quantity (e.g. an item was
  never received through the lot-aware receipt flow), it decrements what it can and
  stops rather than raising, since the aggregate quantity remains the source of truth —
  UNLESS a specific location_id was requested (a PDV operator picked exactly where the
  unit came from), in which case running short there is a real error worth surfacing,
  since silently pulling from elsewhere would make that pick a lie.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_lot_movement import InventoryLotMovement
from app.models.inventory_movement import InventoryMovement
from app.models.inventory_stock_lot import InventoryStockLot
from app.repositories.inventory_lot_repository import InventoryLotRepository
from app.repositories.inventory_repository import InventoryRepository


# ============================================================================
# STOCK LOT SYNC
# ============================================================================


async def decrement_lot_fefo(
    session: AsyncSession,
    *,
    tenant_id: str,
    store_id: str,
    inventory_item_id: str,
    quantity: int,
    performed_by_user_id: str = "",
    reason: str,
    reference_code: str,
    source_type: str,
    source_id: str = "",
    location_id: str = "",
) -> None:
    """Decrement available stock lots for one item, earliest-expiry-first.

    When location_id is set, only lots at that location are eligible and an
    insufficient balance there raises instead of silently falling back to
    other locations.
    """

    if quantity <= 0:
        return

    lot_repository = InventoryLotRepository(session)
    candidates = await lot_repository.find_fefo_candidates(
        tenant_id=tenant_id, store_id=store_id, item_id=inventory_item_id, location_id=location_id,
    )
    remaining = quantity
    for lot in candidates:
        if remaining <= 0:
            break
        taken = min(remaining, lot.quantity)
        if taken <= 0:
            continue
        quantity_before = lot.quantity
        lot.quantity -= taken
        remaining -= taken
        await lot_repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=tenant_id,
                store_id=store_id,
                inventory_item_id=inventory_item_id,
                stock_lot_id=lot.id,
                performed_by_user_id=performed_by_user_id or None,
                movement_type="sale_exit",
                quantity_delta=-taken,
                quantity_before=quantity_before,
                resulting_quantity=lot.quantity,
                from_location_id=lot.location_id,
                batch_code=lot.batch_code,
                expiry_date=lot.expiry_date,
                reason=reason,
                reference_code=reference_code,
                source_type=source_type,
                source_id=source_id,
                unit_cost_snapshot=lot.unit_cost_snapshot,
            )
        )
    if remaining > 0 and location_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Estoque insuficiente no local selecionado para esta baixa: faltam " + str(remaining) + " unidade(s).",
        )


async def restock_marketplace_order(
    session: AsyncSession,
    *,
    tenant_id: str,
    order_code: str,
    reason: str,
) -> None:
    """Credit back every stock lot and aggregate item decremented for a cancelled marketplace order.

    Walks the same movement ledgers decrement_lot_fefo and the checkout exit path wrote
    (InventoryLotMovement.source_id / InventoryMovement.reference_code == order_code) and
    writes compensating 'adjustment' entries, so a rejected-prescription cancellation never
    leaves stock permanently reserved for an order that will never ship.
    """

    inventory_repository = InventoryRepository(session)
    lot_repository = InventoryLotRepository(session)

    movement_rows = (
        await session.execute(
            select(InventoryMovement).where(
                InventoryMovement.tenant_id == tenant_id,
                InventoryMovement.reference_code == order_code,
                InventoryMovement.movement_type == "exit",
            )
        )
    ).scalars().all()
    for movement in movement_rows:
        item = await inventory_repository.get_item_by_id_for_update(tenant_id=tenant_id, item_id=movement.inventory_item_id)
        if item is None:
            continue
        taken = -movement.quantity_delta
        quantity_before = item.quantity
        item.quantity = quantity_before + taken
        await inventory_repository.add_movement(
            InventoryMovement(
                id=str(uuid4()),
                tenant_id=tenant_id,
                store_id=item.store_id,
                inventory_item_id=item.id,
                performed_by_user_id=None,
                movement_type="adjustment",
                quantity_delta=taken,
                quantity_before=quantity_before,
                resulting_quantity=item.quantity,
                reason=reason,
                note="",
                reference_code=order_code,
                from_location_code="",
                to_location_code=item.storage_location,
                unit_cost_snapshot=item.acquisition_cost,
            )
        )

    lot_movement_rows = (
        await session.execute(
            select(InventoryLotMovement).where(
                InventoryLotMovement.tenant_id == tenant_id,
                InventoryLotMovement.source_type == "marketplace_order",
                InventoryLotMovement.source_id == order_code,
                InventoryLotMovement.movement_type == "sale_exit",
            )
        )
    ).scalars().all()
    for lot_movement in lot_movement_rows:
        lot = await lot_repository.get_lot_for_update(tenant_id=tenant_id, lot_id=lot_movement.stock_lot_id)
        if lot is None:
            continue
        taken = -lot_movement.quantity_delta
        quantity_before = lot.quantity
        lot.quantity = quantity_before + taken
        await lot_repository.add_lot_movement(
            InventoryLotMovement(
                tenant_id=tenant_id,
                store_id=lot.store_id,
                inventory_item_id=lot.inventory_item_id,
                stock_lot_id=lot.id,
                performed_by_user_id=None,
                movement_type="adjustment",
                quantity_delta=taken,
                quantity_before=quantity_before,
                resulting_quantity=lot.quantity,
                to_location_id=lot.location_id,
                batch_code=lot.batch_code,
                expiry_date=lot.expiry_date,
                reason=reason,
                reference_code=order_code,
                source_type="marketplace_order",
                source_id=order_code,
                unit_cost_snapshot=lot.unit_cost_snapshot,
            )
        )
