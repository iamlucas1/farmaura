"""
farmaura-api/app/api/v1/portal.py

Portal routes for Farmaura.

Responsibilities:
- expose marketplace and internal bootstrap snapshots derived from persisted records;
- expose coupon, review, favorite, and subscription mutations for the authenticated actor;
- keep transport handlers thin and delegated to the portal service.

Observations:
- public bootstrap routes intentionally skip subject resolution;
- authenticated routes always resolve tenant scope through the token subject.
"""

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_session, get_subject_session, require_internal_subject, require_marketplace_subject
from app.core.rate_limit import PASSWORD_RESET_RATE_LIMIT, PUBLIC_RATE_LIMIT, rate_limit
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.portal import (
    PortalAddressSearchResponse,
    PortalCnaeSettingsResponse,
    PortalCnaeSettingsUpdateRequest,
    PortalConstructionCostsResponse,
    PortalConstructionCostsUpdateRequest,
    PortalCouponMutationRequest,
    PortalCouponResponse,
    PortalDeliveryPricingResponse,
    PortalDeliveryPricingUpdateRequest,
    PortalDeliveryAreasResponse,
    PortalDeliveryAreasUpdateRequest,
    PortalFavoriteMutationRequest,
    PortalFavoriteResponse,
    PortalFinancialSettingsResponse,
    PortalFirstAccessRequest,
    PortalFirstAccessResponse,
    PortalFinancialSettingsUpdateRequest,
    PortalHealthAppointmentCreateRequest,
    PortalHealthHistoryResponse,
    PortalInternalBootstrapResponse,
    PortalMarketplaceBootstrapResponse,
    PortalMarketplaceMetaResponse,
    PortalMarketplaceMetaUpdateRequest,
    PortalMarketplacePublicBootstrapResponse,
    PortalPdvDiscountSettingsResponse,
    PortalPdvDiscountSettingsUpdateRequest,
    PortalPricingPromotionAudienceEstimateRequest,
    PortalPricingPromotionAudienceEstimateResponse,
    PortalPricingPromotionMutationRequest,
    PortalPricingPromotionResponse,
    PortalProductReviewCollectionResponse,
    PortalProductReviewCreateRequest,
    PortalSubscriptionCreateRequest,
    PortalSubscriptionResponse,
    PortalSubscriptionUpdateRequest,
)
from app.services.portal_service import PortalService


# ============================================================================
# PORTAL ROUTES
# ============================================================================


router = APIRouter()


# ----------------------------------------------------------------------------
# Bootstrap
# ----------------------------------------------------------------------------


@router.get(
    "/marketplace/public-bootstrap",
    response_model=PortalMarketplacePublicBootstrapResponse,
    dependencies=[Depends(rate_limit(PUBLIC_RATE_LIMIT))],
)
async def get_marketplace_public_bootstrap(
    session=Depends(get_session),
) -> PortalMarketplacePublicBootstrapResponse:
    """Return public marketplace bootstrap metadata."""

    service = PortalService(session)
    return await service.get_marketplace_public_bootstrap()


@router.post(
    "/marketplace/first-access",
    response_model=PortalFirstAccessResponse,
    dependencies=[Depends(rate_limit(PASSWORD_RESET_RATE_LIMIT))],
)
async def request_marketplace_first_access(
    payload: PortalFirstAccessRequest,
    session=Depends(get_session),
) -> PortalFirstAccessResponse:
    """Provision or renew first-access credentials for a PDV-registered customer."""

    service = PortalService(session)
    return await service.request_marketplace_first_access(payload)


