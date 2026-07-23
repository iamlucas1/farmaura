"""
farmaura-api/app/services/purchase_analytics_service.py

Purchase analytics (ABC/XYZ) service for Farmaura.

Responsibilities:
- classify products by value (ABC, Pareto) and demand variability (XYZ,
  coefficient of variation) from realized sales;
- cross-reference each classified product with the best active purchase quote
  offer (Fase 1) to suggest what and how much to buy;

Observations:
- ABC only needs a revenue total, so it works from the first day of sales;
- XYZ needs at least two distinct months with sales to be meaningful — below
  that, xyz_class stays "" ("aguardando histórico") rather than guessing;
- when there is no sales history at all, the response carries an empty items
  list and total_products_with_sales=0 so the frontend can render an
  explanatory empty state instead of an empty table.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import ROUND_CEILING, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pricing import best_payment_offer
from app.models.purchase_quote import PurchaseQuote
from app.models.purchase_quote_item import PurchaseQuoteItem
from app.repositories.purchase_analytics_repository import (
    MonthlySalesRow,
    PurchaseAnalyticsRepository,
)
from app.repositories.purchase_quote_repository import PurchaseQuoteRepository
from app.schemas.auth import TokenSubject
from app.schemas.purchase_analytics import (
    PurchaseAnalyticsBestOfferResponse,
    PurchaseAnalyticsProductResponse,
    PurchaseAnalyticsResponse,
    PurchaseAnalyticsSummaryResponse,
)

TARGET_COVERAGE_MONTHS = Decimal("1")


@dataclass(slots=True)
class _ProductStats:
    """Aggregate demand stats for one product within the analysis window."""

    total_quantity: int
    total_revenue: Decimal
    months_with_sales: int
    average_monthly_quantity: Decimal
    xyz_class: str


_BestOffer = tuple[PurchaseQuoteItem, PurchaseQuote, Decimal, str]


# ============================================================================
# PURCHASE ANALYTICS SERVICE
# ============================================================================


class PurchaseAnalyticsService:
    """Build the ABC/XYZ purchase-planning view for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = PurchaseAnalyticsRepository(session)
        self.quote_repository = PurchaseQuoteRepository(session)

    async def build_purchase_plan(
        self,
        *,
        months: int = 12,
        category_id: str = "",
        abc_class_filter: str = "",
        xyz_class_filter: str = "",
    ) -> PurchaseAnalyticsResponse:
        """Classify products by ABC/XYZ and suggest purchases from active quotes."""

        months = max(1, min(months, 24))
        today = date.today()
        since_date = self._months_ago_first_day(today, months)
        since_datetime = datetime.combine(since_date, time.min, tzinfo=UTC)
        month_range = self._month_range(since_date, months)

        rows = await self.repository.monthly_sales_by_product(
            tenant_id=str(self.subject.tenant_id),
            since=since_datetime,
            category_id=category_id,
        )
        by_product: dict[str, dict[date, MonthlySalesRow]] = defaultdict(dict)
        for row in rows:
            by_product[row.product_id][row.month] = row

        if not by_product:
            return PurchaseAnalyticsResponse(
                summary=PurchaseAnalyticsSummaryResponse(
                    months=months,
                    months_with_data=0,
                    total_products_with_sales=0,
                    class_a_count=0,
                    class_b_count=0,
                    class_c_count=0,
                    class_a_without_offer_count=0,
                    total_revenue_analyzed=Decimal("0.00"),
                ),
                items=[],
            )

        product_ids = list(by_product.keys())
        stock_by_product = await self.repository.current_stock_by_product(
            tenant_id=str(self.subject.tenant_id)
        )
        identities = await self.repository.product_identity_by_ids(
            tenant_id=str(self.subject.tenant_id),
            product_ids=product_ids,
        )
        offers_by_product = await self._best_offers_by_product(product_ids)

        months_with_data_overall: set[date] = set()
        stats: dict[str, _ProductStats] = {}
        for product_id, month_map in by_product.items():
            series = [month_map[m].quantity if m in month_map else 0 for m in month_range]
            total_quantity = sum(series)
            total_revenue = sum((month_map[m].revenue for m in month_map), Decimal("0.00"))
            months_with_sales = sum(1 for quantity in series if quantity > 0)
            months_with_data_overall.update(month_map.keys())
            average_monthly_quantity = (
                Decimal(total_quantity) / Decimal(len(month_range))
            ).quantize(Decimal("0.01"))
            xyz_class = ""
            if months_with_sales >= 2 and average_monthly_quantity > 0:
                mean = total_quantity / len(month_range)
                coefficient_of_variation = statistics.pstdev(series) / mean
                xyz_class = (
                    "X"
                    if coefficient_of_variation < 0.5
                    else ("Y" if coefficient_of_variation < 1.0 else "Z")
                )
            stats[product_id] = _ProductStats(
                total_quantity=total_quantity,
                total_revenue=total_revenue,
                months_with_sales=months_with_sales,
                average_monthly_quantity=average_monthly_quantity,
                xyz_class=xyz_class,
            )

        abc_by_product = self._classify_abc(stats)

        class_a_count = 0
        class_b_count = 0
        class_c_count = 0
        class_a_without_offer_count = 0
        items: list[PurchaseAnalyticsProductResponse] = []
        for product_id, product_stats in stats.items():
            product = identities.get(product_id)
            if product is None:
                continue
            abc_class = abc_by_product[product_id]
            current_stock = stock_by_product.get(product_id, 0)
            coverage_days = self._coverage_days(
                current_stock, product_stats.average_monthly_quantity
            )
            suggested_quantity = self._suggested_purchase_quantity(
                current_stock, product_stats.average_monthly_quantity
            )
            best_offer = self._serialize_best_offer(offers_by_product.get(product_id))

            if abc_class == "A":
                class_a_count += 1
                if best_offer is None:
                    class_a_without_offer_count += 1
            elif abc_class == "B":
                class_b_count += 1
            else:
                class_c_count += 1

            if abc_class_filter and abc_class != abc_class_filter:
                continue
            if xyz_class_filter and product_stats.xyz_class != xyz_class_filter:
                continue

            items.append(
                PurchaseAnalyticsProductResponse(
                    product_id=product_id,
                    name=product.name,
                    brand_name=product.brand_name,
                    category_name=product.category_name,
                    abc_class=abc_class,
                    xyz_class=product_stats.xyz_class,
                    months_with_sales=product_stats.months_with_sales,
                    total_quantity=product_stats.total_quantity,
                    total_revenue=product_stats.total_revenue,
                    average_monthly_quantity=product_stats.average_monthly_quantity,
                    current_stock=current_stock,
                    coverage_days=coverage_days,
                    suggested_purchase_quantity=suggested_quantity,
                    best_offer=best_offer,
                )
            )
        items.sort(key=lambda entry: entry.total_revenue, reverse=True)

        grand_total_revenue = sum((s.total_revenue for s in stats.values()), Decimal("0.00"))
        summary = PurchaseAnalyticsSummaryResponse(
            months=months,
            months_with_data=len(months_with_data_overall),
            total_products_with_sales=len(stats),
            class_a_count=class_a_count,
            class_b_count=class_b_count,
            class_c_count=class_c_count,
            class_a_without_offer_count=class_a_without_offer_count,
            total_revenue_analyzed=grand_total_revenue,
        )
        return PurchaseAnalyticsResponse(summary=summary, items=items)

    async def _best_offers_by_product(self, product_ids: list[str]) -> dict[str, _BestOffer]:
        """Return the lowest-effective-price confirmed quote offer per product."""

        pairs = await self.quote_repository.list_confirmed_items_by_product_ids(
            tenant_id=str(self.subject.tenant_id),
            product_ids=product_ids,
            as_of=date.today(),
        )
        best: dict[str, _BestOffer] = {}
        for item, quote in pairs:
            assert item.product_id is not None
            effective_price, method, _discount = best_payment_offer(
                item.unit_price, quote.payment_terms
            )
            existing = best.get(item.product_id)
            if existing is None or effective_price < existing[2]:
                best[item.product_id] = (item, quote, effective_price, method)
        return best

    def _serialize_best_offer(
        self, offer: _BestOffer | None
    ) -> PurchaseAnalyticsBestOfferResponse | None:
        """Serialize the best offer tuple into its response schema."""

        if offer is None:
            return None
        _item, quote, effective_price, method = offer
        return PurchaseAnalyticsBestOfferResponse(
            quote_id=quote.id,
            supplier_name=quote.supplier_name_snapshot,
            effective_price=effective_price,
            payment_method=method,
            freight_type=quote.freight_type,
            freight_cost=quote.freight_cost,
            delivery_time_days=quote.delivery_time_days,
            quote_date=quote.quote_date,
        )

    def _classify_abc(self, stats: dict[str, _ProductStats]) -> dict[str, str]:
        """Assign ABC classes from cumulative revenue share (Pareto 80/95)."""

        ordered = sorted(stats.items(), key=lambda entry: entry[1].total_revenue, reverse=True)
        grand_total = sum((s.total_revenue for _, s in ordered), Decimal("0.00"))
        cumulative = Decimal("0.00")
        result: dict[str, str] = {}
        for product_id, product_stats in ordered:
            cumulative += product_stats.total_revenue
            share = (
                (cumulative / grand_total * Decimal("100")) if grand_total > 0 else Decimal("100")
            )
            result[product_id] = "A" if share <= 80 else ("B" if share <= 95 else "C")
        return result

    def _coverage_days(
        self, current_stock: int, average_monthly_quantity: Decimal
    ) -> Decimal | None:
        """Return how many days the current stock covers at the average monthly pace."""

        if average_monthly_quantity <= 0:
            return None
        return (Decimal(current_stock) / average_monthly_quantity * Decimal("30")).quantize(
            Decimal("0.1")
        )

    def _suggested_purchase_quantity(
        self, current_stock: int, average_monthly_quantity: Decimal
    ) -> int:
        """Suggest a purchase quantity to reach one month of target coverage."""

        raw_suggestion = average_monthly_quantity * TARGET_COVERAGE_MONTHS - Decimal(current_stock)
        if raw_suggestion <= 0:
            return 0
        return int(raw_suggestion.to_integral_value(rounding=ROUND_CEILING))

    def _months_ago_first_day(self, today: date, months: int) -> date:
        """Return the first day of the month that starts the analysis window."""

        total_months = today.year * 12 + (today.month - 1) - (months - 1)
        year, month_index = divmod(total_months, 12)
        return date(year, month_index + 1, 1)

    def _month_range(self, since_date: date, months: int) -> list[date]:
        """Return the first-of-month dates covering the analysis window."""

        result: list[date] = []
        year, month = since_date.year, since_date.month
        for _ in range(months):
            result.append(date(year, month, 1))
            month += 1
            if month > 12:
                month = 1
                year += 1
        return result
