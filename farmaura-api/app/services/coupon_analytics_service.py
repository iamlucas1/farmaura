"""
farmaura-api/app/services/coupon_analytics_service.py

Coupon analytics service for Farmaura.

Responsibilities:
- classify each coupon campaign's real-time status (active/expired/exhausted/...)
  from wall-clock time, replacing the frontend-only classification that used to
  drive the coupons screen's "Análises" tab;
- aggregate redemptions across both sales channels into payment/channel/fulfillment/
  customer-segment breakdowns per coupon;

Observations:
- status classification mirrors getCouponStatusKey (coupons-screen.jsx) so the
  "Gestão da tabela" tab (still computed client-side, for instant feedback while
  editing) and this backend-computed "Análises" tab never disagree in practice;
- online and PDV use different payment-method vocabularies (Portuguese labels vs a
  short English enum) — _normalize_payment_label maps both onto one shared set.
"""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon_campaign import CouponCampaign
from app.repositories.coupon_analytics_repository import (
    CouponAnalyticsRepository,
    CouponRedemptionRow,
)
from app.schemas.coupon_analytics import (
    CouponAnalyticsChannelBreakdownResponse,
    CouponAnalyticsFulfillmentBreakdownResponse,
    CouponAnalyticsItemResponse,
    CouponAnalyticsPaymentBreakdownResponse,
    CouponAnalyticsResponse,
    CouponAnalyticsSegmentBreakdownResponse,
    CouponAnalyticsSummaryResponse,
)

_EXPIRING_SOON_HOURS = 72
_NEAR_LIMIT_THRESHOLD_PERCENT = Decimal("80.00")

_ONLINE_PAYMENT_LABELS = {
    "Pix": "Pix",
    "Cartão de crédito": "Cartão de crédito",
    "Cartão de débito": "Cartão de débito",
}
_PDV_PAYMENT_LABELS = {
    "cash": "Dinheiro",
    "pix": "Pix",
    "debit": "Cartão de débito",
    "credit": "Cartão de crédito",
}


