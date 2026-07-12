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

from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory_item import InventoryItem
from app.models.product_review import ProductReview
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.catalog import CatalogItem, CatalogListResponse, CatalogReviewSummary, PublicCatalogItem, PublicCatalogListResponse
from app.schemas.portal import PortalProductReviewResponse
from app.services.marketplace_projection import build_marketplace_catalog_groups


# ============================================================================
# CATALOG SERVICE
# ============================================================================


class CatalogService:
    """Provide catalog listing use-cases."""

    def __init__(self, session: AsyncSession) -> None:
        """Store repository dependencies."""

        self.session = session
        self.repository = InventoryRepository(session)

    async def list_products(self, *, tenant_id: str, page: int, page_size: int) -> CatalogListResponse:
        """Return a paginated grouped marketplace catalog for one tenant."""

        grouped = await self._list_grouped_products(tenant_id=tenant_id)
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

    async def _list_grouped_products(self, *, tenant_id: str) -> list[dict[str, object]]:
        """Return grouped marketplace products for one tenant."""

        store_id = await self.repository.get_primary_store_id(tenant_id=tenant_id)
        inventory_items = await self.repository.list_items(tenant_id=tenant_id, store_id=store_id, active_only=True)
        return build_marketplace_catalog_groups([
            item for item in inventory_items
            if getattr(item, 'sale_price', None) is not None and item.sale_price > 0 and getattr(item, 'is_marketplace_visible', True)
        ])

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
        """Return the first tenant that has active sellable inventory."""

        statement = select(InventoryItem.tenant_id).where(InventoryItem.is_active.is_(True), InventoryItem.sale_price.is_not(None), InventoryItem.sale_price > 0).order_by(InventoryItem.created_at.asc()).limit(1)
        tenant_id = (await self.session.execute(statement)).scalar_one_or_none()
        return str(tenant_id or '')
