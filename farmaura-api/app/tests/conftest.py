"""
farmaura-api/app/tests/conftest.py

Shared test fixtures for Farmaura.

Responsibilities:
- provide a reusable FastAPI test client;
- centralize test environment overrides;
- keep test bootstrap consistent across suites;

Observations:
- database and Redis fixtures can be layered here later;
- current tests focus on transport and middleware behavior;
"""

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("APP_DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("APP_REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("APP_JWT_ISSUER", "farmaura-test")
os.environ.setdefault("APP_JWT_AUDIENCE", "farmaura-test-clients")
os.environ.setdefault("APP_JWT_PRIVATE_KEY", "test-secret")
os.environ.setdefault("APP_JWT_PUBLIC_KEY", "test-secret")

from app.main import app


# ============================================================================
# TEST FIXTURES
# ============================================================================


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    """Provide a synchronous FastAPI test client."""

    with TestClient(app) as test_client:
        yield test_client
