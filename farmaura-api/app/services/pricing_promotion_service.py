"""
farmaura-api/app/services/pricing_promotion_service.py

Pricing promotion matching engine for Farmaura.

Responsibilities:
- resolve a requesting customer's promotion-relevant profile (age, region, device, family);
- decide which active PricingPromotion (if any) best matches a product and profile at one moment;
- estimate how many existing customers would qualify for a draft promotion's audience filters;

Observations:
- shared by catalog_service (apply promo pricing to logged-in shoppers) and portal_service
  (audience-size estimate for the admin UI) so preview and enforcement never drift apart;
- every audience axis is opt-in: an empty list/None on a promotion means "does not restrict
  on this axis" — filters only exclude customers when the promotion actually sets them.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.customer_address import CustomerAddress
from app.models.pricing_promotion import PricingPromotion


# ============================================================================
# CUSTOMER PROMOTION PROFILE
# ============================================================================


@dataclass(frozen=True)
class CustomerPromotionProfile:
    """Represent the promotion-relevant facts about one requesting customer."""

    age: int | None
    regions: tuple[str, ...]
    device_type: str
    marital_status: str
    children_count: int | None
    is_new: bool
    is_recurring: bool


def compute_age(birth_date: str, *, today: date | None = None) -> int | None:
    """Return whole years of age from a YYYY-MM-DD birth date string, or None if invalid."""

    raw = str(birth_date or "").strip()
    if len(raw) != 10:
        return None
    try:
        born = date.fromisoformat(raw)
    except ValueError:
        return None
    reference = today or datetime.now().date()
    years = reference.year - born.year - ((reference.month, reference.day) < (born.month, born.day))
    return years if years >= 0 else None


def resolve_customer_promotion_profile(
    *,
    customer: Customer,
    primary_address: CustomerAddress | None,
    device_type: str,
) -> CustomerPromotionProfile:
    """Build the promotion profile used to evaluate audience targeting for one customer."""

    regions: list[str] = []
    if primary_address is not None:
        if primary_address.state_code:
            regions.append(primary_address.state_code.strip().upper())
        if primary_address.city:
            regions.append(primary_address.city.strip().lower())
    elif customer.city_label:
        regions.append(customer.city_label.strip().lower())
    return CustomerPromotionProfile(
        age=compute_age(customer.birth_date),
        regions=tuple(dict.fromkeys(region for region in regions if region)),
        device_type=str(device_type or "").strip().lower(),
        marital_status=str(customer.marital_status or "").strip().lower(),
        children_count=customer.children_count,
        is_new=int(customer.orders_count or 0) <= 0,
        is_recurring=bool(customer.is_recurring),
    )


# ============================================================================
# MATCHING PREDICATES
# ============================================================================


def _parse_hhmm(value: str) -> int | None:
    """Return minutes-since-midnight for one HH:MM string, or None if malformed."""

    parts = str(value or "").split(":")
    if len(parts) != 2:
        return None
    try:
        hours, minutes = int(parts[0]), int(parts[1])
    except ValueError:
        return None
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return None
    return hours * 60 + minutes


def _matches_schedule(promotion: PricingPromotion, *, now: datetime) -> bool:
    """Return whether one moment falls within the promotion's date, weekday, and daily window."""

    if promotion.starts_at is not None and now < promotion.starts_at:
        return False
    if promotion.ends_at is not None and now > promotion.ends_at:
        return False
    if promotion.days_of_week:
        current_weekday = (now.weekday() + 1) % 7  # Sunday=0..Saturday=6, matches stored convention
        if current_weekday not in promotion.days_of_week:
            return False
    if promotion.daily_start_time and promotion.daily_end_time:
        start_minutes = _parse_hhmm(promotion.daily_start_time)
        end_minutes = _parse_hhmm(promotion.daily_end_time)
        if start_minutes is not None and end_minutes is not None:
            current_minutes = now.hour * 60 + now.minute
            if start_minutes <= end_minutes:
                if not (start_minutes <= current_minutes <= end_minutes):
                    return False
            elif not (current_minutes >= start_minutes or current_minutes <= end_minutes):
                return False
    return True


def _matches_scope(promotion: PricingPromotion, *, category: str, product_name: str) -> bool:
    """Return whether one product falls within the promotion's catalog scope."""

    if promotion.scope_type == "categories":
        allowed = {value.strip().lower() for value in promotion.target_categories}
        return category.strip().lower() in allowed
    if promotion.scope_type == "products":
        allowed = {value.strip().lower() for value in promotion.target_products}
        return product_name.strip().lower() in allowed
    return True


