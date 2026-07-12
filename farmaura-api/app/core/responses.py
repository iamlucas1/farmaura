"""
farmaura-api/app/core/responses.py

Shared response schemas for Farmaura.

Responsibilities:
- define generic API response wrappers;
- keep status payloads consistent across routes;
- reduce duplicate transport contracts;

Observations:
- domain-specific payloads should embed or reuse these models;
- responses stay intentionally minimal;
"""

from pydantic import BaseModel


# ============================================================================
# RESPONSE MODELS
# ============================================================================


class StatusResponse(BaseModel):
    """Represent a simple operation status payload."""

    status: str
    detail: str