@router.get("/marketplace/bootstrap", response_model=PortalMarketplaceBootstrapResponse)
async def get_marketplace_bootstrap(
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> PortalMarketplaceBootstrapResponse:
    """Return authenticated marketplace bootstrap data for the current customer."""

    service = PortalService(session)
    return await service.get_marketplace_bootstrap(subject)


@router.get("/internal/bootstrap", response_model=PortalInternalBootstrapResponse)
async def get_internal_bootstrap(
    store_id: str = Query(default="", max_length=36),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session=Depends(get_subject_session),
) -> PortalInternalBootstrapResponse:
    """Return internal console bootstrap metadata."""

    service = PortalService(session)
    return await service.get_internal_bootstrap(subject, requested_store_id=store_id)


# ----------------------------------------------------------------------------
# Internal settings
# ----------------------------------------------------------------------------


@router.put("/internal/marketplace-meta", response_model=PortalMarketplaceMetaResponse)
async def update_marketplace_meta(
    payload: PortalMarketplaceMetaUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalMarketplaceMetaResponse:
    """Persist tenant-scoped marketplace meta settings."""

    service = PortalService(session)
    return await service.update_marketplace_meta(subject, payload)


@router.get("/internal/delivery-pricing", response_model=PortalDeliveryPricingResponse)
async def get_delivery_pricing(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryPricingResponse:
    """Return tenant-scoped distance-based delivery pricing configuration."""

    service = PortalService(session)
    return await service.get_delivery_pricing(subject)


@router.put("/internal/delivery-pricing", response_model=PortalDeliveryPricingResponse)
async def update_delivery_pricing(
    payload: PortalDeliveryPricingUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryPricingResponse:
    """Persist tenant-scoped distance-based delivery pricing configuration."""

    service = PortalService(session)
    return await service.update_delivery_pricing(subject, payload)


@router.get("/internal/pdv-discount-settings", response_model=PortalPdvDiscountSettingsResponse)
async def get_pdv_discount_settings(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalPdvDiscountSettingsResponse:
    """Return the tenant-scoped minimum average margin required to grant a PDV discount."""

    service = PortalService(session)
    return await service.get_pdv_discount_settings(subject)


@router.put("/internal/pdv-discount-settings", response_model=PortalPdvDiscountSettingsResponse)
async def update_pdv_discount_settings(
    payload: PortalPdvDiscountSettingsUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalPdvDiscountSettingsResponse:
    """Persist the tenant-scoped minimum average margin required to grant a PDV discount."""

    service = PortalService(session)
    return await service.update_pdv_discount_settings(subject, payload)


@router.get("/internal/cnae-settings", response_model=PortalCnaeSettingsResponse)
async def get_cnae_settings(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session=Depends(get_subject_session),
) -> PortalCnaeSettingsResponse:
    """Return the tenant-scoped registered CNAEs and their pricing ICMS rates."""

    service = PortalService(session)
    return await service.get_cnae_settings(subject)


@router.put("/internal/cnae-settings", response_model=PortalCnaeSettingsResponse)
async def update_cnae_settings(
    payload: PortalCnaeSettingsUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session=Depends(get_subject_session),
) -> PortalCnaeSettingsResponse:
    """Persist the tenant-scoped registered CNAEs and their pricing ICMS rates."""

    service = PortalService(session)
    return await service.update_cnae_settings(subject, payload)


@router.get("/internal/delivery-areas", response_model=PortalDeliveryAreasResponse)
async def get_delivery_areas(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryAreasResponse:
    """Return tenant-scoped per-store delivery-area configuration."""

    service = PortalService(session)
    return await service.get_delivery_areas(subject)


@router.put("/internal/delivery-areas", response_model=PortalDeliveryAreasResponse)
async def update_delivery_areas(
    payload: PortalDeliveryAreasUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryAreasResponse:
    """Persist tenant-scoped per-store delivery-area configuration."""

    service = PortalService(session)
    return await service.update_delivery_areas(subject, payload)


@router.get("/internal/address-search", response_model=PortalAddressSearchResponse)
async def search_delivery_addresses(
    query: str = Query(default="", max_length=160),
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalAddressSearchResponse:
    """Return neighborhood/city search matches for one free-text query."""

    service = PortalService(session)
    return await service.search_delivery_addresses(subject, query)


@router.get("/internal/financial-settings", response_model=PortalFinancialSettingsResponse)
async def get_financial_settings(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalFinancialSettingsResponse:
    """Return tenant-scoped financial assumptions for the internal portal."""

    service = PortalService(session)
    return await service.get_financial_settings(subject)


@router.put("/internal/financial-settings", response_model=PortalFinancialSettingsResponse)
async def update_financial_settings(
    payload: PortalFinancialSettingsUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalFinancialSettingsResponse:
    """Persist tenant-scoped financial assumptions for the internal portal."""

    service = PortalService(session)
    return await service.update_financial_settings(subject, payload)


@router.get("/internal/construction-costs", response_model=PortalConstructionCostsResponse)
async def get_construction_costs(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session=Depends(get_subject_session),
) -> PortalConstructionCostsResponse:
    """Return tenant-scoped, per-store construction cost entries and real-sales ROI figures."""

    service = PortalService(session)
    return await service.get_construction_costs(subject)


@router.put("/internal/construction-costs", response_model=PortalConstructionCostsResponse)
async def update_construction_costs(
    payload: PortalConstructionCostsUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session=Depends(get_subject_session),
) -> PortalConstructionCostsResponse:
    """Persist tenant-scoped, per-store construction cost entries."""

    service = PortalService(session)
    return await service.update_construction_costs(subject, payload)


# ----------------------------------------------------------------------------
# Coupon campaigns
# ----------------------------------------------------------------------------


@router.get("/internal/coupons", response_model=list[PortalCouponResponse])
async def list_coupon_campaigns(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Return all coupon campaigns for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.list_coupon_campaigns(subject)


@router.post("/internal/coupons", response_model=list[PortalCouponResponse])
async def create_coupon_campaign(
    payload: PortalCouponMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Persist one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.create_coupon_campaign(subject, payload)


@router.put("/internal/coupons/{coupon_id}", response_model=list[PortalCouponResponse])
async def update_coupon_campaign(
    coupon_id: str,
    payload: PortalCouponMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Update one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.update_coupon_campaign(subject, coupon_id, payload)


@router.delete("/internal/coupons/{coupon_id}", response_model=list[PortalCouponResponse])
async def delete_coupon_campaign(
    coupon_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Delete one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.delete_coupon_campaign(subject, coupon_id)


# ----------------------------------------------------------------------------
# Pricing promotions
# ----------------------------------------------------------------------------


@router.get("/internal/promotions", response_model=list[PortalPricingPromotionResponse])
async def list_pricing_promotions(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST, UserRole.CASHIER)),
    session=Depends(get_subject_session),
) -> list[PortalPricingPromotionResponse]:
    """Return all pricing promotions for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.list_pricing_promotions(subject)


@router.post("/internal/promotions", response_model=list[PortalPricingPromotionResponse])
async def create_pricing_promotion(
    payload: PortalPricingPromotionMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalPricingPromotionResponse]:
    """Persist one pricing promotion for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.create_pricing_promotion(subject, payload)


@router.put("/internal/promotions/{promotion_id}", response_model=list[PortalPricingPromotionResponse])
async def update_pricing_promotion(
    promotion_id: str,
    payload: PortalPricingPromotionMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalPricingPromotionResponse]:
    """Update one pricing promotion for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.update_pricing_promotion(subject, promotion_id, payload)


@router.delete("/internal/promotions/{promotion_id}", response_model=list[PortalPricingPromotionResponse])
async def delete_pricing_promotion(
    promotion_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalPricingPromotionResponse]:
    """Delete one pricing promotion for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.delete_pricing_promotion(subject, promotion_id)


@router.post("/internal/promotions/estimate-audience", response_model=PortalPricingPromotionAudienceEstimateResponse)
async def estimate_pricing_promotion_audience(
    payload: PortalPricingPromotionAudienceEstimateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.MANAGER, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalPricingPromotionAudienceEstimateResponse:
    """Return the estimated audience size for a draft promotion's targeting filters."""

    service = PortalService(session)
    return await service.estimate_pricing_promotion_audience(subject, payload)


# ----------------------------------------------------------------------------
# Product reviews
# ----------------------------------------------------------------------------


@router.get(
    "/products/{product_ref}/reviews",
    response_model=PortalProductReviewCollectionResponse,
    dependencies=[Depends(rate_limit(PUBLIC_RATE_LIMIT))],
)
async def list_product_reviews(
    product_ref: str,
    session=Depends(get_session),
) -> PortalProductReviewCollectionResponse:
    """Return published reviews for one marketplace product reference."""

    service = PortalService(session)
    return await service.list_product_reviews(product_ref)


@router.post("/products/reviews", response_model=PortalProductReviewCollectionResponse)
async def create_product_review(
    payload: PortalProductReviewCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> PortalProductReviewCollectionResponse:
    """Persist one marketplace product review for the authenticated customer."""

    service = PortalService(session)
    return await service.create_product_review(subject, payload)


# ----------------------------------------------------------------------------
# Favorites
# ----------------------------------------------------------------------------


@router.get("/marketplace/favorites", response_model=list[PortalFavoriteResponse])
async def list_favorites(
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalFavoriteResponse]:
    """Return saved marketplace products for the authenticated customer."""

    service = PortalService(session)
    return await service.list_favorites(subject)


@router.post("/marketplace/favorites", response_model=list[PortalFavoriteResponse])
async def save_favorite(
    payload: PortalFavoriteMutationRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalFavoriteResponse]:
    """Save one marketplace product reference for the authenticated customer."""

    service = PortalService(session)
    return await service.save_favorite(subject, payload)


@router.delete("/marketplace/favorites/{product_ref}", response_model=list[PortalFavoriteResponse])
async def delete_favorite(
    product_ref: str,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalFavoriteResponse]:
    """Remove one saved marketplace product reference for the authenticated customer."""

    service = PortalService(session)
    return await service.delete_favorite(subject, product_ref)


# ----------------------------------------------------------------------------
# Subscriptions
# ----------------------------------------------------------------------------


@router.get("/marketplace/subscriptions", response_model=list[PortalSubscriptionResponse])
async def list_subscriptions(
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalSubscriptionResponse]:
    """Return recurring marketplace subscriptions for the authenticated customer."""

    service = PortalService(session)
    return await service.list_subscriptions(subject)


@router.post("/marketplace/subscriptions", response_model=list[PortalSubscriptionResponse])
async def create_subscription(
    payload: PortalSubscriptionCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalSubscriptionResponse]:
    """Create one recurring marketplace subscription for the authenticated customer."""

    service = PortalService(session)
    return await service.create_subscription(subject, payload)


@router.put("/marketplace/subscriptions/{product_ref}", response_model=list[PortalSubscriptionResponse])
async def update_subscription(
    product_ref: str,
    payload: PortalSubscriptionUpdateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalSubscriptionResponse]:
    """Update one recurring marketplace subscription for the authenticated customer."""

    service = PortalService(session)
    return await service.update_subscription(subject, product_ref, payload)


@router.delete("/marketplace/subscriptions/{product_ref}", response_model=list[PortalSubscriptionResponse])
async def delete_subscription(
    product_ref: str,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalSubscriptionResponse]:
    """Cancel one recurring marketplace subscription for the authenticated customer."""

    service = PortalService(session)
    return await service.delete_subscription(subject, product_ref)


@router.post("/health/appointments", response_model=list[PortalHealthHistoryResponse])
async def create_health_appointment(
    payload: PortalHealthAppointmentCreateRequest,
    subject: TokenSubject = Depends(require_marketplace_subject()),
    session=Depends(get_subject_session),
) -> list[PortalHealthHistoryResponse]:
    """Book one real health service appointment for the authenticated customer."""

    service = PortalService(session)
    return await service.create_health_appointment(subject, payload)
