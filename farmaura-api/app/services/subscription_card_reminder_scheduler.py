"""
farmaura-api/app/services/subscription_card_reminder_scheduler.py

Card-less recurrence follow-up scheduler for Farmaura.

Responsibilities:
- e-mail a customer to add a card for a "pending_card" subscription (PDV-confirmed
  recurrence for a customer with no saved card yet), at D-15/10/5/2/1 before its due date;
- on the due date itself, charge the customer's primary saved card if one exists by
  then, or cancel the subscription with a visible reason if it doesn't;
- run as a lightweight in-process background task, matching this codebase's
  single-container architecture (no Celery/APScheduler dependency) — same pattern
  as fiscal_scheduler.py.

Observations:
- days-until-due compares calendar dates, not timestamps, so a reminder fires once
  per day regardless of the tick interval;
- each subscription is processed in its own short-lived session so a slow or failing
  charge/e-mail for one never blocks or corrupts the next.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.tenant_context import apply_system_job_context
from app.models.customer import Customer
from app.models.subscription import Subscription
from app.repositories.customer_payment_method_repository import CustomerPaymentMethodRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.services.notification_service import NotificationService
from app.services.payment_service import PaymentService

logger = logging.getLogger("farmaura.subscription_card_reminder_scheduler")

# Descending so the first threshold a subscription's days-until-due matches (walked in
# order) is the correct one to send; 0 is handled separately as the due-date branch below.
CARD_REMINDER_THRESHOLDS_DAYS = (15, 10, 5, 2, 1)
TICK_INTERVAL_SECONDS = 3600


# ============================================================================
# SCHEDULER LOOP
# ============================================================================


async def run_subscription_card_reminder_scheduler_forever() -> None:
    """Run the card-reminder/due-date sweep on a fixed interval, forever."""

    while True:
        try:
            await run_subscription_card_reminder_scheduler_tick()
        except Exception:
            logger.exception("Subscription card reminder scheduler tick failed")
        await asyncio.sleep(TICK_INTERVAL_SECONDS)


async def run_subscription_card_reminder_scheduler_tick() -> int:
    """Process every subscription scheduled without a card.

    Returns the number of subscriptions that changed state (reminded, charged, or
    cancelled), mainly for test/verification use.
    """

    async with SessionFactory() as session:
        await apply_system_job_context(session)
        pending_ids = await SubscriptionRepository(session).list_pending_card_ids()
    changed = 0
    for subscription_id in pending_ids:
        if await _process_one_pending_card_subscription(subscription_id):
            changed += 1
    return changed


async def _process_one_pending_card_subscription(subscription_id: str) -> bool:
    """Advance one card-less subscription: remind, charge, or cancel — in its own session."""

    async with SessionFactory() as session:
        await apply_system_job_context(session)
        subscription = await session.get(Subscription, subscription_id)
        if subscription is None or subscription.subscription_status != "pending_card" or subscription.next_charge_due_at is None:
            return False
        customer = await session.get(Customer, subscription.customer_id)
        if customer is None:
            return False

        today = datetime.now(UTC).date()
        due_date = subscription.next_charge_due_at.date()
        due_date_label = subscription.next_charge_due_at.strftime("%d/%m/%Y")
        days_until_due = (due_date - today).days

        if days_until_due > 0:
            return await _maybe_send_reminder(session, subscription, customer, days_until_due, due_date_label)
        return await _resolve_due_subscription(session, subscription, customer)


async def _maybe_send_reminder(
    session: AsyncSession, subscription: Subscription, customer: Customer, days_until_due: int, due_date_label: str
) -> bool:
    """Send the one reminder e-mail owed for today's days-until-due, if not sent already."""

    threshold = next((t for t in CARD_REMINDER_THRESHOLDS_DAYS if days_until_due == t), None)
    if threshold is None or subscription.card_reminder_last_threshold_days == threshold:
        return False
    subscription.card_reminder_last_threshold_days = threshold
    await session.commit()
    if customer.email:
        try:
            NotificationService().send_subscription_card_reminder_email(
                email=customer.email,
                full_name=customer.full_name,
                product_name=subscription.product_name_snapshot,
                due_date_label=due_date_label,
                days_until_due=days_until_due,
                add_card_url=f"{get_settings().marketplace_base_url.rstrip('/')}/account",
            )
        except Exception:
            logger.exception("Failed to send card reminder e-mail for subscription %s", subscription.id)
    return True


async def _resolve_due_subscription(session: AsyncSession, subscription: Subscription, customer: Customer) -> bool:
    """Charge the customer's primary card if one exists by the due date, else cancel."""

    payment_methods = await CustomerPaymentMethodRepository(session).list_for_customer(customer_id=customer.id)
    primary = next((m for m in payment_methods if m.is_primary), None)

    if primary is not None:
        discounted_unit_price = (
            subscription.unit_price_snapshot * (Decimal("100.00") - subscription.discount_percent) / Decimal("100.00")
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        amount = discounted_unit_price * subscription.quantity
        try:
            provider_subscription = await PaymentService(session).charge_recurring_subscription(
                customer=customer,
                provider_token=primary.provider_token,
                amount=amount,
                external_reference=subscription.subscription_code,
                description="Recorrência PDV - " + subscription.product_name_snapshot,
            )
        except HTTPException:
            logger.exception("Charge failed for now-carded subscription %s — cancelling instead", subscription.id)
            return await _cancel_no_card(session, subscription, customer, reason="charge_failed")
        subscription.subscription_status = "active"
        subscription.provider_subscription_id = provider_subscription["subscription_id"]
        subscription.started_at_label = "agora"
        await session.commit()
        return True

    return await _cancel_no_card(session, subscription, customer, reason="no_card_by_due_date")


async def _cancel_no_card(session: AsyncSession, subscription: Subscription, customer: Customer, *, reason: str) -> bool:
    """Cancel a card-less subscription that reached its due date, with a visible reason."""

    subscription.subscription_status = "cancelled"
    subscription.cancel_reason = reason
    subscription.cancelled_at_label = datetime.now(UTC).astimezone().strftime("%d/%m/%Y %H:%M")
    await session.commit()
    if customer.email:
        try:
            NotificationService().send_subscription_cancelled_no_card_email(
                email=customer.email, full_name=customer.full_name, product_name=subscription.product_name_snapshot,
            )
        except Exception:
            logger.exception("Failed to send cancellation e-mail for subscription %s", subscription.id)
    return True
