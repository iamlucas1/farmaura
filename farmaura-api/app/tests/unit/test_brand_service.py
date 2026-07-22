"""
farmaura-api/app/tests/unit/test_brand_service.py

Brand service business-logic tests for Farmaura.

Responsibilities:
- verify a brand cannot reference a supplier outside the tenant;
- verify creating a brand replaces its supplier links with the requested set.

Observations:
- repositories are stubbed directly on the service instance, matching this
  suite's existing convention of isolating service policy from persistence
  (see test_fiscal_service.py);
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.domain.enums import AccessScope, UserRole
from app.schemas.auth import TokenSubject
from app.schemas.brand import BrandCreateRequest
from app.services.brand_service import BrandService


# ============================================================================
# TEST HELPERS
# ============================================================================


def build_subject() -> TokenSubject:
    """Create a token subject for an internal pharmacist actor."""

    return TokenSubject(
        user_id=uuid4(),
        tenant_id=uuid4(),
        role=UserRole.PHARMACIST,
        access_scope=AccessScope.INTERNAL,
        session_version=1,
    )


def build_service() -> BrandService:
    """Create a BrandService with every repository dependency stubbed out."""

    service = BrandService(session=AsyncMock(), subject=build_subject())
    service.repository = AsyncMock()
    service.supplier_repository = AsyncMock()
    service.session.commit = AsyncMock()
    service.session.refresh = AsyncMock()
    return service


# ============================================================================
# BRAND CREATE TESTS
# ============================================================================


@pytest.mark.anyio
async def test_create_brand_rejects_unknown_supplier() -> None:
    """Verify referencing a supplier outside the tenant raises not found."""

    service = build_service()
    service.repository.get_by_name = AsyncMock(return_value=None)
    service.supplier_repository.get_by_id = AsyncMock(return_value=None)
    payload = BrandCreateRequest(name="EMS", supplier_ids=[str(uuid4())])

    with pytest.raises(HTTPException) as error:
        await service.create_brand(payload)

    assert error.value.status_code == 404
    service.repository.add_brand.assert_not_called()


@pytest.mark.anyio
async def test_create_brand_links_requested_suppliers() -> None:
    """Verify a new brand replaces its supplier set with the requested ids."""

    service = build_service()
    service.repository.get_by_name = AsyncMock(return_value=None)
    supplier_id = str(uuid4())
    service.supplier_repository.get_by_id = AsyncMock(return_value=SimpleNamespace(id=supplier_id))
    created_brand = SimpleNamespace(
        id=str(uuid4()), name="EMS", description="", logo_url="", is_active=True,
        suppliers=[], created_at=datetime.now(tz=UTC), updated_at=datetime.now(tz=UTC),
    )
    service.repository.add_brand = AsyncMock(return_value=created_brand)
    service.repository.replace_suppliers = AsyncMock()
    payload = BrandCreateRequest(name="EMS", supplier_ids=[supplier_id])

    response = await service.create_brand(payload)

    assert response.name == "EMS"
    service.repository.replace_suppliers.assert_called_once_with(
        tenant_id=str(service.subject.tenant_id), brand_id=created_brand.id, supplier_ids=[supplier_id],
    )
