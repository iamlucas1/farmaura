"""
farmaura-api/app/api/v1/team.py

Internal team routes for Farmaura.

Responsibilities:
- expose internal staff listing and store-assignment for the admin console.

Observations:
- staff creation stays out of scope here; accounts are provisioned elsewhere;
- assigning a store is admin-only, since it changes what a pharmacist/cashier
  operates against across the whole PDV flow.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.team import TeamMemberListResponse, TeamMemberResponse, TeamMemberStoreUpdateRequest
from app.services.team_service import TeamService


# ============================================================================
# TEAM ROUTES
# ============================================================================


router = APIRouter()


@router.get("/members", response_model=TeamMemberListResponse)
async def list_team_members(
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TeamMemberListResponse:
    """Return every internal staff member for the tenant."""

    service = TeamService(session=session, subject=subject)
    return await service.list_members()


@router.patch("/members/{user_id}/store", response_model=TeamMemberResponse)
async def update_team_member_store(
    user_id: str,
    payload: TeamMemberStoreUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TeamMemberResponse:
    """Assign (or clear) the store one staff member operates out of."""

    service = TeamService(session=session, subject=subject)
    return await service.update_member_store(user_id, payload)
