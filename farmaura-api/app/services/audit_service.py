"""
farmaura-api/app/services/audit_service.py

Audit logging service for Farmaura.

Responsibilities:
- persist authenticated backend audit records;
- normalize HTTP request audit payloads;
- keep audit writes isolated from route handlers;

Observations:
- anonymous requests are still logged structurally even when not persisted;
- payload metadata must remain minimal and redacted before persistence;
"""

import json
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.schemas.auth import TokenSubject


# ============================================================================
# AUDIT PAYLOADS
# ============================================================================


@dataclass(slots=True)
class AuditRecord:
    """Represent a normalized audit event payload."""

    action: str
    detail: str
    event_type: str
    outcome: str
    request_id: str
    http_method: str
    http_path: str
    status_code: int
    ip_address: str
    user_agent: str
    metadata: dict[str, str | int | bool | None]


# ============================================================================
# AUDIT SERVICE
# ============================================================================


class AuditService:
    """Persist security and access audit events."""

    def __init__(self, session: AsyncSession) -> None:
        """Store the async session used for audit writes."""

        self.session = session

    async def write_authenticated_event(self, *, subject: TokenSubject, record: AuditRecord) -> None:
        """Persist one authenticated audit event."""

        event = AuditEvent(
            tenant_id=str(subject.tenant_id),
            actor_user_id=str(subject.user_id),
            actor_role=subject.role.value,
            access_scope=subject.access_scope.value,
            request_id=record.request_id,
            source="backend",
            action=record.action,
            event_type=record.event_type,
            outcome=record.outcome,
            http_method=record.http_method,
            http_path=record.http_path,
            status_code=record.status_code,
            ip_address=record.ip_address,
            user_agent=record.user_agent,
            metadata_json=json.dumps(record.metadata, ensure_ascii=True, separators=(",", ":")),
            detail=record.detail,
        )
        self.session.add(event)
        await self.session.commit()
