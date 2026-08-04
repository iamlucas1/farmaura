"""
farmaura-api/app/services/deal_suggestion_service.py

"Ofertas do dia" suggestion engine for Farmaura.

Responsibilities:
- rank/list candidate products for the admin to curate into the "ofertas do dia" home section,
  from 5 independent sources: sales volume, profit margin, active promotion campaign, active
  direct discount, active coupon;
- draw a randomized selection across those same 5 sources (plus a plain-random pool), following
  admin-configured category/brand/count parameters, for `mode="auto"`'s daily cycle;
- read-only in the sense that it never persists — both manual curation
  (`PortalService.update_deal_of_the_day`) and the auto-generated selection
  (`PortalService._resolve_deal_of_the_day`/`regenerate_deal_of_the_day`) are saved by the caller.

Observations:
- every returned `DealSuggestionItem.ref` is already in the "inv-<InventoryItem.id>" format the
  curated list expects (see `PortalService._saved_product_ref`), so the console (or the
  auto-generator) can add a suggestion to the curated list as-is, with no extra translation step;
- promotion/coupon/discount matching reuses the exact same scope predicates already proven at
  checkout (`pricing_promotion_service.list_matching_inventory_items`,
  `coupon_service.list_matching_inventory_items`) — never a second, potentially-diverging notion
  of "what does this campaign apply to";
- constructed with a bare `tenant_id`, not a `TokenSubject` — no method here needs role/user info,
  permission is already enforced at the route layer (`require_internal_subject`), and
  `mode="auto"`'s lazy regeneration runs from `PortalService._resolve_deal_of_the_day`, which is
  also called on the anonymous public bootstrap (no subject exists there at all).
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon_campaign import CouponCampaign
from app.models.inventory_item import InventoryItem
from app.models.pricing_promotion import PricingPromotion
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.purchase_analytics_repository import PurchaseAnalyticsRepository
from app.schemas.portal import DealOfTheDayAutoParams, DealSuggestionItem, DealSuggestionListResponse
from app.services.coupon_service import list_matching_inventory_items as list_coupon_matches
from app.services.pricing_promotion_service import list_matching_inventory_items as list_promotion_matches

# Mirrors PortalDealOfTheDayResponse.product_refs's own Field(max_length=...) — kept here too since
# generate_auto_selection assembles the list itself instead of relying on the schema to cap it.
MAX_DEAL_PRODUCTS = 30

# ============================================================================
# HELPERS
# ============================================================================


def _item_ref(item: InventoryItem) -> str:
    """Return the "inv-<id>" ref format the curated product_refs list stores."""

    return "inv-" + str(item.id)


def _margin_percent(item: InventoryItem) -> Decimal:
    """Return one item's current profit margin as a percentage of its sale price."""

    if not item.sale_price or item.sale_price <= 0:
        return Decimal("0")
    return (item.sale_price - item.acquisition_cost) / item.sale_price * Decimal("100")


def _matches_eligibility(*, category: str, brand: str, categories: list[str], brands: list[str]) -> bool:
    """Return whether one product's category/brand falls within the auto-generator's filters.

    Empty `categories`/`brands` means "no restriction on this axis" — same opt-in-only convention
    already used by `PricingPromotion.target_categories`/`target_products`.
    """

    if categories and category.strip().lower() not in {value.strip().lower() for value in categories}:
        return False
    if brands and brand.strip().lower() not in {value.strip().lower() for value in brands}:
        return False
    return True


# ============================================================================
# DEAL SUGGESTION SERVICE
# ============================================================================


