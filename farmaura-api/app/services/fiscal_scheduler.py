"""
farmaura-api/app/services/fiscal_scheduler.py

Deferred fiscal issuance scheduler for Farmaura.

Responsibilities:
- periodically queue real NFC-e issuance for marketplace pickup orders once
  the Brazilian consumer-law 7-day withdrawal window has passed since payment;
- skip cancelled orders entirely, so a product return never forces a fiscal
  document to be issued and then cancelled;
- run as a lightweight in-process background task, matching this codebase's
  single-container architecture (no Celery/APScheduler dependency).

Observations:
- eligibility is payment_confirmed_at-based, not delivery-based: the 7-day
  window mirrors the CDC right of withdrawal for online purchases, which
  starts at purchase/payment, not at delivery;
- scope is fulfillment_type == "pickup" only: the customer collects in person,
  so it's fiscally identical to a PDV counter sale (no freight, indPres=1) —
  delivery/shipping orders are excluded from the eligibility query entirely
  (not attempted, not errored) until the accountant defines the tax treatment
  of the delivery fee and the correct indPres for a non-presencial sale;
- this only enqueues (FiscalService.enqueue_order writes a DRAFT document and
  kicks the worker) — SEFAZ transmission itself happens in fiscal_worker.py,
  same outbox/retry/numbering the PDV path already relies on;
- each tick uses its own short-lived session so a slow or failing fiscal
  call for one order never blocks or corrupts the next tick.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.tenant_context import apply_system_job_context
from app.domain.enums import OrderStatus
from app.models.fiscal_document import FiscalDocument
from app.models.order import Order
from app.models.order_item import OrderItem
from app.services.fiscal_service import FiscalService, kick_emission

logger = logging.getLogger("farmaura.fiscal_scheduler")

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
    """Queue real NFC-e issuance for every pickup order that has cleared its withdrawal window.

    Returns the number of documents queued, mainly for test/verification use.
    """

    # Default 7 days (CDC withdrawal window); APP_FISCAL_ISSUANCE_DELAY_DAYS=0 is for sandbox/dev testing only.
    cutoff = datetime.now(UTC) - timedelta(days=get_settings().fiscal_issuance_delay_days)
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
            # Phase 1 scope: only in-person pickup is fiscally ready today (no freight/indPres
            # policy decided yet for delivery/shipping) — see the module docstring.
            Order.fulfillment_type == "pickup",
            Order.id.not_in(existing_document_order_ids),
        )
        eligible_order_ids = list((await session.execute(statement)).scalars().all())
    queued_count = 0
    for order_id in eligible_order_ids:
        if await _issue_one_deferred_document(order_id):
            queued_count += 1
    return queued_count


async def _issue_one_deferred_document(order_id: str) -> bool:
    """Queue one order's deferred fiscal document in its own isolated session.

    This only enqueues (DRAFT + kick_emission) — the worker signs/transmits/authorizes
    asynchronously, same outbox as the PDV path. The customer-notification e-mail fires later,
    from FiscalService._finalize_authorized, once the document actually has something to show.
    """

    async with SessionFactory() as session:
        await apply_system_job_context(session)
        order = await session.get(Order, order_id)
        if order is None or order.status == OrderStatus.CANCELLED.value:
            return False
        order_items = list(
            (await session.execute(select(OrderItem).where(OrderItem.order_id == order.id))).scalars().all()
        )
        fiscal_service = FiscalService(session)
        try:
            document = await fiscal_service.enqueue_order(order=order, order_items=order_items)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Failed to queue deferred fiscal document for order %s", order_id)
            return False
        if document is not None:
            kick_emission(document.id)
        return document is not None
