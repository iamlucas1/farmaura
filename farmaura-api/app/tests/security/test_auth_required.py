"""
farmaura-api/app/tests/security/test_auth_required.py

Authentication boundary tests for Farmaura.

Responsibilities:
- verify protected routes reject anonymous access;
- keep auth requirements explicit in API tests;
- establish a baseline security regression guard;

Observations:
- more forbidden and cross-tenant tests should be added with real fixtures;
- protected routes must fail closed by default;
"""

from uuid import uuid4

from app.core.config import get_settings
from app.core.jwt import create_access_token
from app.domain.enums import AccessScope, UserRole


# ============================================================================
# HELPERS
# ============================================================================


def build_auth_headers(*, role: UserRole, access_scope: AccessScope) -> dict[str, str]:
    """Create bearer headers for authorization tests."""

    token = create_access_token(
        settings=get_settings(),
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=role,
        access_scope=access_scope,
        session_version=1,
    )
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# AUTH SECURITY TESTS
# ============================================================================


def test_catalog_requires_authentication(client: object) -> None:
    """Verify the catalog endpoint rejects anonymous requests."""

    response = client.get("/api/v1/catalog")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_customer_profile_rejects_internal_cashier_session(client: object) -> None:
    """Verify an internal cashier cannot access marketplace customer data."""

    response = client.get(
        "/api/v1/customers/me",
        headers=build_auth_headers(role=UserRole.CASHIER, access_scope=AccessScope.INTERNAL),
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_marketplace_cart_rejects_hybrid_admin_session(client: object) -> None:
    """Verify an internal hybrid session cannot access marketplace cart routes."""

    response = client.get(
        "/api/v1/cart",
        headers=build_auth_headers(role=UserRole.ADMIN, access_scope=AccessScope.HYBRID),
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_customer_addresses_require_authentication(client: object) -> None:
    """Verify the saved-address endpoints reject anonymous requests."""

    response = client.get("/api/v1/customers/me/addresses")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_customer_addresses_reject_internal_pharmacist_session(client: object) -> None:
    """Verify an internal pharmacist session cannot access marketplace saved addresses."""

    response = client.get(
        "/api/v1/customers/me/addresses",
        headers=build_auth_headers(role=UserRole.PHARMACIST, access_scope=AccessScope.INTERNAL),
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_customer_payment_methods_require_authentication(client: object) -> None:
    """Verify the saved-payment-method endpoints reject anonymous requests."""

    response = client.get("/api/v1/customers/me/payment-methods")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_customer_payment_method_create_rejects_raw_card_fields(client: object) -> None:
    """Verify the payment method contract rejects any raw card number or CVV field."""

    response = client.post(
        "/api/v1/customers/me/payment-methods",
        headers=build_auth_headers(role=UserRole.CUSTOMER, access_scope=AccessScope.MARKETPLACE),
        json={
            "provider_name": "seed-gateway",
            "provider_token": "tok_test",
            "last_four_digits": "4242",
            "expiration_month": "01",
            "expiration_year": "2030",
            "card_number": "4111111111111111",
            "cvv": "123",
        },
    )
    assert response.status_code == 422


def test_customer_cart_requires_authentication(client: object) -> None:
    """Verify the persisted-cart endpoints reject anonymous requests."""

    response = client.get("/api/v1/customers/me/cart")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_customer_cart_rejects_internal_cashier_session(client: object) -> None:
    """Verify an internal cashier session cannot access the marketplace cart."""

    response = client.get(
        "/api/v1/customers/me/cart",
        headers=build_auth_headers(role=UserRole.CASHIER, access_scope=AccessScope.INTERNAL),
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_inventory_rejects_marketplace_customer_session(client: object) -> None:
    """Verify a marketplace customer cannot access internal inventory routes."""

    response = client.get(
        "/api/v1/inventory/status",
        headers=build_auth_headers(role=UserRole.CUSTOMER, access_scope=AccessScope.MARKETPLACE),
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_pdv_allows_internal_cashier_session(client: object) -> None:
    """Verify an internal cashier can access the PDV module."""

    response = client.get(
        "/api/v1/pdv/status",
        headers=build_auth_headers(role=UserRole.CASHIER, access_scope=AccessScope.INTERNAL),
    )
    assert response.status_code == 200
    assert response.json()["message"] == "PDV workflows scaffolded."


def test_tokenize_card_requires_authentication(client: object) -> None:
    """Verify the card tokenization endpoint rejects anonymous requests."""

    response = client.post("/api/v1/customers/me/payment-methods/tokenize-card", json={})
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_tokenize_card_rejects_internal_session(client: object) -> None:
    """Verify an internal session cannot call the marketplace card tokenization endpoint."""

    response = client.post(
        "/api/v1/customers/me/payment-methods/tokenize-card",
        headers=build_auth_headers(role=UserRole.CASHIER, access_scope=AccessScope.INTERNAL),
        json={
            "holder_name": "Test Holder",
            "number": "4111111111111111",
            "cvv": "123",
            "expiration_month": "01",
            "expiration_year": "2030",
        },
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Forbidden."}


def test_tokenize_card_rejects_malformed_card_fields(client: object) -> None:
    """Verify the tokenize endpoint enforces the raw card field contract before any provider call."""

    response = client.post(
        "/api/v1/customers/me/payment-methods/tokenize-card",
        headers=build_auth_headers(role=UserRole.CUSTOMER, access_scope=AccessScope.MARKETPLACE),
        json={
            "holder_name": "Test Holder",
            "number": "not-a-card-number",
            "cvv": "12",
            "expiration_month": "13",
            "expiration_year": "30",
        },
    )
    assert response.status_code == 422


def test_asaas_webhook_fails_closed_when_unconfigured(client: object) -> None:
    """Verify the payment webhook rejects events when no shared secret is configured."""

    response = client.post(
        "/api/v1/payments/asaas/webhook",
        json={"event": "PAYMENT_CONFIRMED", "payment": {"id": "pay_test_123"}},
    )
    assert response.status_code == 503


def test_asaas_webhook_rejects_wrong_token(client: object) -> None:
    """Verify the payment webhook rejects requests with an incorrect shared-secret token."""

    from app.core.config import get_settings

    get_settings().asaas_webhook_auth_token = "expected-secret"
    try:
        response = client.post(
            "/api/v1/payments/asaas/webhook",
            headers={"asaas-access-token": "wrong-secret"},
            json={"event": "PAYMENT_CONFIRMED", "payment": {"id": "pay_test_123"}},
        )
        assert response.status_code == 401
    finally:
        get_settings().asaas_webhook_auth_token = ""


def test_auth_session_returns_scope_and_modules(client: object) -> None:
    """Verify the session endpoint exposes normalized access metadata."""

    response = client.get(
        "/api/v1/auth/session",
        headers=build_auth_headers(role=UserRole.PHARMACIST, access_scope=AccessScope.INTERNAL),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["subject"]["role"] == UserRole.PHARMACIST.value
    assert payload["subject"]["access_scope"] == AccessScope.INTERNAL.value
    assert payload["allowed_portals"] == ["internal"]
    assert "inventory" in payload["allowed_modules"]
    assert "sales" not in payload["allowed_modules"]
