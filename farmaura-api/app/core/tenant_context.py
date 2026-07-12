"""
farmaura-api/app/core/tenant_context.py

Tenant and access context helpers for PostgreSQL RLS enforcement.

Responsibilities:
- apply authenticated tenant context to database sessions;
- keep PostgreSQL RLS session variables consistent across requests;
- fail closed when protected sessions have no tenant context;

Observations:
- PostgreSQL receives the authoritative request context through transaction-local settings;
- non-PostgreSQL test environments skip RLS session variable writes safely;
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import TokenSubject


# ============================================================================
# RLS CONTEXT
# ============================================================================


async def apply_tenant_context(session: AsyncSession, subject: TokenSubject) -> None:
    """Apply transaction-local tenant and actor context to the current session."""

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT
                set_config('app.current_tenant_id', :tenant_id, true),
                set_config('app.current_user_id', :user_id, true),
                set_config('app.current_user_role', :user_role, true),
                set_config('app.current_access_scope', :access_scope, true)
            """
        ),
        {
            "tenant_id": str(subject.tenant_id),
            "user_id": str(subject.user_id),
            "user_role": subject.role.value,
            "access_scope": subject.access_scope.value,
        },
    )


async def apply_login_context(session: AsyncSession, email: str) -> None:
    """Apply transaction-local login context for the authentication lookup."""

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT set_config('app.current_login_email', :login_email, true)
            """
        ),
        {"login_email": email.strip().lower()},
    )


async def apply_system_job_context(session: AsyncSession) -> None:
    """Apply transaction-local context for one trusted, backend-only background job.

    This flag can only ever be set by trusted server code that calls this
    function directly (e.g. the fiscal issuance scheduler) — no HTTP request
    path derives or forwards it from client input, so it cannot be spoofed
    through any endpoint. It grants the narrow set of cross-tenant reads/writes
    a system-wide sweep genuinely needs (e.g. scanning orders across every
    tenant for deferred fiscal issuance), the same way current_login_email
    and current_webhook_payment_id grant narrow, purpose-built carve-outs.
    """

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT set_config('app.current_system_job', 'true', true)
            """
        )
    )


async def apply_webhook_context(session: AsyncSession, gateway_payment_id: str) -> None:
    """Apply transaction-local context for one verified payment webhook update.

    Scoped narrowly to the single gateway payment id the caller already
    authenticated (shared-secret token + IP allowlist), mirroring the
    current_login_email carve-out used for pre-auth user lookups: it grants
    access to exactly one order row, not cross-tenant access in general.
    """

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT set_config('app.current_webhook_payment_id', :gateway_payment_id, true)
            """
        ),
        {"gateway_payment_id": gateway_payment_id.strip()},
    )
