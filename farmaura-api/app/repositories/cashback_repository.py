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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cashback_rule import CashbackRule
from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.customer import Customer
from app.models.customer_cashback_wallet import CustomerCashbackWallet


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

    async def get_or_create_wallet(self, *, customer_id: str) -> CustomerCashbackWallet:
        """Return the customer's cashback wallet, creating an empty one if absent."""

        statement = select(CustomerCashbackWallet).where(CustomerCashbackWallet.customer_id == customer_id)
        result = await self.session.execute(statement)
        wallet = result.scalar_one_or_none()
        if wallet is None:
            wallet = CustomerCashbackWallet(customer_id=customer_id)
            self.session.add(wallet)
            await self.session.flush()
            await self.session.refresh(wallet)
        return wallet

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
