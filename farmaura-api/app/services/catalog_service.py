"""
farmaura-api/app/services/catalog_service.py

Catalog service for Farmaura.

Responsibilities:
- list customer-facing grouped marketplace products;
- apply pagination and availability rules over operational inventory;
- attach persisted review summaries to catalog products;

Observations:
- customer-facing grouping hides lot-level detail intentionally;
- pricing, stock, and review summaries remain server-authoritative.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_cached_json, set_cached_json
from app.core.device_detection import detect_device_type
from app.core.tenant_context import apply_public_marketplace_context
from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.pricing_promotion import PricingPromotion
from app.models.product_review import ProductReview
from app.models.user import User
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.auth import TokenSubject
from app.schemas.catalog import CatalogItem, CatalogListResponse, CatalogReviewSummary, PublicCatalogItem, PublicCatalogListResponse
from app.schemas.portal import PortalProductReviewResponse
from app.services.marketplace_projection import build_marketplace_catalog_groups, compute_effective_price, quantize_money
from app.services.pricing_promotion_service import compute_discount_percent, find_best_promotion, resolve_customer_promotion_profile


# ============================================================================
# CATALOG SERVICE
# ============================================================================


CATALOG_CACHE_NAMESPACE = "catalog:grouped"


class CatalogService:
    """Provide catalog listing use-cases."""

    def __init__(self, session: AsyncSession) -> None:
        """Store repository dependencies."""

        self.session = session
        self.repository = InventoryRepository(session)

    async def list_products(
        self,
        *,
        tenant_id: str,
        page: int,
        page_size: int,
        subject: TokenSubject | None = None,
        user_agent: str = "",
    ) -> CatalogListResponse:
        """Return a paginated grouped marketplace catalog for one tenant.

        When an authenticated customer subject is provided, active pricing promotions are
        evaluated server-side and applied on top of the manually configured price/promo —
        never below it — so the storefront price can never be spoofed from the client.
        """

        grouped = await self._list_grouped_products(tenant_id=tenant_id)
        if subject is not None:
            grouped = await self._apply_personalized_promotions(
                tenant_id=tenant_id, subject=subject, user_agent=user_agent, grouped=grouped
            )
        review_summary_map = await self._build_review_summary_map(tenant_id=tenant_id, grouped=grouped)
        total = len(grouped)
        offset = (page - 1) * page_size
        paginated = grouped[offset:offset + page_size]
        items = [
            CatalogItem(
                id=str(item['id']),
                sku=str(item['sku']),
                ean=str(item['ean']),
                name=str(item['name']),
                brand=str(item['brand']),
                category=str(item['cat']),
                subcategory=str(item['sub']),
                description=str(item['description']),
                image_url=str(item.get('image_url', '')),
                image_alt=str(item.get('image_alt', '')),
                image_policy=str(item.get('image_policy', 'placeholder_only')),
                gallery=list(item.get('gallery', [])),
                price=item['price'],
                old_price=item['old_price'],
                discount_percent=int(item['discount_percent']),
                requires_prescription=bool(item['requires_prescription']),
                stock=int(item['stock']),
                is_available=bool(item['is_available']),
                tags=list(item['tags']),
                info=str(item['info']),
                aliases=list(item['aliases']),
                inventory_ids=list(item['inventory_ids']),
                review_summary=review_summary_map.get(str(item['id']), CatalogReviewSummary()),
            )
            for item in paginated
        ]
        return CatalogListResponse(items=items, page=page, page_size=page_size, total=total)

    async def list_public_products(self, *, page: int, page_size: int) -> PublicCatalogListResponse:
        """Return a paginated public marketplace catalog with limited fields."""

        tenant_id = await self._resolve_public_tenant_id()
        if not tenant_id:
            return PublicCatalogListResponse(items=[], page=page, page_size=page_size, total=0)
        await apply_public_marketplace_context(self.session, tenant_id)
        grouped = await self._list_grouped_products(tenant_id=tenant_id)
        review_summary_map = await self._build_review_summary_map(tenant_id=tenant_id, grouped=grouped)
        total = len(grouped)
        offset = (page - 1) * page_size
        paginated = grouped[offset:offset + page_size]
        items = [
            PublicCatalogItem(
                id=str(item['id']),
                name=str(item['name']),
                brand=str(item['brand']),
                category=str(item['cat']),
                subcategory=str(item['sub']),
                description=str(item['description']),
                image_url=str(item.get('image_url', '')),
                image_alt=str(item.get('image_alt', '')),
                image_policy=str(item.get('image_policy', 'placeholder_only')),
                gallery=list(item.get('gallery', [])),
                price=item['price'],
                old_price=item['old_price'],
                discount_percent=int(item['discount_percent']),
                requires_prescription=bool(item['requires_prescription']),
                stock=int(item['stock']),
                tags=list(item['tags']),
                info=str(item['info']),
                review_summary=review_summary_map.get(str(item['id']), CatalogReviewSummary()),
            )
            for item in paginated
        ]
        return PublicCatalogListResponse(items=items, page=page, page_size=page_size, total=total)

    async def _apply_personalized_promotions(
        self,
        *,
        tenant_id: str,
        subject: TokenSubject,
        user_agent: str,
        grouped: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        """Override grouped catalog pricing with the best-matching active promotion, per customer."""

        promotions = list(
            (
                await self.session.execute(
                    select(PricingPromotion).where(PricingPromotion.tenant_id == tenant_id, PricingPromotion.is_active.is_(True))
                )
            )
            .scalars()
            .all()
        )
        if not promotions:
            return grouped
        user = (
            await self.session.execute(select(User).where(User.id == subject.user_id, User.tenant_id == tenant_id))
        ).scalar_one_or_none()
        if user is None:
            return grouped
        customer = (
            await self.session.execute(select(Customer).where(Customer.tenant_id == tenant_id, Customer.email == user.email))
        ).scalar_one_or_none()
        if customer is None:
            return grouped
        primary_address = (
            await self.session.execute(
                select(CustomerAddress).where(CustomerAddress.customer_id == customer.id, CustomerAddress.is_primary.is_(True))
            )
        ).scalar_one_or_none()
        device_type = detect_device_type(user_agent)
        profile = resolve_customer_promotion_profile(customer=customer, primary_address=primary_address, device_type=device_type)
        now = datetime.now(tz=UTC)
        if device_type and customer.last_device_type != device_type:
            try:
                customer.last_device_type = device_type
                customer.last_device_seen_at = now
                await self.session.commit()
            except Exception:
                await self.session.rollback()
        for item in grouped:
            old_price_raw = item.get('old_price')
            base_price = quantize_money(Decimal(str(old_price_raw)) if old_price_raw is not None else Decimal(str(item['price'])))
            promotion = find_best_promotion(promotions, category=str(item['cat']), product_name=str(item['name']), profile=profile, now=now)
            if promotion is None:
                continue
            promo_percent = compute_discount_percent(promotion, base_price=base_price)
            current_discount_percent = int(str(item['discount_percent']))
            if promo_percent <= current_discount_percent:
                continue
            item['price'] = compute_effective_price(base_price, promo_percent)
            item['old_price'] = base_price
            item['discount_percent'] = int(promo_percent)
            tags = item['tags']
            if isinstance(tags, list) and 'oferta' not in tags:
                item['tags'] = [*tags, 'oferta']
        return grouped

    async def _list_grouped_products(self, *, tenant_id: str) -> list[dict[str, object]]:
        """Return grouped marketplace products for one tenant, merged across every active store.

        Browsing never pins one store: build_marketplace_catalog_groups already sums stock
        across inventory items sharing the same name/brand, so a product carried in any store
        shows real availability instead of "indisponível" just because a single reference
        store happened to be out — which store actually fulfills the order is resolved later,
        at checkout, against the customer's address.
        """

        cached = await get_cached_json(CATALOG_CACHE_NAMESPACE, tenant_id, "grouped")
        if cached is not None:
            return cached
        inventory_items = await self.repository.list_items(tenant_id=tenant_id, store_id="", active_only=True)
        grouped = build_marketplace_catalog_groups([
            item for item in inventory_items
            if getattr(item, 'sale_price', None) is not None and item.sale_price > 0
        ])
        await set_cached_json(CATALOG_CACHE_NAMESPACE, tenant_id, "grouped", grouped)
        return grouped

    async def _build_review_summary_map(self, *, tenant_id: str, grouped: list[dict[str, object]]) -> dict[str, CatalogReviewSummary]:
        """Return persisted review summaries keyed by grouped product id."""

        inventory_ids = sorted({inventory_id for group in grouped for inventory_id in group.get('inventory_ids', []) if inventory_id})
        if not inventory_ids:
            return {}
        statement = select(ProductReview).where(ProductReview.tenant_id == tenant_id, ProductReview.is_published.is_(True), or_(ProductReview.inventory_item_id.in_(inventory_ids), ProductReview.product_ref.in_([str(group['id']) for group in grouped])))
        reviews = list((await self.session.execute(statement)).scalars().all())
        review_map: dict[str, list[ProductReview]] = {str(group['id']): [] for group in grouped}
        inventory_to_group: dict[str, str] = {}
        for group in grouped:
            group_id = str(group['id'])
            for inventory_id in group.get('inventory_ids', []):
                inventory_to_group[str(inventory_id)] = group_id
        for review in reviews:
            if review.inventory_item_id and str(review.inventory_item_id) in inventory_to_group:
                review_map.setdefault(inventory_to_group[str(review.inventory_item_id)], []).append(review)
                continue
            if review.product_ref in review_map:
                review_map.setdefault(review.product_ref, []).append(review)
        result: dict[str, CatalogReviewSummary] = {}
        for group in grouped:
            group_id = str(group['id'])
            entries = sorted(review_map.get(group_id, []), key=lambda item: item.created_at, reverse=True)
            if entries:
                average = Decimal(sum(int(item.rating or 0) for item in entries) / len(entries)).quantize(Decimal('0.1'))
            else:
                average = Decimal('0.0')
            comments = [
                PortalProductReviewResponse(
                    id=item.id,
                    product_ref=item.product_ref,
                    reviewer_name=item.reviewer_name_snapshot,
                    reviewer_avatar_initials=item.reviewer_avatar_initials,
                    title=item.title,
                    body=item.body,
                    rating=int(item.rating or 0),
                    helpful_count=int(item.helpful_count or 0),
                    is_verified_purchase=bool(item.is_verified_purchase),
                    submitted_at=item.submitted_at_label or item.created_at.astimezone().strftime('%d/%m/%Y'),
                )
                for item in entries[:8]
            ]
            result[group_id] = CatalogReviewSummary(rating_average=average, review_count=len(entries), comments=comments)
        return result

    async def _resolve_public_tenant_id(self) -> str:
        """Return the first tenant that has active sellable inventory.

        Runs through a SECURITY DEFINER function rather than a plain ORM query: this
        lookup is inherently cross-tenant (there is no tenant context yet for an
        anonymous visitor), so it must bypass row-level security narrowly for this one
        read — it returns only a tenant id, never product data.
        """

        tenant_id = (await self.session.execute(text("SELECT app_private.resolve_public_marketplace_tenant_id()"))).scalar_one_or_none()
        return str(tenant_id or '')
