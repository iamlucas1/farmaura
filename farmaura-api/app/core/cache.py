"""
farmaura-api/app/core/cache.py

Read-through cache for expensive, tenant-scoped catalog reads, backed by Valkey.

Responsibilities:
- serialize/deserialize small JSON-able payloads under a namespaced, tenant-scoped key;
- invalidate an entire namespace/tenant instantly via a generation counter instead of
  scanning/deleting a wildcard key set;
- fail open on any cache error: a cache miss (real or from an outage) simply falls through
  to the caller's live loader — cache health must never affect correctness of what gets
  served, only how much backend work it costs.

Observations:
- generation-based invalidation is intentionally coarse: one write anywhere in a tenant's
  catalog bumps the whole tenant's generation rather than pinpointing the one affected key.
  Given how cheap an INCR is and how short catalog TTLs are, precise invalidation isn't
  worth the bookkeeping.
- invalidate_cache_scope must only ever be called *after* the write transaction it is
  invalidating for has committed. Bumping the generation before/during a commit races a
  concurrent reader, who could repopulate the cache from pre-commit state under the new
  generation and leave a stale entry alive until its TTL expires.
- this module must never be used to cache anything a checkout path reads to decide whether
  a sale can go through: prices and stock used to actually place a marketplace order or a
  PDV sale always come from a row-locked, live database read (see
  InventoryRepository.get_item_by_id_for_update), never from here. This cache only ever
  backs what a *listing* shows, never what a purchase *does*.
"""

from __future__ import annotations

import json
from typing import Any

from app.core.valkey_client import get_valkey

DEFAULT_CACHE_TTL_SECONDS = 20


# ============================================================================
# CACHE
# ============================================================================


async def _current_generation(namespace: str, scope: str) -> int:
    """Return the current invalidation generation for one namespace/scope, defaulting to 0."""

    try:
        valkey = get_valkey()
        raw = await valkey.get(f"cachegen:{namespace}:{scope}")
    except Exception:
        return 0
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


async def get_cached_json(namespace: str, scope: str, key: str) -> Any | None:
    """Return the cached value for one namespaced key, or None on a cache miss or error."""

    try:
        valkey = get_valkey()
        generation = await _current_generation(namespace, scope)
        raw = await valkey.get(f"cache:{namespace}:{scope}:{generation}:{key}")
    except Exception:
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


async def set_cached_json(
    namespace: str, scope: str, key: str, value: Any, *, ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS
) -> None:
    """Best-effort write of one namespaced key; silently no-ops on any cache error."""

    try:
        valkey = get_valkey()
        generation = await _current_generation(namespace, scope)
        await valkey.set(f"cache:{namespace}:{scope}:{generation}:{key}", json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:
        return


async def invalidate_cache_scope(namespace: str, scope: str) -> None:
    """Invalidate every cached key under one namespace/scope by bumping its generation.

    Best-effort: if Valkey is unreachable, already-cached entries simply expire on their
    own short TTL instead of being invalidated immediately.
    """

    try:
        valkey = get_valkey()
        await valkey.incr(f"cachegen:{namespace}:{scope}")
    except Exception:
        return
