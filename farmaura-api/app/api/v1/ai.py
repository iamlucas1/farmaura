"""
farmaura-api/app/api/v1/ai.py

AI integration routes for Farmaura.

Responsibilities:
- expose internal AI provider execution endpoints;
- segregate generic prompting from inventory-specific operational prompting;
- keep provider access restricted to authorized internal roles;

Observations:
- inventory AI prompts load live stock context from the database before provider execution;
- credentials are resolved from environment-backed settings without requiring secret files.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings, get_subject_session, require_internal_subject
from app.core.config import Settings
from app.domain.enums import UserRole
from app.schemas.ai import (
    AiPromptExecutionRequest,
    AiPromptExecutionResponse,
    AiProviderStatusResponse,
    InventoryAiExecutionRequest,
)
from app.schemas.auth import TokenSubject
from app.services.ai_service import AiExecutionRequest, AiService
from app.services.inventory_ai_service import InventoryAiService


# ============================================================================
# AI ROUTES
# ============================================================================


router = APIRouter()


@router.get('/providers', response_model=list[AiProviderStatusResponse])
async def list_ai_providers(
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    settings: Settings = Depends(get_app_settings),
) -> list[AiProviderStatusResponse]:
    """Return the configured AI provider readiness state."""

    return AiService(settings).list_provider_statuses()


@router.post('/execute', response_model=AiPromptExecutionResponse)
async def execute_ai_prompt(
    payload: AiPromptExecutionRequest,
    _: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    settings: Settings = Depends(get_app_settings),
) -> AiPromptExecutionResponse:
    """Execute a generic prompt against the selected AI provider."""

    service = AiService(settings)
    request = AiExecutionRequest(
        provider=(payload.provider or settings.ai_default_provider).strip().lower(),
        model=payload.model,
        prompt=payload.prompt,
        system_prompt=payload.system_prompt,
        temperature=payload.temperature,
        max_output_tokens=payload.max_output_tokens,
    )
    return await service.execute_prompt(request)


@router.post('/inventory/execute', response_model=AiPromptExecutionResponse)
async def execute_inventory_ai_prompt(
    payload: InventoryAiExecutionRequest,
    subject: TokenSubject = Depends(require_internal_subject(UserRole.ADMIN, UserRole.PHARMACIST)),
    session: AsyncSession = Depends(get_subject_session),
    settings: Settings = Depends(get_app_settings),
) -> AiPromptExecutionResponse:
    """Execute an inventory-focused prompt with live stock context."""

    service = InventoryAiService(session=session, subject=subject, settings=settings)
    return await service.execute(payload)
