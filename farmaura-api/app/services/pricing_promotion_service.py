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
from app.services.marketplace_projection import compute_effective_price, quantize_money


# ============================================================================
# LOYALTY TIER
# ============================================================================


# Ordered thresholds (minimum completed orders required), evaluated from the top down.
# Fixed in code rather than admin-configurable — see farmaura/06_Pendencias in dev-obsidian.
LOYALTY_TIER_THRESHOLDS: tuple[tuple[str, int], ...] = (
    ("Platina", 60),
    ("Diamante", 30),
    ("Ouro", 15),
    ("Prata", 5),
    ("Bronze", 1),
)


def compute_loyalty_tier(orders_count: int) -> str:
    """Return the loyalty tier label for one customer's completed-order count."""

    count = max(0, int(orders_count or 0))
    for label, minimum in LOYALTY_TIER_THRESHOLDS:
        if count >= minimum:
            return label
    return "Novo"


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
    loyalty_tier: str


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
    """Build the promotion profile used to evaluate audience targeting for one customer.

    ``regions`` accepts state, city, district (bairro), or a 5-digit CEP prefix — every axis
    an admin can target under the same free-text "regions" list, matched case-insensitively.
    """

    regions: list[str] = []
    if primary_address is not None:
        if primary_address.state_code:
            regions.append(primary_address.state_code.strip().upper())
        if primary_address.city:
            regions.append(primary_address.city.strip().lower())
        if primary_address.district:
            regions.append(primary_address.district.strip().lower())
        postal_digits = "".join(char for char in str(primary_address.postal_code or "") if char.isdigit())
        if len(postal_digits) >= 5:
            regions.append(postal_digits[:5])
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
        loyalty_tier=str(customer.loyalty_tier or "").strip().lower(),
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
    if promotion.scope_type == "services":
        # A services-scoped promotion never discounts a catalog product — see
        # find_best_service_promotion for the mirrored, service-only matching path.
        return False
    return True


def _matches_service_scope(promotion: PricingPromotion, *, service_name: str) -> bool:
    """Return whether one health service falls within the promotion's scope.

    Deliberately narrower than _matches_scope: only scope_type="services" ever
    matches here — a generic scope_type="all"/"categories"/"products" campaign is a
    catalog-product campaign and must never silently also discount a service booking.
    """

    if promotion.scope_type != "services":
        return False
    allowed = {value.strip().lower() for value in promotion.target_services}
    return service_name.strip().lower() in allowed


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
    loyalty_tiers: list[str] | None = None,
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
    if loyalty_tiers:
        allowed = {value.strip().lower() for value in loyalty_tiers}
        if profile.loyalty_tier not in allowed:
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
        loyalty_tiers=promotion.target_loyalty_tiers,
    )


def promotion_has_audience_restrictions(promotion: PricingPromotion) -> bool:
    """Return whether a promotion restricts on any audience axis (age, region, device, etc.).

    A promotion with no audience restriction is the only kind safe to show to an anonymous,
    logged-out visitor — there is no customer profile to evaluate a restriction against.
    """

    return bool(
        promotion.min_age is not None
        or promotion.max_age is not None
        or promotion.regions
        or promotion.device_types
        or promotion.marital_statuses
        or promotion.min_children is not None
        or promotion.max_children is not None
        or (promotion.customer_segment and promotion.customer_segment != "all")
        or promotion.target_loyalty_tiers
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


def find_best_service_promotion(
    promotions: list[PricingPromotion],
    *,
    service_name: str,
    profile: CustomerPromotionProfile,
    now: datetime,
) -> PricingPromotion | None:
    """Return the best-matching active promotion for one health service and customer, if any."""

    candidates = [
        promotion
        for promotion in promotions
        if promotion.is_active
        and _matches_schedule(promotion, now=now)
        and _matches_service_scope(promotion, service_name=service_name)
        and _matches_audience(promotion, profile=profile)
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda promotion: (promotion.priority, compute_discount_percent(promotion, base_price=Decimal("100"))),
    )


def apply_promotion_to_health_service(
    *,
    base_price: Decimal,
    service_name: str,
    promotions: list[PricingPromotion],
    profile: CustomerPromotionProfile,
    now: datetime,
) -> tuple[Decimal, PricingPromotion | None]:
    """Return the best-effort discounted price for one health-service booking, and the promotion applied (if any).

    Mirrors apply_promotion_to_catalog_item's shared-computation guarantee: this is the
    same function called for a live price preview and for the booking that actually
    charges the customer, so the two can never drift.
    """

    promotion = find_best_service_promotion(promotions, service_name=service_name, profile=profile, now=now)
    if promotion is None:
        return quantize_money(base_price), None
    percent = compute_discount_percent(promotion, base_price=base_price)
    return compute_effective_price(base_price, percent), promotion


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
    loyalty_tiers: list[str] | None = None,
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
            loyalty_tiers=loyalty_tiers,
        ):
            matches += 1
    return matches


# ============================================================================
# SHARED PRICE APPLICATION (catalog listing + checkout — same computation, same result)
# ============================================================================


def apply_promotion_to_catalog_item(
    item: dict[str, object],
    *,
    promotions: list[PricingPromotion],
    profile: CustomerPromotionProfile,
    now: datetime,
) -> None:
    """Override one grouped catalog item's price in place with its best-matching promotion.

    Shared by catalog listing (``catalog_service``) and marketplace checkout
    (``order_service``) so the discounted price a customer sees is exactly the price they are
    charged — a promotion is never applied only for display. Never lowers below a discount
    already baked into the item (e.g. a manually configured ``promotional_discount_percent``);
    the strongest discount always wins, so a promotion can only improve the customer's price.
    """

    old_price_raw = item.get("old_price")
    base_price = quantize_money(Decimal(str(old_price_raw)) if old_price_raw is not None else Decimal(str(item["price"])))
    promotion = find_best_promotion(promotions, category=str(item["cat"]), product_name=str(item["name"]), profile=profile, now=now)
    if promotion is None:
        return
    promo_percent = compute_discount_percent(promotion, base_price=base_price)
    current_discount_percent = int(str(item["discount_percent"]))
    if promo_percent <= current_discount_percent:
        return
    item["price"] = compute_effective_price(base_price, promo_percent)
    item["old_price"] = base_price
    item["discount_percent"] = int(promo_percent)
    tags = item["tags"]
    if isinstance(tags, list) and "oferta" not in tags:
        item["tags"] = [*tags, "oferta"]
    item["promotion_highlight"] = "superpromo" if promotion.highlight_style == "superpromo" else ""
    # Lets the marketplace card show "economize R$X" instead of a percent when the admin
    # configured the promotion as a flat R$ discount — a small percent can undersell a real
    # fixed discount, and vice versa, so the display should follow how the promo was set up.
    item["discount_type"] = promotion.discount_type
    item["urgency_label"] = promotion.urgency_label
