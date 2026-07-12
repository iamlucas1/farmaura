"""
farmaura-api/app/core/two_factor.py

Time-based one-time password helpers for Farmaura.

Responsibilities:
- generate compatible TOTP secrets;
- build provisioning URIs for authenticator applications;
- keep second-factor validation centralized and explicit;

Observations:
- secrets are base32 strings suitable for authenticator applications;
- verification accepts a small clock skew window to reduce false negatives;
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


# ============================================================================
# TOTP HELPERS
# ============================================================================


def generate_totp_secret() -> str:
    """Return a new base32 secret for TOTP enrollment."""

    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def build_totp_provisioning_uri(*, issuer: str, account_name: str, secret: str) -> str:
    """Build an otpauth provisioning URI for authenticator applications."""

    normalized_issuer = issuer.strip() or "Farmaura"
    normalized_account_name = account_name.strip() or "user"
    normalized_secret = secret.strip().replace(" ", "").upper()
    label = quote(f"{normalized_issuer}:{normalized_account_name}", safe="")
    issuer_param = quote(normalized_issuer, safe="")
    secret_param = quote(normalized_secret, safe="")
    return f"otpauth://totp/{label}?secret={secret_param}&issuer={issuer_param}&algorithm=SHA1&digits=6&period=30"


def _normalize_secret(secret: str) -> bytes:
    """Decode a base32 secret into raw bytes."""

    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * ((8 - len(normalized) % 8) % 8)
    return base64.b32decode(normalized + padding, casefold=True)


def _generate_code(secret: str, counter: int) -> str:
    """Generate a 6-digit TOTP code for a specific counter."""

    secret_bytes = _normalize_secret(secret)
    message = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, message, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary_code = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(binary_code % 1_000_000).zfill(6)


def verify_totp_code(secret: str, code: str, *, window: int = 1, time_step_seconds: int = 30) -> bool:
    """Verify a TOTP code with a bounded clock-skew window."""

    candidate = "".join(character for character in code if character.isdigit())
    if len(candidate) != 6 or not secret.strip():
        return False
    current_counter = int(time.time() // time_step_seconds)
    return any(
        hmac.compare_digest(_generate_code(secret, current_counter + delta), candidate)
        for delta in range(-window, window + 1)
    )
