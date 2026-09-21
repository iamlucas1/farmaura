"""
farmaura-api/app/tests/unit/test_google_account_linking.py

Unit tests for linking/unlinking a Google account on an authenticated
marketplace user.

Responsibilities:
- verify linking rejects a Google account already claimed by someone else;
- verify unlinking is blocked for accounts with no real password (Google-only signups);
- verify the happy paths update google_sub as expected;

Observations:
- follows the same stub-repository pattern as test_auth_portal_boundaries.py;
- verify_google_id_token is monkeypatched so these tests never touch the network.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import get_settings
from app.core.google_identity import GoogleIdentity
from app.schemas.auth import GoogleLinkRequest
from app.services.auth_service import AuthService

# ============================================================================
# TEST HELPERS
# ============================================================================


class StubUserRepository:
    """Provide deterministic user lookups for google-linking tests."""

    def __init__(self, user: object, *, linked_to_other: object | None = None) -> None:
        """Store the subject's own user record and an optional conflicting one."""

        self.user = user
        self.linked_to_other = linked_to_other
        self.saved: list[object] = []

    async def get_by_id(self, _: str):
        """Return the configured subject user."""

        return self.user

    async def get_by_google_sub(self, _: str):
        """Return the conflicting user, if one was configured for this test."""

        return self.linked_to_other

    async def save(self, user: object):
        """Record that a user row was persisted."""

        self.saved.append(user)
        return user


def build_user(*, google_sub: str | None = None, has_password: bool = True) -> object:
    """Create a minimal user object compatible with the auth service."""

    return SimpleNamespace(
        id=str(uuid4()),
        tenant_id=str(uuid4()),
        email='tester@farmaura.com.br',
        google_sub=google_sub,
        has_password=has_password,
    )


def build_service(user: object, *, linked_to_other: object | None = None) -> AuthService:
    """Create an auth service with isolated dependencies."""

    session = AsyncMock()
    session.add = AsyncMock()
    service = AuthService(session=session, settings=get_settings())
    service.user_repository = StubUserRepository(user, linked_to_other=linked_to_other)
    return service


def stub_google_identity(
    monkeypatch: pytest.MonkeyPatch, *, provider_user_id: str = 'google-sub-1'
) -> None:
    """Replace the real Google verification call with a fixed, trusted identity."""

    async def fake_verify(*, token: str, client_id: str) -> GoogleIdentity:
        return GoogleIdentity(
            provider_user_id=provider_user_id,
            email='tester@farmaura.com.br',
            full_name='Tester',
            avatar_url='',
            email_verified=True,
        )

    monkeypatch.setattr('app.services.auth_service.verify_google_id_token', fake_verify)


# ============================================================================
# LINK TESTS
# ============================================================================


@pytest.mark.anyio
async def test_link_google_account_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure linking sets google_sub on the authenticated user's own row."""

    stub_google_identity(monkeypatch)
    user = build_user()
    service = build_service(user)

    response = await service.link_google_account(
        SimpleNamespace(user_id=user.id), GoogleLinkRequest(id_token='a' * 40)
    )

    assert response.linked is True
    assert user.google_sub == 'google-sub-1'


@pytest.mark.anyio
async def test_link_google_account_rejects_when_claimed_by_another_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure linking fails when that Google account is already linked elsewhere."""

    stub_google_identity(monkeypatch)
    user = build_user()
    other_user = build_user(google_sub='google-sub-1')
    service = build_service(user, linked_to_other=other_user)

    with pytest.raises(HTTPException) as excinfo:
        await service.link_google_account(
            SimpleNamespace(user_id=user.id), GoogleLinkRequest(id_token='a' * 40)
        )

    assert excinfo.value.status_code == 409
    assert user.google_sub is None


# ============================================================================
# UNLINK TESTS
# ============================================================================


@pytest.mark.anyio
async def test_unlink_google_account_success() -> None:
    """Ensure unlinking clears google_sub for an account with a real password."""

    user = build_user(google_sub='google-sub-1', has_password=True)
    service = build_service(user)

    response = await service.unlink_google_account(SimpleNamespace(user_id=user.id))

    assert response.linked is False
    assert user.google_sub is None


@pytest.mark.anyio
async def test_unlink_google_account_blocked_without_real_password() -> None:
    """Ensure unlinking is refused for a Google-only account (no real password to fall back to)."""

    user = build_user(google_sub='google-sub-1', has_password=False)
    service = build_service(user)

    with pytest.raises(HTTPException) as excinfo:
        await service.unlink_google_account(SimpleNamespace(user_id=user.id))

    assert excinfo.value.status_code == 409
    assert user.google_sub == 'google-sub-1'


@pytest.mark.anyio
async def test_unlink_google_account_rejects_when_not_linked() -> None:
    """Ensure unlinking a never-linked account fails instead of silently succeeding."""

    user = build_user(google_sub=None, has_password=True)
    service = build_service(user)

    with pytest.raises(HTTPException) as excinfo:
        await service.unlink_google_account(SimpleNamespace(user_id=user.id))

    assert excinfo.value.status_code == 409