def _matches_audience_criteria(
    *,
    profile: CustomerPromotionProfile,
    min_age: int | None,
    max_age: int | None,
    regions: list[str],
    device_types: list[str],
    marital_statuses: list[str],
    min_children: int | None,
    max_children: int | None,
    customer_segment: str,
) -> bool:
    """Return whether one customer profile satisfies a set of audience filters."""

    if min_age is not None and (profile.age is None or profile.age < min_age):
        return False
    if max_age is not None and (profile.age is None or profile.age > max_age):
        return False
    if regions:
        allowed = {value.strip().lower() for value in regions}
        if not any(region in allowed for region in profile.regions):
            return False
    if device_types:
        allowed = {value.strip().lower() for value in device_types}
        if profile.device_type not in allowed:
            return False
    if marital_statuses:
        allowed = {value.strip().lower() for value in marital_statuses}
        if profile.marital_status not in allowed:
            return False
    if min_children is not None and (profile.children_count is None or profile.children_count < min_children):
        return False
    if max_children is not None and (profile.children_count is None or profile.children_count > max_children):
        return False
    if customer_segment == "new_customers" and not profile.is_new:
        return False
    if customer_segment == "recurring" and not profile.is_recurring:
        return False
    return True


def _matches_audience(promotion: PricingPromotion, *, profile: CustomerPromotionProfile) -> bool:
    """Return whether one customer profile satisfies a promotion's audience filters."""

    return _matches_audience_criteria(
        profile=profile,
        min_age=promotion.min_age,
        max_age=promotion.max_age,
        regions=promotion.regions,
        device_types=promotion.device_types,
        marital_statuses=promotion.marital_statuses,
        min_children=promotion.min_children,
        max_children=promotion.max_children,
        customer_segment=promotion.customer_segment,
    )


# ============================================================================
# DISCOUNT RESOLUTION
# ============================================================================


def compute_discount_percent(promotion: PricingPromotion, *, base_price: Decimal) -> Decimal:
    """Return the effective discount percent a promotion applies to one base price."""

    if base_price <= 0:
        return Decimal("0")
    if promotion.discount_type == "fixed":
        capped = min(promotion.discount_value, base_price)
        if promotion.max_discount_value is not None:
            capped = min(capped, promotion.max_discount_value)
        return (capped / base_price * Decimal("100")).quantize(Decimal("0.01"))
    percent = promotion.discount_value
    if promotion.max_discount_value is not None:
        max_percent = promotion.max_discount_value / base_price * Decimal("100")
        percent = min(percent, max_percent)
    return percent


def find_best_promotion(
    promotions: list[PricingPromotion],
    *,
    category: str,
    product_name: str,
    profile: CustomerPromotionProfile,
    now: datetime,
) -> PricingPromotion | None:
    """Return the best-matching active promotion for one product and customer, if any."""

    candidates = [
        promotion
        for promotion in promotions
        if promotion.is_active
        and _matches_schedule(promotion, now=now)
        and _matches_scope(promotion, category=category, product_name=product_name)
        and _matches_audience(promotion, profile=profile)
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda promotion: (promotion.priority, compute_discount_percent(promotion, base_price=Decimal("100"))),
    )


# ============================================================================
# AUDIENCE SIZE ESTIMATION
# ============================================================================


async def estimate_audience_size(
    session: AsyncSession,
    *,
    tenant_id: str,
    min_age: int | None,
    max_age: int | None,
    regions: list[str],
    device_types: list[str],
    marital_statuses: list[str],
    min_children: int | None,
    max_children: int | None,
    customer_segment: str,
) -> int:
    """Return how many active customers of one tenant match the given audience filters."""

    customers = list(
        (
            await session.execute(
                select(Customer).where(Customer.tenant_id == tenant_id, Customer.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    if not customers:
        return 0
    customer_ids = [customer.id for customer in customers]
    addresses = list(
        (
            await session.execute(
                select(CustomerAddress).where(
                    CustomerAddress.customer_id.in_(customer_ids),
                    CustomerAddress.is_primary.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    address_by_customer_id = {address.customer_id: address for address in addresses}
    matches = 0
    for customer in customers:
        profile = resolve_customer_promotion_profile(
            customer=customer,
            primary_address=address_by_customer_id.get(customer.id),
            device_type=customer.last_device_type,
        )
        if _matches_audience_criteria(
            profile=profile,
            min_age=min_age,
            max_age=max_age,
            regions=regions,
            device_types=device_types,
            marital_statuses=marital_statuses,
            min_children=min_children,
            max_children=max_children,
            customer_segment=customer_segment,
        ):
            matches += 1
    return matches
