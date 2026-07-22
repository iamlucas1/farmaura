"""
farmaura-api/app/services/therapeutic_class_service.py

Therapeutic class service for Farmaura.

Responsibilities:
- execute therapeutic class (classe terapeutica) registration and
  maintenance use-cases;
- validate therapeutic class payloads before they reach persistence;
- assemble internal console responses from repository models;

Observations:
- therapeutic classes are tenant-scoped and never hard-deleted, only
  deactivated, to preserve product references;
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.models.therapeutic_class import TherapeuticClass
from app.repositories.category_repository import CategoryRepository
from app.repositories.therapeutic_class_repository import TherapeuticClassRepository
from app.schemas.auth import TokenSubject
from app.schemas.therapeutic_class import (
    TherapeuticClassCreateRequest,
    TherapeuticClassDiscardUpdateRequest,
    TherapeuticClassListResponse,
    TherapeuticClassResponse,
    TherapeuticClassStatusUpdateRequest,
    TherapeuticClassUpdateRequest,
)
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE


# ============================================================================
# THERAPEUTIC CLASS SERVICE
# ============================================================================


class TherapeuticClassService:
    """Provide therapeutic class use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = TherapeuticClassRepository(session)
        self.category_repository = CategoryRepository(session)

    async def list_therapeutic_classes(self, *, active_only: bool = False) -> TherapeuticClassListResponse:
        """Return tenant therapeutic classes."""

        therapeutic_classes = await self.repository.list_therapeutic_classes(
            tenant_id=str(self.subject.tenant_id), active_only=active_only,
        )
        return TherapeuticClassListResponse(items=[self._serialize(item) for item in therapeutic_classes])

    async def create_therapeutic_class(self, payload: TherapeuticClassCreateRequest) -> TherapeuticClassResponse:
        """Create a new therapeutic class."""

        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Therapeutic class name already registered.")
        await self._ensure_category_exists(payload.category_id)
        therapeutic_class = TherapeuticClass(
            tenant_id=str(self.subject.tenant_id),
            name=payload.name,
            description=payload.description,
            category_id=payload.category_id,
            is_active=True,
        )
        therapeutic_class = await self.repository.add_therapeutic_class(therapeutic_class)
        await self.session.commit()
        await self.session.refresh(therapeutic_class)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(therapeutic_class)

    async def update_therapeutic_class(
        self, therapeutic_class_id: str, payload: TherapeuticClassUpdateRequest,
    ) -> TherapeuticClassResponse:
        """Update an existing therapeutic class."""

        therapeutic_class = await self._require_therapeutic_class(therapeutic_class_id)
        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None and existing.id != therapeutic_class.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Therapeutic class name already registered.")
        await self._ensure_category_exists(payload.category_id)
        therapeutic_class.name = payload.name
        therapeutic_class.description = payload.description
        therapeutic_class.category_id = payload.category_id
        await self.session.commit()
        await self.session.refresh(therapeutic_class)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(therapeutic_class)

    async def _ensure_category_exists(self, category_id: str | None) -> None:
        """Validate that the referenced category belongs to the tenant."""

        if not category_id:
            return
        category = await self.category_repository.get_by_id(tenant_id=str(self.subject.tenant_id), category_id=category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    async def update_therapeutic_class_status(
        self, therapeutic_class_id: str, payload: TherapeuticClassStatusUpdateRequest,
    ) -> TherapeuticClassResponse:
        """Activate or deactivate a therapeutic class."""

        therapeutic_class = await self._require_therapeutic_class(therapeutic_class_id)
        therapeutic_class.is_active = payload.is_active
        await self.session.commit()
        await self.session.refresh(therapeutic_class)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(therapeutic_class)

    async def update_therapeutic_class_discard(
        self, therapeutic_class_id: str, payload: TherapeuticClassDiscardUpdateRequest,
    ) -> TherapeuticClassResponse:
        """Discard a therapeutic class (soft-delete) or recover it — independent of is_active."""

        therapeutic_class = await self._require_therapeutic_class(therapeutic_class_id)
        therapeutic_class.is_discarded = payload.is_discarded
        await self.session.commit()
        await self.session.refresh(therapeutic_class)
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(therapeutic_class)

    async def _require_therapeutic_class(self, therapeutic_class_id: str) -> TherapeuticClass:
        """Return an existing therapeutic class or fail with not found."""

        therapeutic_class = await self.repository.get_by_id(
            tenant_id=str(self.subject.tenant_id), therapeutic_class_id=therapeutic_class_id,
        )
        if therapeutic_class is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Therapeutic class not found.")
        return therapeutic_class

    def _serialize(self, therapeutic_class: TherapeuticClass) -> TherapeuticClassResponse:
        """Serialize a therapeutic class for API responses."""

        return TherapeuticClassResponse(
            id=therapeutic_class.id,
            name=therapeutic_class.name,
            description=therapeutic_class.description,
            is_active=therapeutic_class.is_active,
            is_discarded=therapeutic_class.is_discarded,
            category_id=therapeutic_class.category_id,
            category_name=therapeutic_class.category_name,
            created_at=therapeutic_class.created_at,
            updated_at=therapeutic_class.updated_at,
        )
