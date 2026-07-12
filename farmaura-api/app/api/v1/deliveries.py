"""
farmaura-api/app/api/v1/deliveries.py

Delivery routes for Farmaura.

Responsibilities:
- expose initial delivery operations endpoints;
- keep delivery transport contracts minimal and explicit;
- prepare the module for protected logistics workflows;

Observations:
- logistics integrations should live in dedicated services later;
- the bootstrap response confirms module readiness only;
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_internal_subject
from app.domain.enums import UserRole
from app.core.responses import StatusResponse
from app.schemas.auth import TokenSubject
from app.services.operations_service import OperationsService


# ============================================================================
# DELIVERY ROUTES
# ============================================================================


router = APIRouter()


@router.get("/status", response_model=StatusResponse)
async def get_delivery_status(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
) -> StatusResponse:
    """Return the delivery module readiness state."""

    service = OperationsService()
    return await service.get_status("Delivery workflows scaffolded.")
