"""
farmaura-api/app/api/v1/team.py

Internal team routes for Farmaura.

Responsibilities:
- expose internal staff listing, creation, editing, deactivation, and
  store-assignment for the admin console.

Observations:
- every route here is admin-only: team membership, roles, and store
  assignment all change who can operate the PDV, inventory, and orders.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_subject_session, require_internal_subject
from app.domain.enums import UserRole
from app.schemas.auth import TokenSubject
from app.schemas.team import (
    TeamMemberCreateRequest,
    TeamMemberListResponse,
    TeamMemberResponse,
    TeamMemberStatusUpdateRequest,
    TeamMemberStoreUpdateRequest,
    TeamMemberUpdateRequest,
)
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


@router.post("/members", response_model=TeamMemberResponse, status_code=201)
async def create_team_member(
    payload: TeamMemberCreateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TeamMemberResponse:
    """Create a new internal staff account."""

    service = TeamService(session=session, subject=subject)
    return await service.create_member(payload)


@router.put("/members/{user_id}", response_model=TeamMemberResponse)
async def update_team_member(
    user_id: str,
    payload: TeamMemberUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TeamMemberResponse:
    """Update an existing team member's name, email, role, and store."""

    service = TeamService(session=session, subject=subject)
    return await service.update_member(user_id, payload)


@router.patch("/members/{user_id}/status", response_model=TeamMemberResponse)
async def update_team_member_status(
    user_id: str,
    payload: TeamMemberStatusUpdateRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN)),
    session: AsyncSession = Depends(get_subject_session),
) -> TeamMemberResponse:
    """Activate or deactivate a team member."""

    service = TeamService(session=session, subject=subject)
    return await service.update_member_status(user_id, payload)


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
