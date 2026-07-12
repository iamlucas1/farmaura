"""
farmaura-api/app/core/password_hashing.py

Password hashing helpers for Farmaura.

Responsibilities:
- hash passwords with Argon2id;
- verify password candidates safely;
- keep password handling centralized and explicit;

Observations:
- pwdlib[argon2] is required by the repository baseline;
- password policy validation can be layered on top of this helper;
"""

from pwdlib import PasswordHash


# ============================================================================
# PASSWORD HASHER
# ============================================================================


password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Return the Argon2id hash for the given password."""

    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password candidate against a stored hash."""

    return password_hasher.verify(password, password_hash)
