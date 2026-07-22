"""
farmaura-api/app/tests/unit/test_product_service.py

Product service business-logic tests for Farmaura.

Responsibilities:
- verify duplicate EAN/SKU are rejected instead of silently merged;
- verify unknown brand/category/therapeutic class references are rejected;
- verify linking a product to a store creates a zero-quantity item, and
  reuses (reactivates) an existing inactive link instead of duplicating it.

Observations:
- repositories are stubbed directly on the service instance, matching this
  suite's existing convention of isolating service policy from persistence
  (see test_fiscal_service.py);
"""

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.domain.enums import AccessScope, UserRole
from app.schemas.auth import TokenSubject
from app.schemas.product import ProductCreateRequest, ProductStoreLinkRequest
from app.services.product_service import ProductService


# ============================================================================
# TEST HELPERS
# ============================================================================


def build_subject() -> TokenSubject:
    """Create a token subject for an internal pharmacist actor."""

    return TokenSubject(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=UserRole.PHARMACIST,
        access_scope=AccessScope.INTERNAL,
        session_version=1,
    )


def build_service() -> ProductService:
    """Create a ProductService with every repository dependency stubbed out."""

    subject = build_subject()
    service = ProductService(session=AsyncMock(), subject=subject)
    service.repository = AsyncMock()
    service.store_repository = AsyncMock()
    service.brand_repository = AsyncMock()
    service.category_repository = AsyncMock()
    service.therapeutic_class_repository = AsyncMock()
    service.session.commit = AsyncMock()
    service.session.refresh = AsyncMock()
    return service


