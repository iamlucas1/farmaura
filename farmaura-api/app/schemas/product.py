"""
farmaura-api/app/schemas/product.py

Product schemas for Farmaura.

Responsibilities:
- define product identity/configuration create, update, and response
  contracts (SKU, brand, category, therapeutic class, EAN, controlled/
  generic flags, marketplace images);
- validate internal console payloads for product registration and for
  linking a product to a store's stock;

Observations:
- store-scoped operational data (quantity, thresholds, pricing) is out of
  scope here — see app/schemas/inventory.py for that;
- products are soft-deleted via the is_active flag, never hard-deleted.
"""

from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.common import StrictModel


# ============================================================================
# PRODUCT SCHEMAS
# ============================================================================


MarketplaceImageUrl = Annotated[str, StringConstraints(max_length=600_000)]


class ProductResponse(StrictModel):
    """Represent a product record."""

    id: str
    sku: str
    name: str
    ean_code: str
    brand_id: str | None = None
    brand_name: str
    category_id: str | None = None
    category_name: str
    therapeutic_class_id: str | None = None
    medication_class_name: str
    is_controlled: bool
    controlled_category: str = "none"
    is_generic: bool = False
    cnae_code: str = ""
    marketplace_image_url: str
    marketplace_gallery_urls: list[str]
    is_active: bool
    is_discarded: bool = False
    store_count: int = 0
    total_quantity: int = 0
    created_at: datetime
    updated_at: datetime


class ProductCreateRequest(StrictModel):
    """Validate a new product registration request."""

    sku: str = Field(default="", max_length=64)
    name: str = Field(min_length=2, max_length=255)
    ean_code: str = Field(default="", max_length=32)
    brand_id: str | None = None
    category_id: str | None = None
    therapeutic_class_id: str | None = None
    controlled_category: str = Field(default="none", pattern="^(none|prescription|prescription_retention|special_control|black_stripe)$")
    is_generic: bool = False
    cnae_code: str = Field(default="", max_length=20)
    marketplace_image_url: MarketplaceImageUrl = ""
    marketplace_gallery_urls: list[MarketplaceImageUrl] = Field(default_factory=list, max_length=8)


class ProductUpdateRequest(StrictModel):
    """Validate a product update request."""

    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    ean_code: str = Field(default="", max_length=32)
    brand_id: str | None = None
    category_id: str | None = None
    therapeutic_class_id: str | None = None
    controlled_category: str = Field(default="none", pattern="^(none|prescription|prescription_retention|special_control|black_stripe)$")
    is_generic: bool = False
    cnae_code: str = Field(default="", max_length=20)
    marketplace_image_url: MarketplaceImageUrl = ""
    marketplace_gallery_urls: list[MarketplaceImageUrl] = Field(default_factory=list, max_length=8)


class ProductStatusUpdateRequest(StrictModel):
    """Validate a product activation/deactivation request."""

    is_active: bool


class ProductDiscardUpdateRequest(StrictModel):
    """Validate a product discard/recovery request — distinct from is_active."""

    is_discarded: bool


class ProductListResponse(StrictModel):
    """Represent the product list payload."""

    items: list[ProductResponse]


class ProductStoreLinkRequest(StrictModel):
    """Validate a request to link a product to a store with zero stock."""

    store_id: str = Field(min_length=1)


class ProductStoreSummary(StrictModel):
    """Represent one store's stock link for a product."""

    item_id: str
    store_id: str
    store_name: str
    quantity: int
    is_active: bool


class ProductStoreLinksResponse(StrictModel):
    """Represent every store link for a product."""

    items: list[ProductStoreSummary]
