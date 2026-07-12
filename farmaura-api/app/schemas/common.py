"""
farmaura-api/app/schemas/common.py

Common API schemas for Farmaura.

Responsibilities:
- define reusable payload primitives;
- keep shared response metadata consistent;
- centralize cross-domain transport contracts;

Observations:
- common schemas should stay generic but explicit;
- domain-heavy payloads belong in dedicated modules;
"""

from pydantic import BaseModel, ConfigDict


# ============================================================================
# COMMON SCHEMAS
# ============================================================================


class StrictModel(BaseModel):
    """Base schema with strict extra-field rejection."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
