"""
farmaura-api/app/services/team_service.py

Internal team service for Farmaura.

Responsibilities:
- list internal staff (admin/pharmacist/cashier) for the admin console;
- assign each staff member to the physical store they operate out of.

Observations:
- staff creation stays out of scope; accounts are provisioned elsewhere.
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import UserRole
from app.models.user import User
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.team import TeamMemberListResponse, TeamMemberResponse, TeamMemberStoreUpdateRequest

INTERNAL_STAFF_ROLES = [
    UserRole.ADMIN.value,
    UserRole.MANAGER.value,
    UserRole.PHARMACIST.value,
    UserRole.CASHIER.value,
    UserRole.DRIVER.value,
]


# ============================================================================
# TEAM SERVICE
# ============================================================================


class TeamService:
    """Provide internal staff administration use-cases."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.user_repository = UserRepository(session)
        self.store_repository = StoreRepository(session)

    async def list_members(self) -> TeamMemberListResponse:
        """Return every internal staff member for the tenant with their store assignment."""

        members = await self.user_repository.list_by_tenant_roles(
            tenant_id=str(self.subject.tenant_id), roles=INTERNAL_STAFF_ROLES,
        )
        stores = await self.store_repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_names = {store.id: store.name for store in stores}
        return TeamMemberListResponse(items=[self._serialize(member, store_names) for member in members])

    async def update_member_store(self, user_id: str, payload: TeamMemberStoreUpdateRequest) -> TeamMemberResponse:
        """Assign (or clear) the store a staff member operates out of."""

        member = await self.user_repository.get_by_id_for_tenant(tenant_id=str(self.subject.tenant_id), user_id=user_id)
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found.")
        if payload.store_id is not None:
            store = await self.store_repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=payload.store_id)
            if store is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")
        member.store_id = payload.store_id
        await self.session.commit()
        stores = await self.store_repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_names = {store.id: store.name for store in stores}
        return self._serialize(member, store_names)

    def _serialize(self, member: User, store_names: dict[str, str]) -> TeamMemberResponse:
        """Convert one user ORM row into the team member response shape."""

        return TeamMemberResponse(
            id=member.id,
            name=member.full_name,
            email=member.email,
            role=member.role,
            store_id=member.store_id,
            store_name=store_names.get(member.store_id or "", ""),
        )
