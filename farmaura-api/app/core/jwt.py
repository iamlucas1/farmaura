"""
farmaura-api/app/core/jwt.py

JWT helpers for Farmaura.

Responsibilities:
- issue access and refresh tokens;
- validate token claims strictly;
- keep token payloads minimal and typed;

Observations:
- refresh token rotation requires server-side persistence;
- algorithms are explicitly pinned through settings;
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from fastapi import HTTPException, status

from app.core.config import Settings
from app.domain.enums import AccessScope, PortalName, UserRole


# ============================================================================
# TOKEN ENCODING
# ============================================================================


def create_access_token(
    *,
    settings: Settings,
    user_id: UUID,
    tenant_id: UUID,
    role: UserRole,
    access_scope: AccessScope,
    session_version: int,
    store_id: str | None = None,
) -> str:
    """Create a short-lived access token with minimal claims."""

    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role.value,
        "access_scope": access_scope.value,
        "session_version": session_version,
        "store_id": store_id or "",
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_access_ttl_minutes)).timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    *,
    settings: Settings,
    user_id: UUID,
    family_id: UUID,
    token_id: UUID,
    ttl_days: int,
    session_version: int,
) -> str:
    """Create a refresh token with rotation identifiers."""

    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user_id),
        "family_id": str(family_id),
        "jti": str(token_id),
        "session_version": session_version,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(days=ttl_days)).timestamp()),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm=settings.jwt_algorithm)


def create_mfa_challenge_token(
    *,
    settings: Settings,
    user_id: UUID,
    tenant_id: UUID,
    role: UserRole,
    access_scope: AccessScope,
    portal: PortalName,
    remember_session: bool,
    session_version: int,
) -> str:
    """Create a short-lived second-factor challenge token."""

    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role.value,
        "access_scope": access_scope.value,
        "portal": portal.value,
        "remember_session": remember_session,
        "session_version": session_version,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_mfa_ttl_minutes)).timestamp()),
        "type": "mfa",
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm=settings.jwt_algorithm)


def create_password_reset_challenge_token(
    *,
    settings: Settings,
    user_id: UUID,
    tenant_id: UUID,
    role: UserRole,
    access_scope: AccessScope,
    portal: PortalName,
    remember_session: bool,
    session_version: int,
) -> str:
    """Create a short-lived mandatory password-reset challenge token."""

    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role.value,
        "access_scope": access_scope.value,
        "portal": portal.value,
        "remember_session": remember_session,
        "session_version": session_version,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_password_reset_ttl_minutes)).timestamp()),
        "type": "pwd_reset",
    }
    return jwt.encode(payload, settings.jwt_private_key, algorithm=settings.jwt_algorithm)


# ============================================================================
# TOKEN DECODING
# ============================================================================


def decode_access_token(*, token: str, settings: Settings) -> dict[str, str]:
    """Decode and validate an access token strictly."""

    try:
        payload = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "tenant_id", "role", "access_scope", "session_version", "iss", "aud", "exp", "nbf", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    return payload


def decode_refresh_token(*, token: str, settings: Settings) -> dict[str, str]:
    """Decode and validate a refresh token strictly."""

    try:
        payload = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "family_id", "jti", "session_version", "iss", "aud", "exp", "nbf", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    return payload


def decode_mfa_challenge_token(*, token: str, settings: Settings) -> dict[str, str | int | bool]:
    """Decode and validate a second-factor challenge token."""

    try:
        payload = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "tenant_id", "role", "access_scope", "portal", "remember_session", "session_version", "iss", "aud", "exp", "nbf", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge token.") from exc
    if payload.get("type") != "mfa":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    return payload


def decode_password_reset_challenge_token(*, token: str, settings: Settings) -> dict[str, str | int | bool]:
    """Decode and validate a mandatory password-reset challenge token."""

    try:
        payload = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "tenant_id", "role", "access_scope", "portal", "remember_session", "session_version", "iss", "aud", "exp", "nbf", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge token.") from exc
    if payload.get("type") != "pwd_reset":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.")
    return payload
