"""
farmaura-api/app/api/v1/cart.py

Cart routes for Farmaura.

Responsibilities:
- expose initial cart summary endpoints;
- keep cart HTTP handlers minimal;
- reserve the service boundary for future cart rules;

Observations:
- totals shown here are summary values derived from the current request;
- authoritative cart pricing should remain server-calculated;
"""

from decimal import Decimal

from fastapi import APIRouter, Depends

from app.api.deps import require_marketplace_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.cart import CartSummaryResponse


# ============================================================================
# CART ROUTES
# ============================================================================


router = APIRouter()


@router.get("/summary", response_model=CartSummaryResponse)
async def get_cart_summary(
    _: TokenSubject = Depends(require_marketplace_subject(UserRole.CUSTOMER)),
) -> CartSummaryResponse:
    """Return a minimal cart summary."""

    return CartSummaryResponse(items_count=0, estimated_total=Decimal("0.00"))
