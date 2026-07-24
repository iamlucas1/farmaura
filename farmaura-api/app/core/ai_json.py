"""
farmaura-api/app/core/ai_json.py

Shared AI JSON response parsing for Farmaura.

Responsibilities:
- tolerate the small amount of formatting noise AI providers add around JSON
  (markdown code fences, stray prose, trailing commas, curly quotes) and
  recover the JSON object underneath;
- detect when a provider response was cut off by its output token limit, so
  callers can raise an actionable error instead of a generic "malformed
  JSON" one — a truncated response is the most common real-world cause of
  that error on documents with many line items;

Observations:
- extraction-style services (invoice import, purchase quote import) all ask
  providers for a single JSON object back and need the same repair logic;
"""

from __future__ import annotations

import json
import re

from fastapi import HTTPException, status

from app.schemas.ai import AiPromptExecutionResponse

# ============================================================================
# AI JSON PARSING
# ============================================================================

_CURLY_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})
_TRAILING_COMMA_PATTERN = re.compile(r",\s*([\}\]])")
_CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _try_load(candidate: str) -> dict[str, object] | list[object] | None:
    """Attempt to parse a JSON candidate, returning None instead of raising."""

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def parse_ai_json_object(
    content: str, *, error_context: str = "AI extraction"
) -> dict[str, object]:
    """Parse a JSON object out of raw AI text, tolerating common LLM formatting noise.

    Tries, in order: the raw text; text inside a markdown code fence; the largest
    `{...}` span found; then the same candidates again after normalizing curly
    quotes, stripping stray control characters, and dropping trailing commas
    before a closing bracket — cheap, safe repairs for the formatting mistakes
    models actually make, without attempting a full tolerant JSON parser.
    """

    cleaned = (content or "").strip()
    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    object_match = re.search(r"(\{.*\})", cleaned, flags=re.DOTALL)
    candidates = [cleaned]
    if fenced_match:
        candidates.append(fenced_match.group(1).strip())
    if object_match:
        candidates.append(object_match.group(1).strip())

    payload: object = None
    for candidate in candidates:
        payload = _try_load(candidate)
        if payload is not None:
            break
        repaired = candidate.translate(_CURLY_QUOTES)
        repaired = _CONTROL_CHAR_PATTERN.sub("", repaired)
        repaired = _TRAILING_COMMA_PATTERN.sub(r"\1", repaired)
        if repaired != candidate:
            payload = _try_load(repaired)
            if payload is not None:
                break

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{error_context} did not return valid JSON.",
        )
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{error_context} returned an invalid payload.",
        )
    return payload


_TRUNCATED_FINISH_REASONS = {
    "max_tokens",
    "length",
    "incomplete",
    "max_output_tokens",
}


def is_response_truncated(response: AiPromptExecutionResponse) -> bool:
    """Return whether a provider response was cut off by its output token limit.

    Gemini reports `MAX_TOKENS`; OpenAI's Responses API reports `incomplete` (with
    the reason detailed elsewhere in the payload, not surfaced in our normalized
    response) — checked case-insensitively and by substring since exact provider
    wording has drifted before and is not part of any stable contract.
    """

    normalized = response.finish_reason.strip().lower()
    return any(marker in normalized for marker in _TRUNCATED_FINISH_REASONS)
