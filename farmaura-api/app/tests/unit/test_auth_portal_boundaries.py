"""
farmaura-api/app/tests/unit/test_auth_portal_boundaries.py

Authentication portal-boundary tests for Farmaura.

Responsibilities:
- verify login rejects cross-portal credential use;
- keep two-factor challenges bound to the originating portal;
- prevent internal sessions from being reused in marketplace flows;

Observations:
- repository and session dependencies are stubbed to isolate auth policy;
- these tests focus on portal segregation instead of persistence details;
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from app.core.config import get_settings
from app.core.jwt import create_mfa_challenge_token
from app.core.password_hashing import hash_password
from app.domain.enums import AccessScope, PortalName, UserRole
from app.domain.errors import AuthenticationError
from app.schemas.auth import LoginRequest, TwoFactorVerifyRequest
from app.services.auth_service import AuthService


# ============================================================================
# TEST HELPERS
# ============================================================================


class StubUserRepository:
    """Provide deterministic user lookups for auth service tests."""

    def __init__(self, user: object) -> None:
        """Store the user instance returned by the stubs."""

        self.user = user

    async def get_by_email(self, _: str):
        """Return the configured user for login lookups."""

        return self.user

    async def get_by_id(self, _: str):
        """Return the configured user for identifier lookups."""

        return self.user


def build_user(*, role: UserRole, access_scope: AccessScope, two_factor_enabled: bool = False) -> object:
    """Create a minimal user object compatible with the auth service."""

    return SimpleNamespace(
        id=str(uuid4()),
        tenant_id=str(uuid4()),
        email='tester@farmaura.com.br',
        password_hash=hash_password('StrongPass123'),
        full_name='Portal Tester',
        role=role.value,
        access_scope=access_scope.value,
        two_factor_enabled=two_factor_enabled,
        two_factor_secret='JBSWY3DPEHPK3PXP' if two_factor_enabled else '',
        session_version=1,
    )


def build_service(user: object) -> AuthService:
    """Create an auth service with isolated dependencies."""

    session = AsyncMock()
    session.add = AsyncMock()
    service = AuthService(session=session, settings=get_settings())
    service.user_repository = StubUserRepository(user)
    return service


# ============================================================================
# AUTH PORTAL BOUNDARY TESTS
# ============================================================================


@pytest.mark.anyio
async def test_login_rejects_internal_user_in_marketplace_portal() -> None:
    """Verify internal credentials fail when used on the marketplace login."""

    service = build_service(build_user(role=UserRole.PHARMACIST, access_scope=AccessScope.INTERNAL))
    with pytest.raises(AuthenticationError):
        await service.login(
            LoginRequest(
                email='tester@farmaura.com.br',
                password='StrongPass123',
                remember_session=False,
                portal=PortalName.MARKETPLACE,
            ),
            ip_address='127.0.0.1',
            user_agent='pytest',
        )


@pytest.mark.anyio
async def test_login_rejects_hybrid_admin_in_marketplace_portal() -> None:
    """Verify hybrid staff credentials still fail on the marketplace login."""

    service = build_service(build_user(role=UserRole.ADMIN, access_scope=AccessScope.HYBRID))
    with pytest.raises(AuthenticationError):
        await service.login(
            LoginRequest(
                email='tester@farmaura.com.br',
                password='StrongPass123',
                remember_session=True,
                portal=PortalName.MARKETPLACE,
            ),
            ip_address='127.0.0.1',
            user_agent='pytest',
        )


@pytest.mark.anyio
async def test_verify_two_factor_rejects_cross_portal_challenge() -> None:
    """Verify second-factor completion stays bound to the portal that initiated login."""

    user = build_user(role=UserRole.PHARMACIST, access_scope=AccessScope.INTERNAL, two_factor_enabled=True)
    service = build_service(user)
    challenge_token = create_mfa_challenge_token(
        settings=get_settings(),
        user_id=UUID(user.id),
        tenant_id=UUID(user.tenant_id),
        role=UserRole.PHARMACIST,
        access_scope=AccessScope.INTERNAL,
        portal=PortalName.MARKETPLACE,
        remember_session=False,
        session_version=1,
    )
    with pytest.raises(AuthenticationError):
        await service.verify_two_factor(
            TwoFactorVerifyRequest(
                challenge_token=challenge_token,
                code='123456',
            ),
            ip_address='127.0.0.1',
            user_agent='pytest',
        )
