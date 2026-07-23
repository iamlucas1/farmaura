"""
farmaura-api/app/services/category_service.py

Category service for Farmaura.

Responsibilities:
- execute product category registration and maintenance use-cases;
- validate category payloads before they reach persistence;
- assemble internal console responses from repository models;

Observations:
- categories are tenant-scoped and never hard-deleted, only deactivated, to
  preserve product references;
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache_scope
from app.models.category import Category
from app.repositories.category_repository import CategoryRepository
from app.schemas.auth import TokenSubject
from app.schemas.category import (
    CategoryCreateRequest,
    CategoryDiscardUpdateRequest,
    CategoryListResponse,
    CategoryResponse,
    CategoryStatusUpdateRequest,
    CategoryUpdateRequest,
)
from app.services.catalog_service import CATALOG_CACHE_NAMESPACE


# ============================================================================
# CATEGORY SERVICE
# ============================================================================


class CategoryService:
    """Provide category use-cases for the internal console."""

    def __init__(self, session: AsyncSession, subject: TokenSubject) -> None:
        """Store repository dependencies and actor context."""

        self.session = session
        self.subject = subject
        self.repository = CategoryRepository(session)

    async def list_categories(self, *, active_only: bool = False) -> CategoryListResponse:
        """Return tenant categories."""

        categories = await self.repository.list_categories(tenant_id=str(self.subject.tenant_id), active_only=active_only)
        return CategoryListResponse(items=[self._serialize(category) for category in categories])

    async def create_category(self, payload: CategoryCreateRequest) -> CategoryResponse:
        """Create a new category."""

        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category name already registered.")
        category = Category(
            tenant_id=str(self.subject.tenant_id),
            name=payload.name,
            description=payload.description,
            is_active=True,
        )
        category = await self.repository.add_category(category)
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(category)

    async def update_category(self, category_id: str, payload: CategoryUpdateRequest) -> CategoryResponse:
        """Update an existing category."""

        category = await self._require_category(category_id)
        existing = await self.repository.get_by_name(tenant_id=str(self.subject.tenant_id), name=payload.name)
        if existing is not None and existing.id != category.id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category name already registered.")
        category.name = payload.name
        category.description = payload.description
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(category)

    async def update_category_status(self, category_id: str, payload: CategoryStatusUpdateRequest) -> CategoryResponse:
        """Activate or deactivate a category."""

        category = await self._require_category(category_id)
        category.is_active = payload.is_active
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(category)

    async def update_category_discard(self, category_id: str, payload: CategoryDiscardUpdateRequest) -> CategoryResponse:
        """Discard a category (soft-delete) or recover it — independent of is_active."""

        category = await self._require_category(category_id)
        category.is_discarded = payload.is_discarded
        await self.session.commit()
        await invalidate_cache_scope(CATALOG_CACHE_NAMESPACE, str(self.subject.tenant_id))
        return self._serialize(category)

    async def _require_category(self, category_id: str) -> Category:
        """Return an existing category or fail with not found."""

        category = await self.repository.get_by_id(tenant_id=str(self.subject.tenant_id), category_id=category_id)
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")
        return category

    def _serialize(self, category: Category) -> CategoryResponse:
        """Serialize a category for API responses."""

        return CategoryResponse(
            id=category.id,
            name=category.name,
            description=category.description,
            is_active=category.is_active,
            is_discarded=category.is_discarded,
            created_at=category.created_at,
            updated_at=category.updated_at,
        )
