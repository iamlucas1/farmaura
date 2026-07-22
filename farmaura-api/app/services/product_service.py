"""
farmaura-api/app/services/product_service.py

Product service for Farmaura.

Responsibilities:
- execute product identity/configuration registration and maintenance
  use-cases (SKU, brand, category, therapeutic class, EAN, controlled/
  generic flags, marketplace images);
- link a product to a store as a zero-stock inventory item, ready to be
  counted later in the stock screen;
- assemble internal console responses from repository models.

Observations:
- store-scoped stock operations (quantity, movements, transfers, pricing)
  stay in InventoryService; this service only owns product identity;
- find_or_create_by_ean backs the invoice-import automation, the one
  legitimate case where a product is created implicitly from supplier data
  rather than through an explicit admin action — a human creating a product
  by hand always goes through create_product, which never silently merges.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.core.tenant_context import apply_tenant_context
from app.models.inventory_item import InventoryItem
from app.models.inventory_product import InventoryProduct
from app.repositories.brand_repository import BrandRepository
from app.repositories.category_repository import CategoryRepository
from app.repositories.inventory_repository import InventoryRepository
from app.repositories.store_repository import StoreRepository
from app.repositories.therapeutic_class_repository import TherapeuticClassRepository
from app.schemas.auth import TokenSubject
from app.schemas.inventory import InventoryItemResponse
from app.schemas.product import (
    ProductCreateRequest,
    ProductDiscardUpdateRequest,
    ProductListResponse,
    ProductResponse,
    ProductStatusUpdateRequest,
    ProductStoreLinkRequest,
    ProductStoreLinksResponse,
    ProductStoreSummary,
    ProductUpdateRequest,
)
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE
from app.services.marketplace_projection import is_marketplace_image_restricted


# ============================================================================
# PRODUCT SERVICE
# ============================================================================


class ProductService:
    """Provide product use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = InventoryRepository(session)
        self.store_repository = StoreRepository(session)
        self.brand_repository = BrandRepository(session)
        self.category_repository = CategoryRepository(session)
        self.therapeutic_class_repository = TherapeuticClassRepository(session)

    async def _reapply_tenant_context(self) -> None:
        """Reapply RLS session context after a commit.

        `apply_tenant_context` sets Postgres session variables as transaction-local
        (`set_config(..., true)`), and `inventory_products`/`inventory_items` enforce
        `FORCE ROW LEVEL SECURITY`. Committing ends that transaction and clears the
        variables, so any read issued afterward (refresh, a follow-up repository
        query) would see zero rows unless the context is set again first.
        """

        await apply_tenant_context(self.session, self.subject)

    async def list_products(self, *, query: str = "", active_only: bool = False) -> ProductListResponse:
        """Return tenant products with their store/stock summary."""

        products = await self.repository.list_products(
            tenant_id=str(self.subject.tenant_id), query=query, active_only=active_only,
        )
        summaries = await self.repository.stock_summary_by_product(tenant_id=str(self.subject.tenant_id))
        return ProductListResponse(
            items=[self._serialize(product, *summaries.get(product.id, (0, 0))) for product in products],
        )

    async def create_product(self, payload: ProductCreateRequest) -> ProductResponse:
        """Create a new product. Rejects duplicate EAN/SKU rather than merging."""

        cleaned_ean = payload.ean_code.strip()
        if cleaned_ean:
            existing_ean = await self.repository.get_product_by_tenant_and_ean(
                tenant_id=str(self.subject.tenant_id), ean_code=cleaned_ean,
            )
            if existing_ean is not None:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product EAN already registered.")
        sku = payload.sku.strip() or self._generate_sku(payload.name)
        existing_sku = await self.repository.get_product_by_sku(tenant_id=str(self.subject.tenant_id), sku=sku)
        if existing_sku is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product SKU already registered.")
        self._validate_marketplace_image_compliance(payload)
        await self._ensure_catalog_refs_exist(
            brand_id=payload.brand_id, category_id=payload.category_id, therapeutic_class_id=payload.therapeutic_class_id,
        )
        product = InventoryProduct(
            tenant_id=str(self.subject.tenant_id),
            sku=sku,
            ean_code=cleaned_ean,
            name=payload.name,
            brand_id=payload.brand_id,
            category_id=payload.category_id,
            therapeutic_class_id=payload.therapeutic_class_id,
            is_controlled=payload.controlled_category != "none",
            controlled_category=payload.controlled_category,
            is_generic=payload.is_generic,
            cnae_code=payload.cnae_code,
            marketplace_image_url=payload.marketplace_image_url,
            marketplace_gallery_urls=payload.marketplace_gallery_urls,
            is_active=True,
        )
        product = await self.repository.add_product(product)
        await self.session.commit()
        await self._reapply_tenant_context()
        await self.session.refresh(product)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(product, 0, 0)

    async def update_product(self, product_id: str, payload: ProductUpdateRequest) -> ProductResponse:
        """Update an existing product's configuration."""

        product = await self._require_product(product_id)
        cleaned_ean = payload.ean_code.strip()
        if cleaned_ean:
            existing_ean = await self.repository.get_product_by_tenant_and_ean(
                tenant_id=str(self.subject.tenant_id), ean_code=cleaned_ean,
            )
            if existing_ean is not None and existing_ean.id != product.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product EAN already registered.")
        sku = payload.sku.strip()
        existing_sku = await self.repository.get_product_by_sku(tenant_id=str(self.subject.tenant_id), sku=sku)
        if existing_sku is not None and existing_sku.id != product.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Product SKU already registered.")
        self._validate_marketplace_image_compliance(payload)
        await self._ensure_catalog_refs_exist(
            brand_id=payload.brand_id, category_id=payload.category_id, therapeutic_class_id=payload.therapeutic_class_id,
        )
        product.sku = sku
        product.name = payload.name
        product.ean_code = cleaned_ean
        product.brand_id = payload.brand_id
        product.category_id = payload.category_id
        product.therapeutic_class_id = payload.therapeutic_class_id
        product.is_controlled = payload.controlled_category != "none"
        product.controlled_category = payload.controlled_category
        product.is_generic = payload.is_generic
        product.cnae_code = payload.cnae_code
        product.marketplace_image_url = payload.marketplace_image_url
        product.marketplace_gallery_urls = payload.marketplace_gallery_urls
        await self.session.commit()
        await self._reapply_tenant_context()
        await self.session.refresh(product)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        summary = await self.repository.stock_summary_for_product(tenant_id=str(self.subject.tenant_id), product_id=product.id)
        return self._serialize(product, *summary)

    async def update_product_status(self, product_id: str, payload: ProductStatusUpdateRequest) -> ProductResponse:
        """Activate or deactivate a product."""

        product = await self._require_product(product_id)
        product.is_active = payload.is_active
        await self.session.commit()
        await self._reapply_tenant_context()
        await self.session.refresh(product)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        summary = await self.repository.stock_summary_for_product(tenant_id=str(self.subject.tenant_id), product_id=product.id)
        return self._serialize(product, *summary)

    async def update_product_discard(self, product_id: str, payload: ProductDiscardUpdateRequest) -> ProductResponse:
        """Discard a product (soft-delete) or recover it — independent of is_active."""

        product = await self._require_product(product_id)
        product.is_discarded = payload.is_discarded
        await self.session.commit()
        await self._reapply_tenant_context()
        await self.session.refresh(product)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        summary = await self.repository.stock_summary_for_product(tenant_id=str(self.subject.tenant_id), product_id=product.id)
        return self._serialize(product, *summary)

    async def list_store_links(self, product_id: str) -> ProductStoreLinksResponse:
        """Return every store link (stock record) for a product."""

        await self._require_product(product_id)
        items = await self.repository.list_items_by_product(tenant_id=str(self.subject.tenant_id), product_id=product_id)
        stores = await self.store_repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_names = {store.id: store.name for store in stores}
        return ProductStoreLinksResponse(
            items=[
                ProductStoreSummary(
                    item_id=item.id,
                    store_id=item.store_id,
                    store_name=store_names.get(item.store_id, ""),
                    quantity=item.quantity,
                    is_active=item.is_active,
                )
                for item in items
            ],
        )

    async def link_store(self, product_id: str, payload: ProductStoreLinkRequest) -> InventoryItemResponse:
        """Link a product to a store by creating a zero-stock inventory item.

        Real storage location, batch, and price are filled in later, in the
        stock screen, during the first count — this endpoint only records
        that the store now carries the product.
        """

        product = await self._require_product(product_id)
        store = await self.store_repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=payload.store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        existing_items = await self.repository.list_items_by_product(
            tenant_id=str(self.subject.tenant_id), product_id=product.id,
        )
        existing_item = next((item for item in existing_items if item.store_id == store.id), None)
        if existing_item is not None:
            if not existing_item.is_active:
                existing_item.is_active = True
                await self.session.commit()
                await self._reapply_tenant_context()
                await self.session.refresh(existing_item)
                await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
            return self._serialize_item(existing_item)
        item = InventoryItem(
            tenant_id=str(self.subject.tenant_id),
            store_id=store.id,
            product_id=product.id,
            storage_location="",
            batch_code="",
            expiry_label="",
            quantity=0,
            minimum_quantity=0,
            low_stock_threshold=0,
            attention_stock_threshold=0,
            normal_stock_threshold=0,
            sale_price=0,
            acquisition_cost=0,
            market_reference_price=0,
            is_active=True,
            is_marketplace_visible=True,
        )
        item = await self.repository.add_item(item)
        await self.session.commit()
        await self._reapply_tenant_context()
        await self.session.refresh(item)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize_item(item)

    async def find_or_create_by_ean(
        self,
        *,
        ean_code: str,
        name: str,
        brand_name: str,
        category_name: str,
        medication_class_name: str,
        is_controlled: bool,
        controlled_category: str,
        is_generic: bool,
        sku: str = "",
    ) -> InventoryProduct:
        """Reuse the tenant's existing product for this EAN, or create a new one.

        Used by the invoice-import automation only: a blank EAN never matches
        anything (each such line gets its own dedicated product), matching the
        EAN-based merge key the same-product-across-stores feature relies on.
        """

        cleaned_ean = str(ean_code or "").strip()
        if cleaned_ean:
            existing = await self.repository.get_product_by_tenant_and_ean(
                tenant_id=str(self.subject.tenant_id), ean_code=cleaned_ean,
            )
            if existing is not None:
                return existing
        product = InventoryProduct(
            tenant_id=str(self.subject.tenant_id),
            ean_code=cleaned_ean,
            name=name,
            brand_id=await self._resolve_or_create_brand_id(brand_name),
            category_id=await self._resolve_or_create_category_id(category_name),
            therapeutic_class_id=await self._resolve_or_create_therapeutic_class_id(medication_class_name),
            is_controlled=is_controlled,
            controlled_category=controlled_category,
            is_generic=is_generic,
            sku=sku.strip() or self._generate_sku(name),
        )
        return await self.repository.add_product(product)

    async def resolve_or_create_therapeutic_class_id(self, name: str) -> str | None:
        """Public wrapper used by invoice import to re-point a product's therapeutic class."""

        return await self._resolve_or_create_therapeutic_class_id(name)

    async def _resolve_or_create_brand_id(self, name: str) -> str | None:
        """Return the id of an existing brand matching this name, creating one if needed."""

        cleaned = str(name or "").strip()
        if not cleaned:
            return None
        existing = await self.brand_repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=cleaned)
        if existing is not None:
            return existing.id
        from app.models.brand import Brand

        created = await self.brand_repository.add_brand(
            Brand(tenant_id=str(self.subject.tenant_id), name=cleaned, is_active=True),
        )
        return created.id

    async def _resolve_or_create_category_id(self, name: str) -> str | None:
        """Return the id of an existing category matching this name, creating one if needed."""

        cleaned = str(name or "").strip()
        if not cleaned:
            return None
        existing = await self.category_repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=cleaned)
        if existing is not None:
            return existing.id
        from app.models.category import Category

        created = await self.category_repository.add_category(
            Category(tenant_id=str(self.subject.tenant_id), name=cleaned, is_active=True),
        )
        return created.id

    async def _resolve_or_create_therapeutic_class_id(self, name: str) -> str | None:
        """Return the id of an existing therapeutic class matching this name, creating one if needed."""

        cleaned = str(name or "").strip()
        if not cleaned:
            return None
        existing = await self.therapeutic_class_repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=cleaned)
        if existing is not None:
            return existing.id
        from app.models.therapeutic_class import TherapeuticClass

        created = await self.therapeutic_class_repository.add_therapeutic_class(
            TherapeuticClass(tenant_id=str(self.subject.tenant_id), name=cleaned, is_active=True),
        )
        return created.id

    async def _ensure_catalog_refs_exist(
        self, *, brand_id: str | None, category_id: str | None, therapeutic_class_id: str | None,
    ) -> None:
        """Validate that referenced brand/category/therapeutic class belong to the tenant."""

        if brand_id:
            brand = await self.brand_repository.get_by_id(tenant_id=str(self.subject.tenant_id), brand_id=brand_id)
            if brand is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")
        if category_id:
            category = await self.category_repository.get_by_id(tenant_id=str(self.subject.tenant_id), category_id=category_id)
            if category is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
        if therapeutic_class_id:
            therapeutic_class = await self.therapeutic_class_repository.get_by_id(
                tenant_id=str(self.subject.tenant_id), therapeutic_class_id=therapeutic_class_id,
            )
            if therapeutic_class is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Therapeutic class not found.")
            if therapeutic_class.category_id and category_id and therapeutic_class.category_id != category_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Therapeutic class does not belong to the selected category.",
                )

    def _validate_marketplace_image_compliance(self, payload: ProductCreateRequest | ProductUpdateRequest) -> None:
        """Reject marketplace images for medicines whose online image display is prohibited.

        RDC nº 96/2008 (Anvisa) prohibits advertising of prescription-only medicines, so
        the marketplace can never show a pharmacy-supplied image for these categories —
        it always falls back to the regulatory placeholder instead.
        """

        has_custom_image = bool(payload.marketplace_image_url.strip()) or bool(payload.marketplace_gallery_urls)
        if is_marketplace_image_restricted(payload) and has_custom_image:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Marketplace images are prohibited for prescription medicines (RDC nº 96/2008 - Anvisa). "
                    "Remove the custom image and gallery; the marketplace will use the regulatory placeholder."
                ),
            )

    def _generate_sku(self, name: str) -> str:
        """Generate a readable fallback SKU."""

        cleaned = "".join(character if character.isalnum() else "-" for character in (name or "").upper())
        compact = "-".join(segment for segment in cleaned.split("-") if segment)
        return "INV-" + compact[:36] + "-" + uuid4().hex[:6].upper()

    async def _require_product(self, product_id: str) -> InventoryProduct:
        """Return an existing product or fail with not found."""

        product = await self.repository.get_product_by_id(tenant_id=str(self.subject.tenant_id), product_id=product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
        return product

    def _serialize(self, product: InventoryProduct, store_count: int, total_quantity: int) -> ProductResponse:
        """Serialize a product for API responses."""

        return ProductResponse(
            id=product.id,
            sku=product.sku,
            name=product.name,
            ean_code=product.ean_code,
            brand_id=product.brand_id,
            brand_name=product.brand_name,
            category_id=product.category_id,
            category_name=product.category_name,
            therapeutic_class_id=product.therapeutic_class_id,
            medication_class_name=product.medication_class_name,
            is_controlled=product.is_controlled,
            controlled_category=product.controlled_category,
            is_generic=product.is_generic,
            cnae_code=product.cnae_code,
            marketplace_image_url=product.marketplace_image_url,
            marketplace_gallery_urls=list(product.marketplace_gallery_urls or []),
            is_active=product.is_active,
            is_discarded=product.is_discarded,
            store_count=store_count,
            total_quantity=total_quantity,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )

    def _serialize_item(self, item: InventoryItem) -> InventoryItemResponse:
        """Serialize an inventory item for API responses (mirrors InventoryService._serialize_item)."""

        return InventoryItemResponse(
            id=item.id,
            store_id=item.store_id,
            product_id=item.product_id,
            sku=item.sku,
            name=item.name,
            brand_name=item.brand_name,
            category_name=item.category_name,
            medication_class_name=item.medication_class_name,
            ean_code=item.ean_code,
            storage_location_code=item.storage_location,
            batch_code=item.batch_code,
            expiry_label=item.expiry_label,
            quantity=item.quantity,
            minimum_quantity=item.minimum_quantity,
            low_stock_threshold=item.low_stock_threshold,
            attention_stock_threshold=item.attention_stock_threshold,
            normal_stock_threshold=item.normal_stock_threshold,
            sale_price=item.sale_price,
            acquisition_cost=item.acquisition_cost,
            market_reference_price=item.market_reference_price,
            promotional_discount_percent=item.promotional_discount_percent,
            is_controlled=item.is_controlled,
            controlled_category=item.controlled_category,
            is_generic=item.is_generic,
            is_active=item.is_active,
            is_marketplace_visible=item.is_marketplace_visible,
            marketplace_image_url=item.marketplace_image_url,
            marketplace_gallery_urls=list(item.marketplace_gallery_urls or []),
            cnae_code=item.cnae_code,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
