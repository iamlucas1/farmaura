"""
farmaura-api/app/api/middleware/security_headers.py

Security headers middleware for Farmaura.

Responsibilities:
- append conservative security response headers;
- avoid contradictory policies with lumos-gateway;
- ensure responses carry baseline browser protections;

Observations:
- TLS enforcement remains a gateway responsibility;
- CSP can be tightened further once frontend origins are finalized;
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ============================================================================
# SECURITY HEADER MIDDLEWARE
# ============================================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach baseline security headers to each response."""

    async def dispatch(self, request: Request, call_next: object) -> Response:
        """Set gateway-compatible response headers."""

        response = await call_next(request)
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("x-frame-options", "DENY")
        response.headers.setdefault("referrer-policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("permissions-policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault(
            "content-security-policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        return response
