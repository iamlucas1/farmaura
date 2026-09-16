"""
farmaura-api/app/services/cashback_service.py

Marketplace cashback service for Farmaura.

Responsibilities:
- earn cashback on a marketplace order (credited as pending, released on delivery/pickup);
- redeem wallet balance at checkout, capped at a tenant-configurable % of the order total;
- release pending cashback when an order completes, and fully reverse it when an order is cancelled;
- expose the customer's wallet summary and ledger for the self-service surface.

Observations:
- the wallet row is tenant-scoped (denormalized tenant_id + RLS); a customer_id from another
  tenant can neither read nor mutate a wallet through this service;
- the PDV channel keeps its own (immediate-available) earn path in PdvService for now;
  consolidating both channels here is a follow-up.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cashback_transaction import CashbackTransaction
from app.models.cashback_transaction_line import CashbackTransactionLine
from app.models.order import Order
from app.models.order_item import OrderItem
from app.repositories.cashback_repository import CashbackRepository
from app.schemas.auth import TokenSubject
from app.schemas.customers import CustomerCashbackLedgerEntry, CustomerCashbackSummaryResponse
from app.services.portal_service import PortalService


# ============================================================================
# CASHBACK SERVICE
# ============================================================================


SOURCE_CHANNEL = "marketplace"


def _q(value: Decimal | int | float | str) -> Decimal:
    """Return a two-decimal monetary value."""

    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class CashbackService:
    """Provide marketplace cashback earn, redeem, release, and reversal use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject | None = None) -> None:
        """Store the async session and acting subject."""

        self.session = session
        self.subject = subject
        self.repository = CashbackRepository(session)

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def _redeem_max_percent(self, tenant_id: str) -> Decimal:
        """Return the tenant's configured wallet-redemption ceiling, as a percent of the order total."""

        meta = await PortalService(self.session).get_marketplace_meta(tenant_id=tenant_id)
        percent = Decimal(str(meta.cashback_redeem_max_percent or 0))
        return max(Decimal("0"), min(Decimal("100"), percent))

    async def _default_earn_percent(self, tenant_id: str) -> Decimal:
        """Return the tenant-wide fallback earn rate for products without their own percent."""

        meta = await PortalService(self.session).get_marketplace_meta(tenant_id=tenant_id)
        percent = Decimal(str(meta.cashback_default_percent or 0))
        return max(Decimal("0"), min(Decimal("100"), percent))

    async def get_wallet_summary(self, *, tenant_id: str, customer_id: str) -> CustomerCashbackSummaryResponse:
        """Return the customer's wallet balances, ledger, and the current redemption ceiling."""

        wallet = await self.repository.get_or_create_wallet(tenant_id=tenant_id, customer_id=customer_id)
        transactions = await self.repository.list_transactions_for_customer(
            tenant_id=tenant_id, customer_id=customer_id, limit=50,
        )
        return CustomerCashbackSummaryResponse(
            available_balance=_q(wallet.available_balance),
            pending_balance=_q(wallet.pending_balance),
            lifetime_earned_total=_q(wallet.lifetime_earned_total),
            redeemed_total=_q(wallet.redeemed_total),
            redeem_max_percent=await self._redeem_max_percent(tenant_id),
            entries=[
                CustomerCashbackLedgerEntry(
                    id=item.id,
                    type=item.transaction_type,
                    status=item.transaction_status,
                    amount=_q(item.net_amount),
                    order_id=item.order_id or "",
                    reference=item.source_reference,
                    notes=item.notes,
                    created_at_label=item.granted_at_label or "",
                )
                for item in transactions
            ],
        )

    async def resolve_redeemable(self, *, tenant_id: str, customer_id: str, order_gross_total: Decimal) -> Decimal:
        """Return the maximum wallet amount the customer may apply to an order of this gross total."""

        if not customer_id:
            return Decimal("0.00")
        wallet = await self.repository.get_or_create_wallet(tenant_id=tenant_id, customer_id=customer_id)
        percent = await self._redeem_max_percent(tenant_id)
        cap_by_total = _q(Decimal(str(order_gross_total)) * percent / Decimal("100"))
        return max(Decimal("0.00"), min(_q(wallet.available_balance), cap_by_total))

    # ------------------------------------------------------------------
    # Writes — order lifecycle
    # ------------------------------------------------------------------

    async def apply_on_order(
        self,
        *,
        order: Order,
        order_items: list[OrderItem],
        requested_redeem: Decimal,
    ) -> tuple[Decimal, Decimal]:
        """Redeem (capped) and accrue (pending) cashback for a freshly created marketplace order.

        Returns (cashback_applied, cashback_earned). Must be called before the order is charged
        so the gateway amount can be reduced by the applied amount. Does not commit.
        """

        tenant_id = str(order.tenant_id)
        if not order.customer_id:
            return Decimal("0.00"), Decimal("0.00")
        customer = await self.repository.get_customer_by_id(tenant_id=tenant_id, customer_id=str(order.customer_id))
        if customer is None:
            return Decimal("0.00"), Decimal("0.00")
        wallet = await self.repository.get_or_create_wallet(tenant_id=tenant_id, customer_id=str(order.customer_id))

        # --- Redeem (server-authoritative cap) ---
        gross_total = Decimal(str(order.total_amount or 0))
        redeem_ceiling = await self.resolve_redeemable(
            tenant_id=tenant_id, customer_id=str(order.customer_id), order_gross_total=gross_total,
        )
        applied = max(Decimal("0.00"), min(_q(Decimal(str(requested_redeem or 0))), redeem_ceiling))
        if applied > Decimal("0.00"):
            wallet.available_balance = _q(wallet.available_balance - applied)
            wallet.redeemed_total = _q(wallet.redeemed_total + applied)
            await self.repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    customer_id=str(order.customer_id),
                    wallet_id=wallet.id,
                    transaction_type="redeem",
                    transaction_status="redeemed",
                    source_channel=SOURCE_CHANNEL,
                    source_reference=order.order_code,
                    order_id=order.id,
                    sale_reference="",
                    gross_amount=applied,
                    net_amount=applied,
                    wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora",
                    available_at_label="agora",
                    notes="Cashback usado no pagamento do pedido.",
                )
            )
        order.cashback_applied_amount = applied

        # --- Earn (credited pending; released on delivery/pickup) ---
        item_ids = [str(item.inventory_item_id) for item in order_items if item.inventory_item_id]
        percent_by_item = await self.repository.resolve_product_cashback_percent(
            tenant_id=tenant_id, inventory_item_ids=item_ids,
        )
        default_percent = await self._default_earn_percent(tenant_id)
        earned = Decimal("0.00")
        earned_lines: list[dict[str, object]] = []
        for item in order_items:
            raw_percent = percent_by_item.get(str(item.inventory_item_id))
            percent = Decimal(str(raw_percent)) if raw_percent is not None else default_percent
            if percent <= Decimal("0.00"):
                continue
            line_earn = _q(Decimal(str(item.line_total)) * percent / Decimal("100"))
            if line_earn <= Decimal("0.00"):
                continue
            earned = _q(earned + line_earn)
            earned_lines.append(
                {
                    "inventory_item_id": str(item.inventory_item_id) if item.inventory_item_id else None,
                    "product_reference": item.item_name_snapshot,
                    "quantity": item.quantity,
                    "base_amount": _q(item.line_total),
                    "cashback_percent": percent,
                    "cashback_amount": line_earn,
                }
            )
        if earned > Decimal("0.00"):
            wallet.pending_balance = _q(wallet.pending_balance + earned)
            transaction = await self.repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    customer_id=str(order.customer_id),
                    wallet_id=wallet.id,
                    transaction_type="earn",
                    transaction_status="pending",
                    source_channel=SOURCE_CHANNEL,
                    source_reference=order.order_code,
                    order_id=order.id,
                    sale_reference="",
                    gross_amount=earned,
                    net_amount=earned,
                    wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora",
                    available_at_label="após a entrega",
                    notes="Cashback do pedido — liberado após a entrega/retirada.",
                )
            )
            for line in earned_lines:
                await self.repository.add_transaction_line(
                    CashbackTransactionLine(
                        id=str(uuid4()),
                        tenant_id=tenant_id,
                        transaction_id=transaction.id,
                        cashback_rule_id=None,
                        customer_id=str(order.customer_id),
                        inventory_item_id=line["inventory_item_id"],
                        product_reference=line["product_reference"],
                        quantity=line["quantity"],
                        base_amount=line["base_amount"],
                        cashback_percent=line["cashback_percent"],
                        cashback_amount=line["cashback_amount"],
                    )
                )
        order.cashback_earned_amount = earned
        await self._sync_customer_balance(tenant_id=tenant_id, customer_id=str(order.customer_id), wallet=wallet)
        return applied, earned

    async def release_pending_for_order(self, *, order: Order) -> None:
        """Move this order's pending earn into the available balance (call on delivery/pickup). Does not commit."""

        tenant_id = str(order.tenant_id)
        if not order.customer_id:
            return
        movements = await self.repository.list_transactions_for_order(tenant_id=tenant_id, order_id=order.id)
        pending_earn = next(
            (m for m in movements if m.transaction_type == "earn" and m.transaction_status == "pending"),
            None,
        )
        if pending_earn is None:
            return
        wallet = await self.repository.get_or_create_wallet(tenant_id=tenant_id, customer_id=str(order.customer_id))
        amount = _q(pending_earn.net_amount)
        wallet.pending_balance = _q(max(Decimal("0.00"), wallet.pending_balance - amount))
        wallet.available_balance = _q(wallet.available_balance + amount)
        wallet.lifetime_earned_total = _q(wallet.lifetime_earned_total + amount)
        pending_earn.transaction_status = "available"
        await self.repository.add_transaction(
            CashbackTransaction(
                id=str(uuid4()),
                tenant_id=tenant_id,
                customer_id=str(order.customer_id),
                wallet_id=wallet.id,
                transaction_type="release",
                transaction_status="available",
                source_channel=SOURCE_CHANNEL,
                source_reference=order.order_code,
                order_id=order.id,
                sale_reference="",
                gross_amount=amount,
                net_amount=amount,
                wallet_balance_after=wallet.available_balance,
                granted_at_label="agora",
                available_at_label="agora",
                notes="Cashback liberado — pedido concluído.",
            )
        )
        await self._sync_customer_balance(tenant_id=tenant_id, customer_id=str(order.customer_id), wallet=wallet)

    async def reverse_for_order(self, *, order: Order) -> None:
        """Fully reverse an order's cashback on cancellation: void the earn, refund the redeemed. Does not commit."""

        tenant_id = str(order.tenant_id)
        if not order.customer_id:
            return
        movements = await self.repository.list_transactions_for_order(tenant_id=tenant_id, order_id=order.id)
        if any(m.transaction_type == "reversal" for m in movements):
            return
        wallet = await self.repository.get_or_create_wallet(tenant_id=tenant_id, customer_id=str(order.customer_id))

        earn = next((m for m in movements if m.transaction_type == "earn"), None)
        if earn is not None and earn.transaction_status in {"pending", "available"}:
            amount = _q(earn.net_amount)
            if earn.transaction_status == "pending":
                wallet.pending_balance = _q(max(Decimal("0.00"), wallet.pending_balance - amount))
            else:
                wallet.available_balance = _q(max(Decimal("0.00"), wallet.available_balance - amount))
                wallet.lifetime_earned_total = _q(max(Decimal("0.00"), wallet.lifetime_earned_total - amount))
            earn.transaction_status = "reversed"
            await self.repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()), tenant_id=tenant_id, customer_id=str(order.customer_id), wallet_id=wallet.id,
                    transaction_type="reversal", transaction_status="reversed", source_channel=SOURCE_CHANNEL,
                    source_reference=order.order_code, order_id=order.id, sale_reference="",
                    gross_amount=amount, net_amount=amount, wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora", available_at_label="agora",
                    notes="Cashback do pedido estornado — pedido cancelado.",
                )
            )

        redeem = next((m for m in movements if m.transaction_type == "redeem" and m.transaction_status == "redeemed"), None)
        if redeem is not None:
            amount = _q(redeem.net_amount)
            wallet.available_balance = _q(wallet.available_balance + amount)
            wallet.redeemed_total = _q(max(Decimal("0.00"), wallet.redeemed_total - amount))
            redeem.transaction_status = "reversed"
            await self.repository.add_transaction(
                CashbackTransaction(
                    id=str(uuid4()), tenant_id=tenant_id, customer_id=str(order.customer_id), wallet_id=wallet.id,
                    transaction_type="reversal", transaction_status="reversed", source_channel=SOURCE_CHANNEL,
                    source_reference=order.order_code, order_id=order.id, sale_reference="",
                    gross_amount=amount, net_amount=amount, wallet_balance_after=wallet.available_balance,
                    granted_at_label="agora", available_at_label="agora",
                    notes="Cashback usado devolvido à carteira — pedido cancelado.",
                )
            )
        await self._sync_customer_balance(tenant_id=tenant_id, customer_id=str(order.customer_id), wallet=wallet)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _sync_customer_balance(self, *, tenant_id: str, customer_id: str, wallet) -> None:
        """Keep the denormalized customer.cashback_balance in step with the wallet (mirrors PdvService)."""

        customer = await self.repository.get_customer_by_id(tenant_id=tenant_id, customer_id=customer_id)
        if customer is not None:
            customer.cashback_balance = wallet.available_balance
