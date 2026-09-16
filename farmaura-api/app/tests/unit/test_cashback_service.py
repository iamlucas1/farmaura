"""
farmaura-api/app/tests/unit/test_cashback_service.py

Marketplace cashback service business-logic tests for Farmaura.

Responsibilities:
- verify earn uses the product's own cashback_percent, falling back to the
  tenant-wide default when the product has none;
- verify redeem is capped by both the wallet balance and the tenant's
  configured % of the order total — never by the client's requested amount alone;
- verify a completed order releases its pending earn into the available balance;
- verify a cancelled order is fully reversed (earn voided, redeem refunded).

Observations:
- CashbackRepository is stubbed directly on the service instance, and
  PortalService via monkeypatch, matching this suite's existing convention
  (see test_product_service.py) of isolating service policy from persistence.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.domain.enums import AccessScope, UserRole
from app.schemas.auth import TokenSubject
from app.services.cashback_service import CashbackService


# ============================================================================
# TEST HELPERS
# ============================================================================


def build_subject() -> TokenSubject:
    """Create a token subject for an authenticated marketplace customer actor."""

    return TokenSubject(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=UserRole.CUSTOMER,
        access_scope=AccessScope.MARKETPLACE,
        session_version=1,
    )


def build_wallet(**overrides: object) -> SimpleNamespace:
    """Build a minimal CustomerCashbackWallet-shaped stand-in."""

    defaults = dict(
        id=str(uuid4()),
        available_balance=Decimal("0.00"),
        pending_balance=Decimal("0.00"),
        redeemed_total=Decimal("0.00"),
        expired_total=Decimal("0.00"),
        lifetime_earned_total=Decimal("0.00"),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def build_order(*, tenant_id: str, customer_id: str, total_amount: Decimal, order_code: str = "FA-1001") -> SimpleNamespace:
    """Build a minimal Order-shaped stand-in."""

    return SimpleNamespace(
        id=str(uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        order_code=order_code,
        total_amount=total_amount,
        cashback_applied_amount=Decimal("0.00"),
        cashback_earned_amount=Decimal("0.00"),
    )


def build_order_item(*, inventory_item_id: str, line_total: Decimal, quantity: int = 1) -> SimpleNamespace:
    """Build a minimal OrderItem-shaped stand-in."""

    return SimpleNamespace(
        inventory_item_id=inventory_item_id,
        item_name_snapshot="Losartana 50mg",
        quantity=quantity,
        line_total=line_total,
    )


def build_service(
    monkeypatch: pytest.MonkeyPatch,
    *,
    redeem_max_percent: Decimal = Decimal("25.00"),
    default_percent: Decimal = Decimal("0.00"),
) -> CashbackService:
    """Create a CashbackService with the repository stubbed and marketplace meta patched.

    Uses the monkeypatch fixture (not a bare unittest.mock.patch) so PortalService is always
    restored after the test, even on failure — no cross-test leakage.
    """

    subject = build_subject()
    service = CashbackService(session=AsyncMock(), subject=subject)
    service.repository = AsyncMock()
    service.repository.get_customer_by_id = AsyncMock(return_value=SimpleNamespace(id=subject.user_id, cashback_balance=Decimal("0.00")))
    service.repository.list_transactions_for_order = AsyncMock(return_value=[])
    service.repository.add_transaction = AsyncMock(side_effect=lambda txn: txn)
    service.repository.add_transaction_line = AsyncMock(side_effect=lambda line: line)
    service.repository.resolve_product_cashback_percent = AsyncMock(return_value={})

    meta = SimpleNamespace(cashback_default_percent=default_percent, cashback_redeem_max_percent=redeem_max_percent)
    portal = SimpleNamespace(get_marketplace_meta=AsyncMock(return_value=meta))
    monkeypatch.setattr("app.services.cashback_service.PortalService", lambda *args, **kwargs: portal)
    return service


# ============================================================================
# TESTS
# ============================================================================


@pytest.mark.anyio
async def test_resolve_redeemable_caps_by_wallet_and_percent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify the redeemable amount is the smaller of the wallet balance and the % ceiling."""

    service = build_service(monkeypatch, redeem_max_percent=Decimal("25.00"))
    wallet = build_wallet(available_balance=Decimal("100.00"))
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)

    # 25% of a 200.00 order is 50.00 — below the 100.00 available balance, so the % wins.
    redeemable = await service.resolve_redeemable(
        tenant_id="tenant-1", customer_id="customer-1", order_gross_total=Decimal("200.00"),
    )
    assert redeemable == Decimal("50.00")

    # A tiny order caps by its own 25% even though the wallet has plenty.
    redeemable_small_order = await service.resolve_redeemable(
        tenant_id="tenant-1", customer_id="customer-1", order_gross_total=Decimal("10.00"),
    )
    assert redeemable_small_order == Decimal("2.50")


