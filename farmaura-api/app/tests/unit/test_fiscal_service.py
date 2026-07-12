"""
farmaura-api/app/tests/unit/test_fiscal_service.py

Fiscal issuance idempotency and resilience tests for Farmaura.

Responsibilities:
- verify a second issuance call reuses the already-issued document instead of duplicating it;
- verify a disabled or misconfigured Asaas integration never blocks local fiscal issuance;

Observations:
- the database session is stubbed to isolate fiscal issuance policy from persistence details;
- Asaas defaults to disabled in tests, matching the best-effort integration contract.
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.fiscal_service import FiscalService


# ============================================================================
# TEST HELPERS
# ============================================================================


def build_order() -> SimpleNamespace:
    """Create a minimal order object compatible with fiscal issuance."""

    return SimpleNamespace(
        id=str(uuid4()),
        tenant_id=str(uuid4()),
        store_id=str(uuid4()),
        order_code="ORD-0001",
        customer_id=str(uuid4()),
        payment_method_label="Cartão de crédito",
        customer_display_name="Cliente Teste",
        customer_document_snapshot="12345678900",
        customer_email_snapshot="cliente@example.com",
        total_amount=Decimal("59.90"),
    )


def build_session(*, existing_document: object | None) -> AsyncMock:
    """Build a stub session whose lookups resolve to the given existing document."""

    session = AsyncMock()
    execute_result = SimpleNamespace(scalar_one_or_none=lambda: existing_document)
    session.execute = AsyncMock(return_value=execute_result)
    session.add = MagicMock()
    session.flush = AsyncMock()
    return session


# ============================================================================
# FISCAL ISSUANCE TESTS
# ============================================================================


@pytest.mark.anyio
async def test_issue_for_order_reuses_existing_document() -> None:
    """Verify a second issuance call never duplicates an already-issued document."""

    order = build_order()
    existing_document = SimpleNamespace(id=str(uuid4()), order_id=order.id)
    session = build_session(existing_document=existing_document)
    service = FiscalService(session)

    result = await service.issue_for_order(order=order, customer=None)

    assert result is existing_document
    session.add.assert_not_called()


@pytest.mark.anyio
async def test_issue_for_order_never_blocks_on_disabled_asaas() -> None:
    """Verify local fiscal issuance still succeeds when Asaas is disabled."""

    order = build_order()
    session = build_session(existing_document=None)
    service = FiscalService(session)
    assert service.settings.asaas_enabled is False

    document = await service.issue_for_order(order=order, customer=None)

    assert document.order_id == order.id
    assert document.gross_total_amount == order.total_amount
    session.add.assert_called_once()
