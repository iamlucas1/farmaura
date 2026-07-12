"""
farmaura-api/app/core/token_fingerprints.py

Token fingerprint helpers for Farmaura authentication.

Responsibilities:
- hash refresh tokens before persistence;
- compare token hashes safely;
- keep token-secret handling out of repositories;

Observations:
- raw refresh tokens must never be stored server-side;
- SHA-256 is used here as a deterministic token fingerprint, not as a password hash;
"""

import hashlib


# ============================================================================
# TOKEN HASHING
# ============================================================================


def hash_refresh_token(token: str) -> str:
    """Return a deterministic fingerprint for a refresh token."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()