@pytest.mark.anyio
async def test_apply_on_order_earns_per_line_using_product_percent_or_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify earn uses each item's own cashback_percent, falling back to the tenant default."""

    service = build_service(monkeypatch, redeem_max_percent=Decimal("25.00"), default_percent=Decimal("5.00"))
    wallet = build_wallet(available_balance=Decimal("0.00"))
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)
    service.repository.resolve_product_cashback_percent = AsyncMock(
        return_value={"item-own-percent": Decimal("10.00")},
    )

    order = build_order(tenant_id="tenant-1", customer_id="customer-1", total_amount=Decimal("150.00"))
    items = [
        build_order_item(inventory_item_id="item-own-percent", line_total=Decimal("100.00")),  # 10% -> 10.00
        build_order_item(inventory_item_id="item-default-percent", line_total=Decimal("50.00")),  # 5% -> 2.50
    ]

    applied, earned = await service.apply_on_order(order=order, order_items=items, requested_redeem=Decimal("0.00"))

    assert applied == Decimal("0.00")
    assert earned == Decimal("12.50")
    assert order.cashback_earned_amount == Decimal("12.50")
    assert wallet.pending_balance == Decimal("12.50")
    assert wallet.available_balance == Decimal("0.00")  # earn is pending, not spendable yet


@pytest.mark.anyio
async def test_apply_on_order_redeem_never_exceeds_server_cap_even_if_more_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify a client asking to redeem more than allowed is silently clamped, never trusted."""

    service = build_service(monkeypatch, redeem_max_percent=Decimal("25.00"), default_percent=Decimal("0.00"))
    wallet = build_wallet(available_balance=Decimal("1000.00"))  # plenty of balance
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)

    order = build_order(tenant_id="tenant-1", customer_id="customer-1", total_amount=Decimal("100.00"))
    items = [build_order_item(inventory_item_id="item-1", line_total=Decimal("100.00"))]

    # Client asks to redeem the full order — server caps at 25% of the 100.00 total = 25.00.
    applied, _earned = await service.apply_on_order(order=order, order_items=items, requested_redeem=Decimal("100.00"))

    assert applied == Decimal("25.00")
    assert order.cashback_applied_amount == Decimal("25.00")
    assert wallet.available_balance == Decimal("975.00")
    assert wallet.redeemed_total == Decimal("25.00")


@pytest.mark.anyio
async def test_release_pending_for_order_moves_balance_to_available(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify completing an order moves exactly that order's pending earn into available_balance."""

    service = build_service(monkeypatch)
    wallet = build_wallet(pending_balance=Decimal("12.50"), available_balance=Decimal("3.00"))
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)
    pending_txn = SimpleNamespace(transaction_type="earn", transaction_status="pending", net_amount=Decimal("12.50"))
    service.repository.list_transactions_for_order = AsyncMock(return_value=[pending_txn])

    order = build_order(tenant_id="tenant-1", customer_id="customer-1", total_amount=Decimal("100.00"))
    await service.release_pending_for_order(order=order)

    assert wallet.pending_balance == Decimal("0.00")
    assert wallet.available_balance == Decimal("15.50")
    assert wallet.lifetime_earned_total == Decimal("12.50")
    assert pending_txn.transaction_status == "available"


@pytest.mark.anyio
async def test_reverse_for_order_refunds_redeemed_and_voids_pending_earn(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify cancelling an order fully reverses it: earn voided, redeemed amount refunded."""

    service = build_service(monkeypatch)
    wallet = build_wallet(available_balance=Decimal("5.00"), pending_balance=Decimal("8.00"), redeemed_total=Decimal("20.00"))
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)
    earn_txn = SimpleNamespace(transaction_type="earn", transaction_status="pending", net_amount=Decimal("8.00"))
    redeem_txn = SimpleNamespace(transaction_type="redeem", transaction_status="redeemed", net_amount=Decimal("20.00"))
    service.repository.list_transactions_for_order = AsyncMock(return_value=[earn_txn, redeem_txn])

    order = build_order(tenant_id="tenant-1", customer_id="customer-1", total_amount=Decimal("100.00"))
    await service.reverse_for_order(order=order)

    # Pending earn voided (never touched available_balance) + redeemed amount refunded to it.
    assert wallet.pending_balance == Decimal("0.00")
    assert wallet.available_balance == Decimal("25.00")
    assert wallet.redeemed_total == Decimal("0.00")
    assert earn_txn.transaction_status == "reversed"
    assert redeem_txn.transaction_status == "reversed"


@pytest.mark.anyio
async def test_reverse_for_order_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify calling reverse twice for the same order never double-refunds the wallet."""

    service = build_service(monkeypatch)
    wallet = build_wallet(available_balance=Decimal("5.00"))
    service.repository.get_or_create_wallet = AsyncMock(return_value=wallet)
    reversal_txn = SimpleNamespace(transaction_type="reversal", transaction_status="reversed", net_amount=Decimal("20.00"))
    service.repository.list_transactions_for_order = AsyncMock(return_value=[reversal_txn])

    order = build_order(tenant_id="tenant-1", customer_id="customer-1", total_amount=Decimal("100.00"))
    await service.reverse_for_order(order=order)

    assert wallet.available_balance == Decimal("5.00")  # untouched — already reversed once
    service.repository.add_transaction.assert_not_called()
