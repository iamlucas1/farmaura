"""
farmaura-api/app/schemas/portal.py

Portal bootstrap and marketplace preference schemas for Farmaura.

Responsibilities:
- define marketplace and internal bootstrap transport contracts;
- validate coupon, review, and portal-setting payloads;
- keep cross-portal metadata explicit and typed;

Observations:
- bootstrap payloads are cache-friendly snapshots derived from authoritative database records;
- customer-scoped collections remain normalized to simplify frontend cache hydration;
"""

from decimal import Decimal
from uuid import uuid4

from pydantic import Field, field_validator

from app.domain.validators import is_strong_password
from app.schemas.common import StrictModel


# ============================================================================
# SHARED PORTAL SCHEMAS
# ============================================================================


class PortalCategoryResponse(StrictModel):
    """Represent one marketplace category option."""

    id: str
    label: str
    description: str = ""
    icon: str = ""


class PortalStoreResponse(StrictModel):
    """Represent one physical store snapshot."""

    id: str
    name: str
    address: str = ""
    postal_code: str = ""
    district: str = ""
    city: str = ""
    state_code: str = ""
    ready_minutes: int = 20
    open_status_label: str = ""
    latitude: Decimal = Decimal("0.0000000")
    longitude: Decimal = Decimal("0.0000000")


class PortalPharmacistResponse(StrictModel):
    """Represent one pharmacist-facing display profile."""

    name: str = ""
    role_label: str = ""
    registration_code: str = ""
    email: str = ""
    avatar_initials: str = ""


class PortalMarketplaceMetaResponse(StrictModel):
    """Represent marketplace institutional and fee metadata."""

    name: str = "Marketplace Farmaura"
    commission_percent: Decimal = Decimal("0.00")
    payment_fee_percent: Decimal = Decimal("0.00")
    fixed_fee: Decimal = Decimal("0.00")
    minimum_margin_percent: Decimal = Decimal("0.00")
    legal_name: str = ""
    cnpj: str = ""
    state_registration: str = ""
    footer_note: str = ""
    pix_discount_percent: Decimal = Decimal("0.00")
    max_installments: int = 1
    interest_free_installments: int = 1
    installment_interest_percent: Decimal = Decimal("0.00")


class PortalMarketplaceMetaUpdateRequest(StrictModel):
    """Validate one marketplace meta update payload."""

    name: str = Field(default="Marketplace Farmaura", max_length=120)
    commission_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    payment_fee_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    fixed_fee: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    minimum_margin_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    legal_name: str = Field(default="", max_length=255)
    cnpj: str = Field(default="", max_length=32)
    state_registration: str = Field(default="", max_length=32)
    footer_note: str = Field(default="", max_length=255)
    # Payment-method pricing rules: centralized for the whole tenant (every store), not per
    # product or per store — standardizes how Pix/installments are priced across the catalog.
    pix_discount_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    max_installments: int = Field(default=1, ge=1, le=12)
    interest_free_installments: int = Field(default=1, ge=1, le=12)
    installment_interest_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("20.00"))


class PortalPdvDiscountSettingsResponse(StrictModel):
    """Represent the tenant's minimum average margin required to grant a PDV discount."""

    minimum_margin_percent: Decimal = Decimal("20.00")


class PortalPdvDiscountSettingsUpdateRequest(StrictModel):
    """Validate a PDV discount margin settings update payload."""

    minimum_margin_percent: Decimal = Field(default=Decimal("20.00"), ge=Decimal("0.00"), le=Decimal("95.00"))


class PortalCnaeEntry(StrictModel):
    """Represent one CNAE (business activity code) registered for the tenant."""

    code: str = Field(pattern=r"^\d{2}\.\d{2}-\d-\d{2}$")
    description: str = Field(default="", max_length=255)
    is_principal: bool = False
    is_subject_to_icms_st: bool = Field(
        default=False,
        description="True when goods under this CNAE already had ICMS collected upstream by the supplier via substituicao tributaria, so the ICMS slice of the Simples Nacional rate must not be charged again.",
    )


class PortalTaxRegimeSettings(StrictModel):
    """Represent the tenant's tax regime and the inputs needed to compute its effective rate."""

    regime: str = Field(default="simples_nacional", pattern="^simples_nacional$")
    state_code: str = Field(default="", max_length=2)
    trailing_12m_revenue: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


