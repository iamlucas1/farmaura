"""
farmaura-api/app/repositories/user_repository.py

User repository for Farmaura.

Responsibilities:
- load users by login identifiers;
- scope reads to active accounts;
- keep authentication lookups focused;

Observations:
- password verification remains in the service layer;
- tenant-aware query variants can be added as needed;
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


# ============================================================================
# USER REPOSITORY
# ============================================================================


class UserRepository:
    """Provide user persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def get_by_email(self, email: str) -> User | None:
        """Return an active user by email."""

        statement = select(User).where(User.email == email, User.is_active.is_(True))
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: str) -> User | None:
        """Return an active user by identifier."""

        statement = select(User).where(User.id == user_id, User.is_active.is_(True))
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_by_tenant_roles(self, *, tenant_id: str, roles: list[str]) -> list[User]:
        """Return active tenant users restricted to the given roles, ordered by name."""

        statement = (
            select(User)
            .where(User.tenant_id == tenant_id, User.role.in_(roles), User.is_active.is_(True))
            .order_by(User.full_name.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id_for_tenant(self, *, tenant_id: str, user_id: str) -> User | None:
        """Return one active tenant user by identifier, scoped to the tenant."""

        statement = select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.is_active.is_(True))
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_email_including_inactive(self, email: str) -> User | None:
        """Return a user by email regardless of active status.

        Used for duplicate-email checks on creation, since the unique
        constraint on `email` spans deactivated accounts too.
        """

        statement = select(User).where(User.email == email)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_by_tenant_roles_including_inactive(self, *, tenant_id: str, roles: list[str]) -> list[User]:
        """Return every tenant user restricted to the given roles, active or not, ordered by name."""

        statement = (
            select(User)
            .where(User.tenant_id == tenant_id, User.role.in_(roles))
            .order_by(User.full_name.asc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def get_by_id_for_tenant_including_inactive(self, *, tenant_id: str, user_id: str) -> User | None:
        """Return one tenant user by identifier regardless of active status, scoped to the tenant."""

        statement = select(User).where(User.id == user_id, User.tenant_id == tenant_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def count_active_by_tenant_role(self, *, tenant_id: str, role: str) -> int:
        """Return the number of active tenant users with the given role."""

        statement = select(func.count()).select_from(User).where(
            User.tenant_id == tenant_id, User.role == role, User.is_active.is_(True),
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def add(self, user: User) -> User:
        """Persist one new user account."""

        self.session.add(user)
        await self.session.flush()
        return user

    async def save(self, user: User) -> User:
        """Persist user field updates inside the current transaction."""

        await self.session.flush()
        return user

    async def increment_session_version(self, user: User) -> User:
        """Invalidate all prior sessions for the given user."""

        user.session_version += 1
        await self.session.flush()
        return user
