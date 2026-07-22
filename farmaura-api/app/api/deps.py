"""
farmaura-api/app/api/deps.py

API dependency helpers for Farmaura.

Responsibilities:
- provide request-scoped settings and database access;
- resolve authenticated actors from bearer tokens;
- enforce role-based authorization dependencies;

Observations:
- authentication is minimal but strict on token validation;
- tenant context is applied only to authenticated sessions.
"""

from collections.abc import AsyncIterator, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.jwt import decode_access_token
from app.core.tenant_context import apply_tenant_context
from app.domain.enums import AccessScope, PortalName, UserRole
from app.domain.errors import AuthorizationError
from app.domain.permissions import can_access_portal
from app.schemas.auth import TokenSubject


# ============================================================================
# CORE DEPENDENCIES
# ============================================================================


bearer_scheme = HTTPBearer(auto_error=False)


def get_app_settings() -> Settings:
    """Return cached application settings."""

    return get_settings()


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide a scoped async database session."""

    async for session in get_db_session():
        yield session


async def get_current_subject(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    settings: Settings = Depends(get_app_settings),
) -> TokenSubject:
    """Resolve the authenticated subject from the bearer token."""

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    payload = decode_access_token(token=credentials.credentials, settings=settings)
    return TokenSubject.model_validate(
        {
            "sub": payload["sub"],
            "tenant_id": payload["tenant_id"],
            "role": payload["role"],
            "access_scope": payload["access_scope"],
            "session_version": payload["session_version"],
            "store_id": payload.get("store_id") or None,
        }
    )


async def get_subject_session(
    subject: TokenSubject = Depends(get_current_subject),
    session: AsyncSession = Depends(get_session),
) -> AsyncSession:
    """Provide a scoped session with RLS context applied for the subject."""

    await apply_tenant_context(session, subject)
    return session


# ============================================================================
# AUTHORIZATION HELPERS
# ============================================================================


def require_scope(
    *,
    allowed_scopes: tuple[AccessScope, ...],
    allowed_roles: tuple[UserRole, ...] = (),
) -> Callable[[TokenSubject], TokenSubject]:
    """Build a dependency that enforces scope and optional role constraints."""

    def dependency(subject: TokenSubject = Depends(get_current_subject)) -> TokenSubject:
        """Validate portal scope and role membership for the current subject."""

        if subject.access_scope not in allowed_scopes:
            raise AuthorizationError()
        if allowed_roles and subject.role not in allowed_roles:
            raise AuthorizationError()
        return subject

    return dependency


def require_portal_access(
    *,
    portal: PortalName,
    allowed_roles: tuple[UserRole, ...] = (),
) -> Callable[[TokenSubject], TokenSubject]:
    """Build a dependency that enforces portal eligibility and optional role constraints."""

    def dependency(subject: TokenSubject = Depends(get_current_subject)) -> TokenSubject:
        """Validate portal access and role membership for the current subject."""

        if not can_access_portal(subject.role, subject.access_scope, portal):
            raise AuthorizationError()
        if allowed_roles and subject.role not in allowed_roles:
            raise AuthorizationError()
        return subject

    return dependency


def require_marketplace_subject(*roles: UserRole) -> Callable[[TokenSubject], TokenSubject]:
    """Require marketplace access and optionally restrict by role."""

    return require_portal_access(
        portal=PortalName.MARKETPLACE,
        allowed_roles=roles,
    )


def require_internal_subject(*roles: UserRole) -> Callable[[TokenSubject], TokenSubject]:
    """Require internal console access and optionally restrict by role."""

    return require_portal_access(
        portal=PortalName.INTERNAL,
        allowed_roles=roles,
    )


async def require_user_ownership(target_user_id: str, subject: TokenSubject) -> None:
    """Validate user ownership for user-scoped routes."""

    if subject.user_id != target_user_id and subject.role not in {UserRole.ADMIN, UserRole.PHARMACIST}:
        raise AuthorizationError()