class PortalCnaeSettingsResponse(StrictModel):
    """Represent the tenant's registered CNAEs and tax regime used to price every item."""

    items: list[PortalCnaeEntry] = Field(default_factory=list)
    tax_regime: PortalTaxRegimeSettings = Field(default_factory=PortalTaxRegimeSettings)


class PortalCnaeSettingsUpdateRequest(StrictModel):
    """Validate a CNAE settings update payload."""

    items: list[PortalCnaeEntry] = Field(default_factory=list, max_length=40)
    tax_regime: PortalTaxRegimeSettings = Field(default_factory=PortalTaxRegimeSettings)


class PortalDeliveryPricingTier(StrictModel):
    """Represent one distance-based delivery fee tier."""

    up_to_km: Decimal = Field(gt=Decimal("0.00"), le=Decimal("500.00"))
    fee: Decimal = Field(ge=Decimal("0.00"), le=Decimal("999.99"))


class PortalDeliveryPricingResponse(StrictModel):
    """Represent the tenant's delivery pricing configuration."""

    tiers: list[PortalDeliveryPricingTier] = Field(default_factory=list)
    fee_beyond_last_tier: Decimal = Decimal("9.90")
    free_above_subtotal: Decimal = Decimal("120.00")


class PortalDeliveryPricingUpdateRequest(StrictModel):
    """Validate a delivery pricing configuration update payload."""

    tiers: list[PortalDeliveryPricingTier] = Field(default_factory=list, max_length=12)
    fee_beyond_last_tier: Decimal = Field(default=Decimal("9.90"), ge=Decimal("0.00"), le=Decimal("999.99"))
    free_above_subtotal: Decimal = Field(default=Decimal("120.00"), ge=Decimal("0.00"))


class PortalDeliveryFuelConfig(StrictModel):
    """Represent the fuel-cost calculation inputs for one 'calculated' price rule."""

    fuel_type: str = Field(default="gasoline", pattern="^(gasoline|ethanol)$")
    fuel_price_per_liter: Decimal = Field(default=Decimal("6.00"), gt=Decimal("0.00"), le=Decimal("50.00"))
    vehicle_km_per_liter: Decimal = Field(default=Decimal("12.00"), gt=Decimal("0.00"), le=Decimal("100.00"))
    fuel_margin_percent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("200.00"))


class PortalDeliveryPriceRule(StrictModel):
    """Represent one reusable delivery fee rule, shared by neighborhoods and radius tiers."""

    mode: str = Field(default="fixed", pattern="^(fixed|free|calculated)$")
    fixed_fee: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("999.99"))
    fuel: PortalDeliveryFuelConfig = Field(default_factory=PortalDeliveryFuelConfig)


class PortalDeliveryNeighborhood(StrictModel):
    """Represent one CEP-resolved neighborhood covered for delivery, with its own price rule."""

    id: str = Field(default="", max_length=64)
    postal_code: str = Field(default="", max_length=9)
    district: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    state_code: str = Field(default="", max_length=2)
    price: PortalDeliveryPriceRule = Field(default_factory=PortalDeliveryPriceRule)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_active: bool = True


class PortalAddressSearchResult(StrictModel):
    """Represent one free-text address search match, classified as neighborhood/city/other."""

    label: str = ""
    district: str = ""
    city: str = ""
    state_code: str = ""
    kind: str = "other"
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class PortalAddressSearchResponse(StrictModel):
    """Represent the results of one free-text address search."""

    results: list[PortalAddressSearchResult] = Field(default_factory=list)


class PortalDeliveryRadiusTier(StrictModel):
    """Represent one 'up to N km from the store' band, with its own price rule."""

    id: str = Field(default="", max_length=64)
    up_to_km: Decimal = Field(gt=Decimal("0.00"), le=Decimal("500.00"))
    price: PortalDeliveryPriceRule = Field(default_factory=PortalDeliveryPriceRule)
    is_active: bool = True


class PortalDeliveryVariation(StrictModel):
    """Represent one delivery speed variation and its extra fee."""

    id: str = Field(default="normal", pattern="^(normal|express)$")
    label: str = Field(default="", max_length=60)
    extra_fee: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("999.99"))
    eta_minutes: int = Field(default=180, ge=1, le=1440)


