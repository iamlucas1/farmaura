"""
farmaura-api/app/core/file_validation.py

Upload validation helpers for Farmaura.

Responsibilities:
- validate file names, extensions, and content types;
- sniff real file content against known magic-byte signatures, so a renamed/relabeled
  payload can never pass as an image or PDF on extension/Content-Type claims alone;
- enforce backend upload size boundaries;
- prepare uploads for tenant-separated private storage;

Observations:
- SVG, JS, and executables are rejected by default; HTML is allowed only for purchase
  quote imports (a pasted/saved supplier catalog page for AI extraction) — it is never
  rendered inline, only parsed as text server-side or downloaded as an attachment, so it
  carries no stored-XSS risk despite the relaxed allowlist;
- magic-byte sniffing is applied to `validate_upload` (images/PDF: prescriptions, chat
  attachments, generic marketplace uploads) — signatures for those three formats are
  short and unambiguous. The invoice/quote validators accept container formats (XLSX/
  DOCX are ZIP-based, XML/HTML are plain text) where a short prefix check either can't
  distinguish valid-but-unusual content from a crafted payload, or is trivial to satisfy
  without being genuine — sniffing there would be either not meaningfully safer or would
  reject legitimate supplier files. Extension + declared Content-Type is what those two
  already did before this change, and is unaffected.
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

QUOTE_ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx", ".html", ".htm"}
QUOTE_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html",
}

# The one safe, server-chosen extension for each `validate_upload`-allowed content type — used
# to build storage keys without ever trusting the client-supplied filename/extension.
EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
}

# Signature bytes for the three formats `validate_upload` accepts. JPEG only guarantees a
# 2-byte start-of-image marker across all variants (JFIF/Exif/etc. differ after that), so
# it is intentionally the shortest of the three — still sufficient to reject anything that
# isn't actually a JPEG stream.
_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "application/pdf": (b"%PDF-",),
}


def _sniff_content_type(head: bytes) -> str | None:
    """Return the sniffed content type for known magic-byte signatures, or None."""

    for content_type, signatures in _MAGIC_SIGNATURES.items():
        if any(head.startswith(signature) for signature in signatures):
            return content_type
    return None


async def validate_upload(file: UploadFile, settings: Settings) -> None:
    """Validate an uploaded file against conservative allowlists and real file content."""

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
    sniffed = _sniff_content_type(body[:16])
    if sniffed is None or sniffed != file.content_type:
        # The declared extension/Content-Type passed, but the actual bytes don't match any
        # allowed signature (or match a different one than claimed) — e.g. a script or an
        # HTML payload renamed to .pdf. Reject rather than trust client-supplied metadata.
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="File content does not match its declared type."
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
