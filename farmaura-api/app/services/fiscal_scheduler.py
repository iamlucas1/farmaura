"""
farmaura-api/app/services/fiscal_scheduler.py

Deferred fiscal issuance scheduler for Farmaura.

Responsibilities:
- periodically issue fiscal documents for marketplace orders once the
  Brazilian consumer-law 7-day withdrawal window has passed since payment;
- skip cancelled orders entirely, so a product return never forces a fiscal
  document to be issued and then cancelled;
- run as a lightweight in-process background task, matching this codebase's
  single-container architecture (no Celery/APScheduler dependency).

Observations:
- eligibility is payment_confirmed_at-based, not delivery-based: the 7-day
  window mirrors the CDC right of withdrawal for online purchases, which
  starts at purchase/payment, not at delivery;
- each tick uses its own short-lived session so a slow or failing fiscal
  call for one order never blocks or corrupts the next tick.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.database import SessionFactory
from app.core.tenant_context import apply_system_job_context
from app.domain.enums import OrderStatus
from app.models.customer import Customer
from app.models.fiscal_document import FiscalDocument
from app.models.order import Order
from app.services.fiscal_service import FiscalService

logger = logging.getLogger("farmaura.fiscal_scheduler")

FISCAL_ISSUANCE_DELAY_DAYS = 7
TICK_INTERVAL_SECONDS = 900


# ============================================================================
# SCHEDULER LOOP
# ============================================================================


async def run_fiscal_scheduler_forever() -> None:
    """Run the deferred fiscal issuance sweep on a fixed interval, forever."""

    while True:
        try:
            await run_fiscal_scheduler_tick()
        except Exception:
            logger.exception("Fiscal scheduler tick failed")
        await asyncio.sleep(TICK_INTERVAL_SECONDS)


async def run_fiscal_scheduler_tick() -> int:
    """Issue fiscal documents for every order that has cleared its withdrawal window.

    Returns the number of documents issued, mainly for test/verification use.
    """

    cutoff = datetime.now(UTC) - timedelta(days=FISCAL_ISSUANCE_DELAY_DAYS)
    async with SessionFactory() as session:
        # set_config(..., true) is transaction-local, so this lookup session is
        # read-only and discarded — each order below gets its own fresh session
        # (and therefore its own system-job grant) for the actual issuance.
        await apply_system_job_context(session)
        existing_document_order_ids = select(FiscalDocument.order_id).where(FiscalDocument.order_id.is_not(None))
        statement = select(Order.id).where(
            Order.payment_status == "approved",
            Order.payment_confirmed_at.is_not(None),
            Order.payment_confirmed_at <= cutoff,
            Order.status != OrderStatus.CANCELLED.value,
            Order.id.not_in(existing_document_order_ids),
        )
        eligible_order_ids = list((await session.execute(statement)).scalars().all())
    issued_count = 0
    for order_id in eligible_order_ids:
        if await _issue_one_deferred_document(order_id):
            issued_count += 1
    return issued_count


async def _issue_one_deferred_document(order_id: str) -> bool:
    """Issue one order's deferred fiscal document in its own isolated session."""

    async with SessionFactory() as session:
        await apply_system_job_context(session)
        order = await session.get(Order, order_id)
        if order is None or order.status == OrderStatus.CANCELLED.value:
            return False
        customer = await session.get(Customer, order.customer_id) if order.customer_id else None
        fiscal_service = FiscalService(session)
        try:
            document = await fiscal_service.issue_for_order(order=order, customer=customer)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Failed to issue deferred fiscal document for order %s", order_id)
            return False
        if customer and customer.email:
            try:
                response = fiscal_service.serialize_document(document)
                fiscal_service.notification_service.send_fiscal_document_email(
                    document=document,
                    email=customer.email,
                    printable_html_url=response.printable_html_url,
                )
            except Exception:
                logger.exception("Failed to send deferred fiscal document email for order %s", order_id)
        return True
