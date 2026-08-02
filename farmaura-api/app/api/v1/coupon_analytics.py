"""
farmaura-api/app/api/v1/coupon_analytics.py

Coupon analytics routes for Farmaura.

Responsibilities:
- expose the cross-channel coupon analytics endpoint used by the internal
  console's Cupons > Análises tab;

Observations:
- read-only aggregation over existing order/PDV-sale/coupon data — no new tables;
- restricted to admin/manager, matching purchase-analytics.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.coupon_analytics import CouponAnalyticsResponse
from app.services.coupon_analytics_service import CouponAnalyticsService

router = APIRouter()

_ALLOWED_ROLES = (UserRole.ADMIN, UserRole.MANAGER)


# ============================================================================
# COUPON ANALYTICS ROUTES
# ============================================================================


@router.get("", response_model=CouponAnalyticsResponse)
async def get_coupon_analytics(
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> CouponAnalyticsResponse:
    """Return cross-channel coupon analytics for the tenant."""

    service = CouponAnalyticsService(session)
    return await service.build_coupon_analytics(tenant_id=str(subject.tenant_id))
