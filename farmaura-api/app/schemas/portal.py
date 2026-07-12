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

from pydantic import Field

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
    chart_seed: dict[str, list[dict[str, int | str]]] = Field(default_factory=dict)
    coupon_campaigns: list[PortalCouponResponse] = Field(default_factory=list)
    financial_settings: PortalFinancialSettingsResponse = Field(default_factory=PortalFinancialSettingsResponse)
    delivery_route: PortalDeliveryRouteResponse = Field(default_factory=PortalDeliveryRouteResponse)
    delivery_pricing: PortalDeliveryPricingResponse = Field(default_factory=PortalDeliveryPricingResponse)


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


class PortalMarketplacePublicBootstrapResponse(StrictModel):
    """Represent the public marketplace bootstrap payload."""

    categories: list[PortalCategoryResponse]
    stores: list[PortalStoreResponse]
    pharmacist: PortalPharmacistResponse
    marketplace: PortalMarketplaceMetaResponse
    health_services: list[PortalHealthServiceResponse]
    coupons: list[PortalCouponResponse] = Field(default_factory=list)


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
