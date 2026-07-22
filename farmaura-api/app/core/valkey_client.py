"""
farmaura-api/app/core/valkey_client.py

Shared Valkey client for Farmaura.

Responsibilities:
- provide one cached async Valkey connection for the process;
- back request rate limiting, login brute-force throttling, and the catalog read cache.

Observations:
- callers must treat Valkey as best-effort and fail open on connection errors —
  an unreachable cache must never take down authentication or public browsing.
"""

from functools import lru_cache

from valkey.asyncio import Valkey

from app.core.config import get_settings


# ============================================================================
# VALKEY CLIENT
# ============================================================================


@lru_cache(maxsize=1)
def get_valkey() -> Valkey:
    """Return the cached shared async Valkey client."""

    settings = get_settings()
    return Valkey.from_url(settings.valkey_url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1)
