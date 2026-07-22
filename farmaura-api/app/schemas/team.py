"""
farmaura-api/app/schemas/team.py

Internal team schemas for Farmaura.

Responsibilities:
- expose internal staff (admin/pharmacist/cashier) projections for the admin console;
- validate store-assignment update payloads.

Observations:
- staff creation stays out of scope here; accounts are provisioned elsewhere.
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# TEAM INPUT SCHEMAS
# ============================================================================


class TeamMemberStoreUpdateRequest(StrictModel):
    """Validate a store-assignment update for one team member."""

    store_id: str | None = Field(default=None)


# ============================================================================
# TEAM RESPONSE SCHEMAS
# ============================================================================


class TeamMemberResponse(StrictModel):
    """Represent one internal staff member and their store assignment."""

    id: str
    name: str
    email: str
    role: str
    store_id: str | None = None
    store_name: str = ""


class TeamMemberListResponse(StrictModel):
    """Represent the team member list payload."""

    items: list[TeamMemberResponse]
