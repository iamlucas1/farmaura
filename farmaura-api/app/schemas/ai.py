"""
farmaura-api/app/schemas/ai.py

AI integration schemas for Farmaura.

Responsibilities:
- validate prompt execution payloads for configured AI providers;
- expose provider readiness and response metadata contracts;
- define stock-specific AI request shapes for the internal console;

Observations:
- provider selection stays explicit to keep multi-provider routing auditable;
- stock-focused prompts inject database context server-side before model execution;
"""

from pydantic import Field

from app.schemas.common import StrictModel


# ============================================================================
# PROVIDER STATUS
# ============================================================================


class AiProviderStatusResponse(StrictModel):
    """Represent the readiness state of an AI provider."""

    provider: str
    enabled: bool
    configured: bool
    default_model: str
    base_url: str


# ============================================================================
# EXECUTION REQUESTS
# ============================================================================


class AiPromptExecutionRequest(StrictModel):
    """Validate a generic prompt execution request."""

    provider: str | None = Field(default=None, pattern="^(gemini|openai)$")
    model: str = Field(default="", max_length=120)
    prompt: str = Field(min_length=1, max_length=16000)
    system_prompt: str = Field(default="", max_length=8000)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=1200, ge=64, le=8192)


class InventoryAiExecutionRequest(StrictModel):
    """Validate an inventory-focused prompt execution request."""

    provider: str | None = Field(default=None, pattern="^(gemini|openai)$")
    model: str = Field(default="", max_length=120)
    question: str = Field(min_length=1, max_length=12000)
    stock_status: str = Field(default="all", pattern="^(all|ok|low|out)$")
    controlled_only: bool = False
    location_code: str = Field(default="", max_length=64)
    max_items: int = Field(default=50, ge=1, le=200)
    max_movements: int = Field(default=20, ge=0, le=100)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_output_tokens: int = Field(default=1500, ge=64, le=8192)


# ============================================================================
# EXECUTION RESPONSES
# ============================================================================


class AiPromptExecutionResponse(StrictModel):
    """Represent the output of a prompt execution."""

    provider: str
    model: str
    content: str
    response_id: str
    finish_reason: str
    usage_input_tokens: int | None = None
    usage_output_tokens: int | None = None
