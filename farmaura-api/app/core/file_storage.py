"""
farmaura-api/app/core/file_storage.py

Private file storage helpers for Farmaura.

Responsibilities:
- persist uploaded file bytes under the tenant-scoped private storage root;
- retrieve previously stored file bytes for protected downloads;

Observations:
- storage_key values are generated server-side and never derived from user input;
- writes run off the event loop since they are blocking filesystem operations;
"""

from __future__ import annotations

import asyncio

from app.core.config import Settings


# ============================================================================
# PRIVATE FILE STORAGE
# ============================================================================


async def write_private_file(*, settings: Settings, storage_key: str, content: bytes) -> None:
    """Write file bytes under the private storage root."""

    destination = settings.storage_root / storage_key

    def _write() -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)

    await asyncio.to_thread(_write)


async def read_private_file(*, settings: Settings, storage_key: str) -> bytes:
    """Read previously stored file bytes from the private storage root."""

    source = settings.storage_root / storage_key
    return await asyncio.to_thread(source.read_bytes)
