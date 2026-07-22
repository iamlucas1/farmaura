"""
farmaura-api/app/services/purchase_history_service.py

Purchase history and recurrence detection service for Farmaura.

Responsibilities:
- aggregate a customer's real purchase history across the marketplace and
  balcão (PDV) channels into a single product-level view;
- surface which products a customer buys most, for PDV upsell suggestions;
- detect products bought in several consecutive calendar months and surface
  them as recurrence candidates, excluding ones already under subscription.

Observations:
- products are identified by the same slug(name)::slug(brand) key that
  build_marketplace_catalog_groups already uses, so the same logical product
  sold from different store InventoryItem rows is counted together;
- three consecutive months is the recurrence threshold — a defensible middle
  ground between over-triggering on a single repeat purchase and under-
  triggering by waiting a full quarter.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.order_repository import OrderRepository
from app.repositories.pdv_repository import PdvRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.services.marketplace_projection import slug_marketplace_value


# ============================================================================
# CONSTANTS
# ============================================================================


RECURRENCE_MONTH_THRESHOLD = 3
TOP_PRODUCTS_LIMIT = 5
DEFAULT_RECURRENCE_DISCOUNT_PERCENT = Decimal("15.00")


# ============================================================================
# RESULT TYPES
# ============================================================================


@dataclass(frozen=True, slots=True)
class TopProductInsight:
    """Represent one product a customer purchases often."""

    product_key: str
    name: str
    brand: str
    total_quantity: int
    last_price: Decimal


@dataclass(frozen=True, slots=True)
class RecurrenceCandidate:
    """Represent one product bought in several consecutive months."""

    product_key: str
    name: str
    brand: str
    consecutive_months: int
    last_purchased_month: str
    avg_quantity: int
    last_unit_price: Decimal
    suggested_discount_percent: Decimal = DEFAULT_RECURRENCE_DISCOUNT_PERCENT


@dataclass(frozen=True, slots=True)
class CustomerPurchaseSummary:
    """Represent the full purchase-insights payload for a customer."""

    top_products: list[TopProductInsight] = field(default_factory=list)
    recurrence_candidates: list[RecurrenceCandidate] = field(default_factory=list)


# ============================================================================
# PURCHASE HISTORY SERVICE
# ============================================================================


class PurchaseHistoryService:
    """Compute purchase-history insights for a customer from real order/sale data."""

    def __init__(self, session: AsyncSession) -> None:
        """Store repository dependencies."""

        self.session = session
        self.order_repository = OrderRepository(session)
        self.pdv_repository = PdvRepository(session)
        self.subscription_repository = SubscriptionRepository(session)

    async def get_customer_purchase_summary(self, *, tenant_id: str, customer_id: str) -> CustomerPurchaseSummary:
        """Return top products and recurrence candidates for one customer."""

        order_items = await self.order_repository.list_items_by_customer(tenant_id=tenant_id, customer_id=customer_id)
        sale_items = await self.pdv_repository.list_sale_items_by_customer(tenant_id=tenant_id, customer_id=customer_id)

        by_product: dict[str, dict[str, object]] = {}
        months_by_product: dict[str, set[str]] = {}

        def record(name: str, brand: str, quantity: int, unit_price: Decimal, created_at: datetime) -> None:
            key = self._product_key(name, brand)
            bucket = by_product.setdefault(
                key,
                {"name": name, "brand": brand, "total_quantity": 0, "purchase_count": 0, "last_price": unit_price, "last_at": created_at},
            )
            bucket["total_quantity"] = int(bucket["total_quantity"]) + int(quantity)
            bucket["purchase_count"] = int(bucket["purchase_count"]) + 1
            if created_at >= bucket["last_at"]:
                bucket["last_price"] = unit_price
                bucket["last_at"] = created_at
            months_by_product.setdefault(key, set()).add(created_at.strftime("%Y-%m"))

        for item in order_items:
            record(item.item_name_snapshot, item.brand_name_snapshot, item.quantity, item.unit_price, item.created_at)
        for item in sale_items:
            record(item.item_name_snapshot, item.brand_name_snapshot, item.quantity, item.unit_price, item.created_at)

        top_products = sorted(
            (
                TopProductInsight(
                    product_key=key,
                    name=str(data["name"]),
                    brand=str(data["brand"]),
                    total_quantity=int(data["total_quantity"]),
                    last_price=Decimal(data["last_price"]),
                )
                for key, data in by_product.items()
            ),
            key=lambda entry: entry.total_quantity,
            reverse=True,
        )[:TOP_PRODUCTS_LIMIT]

        active_subscriptions = await self.subscription_repository.list_active_for_customer(tenant_id=tenant_id, customer_id=customer_id)
        subscribed_name_slugs = {slug_marketplace_value(subscription.product_name_snapshot) for subscription in active_subscriptions}

        recurrence_candidates: list[RecurrenceCandidate] = []
        for key, months in months_by_product.items():
            streak = self._longest_consecutive_month_streak(months)
            if streak < RECURRENCE_MONTH_THRESHOLD:
                continue
            name_slug = key.split("::")[0]
            if name_slug in subscribed_name_slugs:
                continue
            data = by_product[key]
            purchase_count = max(1, int(data["purchase_count"]))
            recurrence_candidates.append(
                RecurrenceCandidate(
                    product_key=key,
                    name=str(data["name"]),
                    brand=str(data["brand"]),
                    consecutive_months=streak,
                    last_purchased_month=max(months),
                    avg_quantity=max(1, round(int(data["total_quantity"]) / purchase_count)),
                    last_unit_price=Decimal(data["last_price"]),
                )
            )
        recurrence_candidates.sort(key=lambda entry: entry.consecutive_months, reverse=True)
        return CustomerPurchaseSummary(top_products=top_products, recurrence_candidates=recurrence_candidates)

    def _product_key(self, name: str, brand: str) -> str:
        """Return the cross-channel product identity key, matching the marketplace catalog grouping."""

        return slug_marketplace_value(name) + "::" + (slug_marketplace_value(brand) or "sem-marca")

    def _longest_consecutive_month_streak(self, months: set[str]) -> int:
        """Return the longest run of consecutive calendar months present in the set."""

        parsed = sorted(datetime.strptime(month, "%Y-%m") for month in months)
        if not parsed:
            return 0
        longest = 1
        current = 1
        for previous, current_month in zip(parsed, parsed[1:]):
            expected_month = previous.month % 12 + 1
            expected_year = previous.year + (1 if previous.month == 12 else 0)
            if current_month.year == expected_year and current_month.month == expected_month:
                current += 1
                longest = max(longest, current)
            else:
                current = 1
        return longest