class CouponAnalyticsService:
    """Build the cross-channel coupon analytics view for the internal console."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the repository used to read campaigns and redemptions."""

        self.session = session
        self.repository = CouponAnalyticsRepository(session)

    async def build_coupon_analytics(self, *, tenant_id: str) -> CouponAnalyticsResponse:
        """Return coupon analytics aggregated across every campaign for one tenant."""

        campaigns = await self.repository.list_campaigns(tenant_id=tenant_id)
        redemptions = await self.repository.redemptions_by_coupon(tenant_id=tenant_id)
        redemptions_by_code: dict[str, list[CouponRedemptionRow]] = {}
        for redemption in redemptions:
            redemptions_by_code.setdefault(redemption.coupon_code, []).append(redemption)

        customer_ids = sorted({redemption.customer_id for redemption in redemptions if redemption.customer_id})
        segments_by_customer = await self.repository.customer_segments_by_ids(tenant_id=tenant_id, customer_ids=customer_ids)

        now = datetime.now(UTC)
        items = [
            self._build_item(campaign, redemptions_by_code.get(campaign.code, []), segments_by_customer, now)
            for campaign in campaigns
        ]
        return CouponAnalyticsResponse(summary=self._build_summary(items), items=items)

    def _build_item(
        self,
        campaign: CouponCampaign,
        redemptions: list[CouponRedemptionRow],
        segments_by_customer: dict[str, str],
        now: datetime,
    ) -> CouponAnalyticsItemResponse:
        """Return one campaign's analytics row."""

        status_key = self._classify_status(campaign, now)
        days_until_expiry = (campaign.ends_at - now).days if campaign.ends_at is not None else None
        usage_progress_percent = (
            (Decimal(campaign.usage_count) / Decimal(campaign.usage_limit) * Decimal("100.00")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if campaign.usage_limit else None
        )

        payment_totals: dict[str, dict[str, Decimal | int]] = {}
        channel_breakdown = CouponAnalyticsChannelBreakdownResponse()
        fulfillment_breakdown = CouponAnalyticsFulfillmentBreakdownResponse()
        segment_counts: dict[str, int] = {}
        total_discount_granted = Decimal("0.00")

        for redemption in redemptions:
            total_discount_granted += redemption.discount_amount
            payment_label = self._normalize_payment_label(redemption.channel, redemption.payment_method)
            bucket = payment_totals.setdefault(payment_label, {"count": 0, "amount": Decimal("0.00")})
            bucket["count"] = int(bucket["count"]) + 1
            bucket["amount"] = Decimal(bucket["amount"]) + redemption.total_amount

            if redemption.channel == "pdv":
                channel_breakdown.pdv_count += 1
                channel_breakdown.pdv_amount += redemption.total_amount
            else:
                channel_breakdown.online_count += 1
                channel_breakdown.online_amount += redemption.total_amount

            if redemption.fulfillment_type == "delivery":
                fulfillment_breakdown.delivery_count += 1
            elif redemption.fulfillment_type == "shipping":
                fulfillment_breakdown.shipping_count += 1
            else:
                fulfillment_breakdown.pickup_count += 1

            segment = segments_by_customer.get(redemption.customer_id or "", "Não identificado")
            segment_counts[segment] = segment_counts.get(segment, 0) + 1

        payment_breakdown = [
            CouponAnalyticsPaymentBreakdownResponse(label=label, count=int(bucket["count"]), amount=Decimal(bucket["amount"]))
            for label, bucket in sorted(payment_totals.items(), key=lambda entry: entry[1]["count"], reverse=True)
        ]
        segment_breakdown = [
            CouponAnalyticsSegmentBreakdownResponse(segment=segment, count=count)
            for segment, count in sorted(segment_counts.items(), key=lambda entry: entry[1], reverse=True)
        ]
        top_customer_segment = segment_breakdown[0].segment if segment_breakdown else None

        return CouponAnalyticsItemResponse(
            coupon_id=campaign.id,
            code=campaign.code,
            title=campaign.title,
            status=status_key,
            usage_count=campaign.usage_count,
            usage_limit=campaign.usage_limit,
            usage_progress_percent=usage_progress_percent,
            days_until_expiry=days_until_expiry,
            total_redemptions=len(redemptions),
            total_discount_granted=total_discount_granted,
            payment_breakdown=payment_breakdown,
            channel_breakdown=channel_breakdown,
            fulfillment_breakdown=fulfillment_breakdown,
            segment_breakdown=segment_breakdown,
            top_customer_segment=top_customer_segment,
        )

    def _build_summary(self, items: list[CouponAnalyticsItemResponse]) -> CouponAnalyticsSummaryResponse:
        """Return tenant-wide KPIs aggregated from the already-classified items."""

        summary = CouponAnalyticsSummaryResponse(total_coupons=len(items))
        for item in items:
            if item.status == "active":
                summary.active_count += 1
            elif item.status == "scheduled":
                summary.scheduled_count += 1
            elif item.status == "expiring":
                summary.expiring_count += 1
            elif item.status == "expired":
                summary.expired_count += 1
            elif item.status == "exhausted":
                summary.exhausted_count += 1
            elif item.status == "inactive":
                summary.inactive_count += 1
            if (
                item.status not in ("exhausted", "expired", "inactive")
                and item.usage_progress_percent is not None
                and item.usage_progress_percent >= _NEAR_LIMIT_THRESHOLD_PERCENT
            ):
                summary.near_limit_count += 1
            summary.total_redemptions += item.total_redemptions
            summary.total_discount_granted += item.total_discount_granted
        return summary

    def _classify_status(self, campaign: CouponCampaign, now: datetime) -> str:
        """Return one coupon's real-time status, mirroring getCouponStatusKey (coupons-screen.jsx)."""

        if not campaign.is_active:
            return "inactive"
        if campaign.starts_at is not None and campaign.starts_at > now:
            return "scheduled"
        if campaign.usage_limit is not None and campaign.usage_count >= campaign.usage_limit:
            return "exhausted"
        if campaign.ends_at is not None and campaign.ends_at < now:
            return "expired"
        if campaign.ends_at is not None and (campaign.ends_at - now).total_seconds() <= _EXPIRING_SOON_HOURS * 3600:
            return "expiring"
        return "active"

    def _normalize_payment_label(self, channel: str, raw: str) -> str:
        """Return one shared payment-method label across online and PDV vocabularies."""

        if channel == "pdv":
            return _PDV_PAYMENT_LABELS.get(raw, "Outro")
        return _ONLINE_PAYMENT_LABELS.get(raw, "Outro")
