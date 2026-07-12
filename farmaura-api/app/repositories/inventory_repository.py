"""
farmaura-api/app/repositories/inventory_repository.py

Inventory repository for Farmaura.

Responsibilities:
- persist tenant-scoped inventory items, locations, and movements;
- expose filtered inventory read models for the internal console;
- keep stock mutations explicit and transaction-friendly;

Observations:
- business validation remains in services even when repository queries are rich;
- repository methods assume tenant context has already been enforced upstream;
"""

from sqlalchemy import Select, and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_movement import InventoryMovement


# ============================================================================
# INVENTORY REPOSITORY
# ============================================================================


class InventoryRepository:
    """Provide inventory persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def list_items(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        query: str = "",
        stock_status: str = "all",
        controlled_only: bool = False,
        location_code: str = "",
        medication_class_name: str = "",
        active_only: bool = True,
    ) -> list[InventoryItem]:
        """Return filtered inventory items for the store."""

        statement: Select[tuple[InventoryItem]] = select(InventoryItem).where(InventoryItem.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        if active_only:
            statement = statement.where(InventoryItem.is_active.is_(True))
        if controlled_only:
            statement = statement.where(InventoryItem.is_controlled.is_(True))
        if location_code:
            statement = statement.where(InventoryItem.storage_location == location_code)
        if medication_class_name:
            statement = statement.where(InventoryItem.medication_class_name == medication_class_name)
        if query:
            pattern = "%" + query.strip().lower() + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryItem.name).like(pattern),
                    func.lower(InventoryItem.brand_name).like(pattern),
                    func.lower(InventoryItem.category_name).like(pattern),
                    func.lower(InventoryItem.medication_class_name).like(pattern),
                    func.lower(InventoryItem.sku).like(pattern),
                    func.lower(InventoryItem.ean_code).like(pattern),
                    func.lower(InventoryItem.batch_code).like(pattern),
                )
            )
        statement = statement.where(self._stock_status_clause(stock_status))
        statement = statement.order_by(InventoryItem.medication_class_name.asc(), InventoryItem.name.asc(), InventoryItem.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_items(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        controlled_only: bool = False,
        stock_status: str = "all",
        medication_class_name: str = "",
    ) -> int:
        """Return the item count for the given store and filters."""

        statement = select(func.count()).select_from(InventoryItem).where(
            InventoryItem.tenant_id == tenant_id,
            InventoryItem.is_active.is_(True),
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        if controlled_only:
            statement = statement.where(InventoryItem.is_controlled.is_(True))
        if medication_class_name:
            statement = statement.where(InventoryItem.medication_class_name == medication_class_name)
        statement = statement.where(self._stock_status_clause(stock_status))
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def list_medication_classes(self, *, tenant_id: str, store_id: str = "") -> list[str]:
        """Return the distinct medication classes for the current store."""

        statement = (
            select(InventoryItem.medication_class_name)
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.is_active.is_(True),
            )
            .distinct()
            .order_by(InventoryItem.medication_class_name.asc())
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        result = await self.session.execute(statement)
        return [str(item) for item in result.scalars().all() if str(item).strip()]

    async def get_item_by_id(self, *, tenant_id: str, store_id: str = "", item_id: str) -> InventoryItem | None:
        """Return a store inventory item by identifier."""

        statement = select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.tenant_id == tenant_id,
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_item(self, item: InventoryItem) -> InventoryItem:
        """Persist a new inventory item."""

        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def list_locations(self, *, tenant_id: str, store_id: str = "", active_only: bool = True) -> list[InventoryLocation]:
        """Return store inventory locations."""

        statement = select(InventoryLocation).where(InventoryLocation.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(InventoryLocation.store_id == store_id)
        if active_only:
            statement = statement.where(InventoryLocation.is_active.is_(True))
        statement = statement.order_by(InventoryLocation.code.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_location_by_code(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        code: str,
    ) -> InventoryLocation | None:
        """Return a location by its operational code."""

        statement = select(InventoryLocation).where(
            InventoryLocation.tenant_id == tenant_id,
            InventoryLocation.code == code,
        )
        if store_id:
            statement = statement.where(InventoryLocation.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_location(self, location: InventoryLocation) -> InventoryLocation:
        """Persist a new inventory location."""

        self.session.add(location)
        await self.session.flush()
        await self.session.refresh(location)
        return location

    async def count_items_by_location(self, *, tenant_id: str, store_id: str = "") -> dict[str, int]:
        """Return the item counts grouped by current location code."""

        statement = (
            select(InventoryItem.storage_location, func.count())
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.is_active.is_(True),
            )
            .group_by(InventoryItem.storage_location)
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        result = await self.session.execute(statement)
        return {str(code): int(total) for code, total in result.all()}

    async def list_movements(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        item_id: str = "",
        movement_type: str = "",
        limit: int = 50,
    ) -> list[InventoryMovement]:
        """Return recent inventory movements."""

        statement = select(InventoryMovement).where(InventoryMovement.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(InventoryMovement.store_id == store_id)
        if item_id:
            statement = statement.where(InventoryMovement.inventory_item_id == item_id)
        if movement_type:
            statement = statement.where(InventoryMovement.movement_type == movement_type)
        statement = statement.order_by(desc(InventoryMovement.created_at)).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add_movement(self, movement: InventoryMovement) -> InventoryMovement:
        """Persist an inventory movement."""

        self.session.add(movement)
        await self.session.flush()
        await self.session.refresh(movement)
        return movement

    async def search_candidate_items(
        self,
        *,
        tenant_id: str,
        store_id: str,
        ean_code: str,
        query: str,
        limit: int = 5,
    ) -> list[InventoryItem]:
        """Return likely candidate items for invoice matching."""

        cleaned_ean = str(ean_code or "").strip()
        cleaned_query = str(query or "").strip().lower()
        statement = select(InventoryItem).where(
            InventoryItem.tenant_id == tenant_id,
            InventoryItem.store_id == store_id,
            InventoryItem.is_active.is_(True),
        )
        if cleaned_ean and cleaned_query:
            pattern = "%" + cleaned_query + "%"
            statement = statement.where(
                or_(
                    InventoryItem.ean_code == cleaned_ean,
                    func.lower(InventoryItem.name).like(pattern),
                    func.lower(InventoryItem.brand_name).like(pattern),
                    func.lower(InventoryItem.medication_class_name).like(pattern),
                    func.lower(InventoryItem.sku).like(pattern),
                )
            )
        elif cleaned_ean:
            statement = statement.where(InventoryItem.ean_code == cleaned_ean)
        elif cleaned_query:
            pattern = "%" + cleaned_query + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryItem.name).like(pattern),
                    func.lower(InventoryItem.brand_name).like(pattern),
                    func.lower(InventoryItem.medication_class_name).like(pattern),
                    func.lower(InventoryItem.sku).like(pattern),
                )
            )
        else:
            statement = statement.order_by(InventoryItem.name.asc()).limit(limit)
            result = await self.session.execute(statement)
            return list(result.scalars().all())
        statement = statement.order_by(InventoryItem.name.asc()).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_primary_store_id(self, *, tenant_id: str) -> str:
        """Return the first known store identifier for the tenant."""

        item_statement = (
            select(InventoryItem.store_id)
            .where(InventoryItem.tenant_id == tenant_id)
            .order_by(InventoryItem.created_at.asc())
            .limit(1)
        )
        item_result = await self.session.execute(item_statement)
        store_id = item_result.scalar_one_or_none()
        if store_id:
            return str(store_id)
        location_statement = (
            select(InventoryLocation.store_id)
            .where(InventoryLocation.tenant_id == tenant_id)
            .order_by(InventoryLocation.created_at.asc())
            .limit(1)
        )
        location_result = await self.session.execute(location_statement)
        location_store_id = location_result.scalar_one_or_none()
        return str(location_store_id or tenant_id)

    def _stock_status_clause(self, stock_status: str):
        """Return the SQL clause that matches a stock status filter."""

        normalized = str(stock_status or "all").strip().lower()
        if normalized == "low":
            return and_(
                InventoryItem.quantity > 0,
                InventoryItem.quantity <= InventoryItem.low_stock_threshold,
            )
        if normalized == "attention":
            return and_(
                InventoryItem.quantity > InventoryItem.low_stock_threshold,
                InventoryItem.quantity <= InventoryItem.attention_stock_threshold,
            )
        if normalized in {"ok", "normal"}:
            return InventoryItem.quantity > InventoryItem.attention_stock_threshold
        if normalized == "out":
            return InventoryItem.quantity <= 0
        return True
