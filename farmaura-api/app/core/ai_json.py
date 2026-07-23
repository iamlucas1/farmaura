"""
farmaura-api/app/core/ai_json.py

Shared AI JSON response parsing for Farmaura.

Responsibilities:
- tolerate the small amount of formatting noise AI providers add around JSON
  (markdown code fences, stray prose) and recover the JSON object underneath;

Observations:
- extraction-style services (invoice import, purchase quote import) all ask
  providers for a single JSON object back and need the same repair logic;
"""

from __future__ import annotations

import json
import re

from fastapi import HTTPException, status

# ============================================================================
# AI JSON PARSING
# ============================================================================


def parse_ai_json_object(
    content: str, *, error_context: str = "AI extraction"
) -> dict[str, object]:
    """Parse a JSON object out of raw AI text, tolerating code fences and surrounding prose."""

    cleaned = str(content or "").strip()
    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    if fenced_match:
        cleaned = fenced_match.group(1).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as initial_error:
        object_match = re.search(r"(\{.*\})", cleaned, flags=re.DOTALL)
        if not object_match:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{error_context} did not return valid JSON.",
            ) from initial_error
        try:
            payload = json.loads(object_match.group(1))
        except json.JSONDecodeError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{error_context} returned malformed JSON.",
            ) from error
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{error_context} returned an invalid payload.",
        )
    return payload