def build_product(**overrides: object) -> SimpleNamespace:
    """Build a minimal InventoryProduct-shaped stand-in."""

    defaults = dict(
        id=str(uuid4()),
        sku="INV-EXISTING",
        name="Existing product",
        ean_code="",
        brand_id=None,
        brand_name="",
        category_id=None,
        category_name="Medicamentos",
        therapeutic_class_id=None,
        medication_class_name="Geral",
        is_controlled=False,
        controlled_category="none",
        is_generic=False,
        cnae_code="",
        marketplace_image_url="",
        marketplace_gallery_urls=[],
        is_active=True,
        created_at=datetime.now(tz=UTC),
        updated_at=datetime.now(tz=UTC),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def build_create_payload(**overrides: object) -> ProductCreateRequest:
    """Build a valid product create request, overriding selected fields."""

    defaults = dict(name="Dipirona 500mg", sku="", ean_code="", brand_id=None, category_id=None, therapeutic_class_id=None)
    defaults.update(overrides)
    return ProductCreateRequest(**defaults)


# ============================================================================
# CREATE PRODUCT TESTS
# ============================================================================


@pytest.mark.anyio
async def test_create_product_rejects_duplicate_ean() -> None:
    """Verify creating a product with an already-registered EAN raises a conflict."""

    service = build_service()
    service.repository.get_product_by_tenant_and_ean = AsyncMock(return_value=build_product())
    payload = build_create_payload(ean_code="7891234567890")

    with pytest.raises(HTTPException) as error:
        await service.create_product(payload)

    assert error.value.status_code == 409
    service.repository.add_product.assert_not_called()


@pytest.mark.anyio
async def test_create_product_rejects_duplicate_sku() -> None:
    """Verify creating a product with an already-registered SKU raises a conflict."""

    service = build_service()
    service.repository.get_product_by_tenant_and_ean = AsyncMock(return_value=None)
    service.repository.get_product_by_sku = AsyncMock(return_value=build_product())
    payload = build_create_payload(sku="INV-DUP")

    with pytest.raises(HTTPException) as error:
        await service.create_product(payload)

    assert error.value.status_code == 409
    service.repository.add_product.assert_not_called()


@pytest.mark.anyio
async def test_create_product_generates_sku_when_blank() -> None:
    """Verify a blank SKU is auto-generated rather than rejected."""

    def persist(product: object) -> object:
        product.id = str(uuid4())
        product.created_at = datetime.now(tz=UTC)
        product.updated_at = datetime.now(tz=UTC)
        return product

    service = build_service()
    service.repository.get_product_by_tenant_and_ean = AsyncMock(return_value=None)
    service.repository.get_product_by_sku = AsyncMock(return_value=None)
    service.repository.add_product = AsyncMock(side_effect=persist)
    payload = build_create_payload(sku="")

    response = await service.create_product(payload)

    assert response.sku.startswith("INV-")
    service.repository.add_product.assert_called_once()


@pytest.mark.anyio
async def test_create_product_rejects_unknown_brand() -> None:
    """Verify referencing a brand outside the tenant raises not found."""

    service = build_service()
    service.repository.get_product_by_tenant_and_ean = AsyncMock(return_value=None)
    service.repository.get_product_by_sku = AsyncMock(return_value=None)
    service.brand_repository.get_by_id = AsyncMock(return_value=None)
    payload = build_create_payload(brand_id=str(uuid4()))

    with pytest.raises(HTTPException) as error:
        await service.create_product(payload)

    assert error.value.status_code == 404
    service.repository.add_product.assert_not_called()


# ============================================================================
# STORE LINK TESTS
# ============================================================================


@pytest.mark.anyio
async def test_link_store_creates_zero_quantity_item() -> None:
    """Verify linking a product to a store creates a fresh zero-quantity item."""

    service = build_service()
    product = build_product()
    store = SimpleNamespace(id=str(uuid4()), name="Loja Centro")
    service.repository.get_product_by_id = AsyncMock(return_value=product)
    service.store_repository.get_by_id = AsyncMock(return_value=store)
    service.repository.list_items_by_product = AsyncMock(return_value=[])

    created_item = SimpleNamespace(
        id=str(uuid4()), store_id=store.id, product_id=product.id, quantity=0, sku=product.sku, name=product.name,
        brand_name="", category_name="Medicamentos", medication_class_name="Geral", ean_code="",
        storage_location="", batch_code="", expiry_label="", minimum_quantity=0, low_stock_threshold=0,
        attention_stock_threshold=0, normal_stock_threshold=0, sale_price=Decimal("0.00"),
        acquisition_cost=Decimal("0.00"), market_reference_price=Decimal("0.00"),
        promotional_discount_percent=Decimal("0.00"), is_controlled=False, controlled_category="none",
        is_generic=False, is_active=True, is_marketplace_visible=True, marketplace_image_url="",
        marketplace_gallery_urls=[], cnae_code="", created_at=datetime.now(tz=UTC), updated_at=datetime.now(tz=UTC),
    )
    service.repository.add_item = AsyncMock(return_value=created_item)

    response = await service.link_store(product.id, ProductStoreLinkRequest(store_id=store.id))

    assert response.quantity == 0
    assert response.store_id == store.id
    service.repository.add_item.assert_called_once()
    added_item = service.repository.add_item.call_args.args[0]
    assert added_item.quantity == 0
    assert added_item.product_id == product.id


@pytest.mark.anyio
async def test_link_store_reactivates_existing_inactive_link() -> None:
    """Verify re-linking a store that was previously unlinked reactivates it instead of duplicating."""

    service = build_service()
    product = build_product()
    store = SimpleNamespace(id=str(uuid4()), name="Loja Centro")
    existing_item = SimpleNamespace(
        id=str(uuid4()), store_id=store.id, product_id=product.id, quantity=0, is_active=False,
        sku=product.sku, name=product.name, brand_name="", category_name="Medicamentos",
        medication_class_name="Geral", ean_code="", storage_location="", batch_code="", expiry_label="",
        minimum_quantity=0, low_stock_threshold=0, attention_stock_threshold=0, normal_stock_threshold=0,
        sale_price=Decimal("0.00"), acquisition_cost=Decimal("0.00"), market_reference_price=Decimal("0.00"),
        promotional_discount_percent=Decimal("0.00"), is_controlled=False, controlled_category="none",
        is_generic=False, is_marketplace_visible=True, marketplace_image_url="", marketplace_gallery_urls=[],
        cnae_code="", created_at=datetime.now(tz=UTC), updated_at=datetime.now(tz=UTC),
    )
    service.repository.get_product_by_id = AsyncMock(return_value=product)
    service.store_repository.get_by_id = AsyncMock(return_value=store)
    service.repository.list_items_by_product = AsyncMock(return_value=[existing_item])

    response = await service.link_store(product.id, ProductStoreLinkRequest(store_id=store.id))

    assert response.store_id == store.id
    assert existing_item.is_active is True
    service.repository.add_item.assert_not_called()
