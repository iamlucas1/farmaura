"""
farmaura-api/app/api/v1/health.py

Health routes for Farmaura.

Responsibilities:
- expose readiness-friendly health endpoints;
- provide gateway-compatible liveness responses;
- keep operational diagnostics minimal and safe;

Observations:
- sensitive infrastructure details must not leak from health routes;
- these endpoints are suitable for gateway and orchestrator checks;
"""

from fastapi import APIRouter

from app.core.responses import StatusResponse


# ============================================================================
# HEALTH ROUTES
# ============================================================================


router = APIRouter()


@router.get("/health", response_model=StatusResponse)
async def healthcheck() -> StatusResponse:
    """Return the application liveness state."""

    return StatusResponse(status="ok", detail="Farmaura API is healthy.")
