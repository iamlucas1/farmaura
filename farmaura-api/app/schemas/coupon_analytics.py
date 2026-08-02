"""
farmaura-api/app/schemas/coupon_analytics.py

Coupon analytics schemas for Farmaura.

Responsibilities:
- shape the cross-channel coupon analytics response for the internal console;

Observations:
- status is computed here (not left to the frontend) using real wall-clock time,
  same authoritative-backend principle already applied to coupon checkout validation;
- payment_method labels are normalized across channels — see
  CouponAnalyticsService._normalize_payment_label.
"""

from decimal import Decimal

from pydantic import Field

from app.schemas.common import StrictModel

COUPON_STATUS_PATTERN = "^(active|scheduled|expiring|expired|exhausted|inactive)$"


class CouponAnalyticsPaymentBreakdownResponse(StrictModel):
    """Represent one payment method's share of a coupon's redemptions."""

    label: str
    count: int
    amount: Decimal


class CouponAnalyticsChannelBreakdownResponse(StrictModel):
    """Represent a coupon's redemption split between online and PDV."""

    online_count: int = 0
    pdv_count: int = 0
    online_amount: Decimal = Decimal("0.00")
    pdv_amount: Decimal = Decimal("0.00")


class CouponAnalyticsFulfillmentBreakdownResponse(StrictModel):
    """Represent a coupon's redemption split by fulfillment type."""

    pickup_count: int = 0
    delivery_count: int = 0
    shipping_count: int = 0


class CouponAnalyticsSegmentBreakdownResponse(StrictModel):
    """Represent one customer segment's share of a coupon's redemptions."""

    segment: str
    count: int


class CouponAnalyticsItemResponse(StrictModel):
    """Represent one coupon campaign's analytics."""

    coupon_id: str
    code: str
    title: str = ""
    status: str = Field(pattern=COUPON_STATUS_PATTERN)
    usage_count: int = 0
    usage_limit: int | None = None
    usage_progress_percent: Decimal | None = None
    days_until_expiry: int | None = None
    total_redemptions: int = 0
    total_discount_granted: Decimal = Decimal("0.00")
    payment_breakdown: list[CouponAnalyticsPaymentBreakdownResponse] = Field(default_factory=list)
    channel_breakdown: CouponAnalyticsChannelBreakdownResponse = CouponAnalyticsChannelBreakdownResponse()
    fulfillment_breakdown: CouponAnalyticsFulfillmentBreakdownResponse = CouponAnalyticsFulfillmentBreakdownResponse()
    segment_breakdown: list[CouponAnalyticsSegmentBreakdownResponse] = Field(default_factory=list)
    top_customer_segment: str | None = None


class CouponAnalyticsSummaryResponse(StrictModel):
    """Represent tenant-wide coupon analytics KPIs."""

    total_coupons: int = 0
    active_count: int = 0
    scheduled_count: int = 0
    expiring_count: int = 0
    expired_count: int = 0
    exhausted_count: int = 0
    inactive_count: int = 0
    near_limit_count: int = 0
    total_redemptions: int = 0
    total_discount_granted: Decimal = Decimal("0.00")


class CouponAnalyticsResponse(StrictModel):
    """Represent the full coupon analytics payload for the internal console."""

    summary: CouponAnalyticsSummaryResponse
    items: list[CouponAnalyticsItemResponse] = Field(default_factory=list)
