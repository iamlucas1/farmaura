"""
farmaura-api/app/repositories/cashback_repository.py

Cashback repository for Farmaura.

Responsibilities:
- persist and load customer cashback wallets and ledger entries;
- resolve the applicable cashback rule for a sellable item, falling back to
  a store-wide default when no per-item rule exists;
- keep the customer aggregate reachable for balance synchronization.

Observations:
- wallet reads/writes assume the caller already resolved the customer id;
- rule resolution never mutates state, it only projects the current rules.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cashback_rule import CashbackRule
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.customer import Customer
from app.models.customer_cashback_wallet import CustomerCashbackWallet
from app.models.inventory_item import InventoryItem
from app.models.inventory_product import InventoryProduct


# ============================================================================
# CASHBACK REPOSITORY
# ============================================================================


class CashbackRepository:
    """Provide cashback wallet and ledger persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def get_customer_by_id(self, *, tenant_id: str, customer_id: str) -> Customer | None:
        """Return one tenant-scoped customer by identifier."""

        statement = select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_or_create_wallet(self, *, tenant_id: str, customer_id: str) -> CustomerCashbackWallet:
        """Return the customer's cashback wallet, creating an empty one if absent.

        Always tenant-scoped: the wallet row carries `tenant_id` (denormalized from the
        customer) and RLS enforces it, so a `customer_id` from another tenant can neither
        read nor mutate a wallet here.
        """

        statement = select(CustomerCashbackWallet).where(
            CustomerCashbackWallet.customer_id == customer_id,
            CustomerCashbackWallet.tenant_id == tenant_id,
        )
        result = await self.session.execute(statement)
        wallet = result.scalar_one_or_none()
        if wallet is None:
            wallet = CustomerCashbackWallet(tenant_id=tenant_id, customer_id=customer_id)
            self.session.add(wallet)
            await self.session.flush()
            await self.session.refresh(wallet)
        return wallet

    async def list_transactions_for_customer(
        self, *, tenant_id: str, customer_id: str, limit: int = 50,
    ) -> list[CashbackTransaction]:
        """Return the customer's cashback ledger, newest first."""

        statement = (
            select(CashbackTransaction)
            .where(
                CashbackTransaction.tenant_id == tenant_id,
                CashbackTransaction.customer_id == customer_id,
            )
            .order_by(CashbackTransaction.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def resolve_product_cashback_percent(
        self, *, tenant_id: str, inventory_item_ids: list[str],
    ) -> dict[str, Decimal | None]:
        """Return each inventory item's owning-product cashback_percent (None => use tenant default)."""

        if not inventory_item_ids:
            return {}
        statement = (
            select(InventoryItem.id, InventoryProduct.cashback_percent)
            .join(InventoryProduct, InventoryProduct.id == InventoryItem.product_id)
            .where(
                InventoryItem.tenant_id == tenant_id,
                InventoryItem.id.in_(inventory_item_ids),
            )
        )
        result = await self.session.execute(statement)
        return {str(item_id): percent for item_id, percent in result.all()}

    async def list_transactions_for_order(self, *, tenant_id: str, order_id: str) -> list[CashbackTransaction]:
        """Return every cashback ledger movement tied to one order."""

        statement = select(CashbackTransaction).where(
            CashbackTransaction.tenant_id == tenant_id,
            CashbackTransaction.order_id == order_id,
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def resolve_rules_for_items(
        self,
        *,
        tenant_id: str,
        store_id: str,
        inventory_item_ids: list[str],
    ) -> dict[str, CashbackRule]:
        """Return the applicable active cashback rule per inventory item, using a store-wide rule as fallback."""

        statement = select(CashbackRule).where(
            CashbackRule.tenant_id == tenant_id,
            CashbackRule.store_id == store_id,
            CashbackRule.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        rules = list(result.scalars().all())
        per_item = {rule.inventory_item_id: rule for rule in rules if rule.inventory_item_id}
        fallback = next((rule for rule in rules if rule.inventory_item_id is None), None)
        resolved: dict[str, CashbackRule] = {}
        for item_id in inventory_item_ids:
            rule = per_item.get(item_id) or fallback
            if rule is not None:
                resolved[item_id] = rule
        return resolved

    async def add_transaction(self, transaction: CashbackTransaction) -> CashbackTransaction:
        """Persist one cashback ledger transaction."""

        self.session.add(transaction)
        await self.session.flush()
        await self.session.refresh(transaction)
        return transaction

    async def add_transaction_line(self, line: CashbackTransactionLine) -> CashbackTransactionLine:
        """Persist one product-level cashback detail line."""

        self.session.add(line)
        await self.session.flush()
        return line
