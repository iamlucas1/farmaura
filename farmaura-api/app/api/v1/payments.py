"""
farmaura-api/app/api/v1/payments.py

Payment provider webhook routes for Farmaura.

Responsibilities:
- receive inbound Asaas payment webhook events;
- authenticate and deduplicate them before touching order state.

Observations:
- this route intentionally carries no JWT/tenant dependency: Asaas calls it directly,
  authenticated instead by a static shared-secret header plus an IP allowlist, both
  enforced inside PaymentService before any row is read or written.
"""

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.services.payment_service import PaymentService


# ============================================================================
# PAYMENT WEBHOOK ROUTES
# ============================================================================


router = APIRouter()


@router.post("/asaas/webhook", status_code=204)
async def receive_asaas_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Process one inbound Asaas payment webhook event."""

    payload: dict[str, Any] = await request.json()
    service = PaymentService(session)
    await service.process_webhook_event(
        headers=dict(request.headers),
        source_ip=request.client.host if request.client else "",
        event_payload=payload,
    )
