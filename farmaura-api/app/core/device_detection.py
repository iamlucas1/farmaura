"""
farmaura-api/app/core/device_detection.py

Lightweight device-type detection for Farmaura.

Responsibilities:
- classify a request's User-Agent header into mobile, tablet, or desktop;

Observations:
- this is a best-effort heuristic used for promotion targeting and analytics,
  not a security control — never gate authorization decisions on its result.
"""

from __future__ import annotations


# ============================================================================
# DEVICE DETECTION
# ============================================================================


def detect_device_type(user_agent: str | None) -> str:
    """Return 'mobile', 'tablet', 'desktop', or '' from one User-Agent header value."""

    normalized = str(user_agent or "").lower()
    if not normalized:
        return ""
    if "ipad" in normalized or "tablet" in normalized or "kindle" in normalized or "playbook" in normalized:
        return "tablet"
    if "android" in normalized:
        return "mobile" if "mobile" in normalized else "tablet"
    if any(marker in normalized for marker in ("iphone", "ipod", "mobile", "windows phone", "blackberry")):
        return "mobile"
    return "desktop"
