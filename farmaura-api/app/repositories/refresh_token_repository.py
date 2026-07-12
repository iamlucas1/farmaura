"""
farmaura-api/app/repositories/refresh_token_repository.py

Refresh token repository for Farmaura.

Responsibilities:
- persist and rotate refresh token records;
- resolve refresh token state by token or family identifiers;
- support targeted and global session revocation flows;

Observations:
- repositories handle persistence only and do not parse JWT payloads;
- token secrecy remains outside this module through hashed fingerprints;
"""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


# ============================================================================
# REFRESH TOKEN REPOSITORY
# ============================================================================


class RefreshTokenRepository:
    """Provide refresh token persistence operations."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async database session."""

        self.session = session

    async def save(self, refresh_token: RefreshToken) -> RefreshToken:
        """Persist a refresh token record."""

        self.session.add(refresh_token)
        await self.session.flush()
        return refresh_token

    async def get_by_token_id(self, token_id: str) -> RefreshToken | None:
        """Return one refresh token by its JWT identifier."""

        statement = select(RefreshToken).where(RefreshToken.token_id == token_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def revoke(self, refresh_token: RefreshToken, *, reason: str, replaced_by_token_id: str = "") -> RefreshToken:
        """Revoke one refresh token record."""

        refresh_token.is_revoked = True
        refresh_token.revoked_reason = reason
        refresh_token.replaced_by_token_id = replaced_by_token_id
        refresh_token.revoked_at = datetime.now(tz=UTC)
        await self.session.flush()
        return refresh_token

    async def mark_used(self, refresh_token: RefreshToken) -> RefreshToken:
        """Update the last-used timestamp for a refresh token."""

        refresh_token.last_used_at = datetime.now(tz=UTC)
        await self.session.flush()
        return refresh_token

    async def revoke_family(self, *, family_id: str, reason: str) -> None:
        """Revoke every token in a refresh family."""

        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.is_revoked.is_(False))
            .values(
                is_revoked=True,
                revoked_reason=reason,
                revoked_at=datetime.now(tz=UTC),
            )
        )
        await self.session.flush()

    async def revoke_all_for_user(self, *, user_id: str, reason: str) -> None:
        """Revoke every refresh token for one user."""

        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked.is_(False))
            .values(
                is_revoked=True,
                revoked_reason=reason,
                revoked_at=datetime.now(tz=UTC),
            )
        )
        await self.session.flush()
