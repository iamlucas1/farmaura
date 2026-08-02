"""
farmaura-api/app/repositories/coupon_analytics_repository.py

Coupon analytics repository for Farmaura.

Responsibilities:
- read coupon campaigns and their redemptions across both sales channels
  (marketplace online orders and PDV balcão sales);
- keep every query explicitly tenant-scoped;

Observations:
- redemptions are read as two separate queries (Order, PdvSale) and returned as one
  neutral list — the two channels have different payment-method vocabularies and
  schemas, so normalizing them is the service layer's job, not this repository's.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import OrderStatus
from app.models.coupon_campaign import CouponCampaign
from app.models.customer import Customer
from app.models.order import Order
from app.models.pdv_sale import PdvSale


@dataclass(frozen=True, slots=True)
class CouponRedemptionRow:
    """One neutral coupon redemption, from either sales channel."""

    coupon_code: str
    channel: str
    payment_method: str
    fulfillment_type: str
    discount_amount: Decimal
    total_amount: Decimal
    customer_id: str | None
    created_at: datetime


class CouponAnalyticsRepository:
    """Read coupon campaigns and their cross-channel redemptions."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the session used for analytics reads."""

        self.session = session

    async def list_campaigns(self, *, tenant_id: str) -> list[CouponCampaign]:
        """Return every coupon campaign for one tenant."""

        statement = select(CouponCampaign).where(CouponCampaign.tenant_id == tenant_id)
        return list((await self.session.execute(statement)).scalars().all())

    async def redemptions_by_coupon(self, *, tenant_id: str) -> list[CouponRedemptionRow]:
        """Return every online and PDV redemption that used a coupon, for one tenant."""

        online_statement = select(Order).where(
            Order.tenant_id == tenant_id, Order.coupon_code != "", Order.status != OrderStatus.CANCELLED.value,
        )
        online_rows = (await self.session.execute(online_statement)).scalars().all()
        pdv_statement = select(PdvSale).where(PdvSale.tenant_id == tenant_id, PdvSale.coupon_code != "")
        pdv_rows = (await self.session.execute(pdv_statement)).scalars().all()

        redemptions: list[CouponRedemptionRow] = []
        for order in online_rows:
            redemptions.append(
                CouponRedemptionRow(
                    coupon_code=order.coupon_code,
                    channel="online",
                    payment_method=order.payment_method_label,
                    fulfillment_type=order.fulfillment_type,
                    discount_amount=Decimal(order.discount_amount or 0),
                    total_amount=Decimal(order.total_amount or 0),
                    customer_id=order.customer_id,
                    created_at=order.created_at,
                )
            )
        for sale in pdv_rows:
            redemptions.append(
                CouponRedemptionRow(
                    coupon_code=sale.coupon_code,
                    channel="pdv",
                    payment_method=sale.payment_method,
                    fulfillment_type=sale.fulfillment_type,
                    discount_amount=Decimal(sale.discount_amount or 0),
                    total_amount=Decimal(sale.total_amount or 0),
                    customer_id=sale.customer_id,
                    created_at=sale.created_at,
                )
            )
        return redemptions

    async def customer_segments_by_ids(self, *, tenant_id: str, customer_ids: list[str]) -> dict[str, str]:
        """Return each customer's loyalty tier, for the given ids."""

        if not customer_ids:
            return {}
        statement = select(Customer.id, Customer.loyalty_tier).where(
            Customer.tenant_id == tenant_id, Customer.id.in_(customer_ids),
        )
        rows = (await self.session.execute(statement)).all()
        return {row.id: row.loyalty_tier for row in rows}
