"""
farmaura-api/app/core/rate_limit.py

Rate-limit enforcement for Farmaura.

Responsibilities:
- define per-endpoint-family rate-limit policies;
- enforce them per client IP using Valkey fixed-window counters;
- keep public and auth endpoints abuse-aware.

Observations:
- Valkey is treated as best-effort: any connection failure fails open (the
  request proceeds) rather than taking down authentication or public
  browsing because the cache is unavailable.
"""

from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.valkey_client import get_valkey


# ============================================================================
# RATE LIMIT POLICY
# ============================================================================


@dataclass(frozen=True, slots=True)
class RateLimitPolicy:
    """Represent a simple fixed-window rate-limit policy."""

    key: str
    requests: int
    window_seconds: int


AUTH_RATE_LIMIT = RateLimitPolicy(key="auth", requests=10, window_seconds=60)
PASSWORD_RESET_RATE_LIMIT = RateLimitPolicy(key="password-reset", requests=5, window_seconds=300)
UPLOAD_RATE_LIMIT = RateLimitPolicy(key="upload", requests=10, window_seconds=60)
PUBLIC_RATE_LIMIT = RateLimitPolicy(key="public", requests=120, window_seconds=60)


# ============================================================================
# ENFORCEMENT
# ============================================================================


def _client_ip(request: Request) -> str:
    """Return the caller's IP, honoring the trusted proxy header set by lumos-gateway."""

    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(request: Request, policy: RateLimitPolicy) -> None:
    """Reject the request with 429 once its client IP exceeds the policy's window quota."""

    key = f"ratelimit:{policy.key}:{_client_ip(request)}"
    try:
        valkey = get_valkey()
        current = await valkey.incr(key)
        if current == 1:
            await valkey.expire(key, policy.window_seconds)
        if current <= policy.requests:
            return
        ttl = await valkey.ttl(key)
    except HTTPException:
        raise
    except Exception:
        return
    retry_after = ttl if ttl and ttl > 0 else policy.window_seconds
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Muitas requisições. Tente novamente em instantes.",
        headers={"Retry-After": str(retry_after)},
    )


def rate_limit(policy: RateLimitPolicy):
    """Build a FastAPI dependency that enforces the given rate-limit policy."""

    async def dependency(request: Request) -> None:
        await enforce_rate_limit(request, policy)

    return dependency
