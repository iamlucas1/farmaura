"""
farmaura-api/app/tests/security/test_fiscal_routes.py

Authorization and input-validation tests for the fiscal (NFC-e) routes.

Responsibilities:
- prove every fiscal route rejects anonymous callers and marketplace customer sessions;
- prove the role matrix: cashier emits/consults/prints, manager cancels, admin voids numbers and edits profiles;
- prove hostile or malformed input is rejected before reaching any service (extra fields, bad ids, short reasons);

Observations:
- the client is created without entering the lifespan, so no background scheduler starts and no database is needed:
  these checks all happen in dependencies and request validation, before any handler body runs;
- happy paths and state rules live in `test_fiscal_flow.py`, which exercises the real service;
"""

import pytest
from fastapi.testclient import TestClient

from app.domain.enums import AccessScope, UserRole
from app.main import app
from app.tests.security.test_auth_required import build_auth_headers

DOC = "0f3c1d3e-7c1b-4e0a-9d2b-1a2b3c4d5e6f"
KEY = "5" * 44

ALL_ROUTES = [
    ("GET", "/api/v1/fiscal/status", None),
    ("POST", "/api/v1/fiscal/nfce", {"sale_id": DOC}),
    ("GET", "/api/v1/fiscal/nfce", None),
    ("GET", f"/api/v1/fiscal/nfce/{DOC}", None),
    ("GET", f"/api/v1/fiscal/nfce/{DOC}/xml", None),
    ("GET", f"/api/v1/fiscal/nfce/{DOC}/pdf", None),
    ("GET", f"/api/v1/fiscal/nfce/{DOC}/printable", None),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/print", None),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/cancel", {"justification": "Erro de digitacao no valor cobrado"}),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/sync", None),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/reprocess", None),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/send-email", {"email": "cliente@example.com"}),
    ("POST", "/api/v1/fiscal/reconcile", None),
    ("POST", "/api/v1/fiscal/inutilization", {"first_number": 2, "last_number": 3, "justification": "Numeracao pulada por falha"}),
    ("GET", "/api/v1/fiscal/inutilization", None),
    ("GET", f"/api/v1/fiscal/products/{DOC}/profile", None),
]

# Routes a cashier (an operator) must NOT reach.
MANAGER_ONLY = {
    ("GET", "/api/v1/fiscal/status"),
    ("POST", f"/api/v1/fiscal/nfce/{DOC}/cancel"),
    ("GET", "/api/v1/fiscal/inutilization"),
    ("GET", f"/api/v1/fiscal/products/{DOC}/profile"),
}
ADMIN_ONLY = {
    ("POST", "/api/v1/fiscal/reconcile"),
    ("POST", "/api/v1/fiscal/inutilization"),
}


@pytest.fixture(scope="module")
def http() -> TestClient:
    """Return a client that never runs the application lifespan."""

    return TestClient(app)


def call(http: TestClient, method: str, path: str, body: object, headers: dict[str, str] | None = None):
    return http.request(method, path, json=body, headers=headers or {})


@pytest.mark.parametrize(("method", "path", "body"), ALL_ROUTES)
def test_anonymous_callers_are_rejected(http: TestClient, method: str, path: str, body: object) -> None:
    response = call(http, method, path, body)
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."


@pytest.mark.parametrize(("method", "path", "body"), ALL_ROUTES)
def test_marketplace_customer_sessions_never_reach_fiscal_routes(http: TestClient, method: str, path: str, body: object) -> None:
    headers = build_auth_headers(role=UserRole.CUSTOMER, access_scope=AccessScope.MARKETPLACE)
    assert call(http, method, path, body, headers).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), ALL_ROUTES)
def test_hybrid_customer_token_on_internal_scope_is_still_refused(http: TestClient, method: str, path: str, body: object) -> None:
    headers = build_auth_headers(role=UserRole.CUSTOMER, access_scope=AccessScope.INTERNAL)
    assert call(http, method, path, body, headers).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), [r for r in ALL_ROUTES if (r[0], r[1]) in MANAGER_ONLY | ADMIN_ONLY])
def test_cashier_cannot_use_manager_or_admin_routes(http: TestClient, method: str, path: str, body: object) -> None:
    headers = build_auth_headers(role=UserRole.CASHIER, access_scope=AccessScope.INTERNAL)
    assert call(http, method, path, body, headers).status_code == 403


@pytest.mark.parametrize(("method", "path", "body"), [r for r in ALL_ROUTES if (r[0], r[1]) in ADMIN_ONLY])
def test_manager_cannot_use_admin_only_routes(http: TestClient, method: str, path: str, body: object) -> None:
    headers = build_auth_headers(role=UserRole.MANAGER, access_scope=AccessScope.INTERNAL)
    assert call(http, method, path, body, headers).status_code == 403


