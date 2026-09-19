"""
farmaura-api/app/services/purchase_history_service.py

Purchase history and recurrence detection service for Farmaura.

Responsibilities:
- aggregate a customer's real purchase history across the marketplace and
  balcão (PDV) channels into a single product-level view;
- surface which products a customer buys most, for PDV upsell suggestions;
- detect the customer's own real purchase cadence for a product (not a
  calendar-month heuristic) and surface it as a recurrence candidate once the
  same interval has repeated at least 3 times, excluding ones already under
  subscription;
- separately flag continuous-use medications (real clinical content on the
  product, not purchase-count-based) as recurrence candidates too, even before
  three purchases — the medication itself is the signal, not the history.

Observations:
- products are identified by the same slug(name)::slug(brand) key that
  build_marketplace_catalog_groups already uses, so the same logical product
  sold from different store InventoryItem rows is counted together;
- the interval detector tolerates real-world variance (a customer running a
  few days early/late) rather than requiring exact day-for-day spacing —
  see _detect_interval_pattern for the tolerance rule.
"""

from collections import Counter
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from statistics import mean, median
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_item import InventoryItem
from app.models.order_item import OrderItem
from app.models.pdv_sale_item import PdvSaleItem
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.order_repository import OrderRepository
from app.repositories.pdv_repository import PdvRepository
from app.repositories.product_availability_alert_repository import ProductAvailabilityAlertRepository
from app.repositories.product_view_event_repository import ProductViewEventRepository
from app.repositories.saved_product_repository import SavedProductRepository
from app.repositories.subscription_repository import SubscriptionRepository
from app.services.marketplace_projection import slug_marketplace_value


# ============================================================================
# CONSTANTS
# ============================================================================


RECURRENCE_OCCURRENCE_THRESHOLD = 3
# A continuous-use medication with too little purchase history to detect a real interval
# still needs *some* cadence to suggest — 30 days is the clinical default for daily-dose
# continuous medication (one box lasts about a month), never shown as "detectado".
CONTINUOUS_USE_DEFAULT_FREQUENCY_DAYS = 30
TOP_PRODUCTS_LIMIT = 5
# 5 shown inline in the PDV recurrence panel + up to 10 more revealed in its "ver mais" modal
# (15 total) — same pattern as UPSELL_SUGGESTIONS_LIMIT, see PdvRecurrenceSuggestions.
RECURRENCE_CANDIDATES_LIMIT = 15
DEFAULT_RECURRENCE_DISCOUNT_PERCENT = Decimal("15.00")
# Terms that mark a product's own clinical content (bula/description) as continuous-use —
# the product itself is the signal, independent of how many times this customer bought it.
CONTINUOUS_USE_MARKERS = ("uso contínuo", "uso continuo")

# Weights for get_cart_upsell_suggestions — how much each signal counts toward a
# candidate's final score. Personal signals (this customer's own pattern) outweigh the
# generic cross-customer one, since a product this specific customer is known to buy
# alongside/repeatedly is a stronger sell than one that merely trends with the cart
# across everyone. All weights are per distinct order/sale (never per unit bought), so
# one bulk order can't alone dominate the ranking.
WEIGHT_GLOBAL_CO_PURCHASE = 1.0
WEIGHT_PERSONAL_CO_PURCHASE = 3.0
WEIGHT_PERSONAL_TOP_PRODUCT = 1.5
WEIGHT_PERSONAL_RECURRENCE = 2.0
# Browsing-interest signals — real intent, but weaker than an actual purchase, so all
# three stay below every purchase-based weight above. A back-in-stock request is the
# strongest of the three (an active "I want this now" blocked only by stock); a favorite
# is a deliberate but passive bookmark; a page view is the weakest individual signal,
# which is why it is applied per view (see PRODUCT_VIEW_COUNT_CAP) instead of once —
# repeated viewing without buying is exactly the pattern the weight is meant to catch.
WEIGHT_PERSONAL_DESIRED = 1.2
WEIGHT_PERSONAL_FAVORITE = 1.0
WEIGHT_PERSONAL_VIEW = 0.3
# Caps how many views of the same product count toward its score — otherwise one
# obsessively-revisited product could out-rank every other signal combined.
PRODUCT_VIEW_COUNT_CAP = 10
# 5 shown inline in the PDV panel + up to 10 more revealed in the "ver mais" modal (15 total) —
# see PdvUpsell, point-of-sale-screen.jsx.
UPSELL_SUGGESTIONS_LIMIT = 15


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
    """Represent one product worth suggesting as a recurring subscription.

    frequency_days is the customer's own detected purchase cadence (or, for a
    continuous-use medication with too little history, a clinical default — see
    interval_detected) — never a fixed calendar-month bucket.
    """

    product_key: str
    name: str
    brand: str
    frequency_days: int
    occurrences: int
    interval_detected: bool
    continuous_use: bool
    avg_quantity: int
    last_unit_price: Decimal
    suggested_discount_percent: Decimal = DEFAULT_RECURRENCE_DISCOUNT_PERCENT
    savings_amount: Decimal = Decimal("0.00")