def _default_delivery_variations() -> list["PortalDeliveryVariation"]:
    """Return the seeded normal/express delivery variations."""

    return [
        PortalDeliveryVariation(id="normal", label="Padrão", extra_fee=Decimal("0.00"), eta_minutes=180),
        PortalDeliveryVariation(id="express", label="Expressa", extra_fee=Decimal("9.90"), eta_minutes=60),
    ]


class PortalDeliveryStoreAreaConfig(StrictModel):
    """Represent one store's neighborhood and radius-tier delivery-area configuration."""

    store_id: str = Field(default="", max_length=64)
    neighborhoods: list[PortalDeliveryNeighborhood] = Field(default_factory=list, max_length=200)
    radius_tiers: list[PortalDeliveryRadiusTier] = Field(default_factory=list, max_length=20)
    free_above_subtotal: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))


class PortalDeliveryAreasResponse(StrictModel):
    """Represent the tenant's per-store delivery-area configuration."""

    stores: list[PortalDeliveryStoreAreaConfig] = Field(default_factory=list)
    variations: list[PortalDeliveryVariation] = Field(default_factory=_default_delivery_variations)


class PortalDeliveryAreasUpdateRequest(StrictModel):
    """Validate a delivery-area configuration update payload."""

    stores: list[PortalDeliveryStoreAreaConfig] = Field(default_factory=list, max_length=20)
    variations: list[PortalDeliveryVariation] = Field(default_factory=list, max_length=6)


class PortalCouponResponse(StrictModel):
    """Represent one marketplace coupon campaign."""

    id: str
    code: str
    title: str = ""
    description: str = ""
    discount_type: str = "percent"
    shipping_discount_mode: str = "full"
    discount_value: Decimal = Decimal("0.00")
    minimum_order_value: Decimal = Decimal("0.00")
    max_discount_value: Decimal | None = None
    starts_at: str = ""
    ends_at: str = ""
    usage_limit: int | None = None
    usage_count: int = 0
    per_customer_limit: int = 1
    audience: str = "all"
    scope_type: str = "all"
    target_categories: list[str] = Field(default_factory=list)
    target_products: list[str] = Field(default_factory=list)
    first_purchase_only: bool = False
    stackable: bool = False
    active: bool = True
    notes: str = ""
    created_at: str = ""
    updated_at: str = ""


class PortalCouponMutationRequest(StrictModel):
    """Validate one coupon campaign upsert payload."""

    code: str = Field(min_length=1, max_length=24)
    title: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)
    discount_type: str = Field(default="percent", max_length=24)
    shipping_discount_mode: str = Field(default="full", max_length=24)
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    minimum_order_value: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    max_discount_value: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    starts_at: str = Field(default="", max_length=32)
    ends_at: str = Field(default="", max_length=32)
    usage_limit: int | None = Field(default=None, ge=0)
    per_customer_limit: int = Field(default=1, ge=0, le=9999)
    audience: str = Field(default="all", max_length=32)
    scope_type: str = Field(default="all", max_length=24)
    target_categories: list[str] = Field(default_factory=list)
    target_products: list[str] = Field(default_factory=list)
    first_purchase_only: bool = False
    stackable: bool = False
    active: bool = True
    notes: str = Field(default="", max_length=1000)


class PortalPricingPromotionResponse(StrictModel):
    """Represent one automatic marketplace pricing promotion."""

    id: str
    name: str
    description: str = ""
    active: bool = True
    discount_type: str = "percent"
    discount_value: Decimal = Decimal("0.00")
    max_discount_value: Decimal | None = None
    scope_type: str = "all"
    target_categories: list[str] = Field(default_factory=list)
    target_products: list[str] = Field(default_factory=list)
    starts_at: str = ""
    ends_at: str = ""
    daily_start_time: str = ""
    daily_end_time: str = ""
    days_of_week: list[int] = Field(default_factory=list)
    min_age: int | None = None
    max_age: int | None = None
    regions: list[str] = Field(default_factory=list)
    device_types: list[str] = Field(default_factory=list)
    marital_statuses: list[str] = Field(default_factory=list)
    min_children: int | None = None
    max_children: int | None = None
    customer_segment: str = "all"
    priority: int = 0
    notes: str = ""
    created_at: str = ""
    updated_at: str = ""


