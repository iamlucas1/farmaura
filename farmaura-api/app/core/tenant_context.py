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
