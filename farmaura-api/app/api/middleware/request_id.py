"""
farmaura-api/app/api/middleware/request_id.py

Request identifier middleware for Farmaura.

Responsibilities:
- generate or propagate request IDs;
- attach request IDs to response headers;
- improve traceability across gateway and backend logs;

Observations:
- request IDs are additive and compatible with edge-generated IDs;
- values are UUID4 strings when absent from the incoming request;
"""

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# ============================================================================
# REQUEST ID MIDDLEWARE
# ============================================================================


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request identifier to each request and response."""

    async def dispatch(self, request: Request, call_next: object) -> Response:
        """Propagate or generate the request ID."""

        request_id = request.headers.get("x-request-id", str(uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
