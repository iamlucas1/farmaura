"""
farmaura-api/app/api/v1/purchase_analytics.py

Purchase analytics routes for Farmaura.

Responsibilities:
- expose the ABC/XYZ purchase-planning endpoint used by the internal console's
  purchasing dashboard;

Observations:
- read-only aggregation over existing sales/quote data — no new tables;
- restricted to admin/manager, matching the Fase 1 purchase-quote routes.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.purchase_analytics import PurchaseAnalyticsResponse
from app.services.purchase_analytics_service import PurchaseAnalyticsService

router = APIRouter()

_ALLOWED_ROLES = (UserRole.ADMIN, UserRole.MANAGER)


# ============================================================================
# PURCHASE ANALYTICS ROUTES
# ============================================================================


@router.get("", response_model=PurchaseAnalyticsResponse)
async def get_purchase_analytics(
    months: int = Query(default=12, ge=1, le=24),
    category_id: str = Query(default="", max_length=36),
    abc_class: str = Query(default="", pattern="^(A|B|C|)$"),
    xyz_class: str = Query(default="", pattern="^(X|Y|Z|)$"),
    subject: TokenSubject = Depends(require_internal_subject(*_ALLOWED_ROLES)),
    session: AsyncSession = Depends(get_subject_session),
) -> PurchaseAnalyticsResponse:
    """Return the ABC/XYZ purchase plan for the tenant."""

    service = PurchaseAnalyticsService(session=session, subject=subject)
    return await service.build_purchase_plan(
        months=months,
        category_id=category_id,
        abc_class_filter=abc_class,
        xyz_class_filter=xyz_class,
    )
