"""
farmaura-api/app/core/file_validation.py

Upload validation helpers for Farmaura.

Responsibilities:
- validate file names, extensions, and content types;
- enforce backend upload size boundaries;
- prepare uploads for tenant-separated private storage;

Observations:
- magic-byte inspection should be expanded with real parsers later;
- SVG, HTML, JS, and executables are rejected by default;
"""

from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import Settings

# ============================================================================
# FILE VALIDATION
# ============================================================================


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}

INVOICE_ALLOWED_EXTENSIONS = {".pdf", ".xml"}
INVOICE_ALLOWED_CONTENT_TYPES = {"application/pdf", "text/xml", "application/xml"}

QUOTE_ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx"}
QUOTE_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


async def validate_upload(file: UploadFile, settings: Settings) -> None:
    """Validate an uploaded file against conservative allowlists."""

    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported file extension."
        )
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported media type."
        )
    body = await file.read(settings.max_upload_bytes + 1)
    await file.seek(0)
    if len(body) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Upload too large."
        )


async def validate_invoice_upload(file: UploadFile, settings: Settings) -> None:
    """Validate an uploaded supplier invoice file (PDF or XML) against a conservative allowlist."""

    extension = Path(file.filename or "").suffix.lower()
    if extension not in INVOICE_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported invoice file extension.",
        )
    if file.content_type not in INVOICE_ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported invoice media type.",
        )
    body = await file.read(settings.max_upload_bytes + 1)
    await file.seek(0)
    if len(body) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Invoice upload too large."
        )


async def validate_quote_upload(file: UploadFile, settings: Settings) -> None:
    """Validate an uploaded purchase quote file (PDF, image, XLSX, or DOCX)."""

    extension = Path(file.filename or "").suffix.lower()
    if extension not in QUOTE_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported quote file extension.",
        )
    if file.content_type not in QUOTE_ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported quote media type.",
        )
    body = await file.read(settings.max_upload_bytes + 1)
    await file.seek(0)
    if len(body) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Quote upload too large."
        )
