"""
farmaura-api/app/api/middleware/request_logging.py

Structured request logging middleware for Farmaura.

Responsibilities:
- log every HTTP request and response with correlation context;
- persist authenticated audit records for completed requests;
- capture failures without leaking sensitive payload data;

Observations:
- request bodies are intentionally not logged to avoid PII and credential leakage;
- database audit persistence is best-effort and must not block response delivery;
"""

from time import perf_counter
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from structlog.contextvars import bind_contextvars, clear_contextvars

from app.core.database import SessionFactory
from app.core.logging import get_logger
from app.core.tenant_context import apply_tenant_context
from app.schemas.auth import TokenSubject
from app.services.audit_service import AuditRecord, AuditService


# ============================================================================
# REQUEST LOGGING MIDDLEWARE
# ============================================================================


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log and audit every HTTP request."""

    def __init__(self, app: Any) -> None:
        """Store middleware dependencies."""

        super().__init__(app)
        self.logger = get_logger("http.request")

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """Log a full request lifecycle with best-effort audit persistence."""

        request_id = getattr(request.state, "request_id", "") or request.headers.get("x-request-id", str(uuid4()))
        request.state.request_id = request_id
        started_at = perf_counter()
        client_ip = request.client.host if request.client else ""
        user_agent = request.headers.get("user-agent", "")
        bind_contextvars(
            request_id=request_id,
            http_method=request.method,
            http_path=request.url.path,
            client_ip=client_ip,
        )
        self.logger.info(
            "request.started",
            query_string=str(request.url.query),
            route_name=getattr(request.scope.get("route"), "name", "") or "",
        )
        response_status_code = 500
        response: Response | None = None
        caught_exception: Exception | None = None
        try:
            response = await call_next(request)
            response_status_code = response.status_code
            return response
        except HTTPException as exc:
            response_status_code = exc.status_code
            caught_exception = exc
            raise
        except Exception as exc:
            caught_exception = exc
            raise
        finally:
            duration_ms = round((perf_counter() - started_at) * 1000, 2)
            subject = self._extract_subject(request)
            outcome = "success" if response_status_code < 400 else "failure"
            log_payload = {
                "duration_ms": duration_ms,
                "status_code": response_status_code,
                "user_agent": user_agent,
                "actor_user_id": str(subject.user_id) if subject else "",
                "actor_role": subject.role.value if subject else "",
                "tenant_id": str(subject.tenant_id) if subject else "",
                "access_scope": subject.access_scope.value if subject else "",
            }
            if caught_exception is None:
                self.logger.info("request.completed", **log_payload)
            else:
                self.logger.error(
                    "request.failed",
                    **log_payload,
                    error_type=type(caught_exception).__name__,
                )
            await self._persist_audit_event(
                subject=subject,
                request=request,
                request_id=request_id,
                client_ip=client_ip,
                user_agent=user_agent,
                status_code=response_status_code,
                duration_ms=duration_ms,
                outcome=outcome,
            )
            clear_contextvars()

    @staticmethod
    def _extract_subject(request: Request) -> TokenSubject | None:
        """Return the authenticated subject attached to the request, if any."""

        return getattr(request.state, "subject", None)

    async def _persist_audit_event(
        self,
        *,
        subject: TokenSubject | None,
        request: Request,
        request_id: str,
        client_ip: str,
        user_agent: str,
        status_code: int,
        duration_ms: float,
        outcome: str,
    ) -> None:
        """Persist one authenticated request audit event without blocking the response."""

        if subject is None:
            return
        try:
            async with SessionFactory() as session:
                await apply_tenant_context(session, subject)
                service = AuditService(session)
                await service.write_authenticated_event(
                    subject=subject,
                    record=AuditRecord(
                        action=f"http:{request.method.lower()}",
                        detail=f"{request.method} {request.url.path}",
                        event_type="http.request",
                        outcome=outcome,
                        request_id=request_id,
                        http_method=request.method,
                        http_path=request.url.path,
                        status_code=status_code,
                        ip_address=client_ip,
                        user_agent=user_agent[:512],
                        metadata={
                            "duration_ms": duration_ms,
                            "query_present": bool(request.url.query),
                        },
                    ),
                )
        except Exception as exc:
            get_logger("audit.persistence").error(
                "audit.persistence_failed",
                request_id=request_id,
                http_path=request.url.path,
                error_type=type(exc).__name__,
            )
