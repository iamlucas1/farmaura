"""
farmaura-api/app/services/operations_service.py

Operations service for Farmaura.

Responsibilities:
- serve initial pharmacist and operations console summaries;
- keep operational endpoints uniform during bootstrap;
- provide clear extension points for domain-specific logic;

Observations:
- inventory, CRM, deliveries, PDV, and prescriptions share this scaffold;
- each domain should later receive dedicated services and repositories;
"""

from app.core.responses import StatusResponse


# ============================================================================
# OPERATIONS SERVICE
# ============================================================================


class OperationsService:
    """Provide bootstrap responses for operations domains."""

    async def get_status(self, detail: str) -> StatusResponse:
        """Return a standard status response."""

        return StatusResponse(status="ready", detail=detail)
