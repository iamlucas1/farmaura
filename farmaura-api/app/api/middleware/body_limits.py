"""
farmaura-api/app/api/middleware/body_limits.py

Body size protection middleware for Farmaura.

Responsibilities:
- reject oversized request bodies early;
- provide consistent abuse-resistant limits;
- protect application memory from oversized payloads;

Observations:
- body limits should stay aligned with lumos-gateway limits;
- uploads can define stricter route-level limits when needed;
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.status import HTTP_413_REQUEST_ENTITY_TOO_LARGE


# ============================================================================
# BODY LIMIT MIDDLEWARE
# ============================================================================


class BodyLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose body exceeds the configured maximum size."""

    def __init__(self, app: object, max_body_bytes: int) -> None:
        """Store middleware configuration."""

        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(self, request: Request, call_next: object) -> Response:
        """Enforce request body size using the content-length header when present."""

        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_body_bytes:
            return JSONResponse(
                status_code=HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"detail": "Request body too large."},
            )
        return await call_next(request)
