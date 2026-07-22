"""
farmaura-api/app/repositories/inventory_lot_repository.py

Inventory stock lot repository for Farmaura.

Responsibilities:
- persist per-batch, per-location stock balances and their movement history;
- expose filtered, joined read models for the segregated stock screen and the
  product traceability/audit lookup;

Observations:
- kept separate from inventory_repository.py to avoid growing that file further;
- business validation remains in services even when repository queries are rich;
"""

from datetime import date

from sqlalchemy import Select, asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_location import InventoryLocation
from app.models.inventory_lot_movement import InventoryLotMovement
from app.models.inventory_stock_lot import InventoryStockLot


# ============================================================================
# INVENTORY LOT REPOSITORY
# ============================================================================


class InventoryLotRepository:
    """Provide stock lot persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_stock_lots(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        item_id: str = "",
        location_id: str = "",
        location_type: str = "",
        status: str = "",
        batch_code: str = "",
        expiry_from: date | None = None,
        expiry_to: date | None = None,
        supplier_id: str = "",
        only_positive: bool = False,
    ) -> list[InventoryStockLot]:
        """Return stock lots matching the given filters."""

        statement: Select[tuple[InventoryStockLot]] = select(InventoryStockLot).where(
            InventoryStockLot.tenant_id == tenant_id,
        )
        if store_id:
            statement = statement.where(InventoryStockLot.store_id == store_id)
        if item_id:
            statement = statement.where(InventoryStockLot.inventory_item_id == item_id)
        if location_id:
            statement = statement.where(InventoryStockLot.location_id == location_id)
        if status:
            statement = statement.where(InventoryStockLot.status == status)
        if batch_code:
            statement = statement.where(InventoryStockLot.batch_code == batch_code)
        if expiry_from is not None:
            statement = statement.where(InventoryStockLot.expiry_date >= expiry_from)
        if expiry_to is not None:
            statement = statement.where(InventoryStockLot.expiry_date <= expiry_to)
        if supplier_id:
            statement = statement.where(InventoryStockLot.supplier_id == supplier_id)
        if only_positive:
            statement = statement.where(InventoryStockLot.quantity > 0)
        if location_type:
            statement = statement.join(InventoryLocation, InventoryLocation.id == InventoryStockLot.location_id).where(
                InventoryLocation.location_type == location_type,
            )
        statement = statement.order_by(InventoryStockLot.expiry_date.asc().nullslast())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_lot_by_id(self, *, tenant_id: str, lot_id: str) -> InventoryStockLot | None:
        """Return a stock lot by identifier for the tenant."""

        statement = select(InventoryStockLot).where(
            InventoryStockLot.id == lot_id,
            InventoryStockLot.tenant_id == tenant_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_lot_for_update(self, *, tenant_id: str, lot_id: str) -> InventoryStockLot | None:
        """Return a stock lot locked for update."""

        statement = (
            select(InventoryStockLot)
            .where(InventoryStockLot.id == lot_id, InventoryStockLot.tenant_id == tenant_id)
            .with_for_update()
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_matching_lot_for_update(
        self,
        *,
        tenant_id: str,
        store_id: str,
        item_id: str,
        location_id: str,
        batch_code: str,
        status: str = "available",
    ) -> InventoryStockLot | None:
        """Return the existing lot row for one item/location/batch/status combination, locked for update."""

        statement = (
            select(InventoryStockLot)
            .where(
                InventoryStockLot.tenant_id == tenant_id,
                InventoryStockLot.store_id == store_id,
                InventoryStockLot.inventory_item_id == item_id,
                InventoryStockLot.location_id == location_id,
                InventoryStockLot.batch_code == batch_code,
                InventoryStockLot.status == status,
            )
            .with_for_update()
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def find_fefo_candidates(
        self,
        *,
        tenant_id: str,
        store_id: str,
        item_id: str,
        location_id: str = "",
    ) -> list[InventoryStockLot]:
        """Return available lots for one item ordered earliest-expiry-first, locked for update.

        When location_id is given, candidates are restricted to that single
        storage location — used when a PDV operator explicitly picks which
        physical location a sale came from, instead of the default
        FEFO-across-every-location behavior.
        """

        statement = (
            select(InventoryStockLot)
            .where(
                InventoryStockLot.tenant_id == tenant_id,
                InventoryStockLot.store_id == store_id,
                InventoryStockLot.inventory_item_id == item_id,
                InventoryStockLot.status == "available",
                InventoryStockLot.quantity > 0,
            )
            .order_by(asc(InventoryStockLot.expiry_date).nullslast())
            .with_for_update()
        )
        if location_id:
            statement = statement.where(InventoryStockLot.location_id == location_id)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_lot(self, lot: InventoryStockLot) -> InventoryStockLot:
        """Persist a new stock lot row."""

        self.session.add(lot)
        await self.session.flush()
        await self.session.refresh(lot)
        return lot

    async def add_lot_movement(self, movement: InventoryLotMovement) -> InventoryLotMovement:
        """Persist a stock lot movement."""

        self.session.add(movement)
        await self.session.flush()
        await self.session.refresh(movement)
        return movement

    async def list_lot_movements(
        self,
        *,
        tenant_id: str,
        item_id: str = "",
        stock_lot_id: str = "",
        limit: int = 200,
    ) -> list[InventoryLotMovement]:
        """Return stock lot movements, most recent first."""

        statement = select(InventoryLotMovement).where(InventoryLotMovement.tenant_id == tenant_id)
        if item_id:
            statement = statement.where(InventoryLotMovement.inventory_item_id == item_id)
        if stock_lot_id:
            statement = statement.where(InventoryLotMovement.stock_lot_id == stock_lot_id)
        statement = statement.order_by(desc(InventoryLotMovement.created_at)).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_location_by_id(self, *, tenant_id: str, location_id: str) -> InventoryLocation | None:
        """Return a storage location by identifier for the tenant."""

        statement = select(InventoryLocation).where(
            InventoryLocation.id == location_id,
            InventoryLocation.tenant_id == tenant_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()