class PortalPricingPromotionMutationRequest(StrictModel):
    """Validate one pricing promotion upsert payload."""

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    active: bool = True
    discount_type: str = Field(default="percent", max_length=16)
    discount_value: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    max_discount_value: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    scope_type: str = Field(default="all", max_length=24)
    target_categories: list[str] = Field(default_factory=list)
    target_products: list[str] = Field(default_factory=list)
    starts_at: str = Field(default="", max_length=32)
    ends_at: str = Field(default="", max_length=32)
    daily_start_time: str = Field(default="", max_length=5)
    daily_end_time: str = Field(default="", max_length=5)
    days_of_week: list[int] = Field(default_factory=list)
    min_age: int | None = Field(default=None, ge=0, le=120)
    max_age: int | None = Field(default=None, ge=0, le=120)
    regions: list[str] = Field(default_factory=list)
    device_types: list[str] = Field(default_factory=list)
    marital_statuses: list[str] = Field(default_factory=list)
    min_children: int | None = Field(default=None, ge=0, le=20)
    max_children: int | None = Field(default=None, ge=0, le=20)
    customer_segment: str = Field(default="all", max_length=24)
    priority: int = Field(default=0, ge=0, le=100)
    notes: str = Field(default="", max_length=1000)


class PortalPricingPromotionAudienceEstimateRequest(StrictModel):
    """Validate one draft audience-size estimate request."""

    min_age: int | None = Field(default=None, ge=0, le=120)
    max_age: int | None = Field(default=None, ge=0, le=120)
    regions: list[str] = Field(default_factory=list)
    device_types: list[str] = Field(default_factory=list)
    marital_statuses: list[str] = Field(default_factory=list)
    min_children: int | None = Field(default=None, ge=0, le=20)
    max_children: int | None = Field(default=None, ge=0, le=20)
    customer_segment: str = Field(default="all", max_length=24)


class PortalPricingPromotionAudienceEstimateResponse(StrictModel):
    """Represent the estimated audience size for a draft promotion."""

    matching_customers: int = 0
    total_active_customers: int = 0


class PortalProductReviewResponse(StrictModel):
    """Represent one published marketplace product review."""

    id: str
    product_ref: str
    reviewer_name: str = ""
    reviewer_avatar_initials: str = ""
    title: str = ""
    body: str = ""
    rating: int = 5
    helpful_count: int = 0
    is_verified_purchase: bool = False
    submitted_at: str = ""


class PortalProductReviewCreateRequest(StrictModel):
    """Validate one marketplace product review submission."""

    product_ref: str = Field(min_length=1, max_length=120)
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=120)
    body: str = Field(min_length=8, max_length=1200)


class PortalProductReviewCollectionResponse(StrictModel):
    """Represent the review summary and comments for one product."""

    product_ref: str
    rating_average: Decimal = Decimal("0.00")
    review_count: int = 0
    items: list[PortalProductReviewResponse] = Field(default_factory=list)


class PortalFinancialMonthResponse(StrictModel):
    """Represent one monthly finance assumption snapshot."""

    faturamento: Decimal = Decimal("0.00")
    aluguel: Decimal = Decimal("0.00")
    energia: Decimal = Decimal("0.00")
    agua: Decimal = Decimal("0.00")
    contab: Decimal = Decimal("0.00")
    licencas: Decimal = Decimal("0.00")
    manut: Decimal = Decimal("0.00")
    folha: Decimal = Decimal("0.00")
    cmv_pct: Decimal = Decimal("0.00")
    icms_pct: Decimal = Decimal("0.00")
    reinv_pct: Decimal = Decimal("0.00")
    roi_aa: Decimal = Decimal("0.00")


class PortalFinancialSettingsResponse(StrictModel):
    """Represent the finance assumption collection for the internal portal."""

    months: dict[str, PortalFinancialMonthResponse] = Field(default_factory=dict)


class PortalFinancialSettingsUpdateRequest(StrictModel):
    """Validate one finance assumption collection update payload."""

    months: dict[str, PortalFinancialMonthResponse] = Field(default_factory=dict)


class PortalConstructionCostItem(StrictModel):
    """Represent one construction cost line item (money and time spent)."""

    id: str = Field(default_factory=lambda: str(uuid4()), max_length=64)
    label: str = Field(min_length=1, max_length=120)
    category: str = Field(default="", max_length=60)
    amount: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    days: int = Field(default=0, ge=0, le=3650)
    note: str = Field(default="", max_length=500)


