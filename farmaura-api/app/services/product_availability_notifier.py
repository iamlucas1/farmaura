"""
farmaura-api/app/services/product_availability_notifier.py

Back-in-stock notification trigger for Farmaura.

Responsibilities:
- detect when a grouped marketplace product becomes purchasable again;
- fulfil any pending ProductAvailabilityAlert rows for that product with an e-mail;

Observations:
- shared by inventory_service (stock replenishment, publish/unpublish toggle) so
  every place stock or visibility can change re-uses the same availability check;
- best-effort by design: a delivery failure never blocks the inventory write that
  triggered it — see call sites, which wrap this in try/except.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.product_availability_alert_repository import ProductAvailabilityAlertRepository
from app.services.marketplace_projection import build_marketplace_catalog_groups, build_marketplace_product_id
from app.services.notification_service import NotificationService


# ============================================================================
# AVAILABILITY NOTIFIER
# ============================================================================


async def notify_if_product_became_available(
    session: AsyncSession,
    *,
    tenant_id: str,
    product_name: str,
    brand_name: str,
    fallback_id: str,
) -> None:
    """Send back-in-stock e-mails to pending subscribers once a product is purchasable again."""

    product_ref = build_marketplace_product_id(product_name, brand_name, fallback_id)
    inventory_repository = InventoryRepository(session)
    inventory_items = await inventory_repository.list_items(tenant_id=tenant_id, store_id="", active_only=True)
    grouped = build_marketplace_catalog_groups(
        [
            item
            for item in inventory_items
            if getattr(item, "sale_price", None) is not None
            and item.sale_price > 0
            and getattr(item, "is_marketplace_visible", True)
        ]
    )
    group = next((entry for entry in grouped if str(entry["id"]) == product_ref), None)
    if group is None or not bool(group.get("is_available")):
        return

    alert_repository = ProductAvailabilityAlertRepository(session)
    pending_alerts = await alert_repository.list_pending_for_product(tenant_id=tenant_id, product_ref=product_ref)
    if not pending_alerts:
        return

    notifier = NotificationService()
    now = datetime.now(tz=UTC)
    for alert in pending_alerts:
        customer = await session.get(Customer, alert.customer_id)
        alert.notified_at = now
        if customer is not None and customer.email:
            notifier.send_product_available_email(
                email=customer.email,
                full_name=customer.full_name,
                product_name=str(group["name"]),
            )
    await session.commit()
