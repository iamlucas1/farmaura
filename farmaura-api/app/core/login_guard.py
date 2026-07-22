"""
farmaura-api/app/core/login_guard.py

Per-account brute-force login guard for Farmaura.

Responsibilities:
- count consecutive failed login attempts per account, by e-mail;
- lock the account for an exponentially increasing cooldown once a failure
  threshold is crossed, to make offline password-guessing impractical;
- issue a single-use unlock token whenever a fresh lockout is applied, so the
  account owner can end the lockout early instead of only waiting it out;
- reset the counter and any active lockout after a successful login.

Observations:
- backed by Valkey so lockout state survives process restarts and is shared
  across every API replica; fails open (never blocks a login attempt) if
  Valkey itself is unreachable — availability of authentication must not
  depend on cache health.
- keyed by e-mail, not IP: this specifically protects one account against
  password guessing regardless of which IP the attempts come from, which is
  complementary to (not a replacement for) the per-IP rate limit already
  applied to /auth/login via app.core.rate_limit.
"""

import secrets

from fastapi import HTTPException, status

from app.core.valkey_client import get_valkey

FAILURE_THRESHOLD = 5
FAILURE_COUNTER_TTL_SECONDS = 24 * 60 * 60
BASE_LOCKOUT_SECONDS = 30
MAX_LOCKOUT_SECONDS = 24 * 60 * 60


# ============================================================================
# LOGIN GUARD
# ============================================================================


def _failure_key(email: str) -> str:
    """Return the Valkey key tracking one account's consecutive failed attempts."""

    return f"login:failures:{email}"


def _lock_key(email: str) -> str:
    """Return the Valkey key marking one account as currently locked out."""

    return f"login:locked:{email}"


def _unlock_token_key(token: str) -> str:
    """Return the Valkey key mapping one single-use unlock token to its account e-mail."""

    return f"login:unlock-token:{token}"


async def assert_not_locked(email: str) -> None:
    """Reject the login attempt outright while the account is under an active lockout."""

    try:
        valkey = get_valkey()
        ttl = await valkey.ttl(_lock_key(email))
    except Exception:
        return
    if ttl and ttl > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Conta temporariamente bloqueada por excesso de tentativas. Verifique seu e-mail para instruções de desbloqueio.",
            headers={"Retry-After": str(ttl)},
        )


async def register_failed_attempt(email: str) -> tuple[str, int] | None:
    """Count one failed login attempt and lock the account with exponential backoff past the threshold.

    Lockout duration doubles for every failure past FAILURE_THRESHOLD:
    30s, 60s, 120s, 240s, ... capped at MAX_LOCKOUT_SECONDS (24h). Returns the
    (unlock_token, lockout_seconds) pair only when this call is the one that
    just applied a fresh lock, so the caller can e-mail the owner exactly
    once per lockout event rather than once per rejected attempt.
    """

    try:
        valkey = get_valkey()
        attempts = await valkey.incr(_failure_key(email))
        if attempts == 1:
            await valkey.expire(_failure_key(email), FAILURE_COUNTER_TTL_SECONDS)
        if attempts >= FAILURE_THRESHOLD:
            lockout_seconds = min(BASE_LOCKOUT_SECONDS * (2 ** (attempts - FAILURE_THRESHOLD)), MAX_LOCKOUT_SECONDS)
            await valkey.set(_lock_key(email), "1", ex=lockout_seconds)
            unlock_token = secrets.token_urlsafe(32)
            await valkey.set(_unlock_token_key(unlock_token), email, ex=lockout_seconds)
            return unlock_token, lockout_seconds
    except Exception:
        return None
    return None


async def clear_failed_attempts(email: str) -> None:
    """Reset the failure counter and any active lockout after a successful login or unlock."""

    try:
        valkey = get_valkey()
        await valkey.delete(_failure_key(email), _lock_key(email))
    except Exception:
        return


async def resolve_and_consume_unlock_token(token: str) -> str | None:
    """Return the account e-mail bound to one unlock token, consuming it so it cannot be reused."""

    try:
        valkey = get_valkey()
        return await valkey.getdel(_unlock_token_key(token))
    except Exception:
        return None
