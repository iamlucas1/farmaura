"""
farmaura-api/app/schemas/uploads.py

Upload schemas for Farmaura.

Responsibilities:
- define private upload response contracts;
- keep file metadata responses minimal and safe;
- support protected upload workflows from the first version;

Observations:
- storage keys are internal identifiers, not public URLs;
- download authorization must stay server-enforced;
"""

from app.schemas.common import StrictModel


# ============================================================================
# UPLOAD SCHEMAS
# ============================================================================


class UploadResponse(StrictModel):
    """Represent a registered upload."""

    file_id: str
    storage_key: str
    status: str
