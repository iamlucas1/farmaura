"""
farmaura-api/app/core/google_identity.py

Google Sign-In identity verification for Farmaura.

Responsibilities:
- verify a Google-issued ID token's signature and standard claims;
- reject tokens minted for a different audience or issuer;
- surface only the identity fields authentication needs;

Observations:
- verifies the token's RS256 signature against Google's published JWKS via
  PyJWT (already a dependency for our own tokens) instead of adding the
  google-auth package — google-auth's HTTP transport needs the `requests`
  library, which this codebase deliberately does not otherwise depend on
  (every other external client here uses httpx or stdlib urllib);
- PyJWKClient fetches and caches Google's signing keys itself (5 minute
  cache by default) and performs a blocking HTTP call on a cache miss, so
  every call here runs in a thread;
- callers must treat an unverified e-mail as untrustworthy for account
  linking/creation — see require_verified_email below.
"""

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

from app.domain.errors import AuthenticationError

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ALLOWED_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


# ============================================================================
# GOOGLE IDENTITY
# ============================================================================


@dataclass(frozen=True, slots=True)
class GoogleIdentity:
    """Represent the verified identity carried by a Google ID token."""

    provider_user_id: str
    email: str
    full_name: str
    avatar_url: str
    email_verified: bool


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    """Return the process-wide JWKS client, so Google's signing keys are cached across calls."""

    return PyJWKClient(GOOGLE_JWKS_URL)


def _decode_google_id_token(*, token: str, client_id: str) -> dict[str, Any]:
    """Verify signature and audience for a Google ID token (blocking); the caller checks issuer."""

    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    claims: dict[str, Any] = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=client_id,
        options={"require": ["sub", "email", "iss", "aud", "exp", "iat"]},
    )
    if str(claims.get("iss") or "") not in ALLOWED_ISSUERS:
        raise AuthenticationError()
    return claims


async def verify_google_id_token(*, token: str, client_id: str) -> GoogleIdentity:
    """Verify a Google ID token and return its trusted identity claims.

    Raises AuthenticationError (generic, safe to return to the client) for
    every failure mode — malformed token, wrong audience/issuer, expired
    signature — never leaking which specific check failed.
    """

    normalized_token = (token or "").strip()
    if not normalized_token or not client_id.strip():
        raise AuthenticationError()
    try:
        claims = await asyncio.to_thread(
            _decode_google_id_token, token=normalized_token, client_id=client_id
        )
    except Exception as exc:
        raise AuthenticationError() from exc

    provider_user_id = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not provider_user_id or not email:
        raise AuthenticationError()

    return GoogleIdentity(
        provider_user_id=provider_user_id,
        email=email,
        full_name=str(claims.get("name") or "").strip(),
        avatar_url=str(claims.get("picture") or "").strip(),
        email_verified=bool(claims.get("email_verified")),
    )


def require_verified_email(identity: GoogleIdentity) -> None:
    """Fail closed when Google has not itself verified the account's e-mail.

    Only a verified e-mail is trustworthy enough to auto-link an existing
    password account — otherwise anyone who controls an unverified address
    could take over a Farmaura account that happens to share it.
    """

    if not identity.email_verified:
        raise AuthenticationError("O e-mail da conta Google precisa estar verificado.")
