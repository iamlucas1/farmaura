"""
farmaura-api/app/schemas/purchase_analytics.py

Purchase analytics schemas for Farmaura.

Responsibilities:
- define the ABC/XYZ purchase-planning response contract;

Observations:
- xyz_class is an empty string when a product hasn't been sold in at least two
  distinct months yet — the frontend must render that as "aguardando
  histórico", not as a fourth class letter;
- best_offer is null whenever no confirmed, non-expired quote item is linked
  to that catalog product — the frontend must prompt for a quote, not hide it.
"""

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel

ABC_CLASS_PATTERN = "^(A|B|C)$"
XYZ_CLASS_PATTERN = "^(X|Y|Z|)$"


# ============================================================================
# PURCHASE ANALYTICS SCHEMAS
# ============================================================================


class PurchaseAnalyticsBestOfferResponse(StrictModel):
    """Represent the best active quote offer found for a classified product."""

    quote_id: str
    supplier_name: str
    effective_price: Decimal
    payment_method: str
    freight_type: str
    freight_cost: Decimal | None
    delivery_time_days: int | None
    quote_date: date


class PurchaseAnalyticsProductResponse(StrictModel):
    """Represent one classified product in the purchase plan."""

    product_id: str
    name: str
    brand_name: str
    category_name: str
    abc_class: str = Field(pattern=ABC_CLASS_PATTERN)
    xyz_class: str = Field(pattern=XYZ_CLASS_PATTERN)
    months_with_sales: int
    total_quantity: int
    total_revenue: Decimal
    average_monthly_quantity: Decimal
    current_stock: int
    coverage_days: Decimal | None
    suggested_purchase_quantity: int
    best_offer: PurchaseAnalyticsBestOfferResponse | None


class PurchaseAnalyticsSummaryResponse(StrictModel):
    """Represent the KPI summary for the purchase plan."""

    months: int
    months_with_data: int
    total_products_with_sales: int
    class_a_count: int
    class_b_count: int
    class_c_count: int
    class_a_without_offer_count: int
    total_revenue_analyzed: Decimal


class PurchaseAnalyticsResponse(StrictModel):
    """Represent the full purchase-planning response."""

    summary: PurchaseAnalyticsSummaryResponse
    items: list[PurchaseAnalyticsProductResponse]
