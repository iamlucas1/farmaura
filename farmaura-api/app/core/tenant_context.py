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
                set_config('app.current_access_scope', :access_scope, true),
                set_config('app.current_store_id', :store_id, true)
            """
        ),
        {
            "tenant_id": str(subject.tenant_id),
            "user_id": str(subject.user_id),
            "user_role": subject.role.value,
            "access_scope": subject.access_scope.value,
            "store_id": str(subject.store_id) if subject.store_id else "",
        },
    )


async def apply_authenticated_context(session: AsyncSession, *, tenant_id: str, user_id: str) -> None:
    """Apply transaction-local tenant/user context for pre-session-token auth flows.

    Covers login, 2FA verification, password-reset completion, and refresh/logout
    token rotation — all of which read or write the users/refresh_tokens rows for
    one already-identified account before a full TokenSubject (with role, access
    scope, store) exists. Ordinary authenticated requests get this from
    apply_tenant_context via get_subject_session instead; these flows run over a
    plain get_session dependency because there is no bearer token yet to decode.
    """

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT
                set_config('app.current_tenant_id', :tenant_id, true),
                set_config('app.current_user_id', :user_id, true)
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id},
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


async def apply_first_access_context(session: AsyncSession, email: str) -> None:
    """Apply transaction-local context for one unauthenticated marketplace account-provisioning request.

    Covers both the PDV first-access flow (issuing a temporary password for
    an existing customer) and self-service registration (creating a brand
    new customer and user). Scoped narrowly to the single e-mail address the
    caller already claimed ownership of by submitting the form, mirroring
    the current_login_email carve-out: it grants read/write access to the
    matching customer row and read/write access to the matching user row
    only, never cross-tenant or cross-account access.
    """

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT set_config('app.current_first_access_email', :first_access_email, true)
            """
        ),
        {"first_access_email": email.strip().lower()},
    )


async def apply_public_marketplace_context(session: AsyncSession, tenant_id: str) -> None:
    """Apply transaction-local context for one anonymous public catalog read.

    Scoped to a single tenant id already resolved through the narrow
    SECURITY DEFINER lookup app_private.resolve_public_marketplace_tenant_id
    (which bypasses RLS only to identify which tenant owns the public storefront,
    never to read product data itself). Sets the 'customer' role so the existing
    customer read carve-out on inventory_items_access_policy applies — the same
    access an authenticated shopper already has, extended to pre-login browsing.
    """

    if session.bind is None or session.bind.dialect.name != "postgresql":
        return
    await session.execute(
        text(
            """
            SELECT
                set_config('app.current_tenant_id', :tenant_id, true),
                set_config('app.current_user_role', 'customer', true)
            """
        ),
        {"tenant_id": tenant_id},
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
