"""
farmaura-api/app/schemas/catalog.py

Catalog schemas for Farmaura.

Responsibilities:
- define customer-facing catalog payloads;
- keep marketplace product listing contracts explicit and typed;
- support grouped product projection from operational inventory with review summaries;

Observations:
- grouped products intentionally hide lot-level operational detail from customers;
- pricing remains decimal-typed end to end.
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel
from app.schemas.portal import PortalProductReviewResponse


# ============================================================================
# CATALOG SCHEMAS
# ============================================================================


class CatalogReviewSummary(StrictModel):
    """Represent the review summary attached to one catalog product."""

    rating_average: Decimal = Decimal("0.00")
    review_count: int = 0
    comments: list[PortalProductReviewResponse] = Field(default_factory=list)


class PublicCatalogItem(StrictModel):
    """Represent one public marketplace product projection."""

    id: str
    name: str
    brand: str
    category: str
    subcategory: str
    description: str
    image_url: str = ""
    image_alt: str = ""
    image_policy: str
    gallery: list[str] = Field(default_factory=list)
    price: Decimal
    old_price: Decimal | None = None
    discount_percent: int
    requires_prescription: bool
    stock: int
    tags: list[str]
    info: str
    aliases: list[str] = Field(default_factory=list)
    inventory_ids: list[str] = Field(default_factory=list)
    promotion_highlight: str = ""
    discount_type: str = "percent"
    urgency_label: str = ""
    review_summary: CatalogReviewSummary = Field(default_factory=CatalogReviewSummary)


class PublicCatalogListResponse(StrictModel):
    """Represent a paginated public catalog list response."""

    items: list[PublicCatalogItem]
    page: int
    page_size: int
    total: int


class MostSearchedProductResponse(StrictModel):
    """Represent one product's rank in the "most searched" demand ranking."""

    product_id: str
    rank: int
    xyz_class: str = ""


class MostSearchedProductsResponse(StrictModel):
    """Represent the ranked "most searched" product list for the marketplace home page."""

    items: list[MostSearchedProductResponse] = Field(default_factory=list)


class CatalogItem(StrictModel):
    """Represent one authenticated marketplace product."""

    id: str
    sku: str
    ean: str
    name: str
    brand: str
    category: str
    subcategory: str
    description: str
    image_url: str = ""
    image_alt: str = ""
    image_policy: str
    gallery: list[str] = Field(default_factory=list)
    price: Decimal
    old_price: Decimal | None = None
    discount_percent: int
    requires_prescription: bool
    stock: int
    is_available: bool
    tags: list[str]
    info: str
    aliases: list[str]
    inventory_ids: list[str]
    promotion_highlight: str = ""
    discount_type: str = "percent"
    urgency_label: str = ""
    review_summary: CatalogReviewSummary = Field(default_factory=CatalogReviewSummary)


class CatalogListResponse(StrictModel):
    """Represent a paginated authenticated catalog list response."""

    items: list[CatalogItem]
    page: int
    page_size: int
    total: int
