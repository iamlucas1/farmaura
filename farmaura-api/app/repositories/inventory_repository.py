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

from datetime import datetime

from sqlalchemy import Select, and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from app.models.brand import Brand
from app.models.category import Category
from app.models.inventory_audit_entry import InventoryAuditEntry
from app.models.inventory_invoice_record import InventoryInvoiceRecord
from app.models.inventory_item import InventoryItem
from app.models.inventory_location import InventoryLocation
from app.models.inventory_movement import InventoryMovement
from app.models.inventory_product import InventoryProduct
from app.models.store import Store
from app.models.therapeutic_class import TherapeuticClass
from app.models.user import User


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

        medication_class = func.coalesce(TherapeuticClass.name, "Geral")
        statement: Select[tuple[InventoryItem]] = (
            select(InventoryItem)
            .join(InventoryItem.product)
            .outerjoin(Brand, Brand.id == InventoryProduct.brand_id)
            .outerjoin(Category, Category.id == InventoryProduct.category_id)
            .outerjoin(TherapeuticClass, TherapeuticClass.id == InventoryProduct.therapeutic_class_id)
            .options(contains_eager(InventoryItem.product))
            .where(InventoryItem.tenant_id == tenant_id)
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        if active_only:
            statement = statement.where(InventoryItem.is_active.is_(True))
        if controlled_only:
            statement = statement.where(InventoryProduct.is_controlled.is_(True))
        if location_code:
            statement = statement.where(InventoryItem.storage_location == location_code)
        if medication_class_name:
            statement = statement.where(medication_class == medication_class_name)
        if query:
            pattern = "%" + query.strip().lower() + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryProduct.name).like(pattern),
                    func.lower(func.coalesce(Brand.name, "")).like(pattern),
                    func.lower(func.coalesce(Category.name, "Medicamentos")).like(pattern),
                    func.lower(medication_class).like(pattern),
                    func.lower(InventoryProduct.sku).like(pattern),
                    func.lower(InventoryProduct.ean_code).like(pattern),
                    func.lower(InventoryItem.batch_code).like(pattern),
                )
            )
        statement = statement.where(self._stock_status_clause(stock_status))
        statement = statement.order_by(medication_class.asc(), InventoryProduct.name.asc(), InventoryItem.created_at.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

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

        statement = (
            select(func.count())
            .select_from(InventoryItem)
            .join(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .outerjoin(TherapeuticClass, TherapeuticClass.id == InventoryProduct.therapeutic_class_id)
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.is_active.is_(True),
            )
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        if controlled_only:
            statement = statement.where(InventoryProduct.is_controlled.is_(True))
        if medication_class_name:
            statement = statement.where(func.coalesce(TherapeuticClass.name, "Geral") == medication_class_name)
        statement = statement.where(self._stock_status_clause(stock_status))
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def list_medication_classes(self, *, tenant_id: str, store_id: str = "") -> list[str]:
        """Return the distinct medication classes for the current store."""

        medication_class = func.coalesce(TherapeuticClass.name, "Geral")
        statement = (
            select(medication_class)
            .select_from(InventoryProduct)
            .join(InventoryItem, InventoryItem.product_id == InventoryProduct.id)
            .outerjoin(TherapeuticClass, TherapeuticClass.id == InventoryProduct.therapeutic_class_id)
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.is_active.is_(True),
            )
            .distinct()
            .order_by(medication_class.asc())
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        result = await self.session.execute(statement)
        return [str(item) for item in result.scalars().all() if str(item).strip()]

    async def get_item_by_id(self, *, tenant_id: str, store_id: str = "", item_id: str) -> InventoryItem | None:
        """Return a store inventory item by identifier."""

        statement = (
            select(InventoryItem)
            .options(joinedload(InventoryItem.product))
            .where(
                InventoryItem.id == item_id,
                InventoryItem.tenant_id == tenant_id,
            )
        )
        if store_id:
            statement = statement.where(InventoryItem.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_item_by_id_for_update(self, *, tenant_id: str, item_id: str) -> InventoryItem | None:
        """Return one inventory item locked for update, blocking concurrent stock decrements on the same row."""

        statement = (
            select(InventoryItem)
            .options(joinedload(InventoryItem.product))
            .where(InventoryItem.id == item_id, InventoryItem.tenant_id == tenant_id)
            .with_for_update(of=InventoryItem)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_item(self, item: InventoryItem) -> InventoryItem:
        """Persist a new inventory item."""

        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)
        return item

    async def get_product_by_tenant_and_ean(self, *, tenant_id: str, ean_code: str) -> InventoryProduct | None:
        """Return the tenant's shared product for a given EAN code, if one already exists."""

        cleaned_ean = str(ean_code or "").strip()
        if not cleaned_ean:
            return None
        statement = select(InventoryProduct).where(
            InventoryProduct.tenant_id == tenant_id,
            InventoryProduct.ean_code == cleaned_ean,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_product_by_id(self, *, tenant_id: str, product_id: str) -> InventoryProduct | None:
        """Return one shared product by identifier."""

        statement = select(InventoryProduct).where(
            InventoryProduct.id == product_id,
            InventoryProduct.tenant_id == tenant_id,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_product_by_sku(self, *, tenant_id: str, sku: str) -> InventoryProduct | None:
        """Return one shared product by SKU."""

        statement = select(InventoryProduct).where(
            InventoryProduct.tenant_id == tenant_id,
            InventoryProduct.sku == sku,
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_products(self, *, tenant_id: str, query: str = "", active_only: bool = False) -> list[InventoryProduct]:
        """Return tenant products, optionally filtered by query or activity."""

        statement: Select[tuple[InventoryProduct]] = select(InventoryProduct).where(
            InventoryProduct.tenant_id == tenant_id,
        )
        if active_only:
            statement = statement.where(InventoryProduct.is_active.is_(True))
        if query:
            pattern = "%" + query.strip().lower() + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryProduct.name).like(pattern),
                    func.lower(InventoryProduct.sku).like(pattern),
                    func.lower(InventoryProduct.ean_code).like(pattern),
                )
            )
        statement = statement.order_by(InventoryProduct.name.asc())
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

    async def add_product(self, product: InventoryProduct) -> InventoryProduct:
        """Persist a new shared product."""

        self.session.add(product)
        await self.session.flush()
        await self.session.refresh(product)
        return product

    async def list_items_by_product(self, *, tenant_id: str, product_id: str) -> list[InventoryItem]:
        """Return every store-scoped item linked to a shared product, including inactive links."""

        statement = (
            select(InventoryItem)
            .options(joinedload(InventoryItem.product))
            .where(InventoryItem.tenant_id == tenant_id, InventoryItem.product_id == product_id)
            .order_by(InventoryItem.created_at.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

    async def count_items_by_product(self, *, tenant_id: str, product_id: str) -> int:
        """Return how many store inventory items currently reference this shared product."""

        statement = select(func.count()).select_from(InventoryItem).where(
            InventoryItem.tenant_id == tenant_id,
            InventoryItem.product_id == product_id,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def stock_summary_by_product(self, *, tenant_id: str) -> dict[str, tuple[int, int]]:
        """Return (active store count, total quantity) per product for the whole tenant."""

        statement = (
            select(InventoryItem.product_id, func.count(InventoryItem.id), func.coalesce(func.sum(InventoryItem.quantity), 0))
            .where(InventoryItem.tenant_id == tenant_id, InventoryItem.is_active.is_(True))
            .group_by(InventoryItem.product_id)
        )
        result = await self.session.execute(statement)
        return {row[0]: (int(row[1]), int(row[2])) for row in result.all()}

    async def stock_summary_for_product(self, *, tenant_id: str, product_id: str) -> tuple[int, int]:
        """Return (active store count, total quantity) for a single product."""

        statement = select(func.count(InventoryItem.id), func.coalesce(func.sum(InventoryItem.quantity), 0)).where(
            InventoryItem.tenant_id == tenant_id,
            InventoryItem.product_id == product_id,
            InventoryItem.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        row = result.one()
        return int(row[0]), int(row[1])

    async def list_locations(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        active_only: bool = True,
        location_type: str = "",
    ) -> list[InventoryLocation]:
        """Return store inventory locations."""

        statement = select(InventoryLocation).where(InventoryLocation.tenant_id == tenant_id)
        if store_id:
            statement = statement.where(InventoryLocation.store_id == store_id)
        if active_only:
            statement = statement.where(InventoryLocation.is_active.is_(True))
        if location_type:
            statement = statement.where(InventoryLocation.location_type == location_type)
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

    async def get_location_by_id(
        self,
        *,
        tenant_id: str,
        location_id: str,
    ) -> InventoryLocation | None:
        """Return a location by its identifier."""

        statement = select(InventoryLocation).where(
            InventoryLocation.tenant_id == tenant_id,
            InventoryLocation.id == location_id,
        )
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
        medication_class = func.coalesce(TherapeuticClass.name, "Geral")
        statement = (
            select(InventoryItem)
            .join(InventoryItem.product)
            .outerjoin(Brand, Brand.id == InventoryProduct.brand_id)
            .outerjoin(TherapeuticClass, TherapeuticClass.id == InventoryProduct.therapeutic_class_id)
            .options(contains_eager(InventoryItem.product))
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.store_id == store_id,
                InventoryItem.is_active.is_(True),
            )
        )
        if cleaned_ean and cleaned_query:
            pattern = "%" + cleaned_query + "%"
            statement = statement.where(
                or_(
                    InventoryProduct.ean_code == cleaned_ean,
                    func.lower(InventoryProduct.name).like(pattern),
                    func.lower(func.coalesce(Brand.name, "")).like(pattern),
                    func.lower(medication_class).like(pattern),
                    func.lower(InventoryProduct.sku).like(pattern),
                )
            )
        elif cleaned_ean:
            statement = statement.where(InventoryProduct.ean_code == cleaned_ean)
        elif cleaned_query:
            pattern = "%" + cleaned_query + "%"
            statement = statement.where(
                or_(
                    func.lower(InventoryProduct.name).like(pattern),
                    func.lower(func.coalesce(Brand.name, "")).like(pattern),
                    func.lower(medication_class).like(pattern),
                    func.lower(InventoryProduct.sku).like(pattern),
                )
            )
        else:
            statement = statement.order_by(InventoryProduct.name.asc()).limit(limit)
            result = await self.session.execute(statement)
            return list(result.scalars().unique().all())
        statement = statement.order_by(InventoryProduct.name.asc()).limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().unique().all())

    async def add_audit_entry(self, entry: InventoryAuditEntry) -> InventoryAuditEntry:
        """Persist an inventory audit trail entry."""

        self.session.add(entry)
        await self.session.flush()
        await self.session.refresh(entry)
        return entry

    def _audit_entry_filters(
        self,
        *,
        tenant_id: str,
        entity_type: str,
        action: str,
        actor_query: str,
        date_from: datetime | None,
        date_to: datetime | None,
        q: str,
    ):
        """Return the shared WHERE clauses for audit entry list/count queries."""

        clauses = [InventoryAuditEntry.tenant_id == tenant_id]
        if entity_type:
            clauses.append(InventoryAuditEntry.entity_type == entity_type)
        if action:
            clauses.append(InventoryAuditEntry.action == action)
        if actor_query:
            pattern = "%" + actor_query.strip().lower() + "%"
            clauses.append(
                or_(
                    func.lower(InventoryAuditEntry.actor_name).like(pattern),
                    func.lower(InventoryAuditEntry.actor_email).like(pattern),
                )
            )
        if date_from is not None:
            clauses.append(InventoryAuditEntry.created_at >= date_from)
        if date_to is not None:
            clauses.append(InventoryAuditEntry.created_at <= date_to)
        if q:
            pattern = "%" + q.strip().lower() + "%"
            clauses.append(func.lower(InventoryAuditEntry.entity_label).like(pattern))
        return clauses

    async def list_audit_entries(
        self,
        *,
        tenant_id: str,
        entity_type: str = "",
        action: str = "",
        actor_query: str = "",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        q: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> list[InventoryAuditEntry]:
        """Return audit trail entries (item/location creations and edits) matching the given filters."""

        clauses = self._audit_entry_filters(
            tenant_id=tenant_id, entity_type=entity_type, action=action, actor_query=actor_query,
            date_from=date_from, date_to=date_to, q=q,
        )
        statement = (
            select(InventoryAuditEntry)
            .where(and_(*clauses))
            .order_by(desc(InventoryAuditEntry.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count_audit_entries(
        self,
        *,
        tenant_id: str,
        entity_type: str = "",
        action: str = "",
        actor_query: str = "",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        q: str = "",
    ) -> int:
        """Return the audit trail entry count matching the given filters."""

        clauses = self._audit_entry_filters(
            tenant_id=tenant_id, entity_type=entity_type, action=action, actor_query=actor_query,
            date_from=date_from, date_to=date_to, q=q,
        )
        statement = select(func.count()).select_from(InventoryAuditEntry).where(and_(*clauses))
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    def _movement_actor_filters(
        self,
        *,
        tenant_id: str,
        actor_query: str,
        date_from: datetime | None,
        date_to: datetime | None,
        q: str,
        reason: str = "",
        exclude_reason: str = "",
    ):
        """Return the shared WHERE clauses for movement-as-audit list/count queries."""

        clauses = [InventoryMovement.tenant_id == tenant_id]
        if reason:
            clauses.append(InventoryMovement.reason == reason)
        if exclude_reason:
            clauses.append(
                or_(InventoryMovement.reason != exclude_reason, InventoryMovement.reason.is_(None))
            )
        if actor_query:
            pattern = "%" + actor_query.strip().lower() + "%"
            clauses.append(
                or_(
                    func.lower(User.full_name).like(pattern),
                    func.lower(User.email).like(pattern),
                )
            )
        if date_from is not None:
            clauses.append(InventoryMovement.created_at >= date_from)
        if date_to is not None:
            clauses.append(InventoryMovement.created_at <= date_to)
        if q:
            pattern = "%" + q.strip().lower() + "%"
            clauses.append(func.lower(InventoryProduct.name).like(pattern))
        return clauses

    async def list_movements_with_actor(
        self,
        *,
        tenant_id: str,
        actor_query: str = "",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        q: str = "",
        reason: str = "",
        exclude_reason: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> list[tuple[InventoryMovement, str, str, str, str]]:
        """Return stock movements joined with the acting user's identity and item name."""

        clauses = self._movement_actor_filters(
            tenant_id=tenant_id, actor_query=actor_query, date_from=date_from, date_to=date_to, q=q,
            reason=reason, exclude_reason=exclude_reason,
        )
        statement = (
            select(InventoryMovement, User.full_name, User.email, User.role, InventoryProduct.name)
            .outerjoin(User, User.id == InventoryMovement.performed_by_user_id)
            .outerjoin(InventoryItem, InventoryItem.id == InventoryMovement.inventory_item_id)
            .outerjoin(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .where(and_(*clauses))
            .order_by(desc(InventoryMovement.created_at))
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return [
            (movement, full_name or "", email or "", role or "", item_name or "Item removido")
            for movement, full_name, email, role, item_name in result.all()
        ]

    async def count_movements_with_actor(
        self,
        *,
        tenant_id: str,
        actor_query: str = "",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        q: str = "",
        reason: str = "",
        exclude_reason: str = "",
    ) -> int:
        """Return the stock movement count matching the given filters."""

        clauses = self._movement_actor_filters(
            tenant_id=tenant_id, actor_query=actor_query, date_from=date_from, date_to=date_to, q=q,
            reason=reason, exclude_reason=exclude_reason,
        )
        statement = (
            select(func.count())
            .select_from(InventoryMovement)
            .outerjoin(User, User.id == InventoryMovement.performed_by_user_id)
            .outerjoin(InventoryItem, InventoryItem.id == InventoryMovement.inventory_item_id)
            .outerjoin(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .where(and_(*clauses))
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def get_primary_store_id(self, *, tenant_id: str) -> str:
        """Return the tenant's primary store identifier, or its first active store."""

        statement = (
            select(Store.id)
            .where(Store.tenant_id == tenant_id, Store.is_active.is_(True))
            .order_by(Store.is_primary.desc(), Store.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(statement)
        store_id = result.scalar_one_or_none()
        return str(store_id or "")

    async def add_invoice_record(self, record: InventoryInvoiceRecord) -> InventoryInvoiceRecord:
        """Persist a supplier invoice record."""

        self.session.add(record)
        await self.session.flush()
        await self.session.refresh(record)
        return record

    async def list_invoice_records(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        item_id: str,
    ) -> list[InventoryInvoiceRecord]:
        """Return the invoice history for one inventory item, most recent first."""

        statement = select(InventoryInvoiceRecord).where(
            InventoryInvoiceRecord.tenant_id == tenant_id,
            InventoryInvoiceRecord.inventory_item_id == item_id,
        )
        if store_id:
            statement = statement.where(InventoryInvoiceRecord.store_id == store_id)
        statement = statement.order_by(desc(InventoryInvoiceRecord.created_at))
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_invoice_record_by_id(
        self,
        *,
        tenant_id: str,
        store_id: str = "",
        invoice_id: str,
    ) -> InventoryInvoiceRecord | None:
        """Return one invoice record scoped to the tenant/store."""

        statement = select(InventoryInvoiceRecord).where(
            InventoryInvoiceRecord.tenant_id == tenant_id,
            InventoryInvoiceRecord.id == invoice_id,
        )
        if store_id:
            statement = statement.where(InventoryInvoiceRecord.store_id == store_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

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
