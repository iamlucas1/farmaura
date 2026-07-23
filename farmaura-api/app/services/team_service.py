"""
farmaura-api/app/services/team_service.py

Internal team service for Farmaura.

Responsibilities:
- list, create, update, and deactivate internal staff (admin/manager/pharmacist/cashier/driver)
  for the admin console;
- assign each staff member to the physical store they operate out of.

Observations:
- team members are never hard-deleted, only deactivated, to preserve audit/history
  references (orders processed, inventory movements, deliveries assigned);
- deactivation is blocked for the caller's own account and for the tenant's last
  active admin, so an admin can never lock themselves (or everyone) out.
"""

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.password_hashing import hash_password
from app.domain.enums import AccessScope, UserRole
from app.domain.validators import is_valid_email
from app.models.user import User
from app.repositories.store_repository import StoreRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenSubject
from app.schemas.team import (
    TeamMemberCreateRequest,
    TeamMemberListResponse,
    TeamMemberResponse,
    TeamMemberStatusUpdateRequest,
    TeamMemberStoreUpdateRequest,
    TeamMemberUpdateRequest,
)

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
        """Return every internal staff member for the tenant, active or not, with their store assignment."""

        members = await self.user_repository.list_by_tenant_roles_including_inactive(
            tenant_id=str(self.subject.tenant_id), roles=INTERNAL_STAFF_ROLES,
        )
        stores = await self.store_repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        store_names = {store.id: store.name for store in stores}
        return TeamMemberListResponse(items=[self._serialize(member, store_names) for member in members])

    async def create_member(self, payload: TeamMemberCreateRequest) -> TeamMemberResponse:
        """Create a new internal staff account."""

        email = payload.email.strip().lower()
        if not is_valid_email(email):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail inválido.")
        if await self.user_repository.get_by_email_including_inactive(email) is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma conta com este e-mail.")
        if payload.store_id is not None:
            await self._require_store(payload.store_id)

        access_scope = AccessScope.HYBRID.value if payload.role == UserRole.ADMIN.value else AccessScope.INTERNAL.value
        member = User(
            tenant_id=str(self.subject.tenant_id),
            email=email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name.strip(),
            role=payload.role,
            access_scope=access_scope,
            store_id=payload.store_id,
            is_active=True,
        )
        member = await self.user_repository.add(member)
        await self.session.commit()
        return self._serialize(member, await self._store_names())

    async def update_member(self, user_id: str, payload: TeamMemberUpdateRequest) -> TeamMemberResponse:
        """Update an existing team member's name, email, role, and store assignment."""

        member = await self._require_member(user_id)
        email = payload.email.strip().lower()
        if not is_valid_email(email):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="E-mail inválido.")
        existing = await self.user_repository.get_by_email_including_inactive(email)
        if existing is not None and existing.id != member.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma conta com este e-mail.")
        if payload.store_id is not None:
            await self._require_store(payload.store_id)

        member.full_name = payload.full_name.strip()
        member.email = email
        member.role = payload.role
        member.access_scope = (
            AccessScope.HYBRID.value if payload.role == UserRole.ADMIN.value else AccessScope.INTERNAL.value
        )
        member.store_id = payload.store_id
        await self.session.commit()
        await self.session.refresh(member)
        return self._serialize(member, await self._store_names())

    async def update_member_store(self, user_id: str, payload: TeamMemberStoreUpdateRequest) -> TeamMemberResponse:
        """Assign (or clear) the store a staff member operates out of."""

        member = await self._require_member(user_id)
        if payload.store_id is not None:
            await self._require_store(payload.store_id)
        member.store_id = payload.store_id
        await self.session.commit()
        return self._serialize(member, await self._store_names())

    async def update_member_status(self, user_id: str, payload: TeamMemberStatusUpdateRequest) -> TeamMemberResponse:
        """Activate or deactivate a team member.

        Blocks deactivating the caller's own account and the tenant's last
        active admin — either would leave the tenant with no way to log
        back in and manage the team.
        """

        member = await self._require_member(user_id)
        if not payload.is_active:
            if member.id == str(self.subject.user_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Você não pode desativar sua própria conta.",
                )
            if member.role == UserRole.ADMIN.value:
                active_admins = await self.user_repository.count_active_by_tenant_role(
                    tenant_id=str(self.subject.tenant_id), role=UserRole.ADMIN.value,
                )
                if active_admins <= 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Não é possível desativar o último administrador ativo.",
                    )
        member.is_active = payload.is_active
        await self.session.commit()
        await self.session.refresh(member)
        return self._serialize(member, await self._store_names())

    async def _require_member(self, user_id: str) -> User:
        """Return an existing tenant team member (active or not) or fail with not found."""

        member = await self.user_repository.get_by_id_for_tenant_including_inactive(
            tenant_id=str(self.subject.tenant_id), user_id=user_id,
        )
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found.")
        return member

    async def _require_store(self, store_id: str) -> None:
        """Raise not-found if the given store does not belong to the tenant."""

        store = await self.store_repository.get_by_id(tenant_id=str(self.subject.tenant_id), store_id=store_id)
        if store is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found.")

    async def _store_names(self) -> dict[str, str]:
        """Return every tenant store name keyed by id, for response serialization."""

        stores = await self.store_repository.list_stores(tenant_id=str(self.subject.tenant_id), active_only=False)
        return {store.id: store.name for store in stores}

    def _serialize(self, member: User, store_names: dict[str, str]) -> TeamMemberResponse:
        """Convert one user ORM row into the team member response shape."""

        return TeamMemberResponse(
            id=member.id,
            name=member.full_name,
            email=member.email,
            role=member.role,
            store_id=member.store_id,
            store_name=store_names.get(member.store_id or "", ""),
            is_active=member.is_active,
        )
