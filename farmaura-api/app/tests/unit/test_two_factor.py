"""
farmaura-api/app/tests/unit/test_two_factor.py

Unit tests for Farmaura two-factor helpers.

Responsibilities:
- validate authenticator provisioning URI generation;
- verify TOTP code acceptance for generated secrets;
- guard helper behavior with lightweight deterministic coverage;

Observations:
- the code generator helper is intentionally exercised directly for deterministic tests;
- service-level 2FA flows should be covered separately with database-backed fixtures.
"""

from app.core.two_factor import _generate_code, build_totp_provisioning_uri, generate_totp_secret, verify_totp_code


# ============================================================================
# TWO-FACTOR HELPER TESTS
# ============================================================================


def test_build_totp_provisioning_uri_embeds_expected_fields() -> None:
    """Ensure otpauth URIs expose issuer, account, and secret fields."""

    uri = build_totp_provisioning_uri(
        issuer="Farmaura",
        account_name="cliente@farmaura.com",
        secret="ABCDEF123456",
    )

    assert uri.startswith("otpauth://totp/")
    assert "issuer=Farmaura" in uri
    assert "secret=ABCDEF123456" in uri
    assert "cliente%40farmaura.com" in uri


def test_verify_totp_code_accepts_current_code_for_generated_secret() -> None:
    """Ensure the verifier accepts a freshly generated code for a valid secret."""

    secret = generate_totp_secret()
    current_counter = __import__("time").time() // 30
    code = _generate_code(secret, int(current_counter))

    assert verify_totp_code(secret, code) is True
