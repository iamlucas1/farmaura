"""
farmaura-api/app/core/device_detection.py

Lightweight device-type detection for Farmaura.

Responsibilities:
- classify a request's User-Agent header into ios, android, tablet, desktop, or outro;

Observations:
- this is a best-effort heuristic used for promotion targeting and analytics,
  not a security control — never gate authorization decisions on its result;
- there is no native app for the marketplace (web only), so this only distinguishes
  operating system / form factor, never a real "web vs installed app" channel.
"""

from __future__ import annotations


# ============================================================================
# DEVICE DETECTION
# ============================================================================


def detect_device_type(user_agent: str | None) -> str:
    """Return 'ios', 'android', 'tablet', 'desktop', 'outro', or '' from one User-Agent header value."""

    normalized = str(user_agent or "").lower()
    if not normalized:
        return ""
    if "ipad" in normalized:
        return "tablet"
    if any(marker in normalized for marker in ("iphone", "ipod")):
        return "ios"
    if "android" in normalized:
        return "android" if "mobile" in normalized else "tablet"
    if "tablet" in normalized or "kindle" in normalized or "playbook" in normalized:
        return "tablet"
    if any(marker in normalized for marker in ("mobile", "windows phone", "blackberry")):
        return "outro"
    return "desktop"