@dataclass(frozen=True, slots=True)
class CustomerPurchaseSummary:
    """Represent the full purchase-insights payload for a customer."""

    top_products: list[TopProductInsight] = field(default_factory=list)
    recurrence_candidates: list[RecurrenceCandidate] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class UpsellSuggestion:
    """Represent one real, in-stock product worth offering alongside the current cart."""

    inventory_item_id: str
    name: str
    brand: str
    category: str
    price: Decimal
    is_controlled: bool = False


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

    @asynccontextmanager
    async def _elevated_for_cashier(self) -> AsyncGenerator[None]:
        """Temporarily widen this session's RLS role for one narrow, read-only history lookup.

        A cashier's own row-level policies scope pdv_sales/orders to sales they personally
        rang up (and zero marketplace orders at all) — the right default for browsing raw
        sales, but it starves the signals computed here (top products, recurrence,
        co-purchase) even though the result only ever surfaces already-in-stock product
        names back to the response, never a raw order/sale/customer row. Elevating to
        'pharmacist' for the duration of the read matches what CrmService.get_purchase_insights
        already grants a pharmacist for the exact same query, then restores the real role
        immediately after — a no-op for every role that isn't 'cashier'.
        """

        if self.session.bind is None or self.session.bind.dialect.name != "postgresql":
            yield
            return
        original_role = (await self.session.execute(text("SELECT current_setting('app.current_user_role', true)"))).scalar()
        if original_role != "cashier":
            yield
            return
        await self.session.execute(text("SELECT set_config('app.current_user_role', 'pharmacist', true)"))
        try:
            yield
        finally:
            await self.session.execute(
                text("SELECT set_config('app.current_user_role', :role, true)"), {"role": original_role}
            )

    async def get_customer_purchase_summary(self, *, tenant_id: str, customer_id: str) -> CustomerPurchaseSummary:
        """Return top products and recurrence candidates for one customer."""

        async with self._elevated_for_cashier():
            order_items = await self.order_repository.list_items_by_customer(tenant_id=tenant_id, customer_id=customer_id)
            sale_items = await self.pdv_repository.list_sale_items_by_customer(tenant_id=tenant_id, customer_id=customer_id)
            active_subscriptions = await self.subscription_repository.list_active_for_customer(tenant_id=tenant_id, customer_id=customer_id)

        by_product: dict[str, dict[str, object]] = {}
        dates_by_product: dict[str, list[datetime]] = {}

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
            dates_by_product.setdefault(key, []).append(created_at)

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

        subscribed_name_slugs = {slug_marketplace_value(subscription.product_name_snapshot) for subscription in active_subscriptions}

        continuous_use_names = await self._continuous_use_product_names(
            tenant_id=tenant_id, names=[str(data["name"]) for data in by_product.values()],
        )

        recurrence_candidates: list[RecurrenceCandidate] = []
        for key, data in by_product.items():
            name_slug = key.split("::")[0]
            if name_slug in subscribed_name_slugs:
                continue
            purchase_count = max(1, int(data["purchase_count"]))
            is_continuous_use = str(data["name"]).strip().lower() in continuous_use_names
            interval = self._detect_interval_pattern(dates_by_product[key])
            if interval is None and not is_continuous_use:
                continue
            if interval is not None:
                frequency_days, occurrences, interval_detected = interval[0], interval[1], True
            else:
                # Continuous-use medication, but not enough purchase history yet for a real
                # interval — still worth suggesting, using the clinical default cadence.
                frequency_days, occurrences, interval_detected = CONTINUOUS_USE_DEFAULT_FREQUENCY_DAYS, purchase_count, False
            avg_quantity = max(1, round(int(data["total_quantity"]) / purchase_count))
            last_unit_price = Decimal(data["last_price"])
            discounted_unit_price = (last_unit_price * (Decimal("100.00") - DEFAULT_RECURRENCE_DISCOUNT_PERCENT) / Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            savings_amount = ((last_unit_price - discounted_unit_price) * avg_quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            recurrence_candidates.append(
                RecurrenceCandidate(
                    product_key=key,
                    name=str(data["name"]),
                    brand=str(data["brand"]),
                    frequency_days=frequency_days,
                    occurrences=occurrences,
                    interval_detected=interval_detected,
                    continuous_use=is_continuous_use,
                    avg_quantity=avg_quantity,
                    last_unit_price=last_unit_price,
                    savings_amount=savings_amount,
                )
            )
        # Continuous-use medications first (a clinical fact outweighs a shopping pattern),
        # then by how many times the pattern was actually observed.
        recurrence_candidates.sort(key=lambda entry: (entry.continuous_use, entry.occurrences), reverse=True)
        return CustomerPurchaseSummary(top_products=top_products, recurrence_candidates=recurrence_candidates[:RECURRENCE_CANDIDATES_LIMIT])

    async def _continuous_use_product_names(self, *, tenant_id: str, names: list[str]) -> set[str]:
        """Return the lowercased names of products whose real bula/description marks them continuous-use."""

        products = await InventoryRepository(self.session).list_products_by_names(tenant_id=tenant_id, names=names)
        flagged = set()
        for product in products:
            text = ((product.bula_markdown or "") + " " + (product.short_description or "")).lower()
            if any(marker in text for marker in CONTINUOUS_USE_MARKERS):
                flagged.add(product.name.strip().lower())
        return flagged

    def _product_key(self, name: str, brand: str) -> str:
        """Return the cross-channel product identity key, matching the marketplace catalog grouping."""

        return slug_marketplace_value(name) + "::" + (slug_marketplace_value(brand) or "sem-marca")

    async def _resolve_brand_by_name(self, *, tenant_id: str, names: list[str]) -> dict[str, str]:
        """Return each product's current brand, by lowercased name — for signals that only kept a name.

        Favorites, back-in-stock requests, and view events don't snapshot a brand (unlike
        order/sale line items), so their product identity key needs one extra lookup
        against the live catalog before it can be compared to the purchase-based keys.
        """

        if not names:
            return {}
        products = await InventoryRepository(self.session).list_products_by_names(tenant_id=tenant_id, names=names)
        return {product.name.strip().lower(): product.brand_name for product in products}

    def _detect_interval_pattern(self, dates: list[datetime]) -> tuple[int, int] | None:
        """Detect the customer's own real recurring-purchase cadence for one product.

        Returns (frequency_days, occurrences) once the same interval has repeated at
        least RECURRENCE_OCCURRENCE_THRESHOLD times (3 purchases → 2 gaps between
        them), or None if there isn't a consistent enough pattern yet. Tolerance is
        proportional to the interval itself (±40%, minimum 5 days) so a customer who
        runs a few days early or late one cycle doesn't break the detected pattern —
        real purchase timing is never exactly regular.
        """

        unique_days = sorted({purchase_date.date() for purchase_date in dates})
        if len(unique_days) < RECURRENCE_OCCURRENCE_THRESHOLD:
            return None
        intervals = [(later - earlier).days for earlier, later in zip(unique_days, unique_days[1:]) if (later - earlier).days > 0]
        if len(intervals) < RECURRENCE_OCCURRENCE_THRESHOLD - 1:
            return None
        median_interval = median(intervals)
        if median_interval <= 0:
            return None
        tolerance = max(5.0, median_interval * 0.4)
        consistent_intervals = [interval for interval in intervals if abs(interval - median_interval) <= tolerance]
        if len(consistent_intervals) < RECURRENCE_OCCURRENCE_THRESHOLD - 1:
            return None
        return round(mean(consistent_intervals)), len(unique_days)

    def _distinct_transaction_counts(
        self, items: list[OrderItem] | list[PdvSaleItem], transaction_id_attr: str,
    ) -> tuple[Counter[str], dict[str, tuple[str, str]]]:
        """Count, per product, how many distinct orders/sales it appears in among `items`.

        Distinct transactions rather than raw line count or summed quantity — otherwise
        one bulk order/sale could alone make an unrelated product look like a strong
        cross-sell. Also returns a product_key -> (name, brand) lookup for display.
        """

        seen_transaction_products: set[tuple[str, str]] = set()
        counts: Counter[str] = Counter()
        labels: dict[str, tuple[str, str]] = {}
        for item in items:
            name = str(getattr(item, "item_name_snapshot", ""))
            brand = str(getattr(item, "brand_name_snapshot", ""))
            key = self._product_key(name, brand)
            transaction_id = str(getattr(item, transaction_id_attr))
            marker = (transaction_id, key)
            if marker in seen_transaction_products:
                continue
            seen_transaction_products.add(marker)
            counts[key] += 1
            labels.setdefault(key, (name, brand))
        return counts, labels

    async def get_cart_upsell_suggestions(
        self, *, tenant_id: str, store_id: str, customer_id: str, cart_pairs: list[tuple[str, str]],
    ) -> list[UpsellSuggestion]:
        """Recommend real, in-stock products worth offering alongside the current cart.

        Blends four signals from real order/sale history, weighted so the customer's own
        pattern outweighs the generic cross-customer one (see the WEIGHT_* constants):
        - global co-purchase: what sells well together with the cart's products, across
          every customer's past orders/sales (the "customers who bought X also bought Y"
          signal the whole store's history provides);
        - this customer's own co-purchase pattern: what THEY have bought alongside these
          same products before, if they've bought them before;
        - this customer's overall top products (their general shopping style) and
          recurrence candidates (their own purchase recurrence) that aren't already in
          the cart.
        Candidates are then resolved against real current-store stock (name-matched,
        quantity > 0) — a recommendation nobody can actually fulfill right now is worse
        than no recommendation.
        """

        if not cart_pairs and not customer_id:
            return []
        cart_keys = {self._product_key(name, brand) for name, brand in cart_pairs}
        scores: dict[str, float] = {}
        labels: dict[str, tuple[str, str]] = {}

        def add(counts: Counter[str], weight: float, key_labels: dict[str, tuple[str, str]]) -> None:
            for key, count in counts.items():
                if key in cart_keys:
                    continue
                scores[key] = scores.get(key, 0.0) + count * weight
                labels.setdefault(key, key_labels[key])

        async with self._elevated_for_cashier():
            global_order_items = await self.order_repository.list_items_for_orders_matching_products(tenant_id=tenant_id, name_brand_pairs=cart_pairs)
            global_sale_items = await self.pdv_repository.list_sale_items_for_sales_matching_products(tenant_id=tenant_id, name_brand_pairs=cart_pairs)
            order_counts, order_labels = self._distinct_transaction_counts(global_order_items, "order_id")
            sale_counts, sale_labels = self._distinct_transaction_counts(global_sale_items, "pdv_sale_id")
            add(order_counts, WEIGHT_GLOBAL_CO_PURCHASE, order_labels)
            add(sale_counts, WEIGHT_GLOBAL_CO_PURCHASE, sale_labels)

            if customer_id:
                personal_order_items = await self.order_repository.list_items_for_orders_matching_products(
                    tenant_id=tenant_id, name_brand_pairs=cart_pairs, customer_id=customer_id,
                )
                personal_sale_items = await self.pdv_repository.list_sale_items_for_sales_matching_products(
                    tenant_id=tenant_id, name_brand_pairs=cart_pairs, customer_id=customer_id,
                )
                personal_order_counts, personal_order_labels = self._distinct_transaction_counts(personal_order_items, "order_id")
                personal_sale_counts, personal_sale_labels = self._distinct_transaction_counts(personal_sale_items, "pdv_sale_id")
                add(personal_order_counts, WEIGHT_PERSONAL_CO_PURCHASE, personal_order_labels)
                add(personal_sale_counts, WEIGHT_PERSONAL_CO_PURCHASE, personal_sale_labels)

                summary = await self.get_customer_purchase_summary(tenant_id=tenant_id, customer_id=customer_id)
                for top_product in summary.top_products:
                    if top_product.product_key in cart_keys:
                        continue
                    scores[top_product.product_key] = scores.get(top_product.product_key, 0.0) + WEIGHT_PERSONAL_TOP_PRODUCT
                    labels.setdefault(top_product.product_key, (top_product.name, top_product.brand))
                for candidate in summary.recurrence_candidates:
                    if candidate.product_key in cart_keys:
                        continue
                    scores[candidate.product_key] = scores.get(candidate.product_key, 0.0) + WEIGHT_PERSONAL_RECURRENCE
                    labels.setdefault(candidate.product_key, (candidate.name, candidate.brand))

                # Browsing-interest signals: favorited products, back-in-stock requests
                # ("desejados"), and repeated product-page views — real cross-sell signals
                # even when the customer has never actually bought the product yet.
                favorites = await SavedProductRepository(self.session).list_for_customer(tenant_id=tenant_id, customer_id=customer_id)
                alerts = await ProductAvailabilityAlertRepository(self.session).list_for_customer(customer_id=customer_id)
                views = await ProductViewEventRepository(self.session).list_for_customer(tenant_id=tenant_id, customer_id=customer_id)

                names_needing_brand = {
                    record.product_name_snapshot.strip()
                    for record in (*favorites, *alerts, *views)
                    if record.product_name_snapshot.strip()
                }
                brand_by_name = await self._resolve_brand_by_name(tenant_id=tenant_id, names=list(names_needing_brand))

                def resolve_key(name: str) -> tuple[str, str] | None:
                    name = name.strip()
                    if not name:
                        return None
                    brand = brand_by_name.get(name.lower(), "")
                    key = self._product_key(name, brand)
                    return None if key in cart_keys else (key, brand)

                for favorite in favorites:
                    resolved = resolve_key(favorite.product_name_snapshot)
                    if resolved is None:
                        continue
                    key, brand = resolved
                    scores[key] = scores.get(key, 0.0) + WEIGHT_PERSONAL_FAVORITE
                    labels.setdefault(key, (favorite.product_name_snapshot.strip(), brand))

                for alert in alerts:
                    resolved = resolve_key(alert.product_name_snapshot)
                    if resolved is None:
                        continue
                    key, brand = resolved
                    scores[key] = scores.get(key, 0.0) + WEIGHT_PERSONAL_DESIRED
                    labels.setdefault(key, (alert.product_name_snapshot.strip(), brand))

                view_counts: Counter[str] = Counter()
                for view in views:
                    resolved = resolve_key(view.product_name_snapshot)
                    if resolved is None:
                        continue
                    key, brand = resolved
                    view_counts[key] += 1
                    labels.setdefault(key, (view.product_name_snapshot.strip(), brand))
                for key, count in view_counts.items():
                    scores[key] = scores.get(key, 0.0) + min(count, PRODUCT_VIEW_COUNT_CAP) * WEIGHT_PERSONAL_VIEW

        if not scores:
            return []

        ranked_keys = sorted(scores, key=lambda key: scores[key], reverse=True)
        store_items = await InventoryRepository(self.session).list_items(tenant_id=tenant_id, store_id=store_id, active_only=True)
        in_stock_by_name: dict[str, InventoryItem] = {}
        for item in store_items:
            if item.quantity > 0:
                in_stock_by_name.setdefault(item.name.strip().lower(), item)

        suggestions: list[UpsellSuggestion] = []
        for key in ranked_keys:
            name, _brand = labels[key]
            match = in_stock_by_name.get(name.strip().lower())
            if match is None:
                continue
            suggestions.append(
                UpsellSuggestion(
                    inventory_item_id=str(match.id),
                    name=match.name,
                    brand=match.brand_name,
                    category=match.category_name,
                    price=Decimal(match.sale_price),
                    is_controlled=match.is_controlled,
                )
            )
            if len(suggestions) >= UPSELL_SUGGESTIONS_LIMIT:
                break
        return suggestions
