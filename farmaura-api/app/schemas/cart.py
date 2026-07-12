"""
farmaura-api/app/schemas/cart.py

Cart schemas for Farmaura.

Responsibilities:
- define initial cart response contracts;
- support future server-authoritative cart computation;
- keep cart transport payloads explicit;

Observations:
- totals must never be trusted from the client;
- this scaffold returns summary-only payloads;
"""

from decimal import Decimal

from app.schemas.common import StrictModel


# ============================================================================
# CART SCHEMAS
# ============================================================================


class CartSummaryResponse(StrictModel):
    """Represent a bounded cart summary."""

    items_count: int
    estimated_total: Decimal
