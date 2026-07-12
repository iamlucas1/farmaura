"""
farmaura-api/app/services/ai_service.py

AI provider orchestration service for Farmaura.

Responsibilities:
- execute prompts against configured Gemini and OpenAI providers;
- normalize provider-specific payloads and responses into a shared contract;
- expose provider readiness for internal operational modules;

Observations:
- this integration reads credentials directly from the environment-backed settings;
- provider-specific request schemas intentionally stay minimal for operational prompting.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings
from app.schemas.ai import AiPromptExecutionResponse, AiProviderStatusResponse


# ============================================================================
# VALUE OBJECTS
# ============================================================================


@dataclass(frozen=True, slots=True)
class AiExecutionRequest:
    """Represent a normalized provider execution request."""

    provider: str
    model: str
    prompt: str
    system_prompt: str
    temperature: float
    max_output_tokens: int


@dataclass(frozen=True, slots=True)
class AiDocumentExecutionRequest:
    """Represent a multimodal provider execution request."""

    provider: str
    model: str
    prompt: str
    system_prompt: str
    mime_type: str
    file_name: str
    file_base64: str
    temperature: float
    max_output_tokens: int


# ============================================================================
# AI SERVICE
# ============================================================================


class AiService:
    """Execute prompts against configured AI providers."""

    def __init__(self, settings: Settings) -> None:
        """Store runtime configuration for AI providers."""

        self.settings = settings

    def list_provider_statuses(self) -> list[AiProviderStatusResponse]:
        """Return the configured readiness state for supported providers."""

        return [
            AiProviderStatusResponse(
                provider="gemini",
                enabled=self.settings.ai_enabled,
                configured=self.settings.ai_gemini_api_key.strip() != "",
                default_model=self.settings.ai_gemini_model,
                base_url=self.settings.ai_gemini_base_url,
            ),
            AiProviderStatusResponse(
                provider="openai",
                enabled=self.settings.ai_enabled,
                configured=self.settings.ai_openai_api_key.strip() != "",
                default_model=self.settings.ai_openai_model,
                base_url=self.settings.ai_openai_base_url,
            ),
        ]

    async def execute_prompt(self, request: AiExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a normalized prompt request against the chosen provider."""

        self._ensure_ai_enabled()
        normalized_provider = request.provider.strip().lower() or self.settings.ai_default_provider.strip().lower()
        if normalized_provider == "gemini":
            return await self._execute_gemini(request)
        if normalized_provider == "openai":
            return await self._execute_openai(request)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported AI provider.")

    async def execute_document_prompt(self, request: AiDocumentExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a multimodal document prompt against the chosen provider."""

        self._ensure_ai_enabled()
        normalized_provider = request.provider.strip().lower() or self.settings.ai_default_provider.strip().lower()
        if normalized_provider == "gemini":
            return await self._execute_gemini_document(request)
        if normalized_provider == "openai":
            return await self._execute_openai_document(request)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported AI provider.")

    def _ensure_ai_enabled(self) -> None:
        """Fail closed when AI integrations are disabled."""

        if not self.settings.ai_enabled:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI integrations are disabled.")

    async def _execute_gemini(self, request: AiExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a prompt through the Gemini GenerateContent API."""

        api_key = self.settings.ai_gemini_api_key.strip()
        if api_key == "":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Gemini API key is not configured.")
        model = request.model.strip() or self.settings.ai_gemini_model
        payload: dict[str, Any] = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": request.prompt}],
                }
            ],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_output_tokens,
            },
        }
        if request.system_prompt.strip():
            payload["systemInstruction"] = {
                "parts": [{"text": request.system_prompt.strip()}],
            }
        return await self._post_gemini(payload=payload, model=model)

    async def _execute_gemini_document(self, request: AiDocumentExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a document prompt through the Gemini GenerateContent API."""

        model = request.model.strip() or self.settings.ai_gemini_model
        payload: dict[str, Any] = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": request.prompt},
                        {
                            "inlineData": {
                                "mimeType": request.mime_type,
                                "data": request.file_base64,
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_output_tokens,
            },
        }
        if request.system_prompt.strip():
            payload["systemInstruction"] = {
                "parts": [{"text": request.system_prompt.strip()}],
            }
        return await self._post_gemini(payload=payload, model=model)

    async def _post_gemini(self, *, payload: dict[str, Any], model: str) -> AiPromptExecutionResponse:
        """Send a prepared request to Gemini and normalize the response."""

        api_key = self.settings.ai_gemini_api_key.strip()
        if api_key == "":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Gemini API key is not configured.")
        endpoint = self.settings.ai_gemini_base_url.rstrip("/") + f"/models/{model}:generateContent"
        async with httpx.AsyncClient(timeout=self.settings.ai_request_timeout_seconds) as client:
            response = await client.post(
                endpoint,
                params={"key": api_key},
                headers={"Content-Type": "application/json"},
                json=payload,
            )
        self._raise_for_provider_error(response=response, provider="Gemini")
        body = response.json()
        candidates = body.get("candidates") or []
        if not candidates:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Gemini returned no candidates.")
        candidate = candidates[0]
        content = self._extract_gemini_text(candidate)
        usage = body.get("usageMetadata") or {}
        return AiPromptExecutionResponse(
            provider="gemini",
            model=model,
            content=content,
            response_id=str(body.get("responseId") or ""),
            finish_reason=str(candidate.get("finishReason") or ""),
            usage_input_tokens=self._int_or_none(usage.get("promptTokenCount")),
            usage_output_tokens=self._int_or_none(usage.get("candidatesTokenCount")),
        )

    async def _execute_openai(self, request: AiExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a prompt through the OpenAI Responses API."""

        api_key = self.settings.ai_openai_api_key.strip()
        if api_key == "":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OpenAI API key is not configured.")
        model = request.model.strip() or self.settings.ai_openai_model
        endpoint = self.settings.ai_openai_base_url.rstrip("/") + "/responses"
        payload: dict[str, Any] = {
            "model": model,
            "input": request.prompt,
            "max_output_tokens": request.max_output_tokens,
        }
        if request.system_prompt.strip() != "":
            payload["instructions"] = request.system_prompt.strip()
        async with httpx.AsyncClient(timeout=self.settings.ai_request_timeout_seconds) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + api_key,
                },
                json=payload,
            )
        self._raise_for_provider_error(response=response, provider="OpenAI")
        body = response.json()
        content = self._extract_openai_text(body)
        usage = body.get("usage") or {}
        return AiPromptExecutionResponse(
            provider="openai",
            model=model,
            content=content,
            response_id=str(body.get("id") or ""),
            finish_reason=str(body.get("status") or ""),
            usage_input_tokens=self._int_or_none(usage.get("input_tokens")),
            usage_output_tokens=self._int_or_none(usage.get("output_tokens")),
        )

    async def _execute_openai_document(self, request: AiDocumentExecutionRequest) -> AiPromptExecutionResponse:
        """Execute a multimodal document prompt through the OpenAI Responses API."""

        if not request.mime_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="OpenAI invoice extraction currently supports image files only. Use Gemini for PDF documents.",
            )
        api_key = self.settings.ai_openai_api_key.strip()
        if api_key == "":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="OpenAI API key is not configured.")
        model = request.model.strip() or self.settings.ai_openai_model
        endpoint = self.settings.ai_openai_base_url.rstrip("/") + "/responses"
        payload: dict[str, Any] = {
            "model": model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": request.prompt},
                        {
                            "type": "input_image",
                            "image_url": "data:" + request.mime_type + ";base64," + request.file_base64,
                        },
                    ],
                }
            ],
            "max_output_tokens": request.max_output_tokens,
        }
        if request.system_prompt.strip() != "":
            payload["instructions"] = request.system_prompt.strip()
        async with httpx.AsyncClient(timeout=self.settings.ai_request_timeout_seconds) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + api_key,
                },
                json=payload,
            )
        self._raise_for_provider_error(response=response, provider="OpenAI")
        body = response.json()
        content = self._extract_openai_text(body)
        usage = body.get("usage") or {}
        return AiPromptExecutionResponse(
            provider="openai",
            model=model,
            content=content,
            response_id=str(body.get("id") or ""),
            finish_reason=str(body.get("status") or ""),
            usage_input_tokens=self._int_or_none(usage.get("input_tokens")),
            usage_output_tokens=self._int_or_none(usage.get("output_tokens")),
        )

    def _raise_for_provider_error(self, *, response: httpx.Response, provider: str) -> None:
        """Raise a normalized HTTP exception for provider errors."""

        if response.is_success:
            return
        detail = ""
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if isinstance(payload, dict):
            error_payload = payload.get("error")
            if isinstance(error_payload, dict):
                detail = str(error_payload.get("message") or error_payload.get("code") or "")
            elif error_payload is not None:
                detail = str(error_payload)
            elif payload.get("message") is not None:
                detail = str(payload.get("message"))
        if detail.strip() == "":
            detail = f"{provider} request failed with status {response.status_code}."
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    def _extract_gemini_text(self, candidate: dict[str, Any]) -> str:
        """Extract the textual answer from a Gemini candidate."""

        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        fragments: list[str] = []
        for part in parts:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                fragments.append(part["text"])
        answer = "\n".join(fragment.strip() for fragment in fragments if fragment.strip())
        if answer == "":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Gemini returned an empty response.")
        return answer

    def _extract_openai_text(self, payload: dict[str, Any]) -> str:
        """Extract the textual answer from an OpenAI response payload."""

        if isinstance(payload.get("output_text"), str) and payload["output_text"].strip() != "":
            return payload["output_text"].strip()
        output = payload.get("output") or []
        fragments: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content") or []
            if not isinstance(content, list):
                continue
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    fragments.append(part["text"])
        answer = "\n".join(fragment.strip() for fragment in fragments if fragment.strip())
        if answer == "":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI returned an empty response.")
        return answer

    def _int_or_none(self, value: Any) -> int | None:
        """Convert optional numeric usage values to integers."""

        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