def test_only_admin_can_write_a_product_fiscal_profile(http: TestClient) -> None:
    profile = {"ncm": "30049099", "cfop": "5102", "origin": "0", "commercial_unit": "UN", "pis_cst": "49", "cofins_cst": "49"}
    for role in (UserRole.CASHIER, UserRole.MANAGER, UserRole.PHARMACIST):
        headers = build_auth_headers(role=role, access_scope=AccessScope.INTERNAL)
        assert http.put(f"/api/v1/fiscal/products/{DOC}/profile", json=profile, headers=headers).status_code == 403


def test_driver_role_has_no_fiscal_access(http: TestClient) -> None:
    headers = build_auth_headers(role=UserRole.DRIVER, access_scope=AccessScope.INTERNAL)
    assert http.get("/api/v1/fiscal/nfce", headers=headers).status_code == 403


# ---------------------------------------------------------------------------------------------
# Input validation (authorized caller, rejected before any service code)
# ---------------------------------------------------------------------------------------------


@pytest.fixture
def manager() -> dict[str, str]:
    return build_auth_headers(role=UserRole.MANAGER, access_scope=AccessScope.INTERNAL)


@pytest.fixture
def admin() -> dict[str, str]:
    return build_auth_headers(role=UserRole.ADMIN, access_scope=AccessScope.INTERNAL)


def test_cancel_rejects_short_reason_and_extra_fields(http: TestClient, manager: dict[str, str]) -> None:
    url = f"/api/v1/fiscal/nfce/{DOC}/cancel"
    assert http.post(url, json={"justification": "curto"}, headers=manager).status_code == 422
    assert http.post(url, json={"justification": "x" * 256}, headers=manager).status_code == 422
    overposted = {"justification": "Erro de digitacao no valor cobrado", "status": "AUTHORIZED", "tenant_id": "x"}
    assert http.post(url, json=overposted, headers=manager).status_code == 422


def test_emit_rejects_non_identifier_sale_and_extra_totals(http: TestClient, manager: dict[str, str]) -> None:
    for body in ({"sale_id": "1; DROP TABLE fiscal_documents"}, {"sale_id": DOC, "total": 0.01}, {}):
        assert http.post("/api/v1/fiscal/nfce", json=body, headers=manager).status_code == 422


def test_listing_filters_are_bounded(http: TestClient, manager: dict[str, str]) -> None:
    base = "/api/v1/fiscal/nfce"
    for query in ("limit=1000", "limit=0", "offset=-1", "access_key=abc", "consumer_cpf=123", "number=0", "serie=1000"):
        assert http.get(f"{base}?{query}", headers=manager).status_code == 422, query


def test_inutilization_validates_range_and_reason(http: TestClient, admin: dict[str, str]) -> None:
    url = "/api/v1/fiscal/inutilization"
    for body in (
        {"first_number": 0, "last_number": 3, "justification": "Numeracao pulada por falha"},
        {"first_number": 1, "last_number": 1_000_000_000, "justification": "Numeracao pulada por falha"},
        {"first_number": 1, "last_number": 3, "justification": "curta"},
        {"first_number": 1, "last_number": 3, "justification": "Numeracao pulada por falha", "serie": 9},
    ):
        assert http.post(url, json=body, headers=admin).status_code == 422


def test_profile_rejects_malformed_tax_codes_and_negative_rates(http: TestClient, admin: dict[str, str]) -> None:
    url = f"/api/v1/fiscal/products/{DOC}/profile"
    valid = {"ncm": "30049099", "cfop": "5102", "origin": "0", "commercial_unit": "UN", "pis_cst": "49", "cofins_cst": "49"}
    for override in (
        {"ncm": "3004"}, {"ncm": "ABCDEFGH"}, {"cfop": "51022"}, {"origin": "9"}, {"icms_csosn": "999"},
        {"icms_cst": "20"}, {"pis_rate": "-1"}, {"cbs_rate": "101"}, {"ibscbs_cclasstrib": "12"}, {"unknown": "x"},
    ):
        assert http.put(url, json={**valid, **override}, headers=admin).status_code == 422, override


def test_no_fiscal_response_shape_can_carry_secrets() -> None:
    from app.schemas.fiscal import FiscalDocumentResponse, FiscalModuleStatusResponse

    forbidden = ("csc", "password", "private", "secret", "token", "certificate_path")
    fields = set(FiscalDocumentResponse.model_fields) | set(FiscalModuleStatusResponse.model_fields)
    assert not [f for f in fields if any(word in f.lower() for word in forbidden)]
