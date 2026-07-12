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

from fastapi import APIRouter, Depends

from app.api.deps import get_session, get_subject_session, require_internal_subject, require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.portal import (
    PortalCouponMutationRequest,
    PortalCouponResponse,
    PortalDeliveryPricingResponse,
    PortalDeliveryPricingUpdateRequest,
    PortalFavoriteMutationRequest,
    PortalFavoriteResponse,
    PortalFinancialSettingsResponse,
    PortalFinancialSettingsUpdateRequest,
    PortalHealthAppointmentCreateRequest,
    PortalHealthHistoryResponse,
    PortalInternalBootstrapResponse,
    PortalMarketplaceBootstrapResponse,
    PortalMarketplaceMetaResponse,
    PortalMarketplaceMetaUpdateRequest,
    PortalMarketplacePublicBootstrapResponse,
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


@router.get("/marketplace/public-bootstrap", response_model=PortalMarketplacePublicBootstrapResponse)
async def get_marketplace_public_bootstrap(
    session=Depends(get_session),
) -> PortalMarketplacePublicBootstrapResponse:
    """Return public marketplace bootstrap metadata."""

    service = PortalService(session)
    return await service.get_marketplace_public_bootstrap()


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
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session=Depends(get_subject_session),
) -> PortalInternalBootstrapResponse:
    """Return internal console bootstrap metadata."""

    service = PortalService(session)
    return await service.get_internal_bootstrap(subject)


# ----------------------------------------------------------------------------
# Internal settings
# ----------------------------------------------------------------------------


@router.put("/internal/marketplace-meta", response_model=PortalMarketplaceMetaResponse)
async def update_marketplace_meta(
    payload: PortalMarketplaceMetaUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalMarketplaceMetaResponse:
    """Persist tenant-scoped marketplace meta settings."""

    service = PortalService(session)
    return await service.update_marketplace_meta(subject, payload)


@router.get("/internal/delivery-pricing", response_model=PortalDeliveryPricingResponse)
async def get_delivery_pricing(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryPricingResponse:
    """Return tenant-scoped distance-based delivery pricing configuration."""

    service = PortalService(session)
    return await service.get_delivery_pricing(subject)


@router.put("/internal/delivery-pricing", response_model=PortalDeliveryPricingResponse)
async def update_delivery_pricing(
    payload: PortalDeliveryPricingUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalDeliveryPricingResponse:
    """Persist tenant-scoped distance-based delivery pricing configuration."""

    service = PortalService(session)
    return await service.update_delivery_pricing(subject, payload)


@router.get("/internal/financial-settings", response_model=PortalFinancialSettingsResponse)
async def get_financial_settings(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalFinancialSettingsResponse:
    """Return tenant-scoped financial assumptions for the internal portal."""

    service = PortalService(session)
    return await service.get_financial_settings(subject)


@router.put("/internal/financial-settings", response_model=PortalFinancialSettingsResponse)
async def update_financial_settings(
    payload: PortalFinancialSettingsUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> PortalFinancialSettingsResponse:
    """Persist tenant-scoped financial assumptions for the internal portal."""

    service = PortalService(session)
    return await service.update_financial_settings(subject, payload)


# ----------------------------------------------------------------------------
# Coupon campaigns
# ----------------------------------------------------------------------------


@router.get("/internal/coupons", response_model=list[PortalCouponResponse])
async def list_coupon_campaigns(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST, UserRole.CASHIER)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Return all coupon campaigns for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.list_coupon_campaigns(subject)


@router.post("/internal/coupons", response_model=list[PortalCouponResponse])
async def create_coupon_campaign(
    payload: PortalCouponMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Persist one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.create_coupon_campaign(subject, payload)


@router.put("/internal/coupons/{coupon_id}", response_model=list[PortalCouponResponse])
async def update_coupon_campaign(
    coupon_id: str,
    payload: PortalCouponMutationRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Update one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.update_coupon_campaign(subject, coupon_id, payload)


@router.delete("/internal/coupons/{coupon_id}", response_model=list[PortalCouponResponse])
async def delete_coupon_campaign(
    coupon_id: str,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session=Depends(get_subject_session),
) -> list[PortalCouponResponse]:
    """Delete one coupon campaign for the authenticated internal tenant."""

    service = PortalService(session)
    return await service.delete_coupon_campaign(subject, coupon_id)


# ----------------------------------------------------------------------------
# Product reviews
# ----------------------------------------------------------------------------


@router.get("/products/{product_ref}/reviews", response_model=PortalProductReviewCollectionResponse)
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