class PortalStoreConstructionCostsInput(StrictModel):
    """Validate the editable construction cost fields for one store."""

    opened_at: str = Field(default="", max_length=10)
    construction_started_at: str = Field(default="", max_length=10)
    net_margin_pct: Decimal = Field(default=Decimal("15.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    items: list[PortalConstructionCostItem] = Field(default_factory=list, max_length=100)


class PortalStoreConstructionCostsResponse(StrictModel):
    """Represent one store's construction cost entry plus its real-sales ROI figures."""

    opened_at: str = ""
    construction_started_at: str = ""
    net_margin_pct: Decimal = Decimal("15.00")
    items: list[PortalConstructionCostItem] = Field(default_factory=list)
    total_invested: Decimal = Decimal("0.00")
    total_days: int = 0
    revenue_since_opening: Decimal = Decimal("0.00")
    sales_count: int = 0
    months_since_opening: Decimal = Decimal("0.00")
    avg_monthly_revenue: Decimal = Decimal("0.00")
    estimated_profit_since_opening: Decimal = Decimal("0.00")
    roi_pct: Decimal | None = None
    payback_months: Decimal | None = None


class PortalConstructionCostsResponse(StrictModel):
    """Represent the construction cost and ROI collection for every store."""

    stores: dict[str, PortalStoreConstructionCostsResponse] = Field(default_factory=dict)


class PortalConstructionCostsUpdateRequest(StrictModel):
    """Validate a construction cost collection update payload."""

    stores: dict[str, PortalStoreConstructionCostsInput] = Field(default_factory=dict, max_length=200)


class PortalDeliveryRouteStopResponse(StrictModel):
    """Represent one ordered stop inside the active delivery route."""

    id: str
    order_id: str
    order_code: str = ""
    customer: str = ""
    address: str = ""
    district: str = ""
    cep: str = ""
    status: str = "planned"
    lat: Decimal | None = None
    lng: Decimal | None = None
    dist: Decimal | None = None
    navigation_url: str = ""


class PortalDeliveryRouteResponse(StrictModel):
    """Represent the active internal delivery route payload."""

    id: str = ""
    code: str = ""
    status: str = "planned"
    driver: str = ""
    driver_user_id: str = ""
    vehicle: str = ""
    total_km: Decimal = Decimal("0.00")
    total_min: int = 0
    saved_km: Decimal = Decimal("0.00")
    provider: str = ""
    hub_name: str = ""
    hub_address: str = ""
    hub_lat: Decimal | None = None
    hub_lng: Decimal | None = None
    stops: list[PortalDeliveryRouteStopResponse] = Field(default_factory=list)


class PortalInternalBootstrapResponse(StrictModel):
    """Represent the internal console bootstrap payload."""

    now_label: str
    today_label: str = ""
    today_iso: str = ""
    pharmacist: PortalPharmacistResponse
    marketplace: PortalMarketplaceMetaResponse
    store: PortalStoreResponse
    stores: list[PortalStoreResponse] = Field(default_factory=list)
    chart_seed: dict[str, list[dict[str, int | str]]] = Field(default_factory=dict)
    coupon_campaigns: list[PortalCouponResponse] = Field(default_factory=list)
    pricing_promotions: list[PortalPricingPromotionResponse] = Field(default_factory=list)
    financial_settings: PortalFinancialSettingsResponse = Field(default_factory=PortalFinancialSettingsResponse)
    delivery_route: PortalDeliveryRouteResponse = Field(default_factory=PortalDeliveryRouteResponse)
    delivery_pricing: PortalDeliveryPricingResponse = Field(default_factory=PortalDeliveryPricingResponse)
    delivery_areas: PortalDeliveryAreasResponse = Field(default_factory=PortalDeliveryAreasResponse)
    pdv_discount_settings: PortalPdvDiscountSettingsResponse = Field(default_factory=PortalPdvDiscountSettingsResponse)
    cnae_settings: PortalCnaeSettingsResponse = Field(default_factory=PortalCnaeSettingsResponse)


class PortalHealthServiceResponse(StrictModel):
    """Represent one customer-facing health service."""

    id: str
    name: str
    group: str = ""
    icon: str = "activity"
    description: str = ""
    duration_label: str = ""
    duration_minutes: int = 0
    price_amount: Decimal = Decimal("0.00")


class PortalHealthHistoryResponse(StrictModel):
    """Represent one customer-facing health service appointment."""

    id: str
    service: str
    store: str = ""
    professional: str = ""
    date: str = ""
    time: str = ""
    status: str = "upcoming"


class PortalHealthAppointmentCreateRequest(StrictModel):
    """Validate one health service booking submitted by a marketplace customer."""

    service_id: str = Field(min_length=1, max_length=64)
    store_id: str = Field(default="", max_length=64)
    store_name: str = Field(default="", max_length=255)
    scheduled_date_label: str = Field(default="", max_length=40)
    scheduled_time_label: str = Field(min_length=1, max_length=20)


class PortalFavoriteResponse(StrictModel):
    """Represent one saved marketplace product reference."""

    product_ref: str


class PortalSubscriptionResponse(StrictModel):
    """Represent one recurring marketplace subscription."""

    product_ref: str
    quantity: int
    frequency_days: int
    is_paused: bool
    next_cycle_in_days: int
    started_at_label: str = ""


class PortalMarketplaceDeliveryEstimateResponse(StrictModel):
    """Represent the pre-checkout free-shipping threshold and base fee shown in the marketplace, sourced from admin delivery settings."""

    free_above_subtotal: Decimal = Decimal("0.00")
    base_fee: Decimal = Decimal("0.00")


class PortalMarketplaceBootstrapResponse(StrictModel):
    """Represent the authenticated marketplace bootstrap payload."""

    categories: list[PortalCategoryResponse]
    stores: list[PortalStoreResponse]
    pharmacist: PortalPharmacistResponse
    marketplace: PortalMarketplaceMetaResponse
    health_services: list[PortalHealthServiceResponse]
    health_history: list[PortalHealthHistoryResponse]
    favorites: list[PortalFavoriteResponse]
    subscriptions: list[PortalSubscriptionResponse]
    coupons: list[PortalCouponResponse] = Field(default_factory=list)
    delivery_estimate: PortalMarketplaceDeliveryEstimateResponse = Field(default_factory=PortalMarketplaceDeliveryEstimateResponse)


class PortalMarketplacePublicBootstrapResponse(StrictModel):
    """Represent the public marketplace bootstrap payload."""

    categories: list[PortalCategoryResponse]
    stores: list[PortalStoreResponse]
    pharmacist: PortalPharmacistResponse
    marketplace: PortalMarketplaceMetaResponse
    health_services: list[PortalHealthServiceResponse]
    coupons: list[PortalCouponResponse] = Field(default_factory=list)
    delivery_estimate: PortalMarketplaceDeliveryEstimateResponse = Field(default_factory=PortalMarketplaceDeliveryEstimateResponse)


class PortalFavoriteMutationRequest(StrictModel):
    """Validate a saved product mutation payload."""

    product_ref: str = Field(min_length=1, max_length=120)


class PortalSubscriptionCreateRequest(StrictModel):
    """Validate one marketplace subscription creation payload."""

    product_ref: str = Field(min_length=1, max_length=120)
    quantity: int = Field(default=1, ge=1, le=99)
    frequency_days: int = Field(default=30, ge=1, le=365)


class PortalSubscriptionUpdateRequest(StrictModel):
    """Validate one marketplace subscription update payload."""

    quantity: int | None = Field(default=None, ge=1, le=99)
    frequency_days: int | None = Field(default=None, ge=1, le=365)
    is_paused: bool | None = None
    skip_next_cycle: bool = False


class PortalFirstAccessRequest(StrictModel):
    """Validate a marketplace first-access request payload."""

    email: str = Field(min_length=5, max_length=320)


class PortalFirstAccessResponse(StrictModel):
    """Represent a marketplace first-access request outcome."""

    status: str = "ok"
    detail: str


class PortalRegisterRequest(StrictModel):
    """Validate a self-service marketplace account creation payload."""

    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=320)
    phone: str = Field(default="", max_length=32)
    password: str = Field(min_length=8, max_length=128)
    remember_session: bool = False

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Require lowercase, uppercase, digit, and special characters."""

        if not is_strong_password(value):
            raise ValueError("A senha deve conter letra minúscula, letra maiúscula, número e caractere especial.")
        return value
