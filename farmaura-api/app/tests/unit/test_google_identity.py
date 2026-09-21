"""
farmaura-api/app/tests/unit/test_google_identity.py

Unit tests for Google Sign-In identity verification.

Responsibilities:
- guard against empty/misconfigured inputs before any network call;
- verify the unverified-e-mail guard used for account auto-linking;

Observations:
- the JWKS fetch/signature path itself is exercised manually against the
  real Google endpoint (see the ADR) — these tests only cover the pure
  guard logic that never touches the network.
"""

import pytest

from app.core.google_identity import GoogleIdentity, require_verified_email, verify_google_id_token
from app.domain.errors import AuthenticationError

# ============================================================================
# GUARD TESTS
# ============================================================================


@pytest.mark.anyio
async def test_verify_google_id_token_rejects_empty_token() -> None:
    """Ensure an empty token is rejected before any network call."""

    with pytest.raises(AuthenticationError):
        await verify_google_id_token(token="", client_id="client-123")


@pytest.mark.anyio
async def test_verify_google_id_token_rejects_when_feature_not_configured() -> None:
    """Ensure a blank client id (feature disabled) fails closed."""

    with pytest.raises(AuthenticationError):
        await verify_google_id_token(token="a.b.c", client_id="")


def test_require_verified_email_accepts_verified_identity() -> None:
    """Ensure a verified Google identity passes the guard."""

    identity = GoogleIdentity(
        provider_user_id="123",
        email="cliente@example.com",
        full_name="Cliente Teste",
        avatar_url="",
        email_verified=True,
    )
    require_verified_email(identity)


def test_require_verified_email_rejects_unverified_identity() -> None:
    """Ensure an unverified Google identity is rejected, blocking auto-link."""

    identity = GoogleIdentity(
        provider_user_id="123",
        email="cliente@example.com",
        full_name="Cliente Teste",
        avatar_url="",
        email_verified=False,
    )
    with pytest.raises(AuthenticationError):
        require_verified_email(identity)
