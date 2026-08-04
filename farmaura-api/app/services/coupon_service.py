"""
farmaura-api/app/services/coupon_service.py

Shared coupon resolution service for Farmaura.

Responsibilities:
- validate one coupon code against its CouponCampaign row and price its discount,
  shared by every channel that can redeem a coupon (marketplace checkout, PDV balcão);
- keep eligibility counting (previous purchases, per-customer uses) channel-agnostic,
  since a customer's history and usage limit must hold across online and PDV alike;

Observations:
- callers build a neutral cart_lines shape (CouponCartLine) from their own item
  source before calling resolve_coupon — this service knows nothing about
  marketplace catalog groups or PDV inventory snapshots;
- the campaign row is locked (with_for_update) so two concurrent redemptions near a
  usage limit can't both slip through, across channels;
- a coupon always requires an identified customer, even in PDV where a sale can
  otherwise be anonymous ("consumidor não identificado") — per_customer_limit and
  the audience/segment analytics this backs are meaningless without one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import OrderStatus
from app.models.coupon_campaign import CouponCampaign
from app.models.health_service_appointment import HealthServiceAppointment
from app.models.order import Order
from app.models.pdv_sale import PdvSale
from app.services.marketplace_projection import quantize_money


@dataclass(frozen=True, slots=True)
class CouponCartLine:
    """One neutral cart line used to resolve coupon scope and eligibility."""

    price: Decimal
    quantity: int
    category: str = ""
    name: str = ""


def normalize_coupon_code(value: str) -> str:
    """Return a normalized coupon code, or '' when none was submitted.

    Mirrors PortalService._normalize_coupon_code but never raises — an empty/blank
    code at checkout just means "no coupon", not a validation error.
    """

    return ''.join(character for character in str(value or '').upper().strip() if character.isalnum() or character in {'_', '-'})[:24]


def _json_load_list(raw: str | None) -> list[object]:
    """Return one decoded JSON list, or an empty list if raw is missing/invalid."""

    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return decoded if isinstance(decoded, list) else []


def list_matching_inventory_items(
    campaign: CouponCampaign,
    inventory_items: list,
    *,
    now: datetime,
) -> list:
    """Return every inventory item currently within one coupon campaign's active window and scope.

    Reverse of `resolve_coupon`'s per-line scope check — used by the "ofertas do dia" admin
    suggestion engine to list every product a coupon currently covers, not to redeem a cart. A
    `scope_type="services"` campaign never matches (same isolation `resolve_coupon` enforces via
    `allow_service_scope`).
    """

    if not campaign.is_active or campaign.scope_type == 'services':
        return []
    if campaign.starts_at is not None and campaign.starts_at > now:
        return []
    if campaign.ends_at is not None and campaign.ends_at < now:
        return []
    target_categories = {str(value or '').strip().lower() for value in _json_load_list(campaign.target_categories_json)}
    target_products = {str(value or '').strip().lower() for value in _json_load_list(campaign.target_products_json)}
    matches = []
    for item in inventory_items:
        if campaign.scope_type == 'categories' and item.category_name.strip().lower() not in target_categories:
            continue
        if campaign.scope_type == 'products' and item.name.strip().lower() not in target_products:
            continue
        matches.append(item)
    return matches


class CouponService:
    """Validate and price coupon redemptions across every sales channel."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the session used for coupon and cross-channel history queries."""

        self.session = session

    async def resolve_coupon(
        self,
        *,
        tenant_id: str,
        customer_id: str | None,
        code: str,
        channel: str,
        cart_lines: list[CouponCartLine],
        subtotal_amount: Decimal,
        secondary_fee_amount: Decimal,
        requires_prescription: bool,
        allow_service_scope: bool = False,
    ) -> tuple[CouponCampaign | None, Decimal]:
        """Validate one coupon code against its real campaign row and price its discount.

        The backend is the sole source of truth here — the caller only ever passes a
        code, never a pre-computed discount. Eligibility failures share one generic
        message so a probing client can't map out a campaign's rules by trial and
        error; the minimum-order message is the deliberate exception since it isn't
        sensitive and helps a legitimate shopper fix their cart.
        """

        normalized_code = normalize_coupon_code(code)
        if not normalized_code:
            return None, Decimal('0.00')
        if customer_id is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Selecione um cliente para aplicar este cupom.')

        statement = (
            select(CouponCampaign)
            .where(CouponCampaign.tenant_id == tenant_id, CouponCampaign.code == normalized_code)
            .with_for_update()
        )
        campaign = (await self.session.execute(statement)).scalar_one_or_none()
        invalid = HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Cupom inválido ou indisponível.')
        if campaign is None or not campaign.is_active:
            raise invalid
        if campaign.channel_scope not in ('all', channel):
            raise invalid
        # A "services" scope campaign only ever redeems on a health-service booking, and a
        # booking never redeems a generic "all"/"categories"/"products" campaign — same
        # deliberate isolation as PricingPromotion.target_services, so an existing sitewide
        # coupon never silently starts working at booking the day this axis is adopted.
        if allow_service_scope and campaign.scope_type != 'services':
            raise invalid
        if not allow_service_scope and campaign.scope_type == 'services':
            raise invalid
        now = datetime.now(UTC)
        if campaign.starts_at is not None and campaign.starts_at > now:
            raise invalid
        if campaign.ends_at is not None and campaign.ends_at < now:
            raise invalid
        if campaign.usage_limit is not None and campaign.usage_count >= campaign.usage_limit:
            raise invalid

        previous_purchases_count = await self._count_previous_purchases(tenant_id, customer_id)
        if campaign.first_purchase_only and previous_purchases_count > 0:
            raise invalid
        if campaign.audience == 'new_customers' and previous_purchases_count > 0:
            raise invalid
        if campaign.audience == 'recurring' and previous_purchases_count == 0:
            raise invalid
        if campaign.audience == 'prescription' and not requires_prescription:
            raise invalid

        if campaign.per_customer_limit:
            previous_uses = await self._count_customer_coupon_uses(tenant_id, customer_id, normalized_code)
            if previous_uses >= campaign.per_customer_limit:
                raise invalid

        target_categories = {str(value or '').strip().lower() for value in _json_load_list(campaign.target_categories_json)}
        target_products = {str(value or '').strip().lower() for value in _json_load_list(campaign.target_products_json)}
        target_services = {str(value or '').strip().lower() for value in _json_load_list(campaign.target_services_json)}
        eligible_subtotal = Decimal('0.00')
        for line in cart_lines:
            if campaign.scope_type == 'categories' and line.category.strip().lower() not in target_categories:
                continue
            if campaign.scope_type == 'products' and line.name.strip().lower() not in target_products:
                continue
            if campaign.scope_type == 'services' and line.name.strip().lower() not in target_services:
                continue
            eligible_subtotal += quantize_money(line.price * Decimal(line.quantity))
        if campaign.scope_type in ('categories', 'products', 'services') and eligible_subtotal <= 0:
            raise invalid

        minimum_order_value = Decimal(campaign.minimum_order_value or 0)
        if minimum_order_value > 0 and subtotal_amount < minimum_order_value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f'Este cupom exige pedido mínimo de {minimum_order_value}.',
            )

        discount_amount = self.compute_coupon_discount(campaign, eligible_subtotal, secondary_fee_amount)
        if campaign.discount_type == 'shipping' and secondary_fee_amount <= 0:
            raise invalid
        if discount_amount <= 0:
            raise invalid
        return campaign, discount_amount

    def compute_coupon_discount(self, campaign: CouponCampaign, eligible_subtotal: Decimal, secondary_fee_amount: Decimal) -> Decimal:
        """Return the priced discount for one resolved coupon campaign.

        Mirrors computeMarketplaceCouponDiscount (cart-screen.jsx) so the cart's instant
        preview and this server-authoritative value stay consistent.
        """

        if campaign.discount_type == 'shipping':
            shipping_fee = max(Decimal('0.00'), secondary_fee_amount)
            mode = campaign.shipping_discount_mode or 'full'
            if mode == 'percent':
                return quantize_money(min(shipping_fee, shipping_fee * Decimal(campaign.discount_value) / Decimal('100')))
            if mode == 'fixed':
                return quantize_money(min(shipping_fee, Decimal(campaign.discount_value)))
            return quantize_money(shipping_fee)
        if eligible_subtotal <= 0:
            return Decimal('0.00')
        if campaign.discount_type == 'fixed':
            return quantize_money(min(eligible_subtotal, Decimal(campaign.discount_value)))
        raw_discount = eligible_subtotal * Decimal(campaign.discount_value) / Decimal('100')
        if campaign.max_discount_value is not None:
            return quantize_money(min(raw_discount, Decimal(campaign.max_discount_value)))
        return quantize_money(raw_discount)

    async def _count_previous_purchases(self, tenant_id: str, customer_id: str) -> int:
        """Return how many past orders this customer has, across online and PDV."""

        online_count = (await self.session.execute(
            select(func.count()).select_from(Order).where(
                Order.tenant_id == tenant_id, Order.customer_id == customer_id, Order.status != OrderStatus.CANCELLED.value,
            )
        )).scalar_one()
        pdv_count = (await self.session.execute(
            select(func.count()).select_from(PdvSale).where(
                PdvSale.tenant_id == tenant_id, PdvSale.customer_id == customer_id,
            )
        )).scalar_one()
        return int(online_count) + int(pdv_count)

    async def _count_customer_coupon_uses(self, tenant_id: str, customer_id: str, code: str) -> int:
        """Return how many times this customer has already redeemed this code, across channels."""

        online_count = (await self.session.execute(
            select(func.count()).select_from(Order).where(
                Order.tenant_id == tenant_id, Order.customer_id == customer_id,
                Order.coupon_code == code, Order.status != OrderStatus.CANCELLED.value,
            )
        )).scalar_one()
        pdv_count = (await self.session.execute(
            select(func.count()).select_from(PdvSale).where(
                PdvSale.tenant_id == tenant_id, PdvSale.customer_id == customer_id, PdvSale.coupon_code == code,
            )
        )).scalar_one()
        booking_count = (await self.session.execute(
            select(func.count()).select_from(HealthServiceAppointment).where(
                HealthServiceAppointment.tenant_id == tenant_id, HealthServiceAppointment.customer_id == customer_id,
                HealthServiceAppointment.coupon_code == code,
            )
        )).scalar_one()
        return int(online_count) + int(pdv_count) + int(booking_count)
