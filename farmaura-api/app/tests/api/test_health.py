"""
farmaura-api/app/tests/api/test_health.py

Health API tests for Farmaura.

Responsibilities:
- verify the health endpoint responds successfully;
- assert the baseline health payload contract;
- confirm middleware-friendly response behavior;

Observations:
- health routes must stay safe for public probing through the gateway;
- sensitive diagnostics must not appear here;
"""


# ============================================================================
# HEALTH API TESTS
# ============================================================================


def test_healthcheck_returns_ok(client: object) -> None:
    """Verify the health endpoint returns the expected payload."""

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "detail": "Farmaura API is healthy."}
