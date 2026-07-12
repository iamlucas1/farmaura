"""
farmaura-api/app/core/rate_limit.py

Rate-limit primitives for Farmaura.

Responsibilities:
- define baseline in-process request throttling structures;
- support future Redis-backed rate limiting integration;
- keep public and auth endpoints abuse-aware from the start;

Observations:
- this scaffold exposes policy objects instead of middleware enforcement;
- production-grade distributed throttling should use Redis persistence;
"""

from dataclasses import dataclass


# ============================================================================
# RATE LIMIT POLICY
# ============================================================================


@dataclass(frozen=True, slots=True)
class RateLimitPolicy:
    """Represent a simple rate-limit policy."""

    key: str
    requests: int
    window_seconds: int


AUTH_RATE_LIMIT = RateLimitPolicy(key="auth", requests=5, window_seconds=60)
UPLOAD_RATE_LIMIT = RateLimitPolicy(key="upload", requests=10, window_seconds=60)
PUBLIC_RATE_LIMIT = RateLimitPolicy(key="public", requests=120, window_seconds=60)