class DealSuggestionService:
    """Suggest, and randomly assemble, "ofertas do dia" candidates from real sales/campaign data."""

    def __init__(self, *, session: AsyncSession, tenant_id: str) -> None:
        """Store the session and the tenant every query is scoped to."""

        self.session = session
        self.tenant_id = tenant_id
        self.inventory_repository = InventoryRepository(session)
        self.analytics_repository = PurchaseAnalyticsRepository(session)

    async def _list_visible_inventory_items(self) -> list[InventoryItem]:
        """Return every active, marketplace-visible, priced inventory item for the tenant."""

        items = await self.inventory_repository.list_items(tenant_id=self.tenant_id, store_id="", active_only=True)
        return [item for item in items if item.is_marketplace_visible and item.sale_price and item.sale_price > 0]

    async def list_bestsellers(self, *, months: int, limit: int) -> DealSuggestionListResponse:
        """Rank products by realized sales volume (online + PDV) over the trailing window."""

        since = datetime.now(UTC) - timedelta(days=months * 30)
        rows = await self.analytics_repository.monthly_sales_by_product(tenant_id=self.tenant_id, since=since)
        if not rows:
            return DealSuggestionListResponse()

        quantity_by_product: dict[str, int] = {}
        for row in rows:
            quantity_by_product[row.product_id] = quantity_by_product.get(row.product_id, 0) + row.quantity
        ranked_product_ids = sorted(quantity_by_product, key=lambda pid: quantity_by_product[pid], reverse=True)[:limit]

        identities = await self.analytics_repository.product_identity_by_ids(tenant_id=self.tenant_id, product_ids=ranked_product_ids)
        representatives = await self.analytics_repository.representative_inventory_item_by_product(
            tenant_id=self.tenant_id, product_ids=ranked_product_ids
        )

        items: list[DealSuggestionItem] = []
        for product_id in ranked_product_ids:
            item = representatives.get(product_id)
            identity = identities.get(product_id)
            if item is None or identity is None:
                continue
            quantity = quantity_by_product[product_id]
            items.append(DealSuggestionItem(
                ref=_item_ref(item),
                name=identity.name,
                brand=identity.brand_name,
                category=identity.category_name,
                price=item.sale_price,
                stock=item.quantity,
                metric_label=f"{quantity} vendido(s) nos últimos {months} meses",
                metric_value=Decimal(quantity),
            ))
        return DealSuggestionListResponse(items=items)

    async def list_best_margins(self, *, limit: int) -> DealSuggestionListResponse:
        """Rank marketplace-visible items by current profit margin percentage."""

        candidates = await self._list_visible_inventory_items()
        candidates.sort(key=_margin_percent, reverse=True)
        items = [
            DealSuggestionItem(
                ref=_item_ref(item),
                name=item.name,
                brand=item.brand_name,
                category=item.category_name,
                price=item.sale_price,
                stock=item.quantity,
                metric_label=f"{_margin_percent(item):.0f}% de margem",
                metric_value=_margin_percent(item),
            )
            for item in candidates[:limit]
        ]
        return DealSuggestionListResponse(items=items)

    async def _list_active_promotions(self, *, kind: str) -> list[PricingPromotion]:
        statement = select(PricingPromotion).where(
            PricingPromotion.tenant_id == self.tenant_id,
            PricingPromotion.is_active.is_(True),
            PricingPromotion.kind == kind,
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def _list_promotion_kind_matches(self, *, kind: str, limit: int, label_prefix: str) -> DealSuggestionListResponse:
        promotions = await self._list_active_promotions(kind=kind)
        if not promotions:
            return DealSuggestionListResponse()
        visible_items = await self._list_visible_inventory_items()
        now = datetime.now(UTC)

        seen_ids: set[str] = set()
        items: list[DealSuggestionItem] = []
        for promotion in promotions:
            for item in list_promotion_matches(promotion, visible_items, now=now):
                if item.id in seen_ids:
                    continue
                seen_ids.add(item.id)
                items.append(DealSuggestionItem(
                    ref=_item_ref(item),
                    name=item.name,
                    brand=item.brand_name,
                    category=item.category_name,
                    price=item.sale_price,
                    stock=item.quantity,
                    metric_label=f"{label_prefix}: {promotion.name}",
                ))
                if len(items) >= limit:
                    return DealSuggestionListResponse(items=items)
        return DealSuggestionListResponse(items=items)

    async def list_active_promotion_products(self, *, limit: int) -> DealSuggestionListResponse:
        """List products currently matched by an active campaign-kind promotion."""

        return await self._list_promotion_kind_matches(kind="campaign", limit=limit, label_prefix="Promoção")

    async def list_active_discount_products(self, *, limit: int) -> DealSuggestionListResponse:
        """List products currently marked down via a direct product_discount promotion."""

        return await self._list_promotion_kind_matches(kind="product_discount", limit=limit, label_prefix="Desconto")

    async def list_active_coupon_products(self, *, limit: int) -> DealSuggestionListResponse:
        """List products currently targeted by an active coupon campaign."""

        statement = select(CouponCampaign).where(
            CouponCampaign.tenant_id == self.tenant_id,
            CouponCampaign.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        campaigns = list(result.scalars().all())
        if not campaigns:
            return DealSuggestionListResponse()
        visible_items = await self._list_visible_inventory_items()
        now = datetime.now(UTC)

        seen_ids: set[str] = set()
        items: list[DealSuggestionItem] = []
        for campaign in campaigns:
            for item in list_coupon_matches(campaign, visible_items, now=now):
                if item.id in seen_ids:
                    continue
                seen_ids.add(item.id)
                items.append(DealSuggestionItem(
                    ref=_item_ref(item),
                    name=item.name,
                    brand=item.brand_name,
                    category=item.category_name,
                    price=item.sale_price,
                    stock=item.quantity,
                    metric_label=f"Cupom: {campaign.code}",
                ))
                if len(items) >= limit:
                    return DealSuggestionListResponse(items=items)
        return DealSuggestionListResponse(items=items)

    async def generate_auto_selection(self, *, params: DealOfTheDayAutoParams) -> list[str]:
        """Randomly assemble a fresh "ofertas do dia" ref list from `params`, for `mode="auto"`.

        Draws `count_<source>` items at random from each of the 5 existing suggestion sources
        (restricted to `params.categories`/`.brands` when set), plus `count_random` items drawn
        directly from the eligible pool with no source ranking at all. The combined list is
        shuffled once more before returning, so it doesn't read as "grouped by source", and capped
        at `MAX_DEAL_PRODUCTS` regardless of how the counts sum up.
        """

        picked_refs: list[str] = []
        seen_refs: set[str] = set()

        def eligible(candidate) -> bool:
            return _matches_eligibility(
                category=getattr(candidate, "category", None) or getattr(candidate, "category_name", ""),
                brand=getattr(candidate, "brand", None) or getattr(candidate, "brand_name", ""),
                categories=params.categories,
                brands=params.brands,
            )

        def draw(candidates, ref_of, count: int) -> None:
            if count <= 0:
                return
            pool = [candidate for candidate in candidates if eligible(candidate) and ref_of(candidate) not in seen_refs]
            random.shuffle(pool)
            for candidate in pool[:count]:
                ref = ref_of(candidate)
                picked_refs.append(ref)
                seen_refs.add(ref)

        # Fetch a generous limit per source (not just the requested count) so there's a real pool
        # to shuffle and draw from, rather than always picking the same top-N deterministically.
        source_limit = 50
        if params.count_bestsellers:
            draw((await self.list_bestsellers(months=3, limit=source_limit)).items, lambda i: i.ref, params.count_bestsellers)
        if params.count_margins:
            draw((await self.list_best_margins(limit=source_limit)).items, lambda i: i.ref, params.count_margins)
        if params.count_promotions:
            draw((await self.list_active_promotion_products(limit=source_limit)).items, lambda i: i.ref, params.count_promotions)
        if params.count_discounts:
            draw((await self.list_active_discount_products(limit=source_limit)).items, lambda i: i.ref, params.count_discounts)
        if params.count_coupons:
            draw((await self.list_active_coupon_products(limit=source_limit)).items, lambda i: i.ref, params.count_coupons)
        if params.count_random:
            visible_items = await self._list_visible_inventory_items()
            draw(visible_items, _item_ref, params.count_random)

        random.shuffle(picked_refs)
        return picked_refs[:MAX_DEAL_PRODUCTS]
