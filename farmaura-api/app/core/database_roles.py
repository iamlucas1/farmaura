"""
farmaura-api/app/core/database_roles.py

Least-privilege runtime role bootstrap for Farmaura's PostgreSQL database.

Responsibilities:
- create (or update the password of) the restricted, non-superuser role the
  application connects as at runtime, distinct from the admin role used only
  to bootstrap schema and RLS policies;
- grant that runtime role exactly the privileges it needs on every table,
  sequence, and app_private helper function — including ones added later,
  via ALTER DEFAULT PRIVILEGES.

Observations:
- this mirrors production, where the live application should never connect
  as a role that bypasses row-level security;
- runs idempotently on every startup from the same admin connection that
  applies RLS policies, so it stays in sync as models change;
- schema/seed bootstrap itself still runs over the admin connection (see
  scripts/bootstrap_database.py), since it performs cross-tenant writes with
  no per-request tenant context — the same reason existing "system job"
  policy carve-outs exist for background sweeps.
"""

from sqlalchemy import Connection
from sqlalchemy.engine import make_url


# ============================================================================
# SQL HELPERS
# ============================================================================


def _escape_literal(value: str) -> str:
    """Escape a value for safe embedding inside a single-quoted SQL literal."""

    return value.replace("'", "''")


def _quote_ident(value: str) -> str:
    """Escape a value for safe embedding as a double-quoted SQL identifier."""

    return '"' + value.replace('"', '""') + '"'


# ============================================================================
# ROLE BOOTSTRAP
# ============================================================================


def ensure_runtime_role(connection: Connection, *, runtime_database_url: str) -> None:
    """Create the restricted runtime role if missing, or refresh its password.

    The role is created explicitly NOSUPERUSER/NOBYPASSRLS so it can never
    skip row-level security, regardless of how it is later granted access.
    """

    url = make_url(runtime_database_url)
    username = url.username or ""
    password = url.password or ""
    if not username or not password:
        return

    safe_username = _escape_literal(username)
    safe_password = _escape_literal(password)
    connection.exec_driver_sql(
        f"""
        DO $do$
        BEGIN
            IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{safe_username}') THEN
                EXECUTE format(
                    'ALTER ROLE %%I WITH LOGIN PASSWORD %%L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
                    '{safe_username}', '{safe_password}'
                );
            ELSE
                EXECUTE format(
                    'CREATE ROLE %%I WITH LOGIN PASSWORD %%L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS',
                    '{safe_username}', '{safe_password}'
                );
            END IF;
        END
        $do$;
        """
    )


def grant_runtime_privileges(connection: Connection, *, runtime_database_url: str) -> None:
    """Grant the restricted runtime role access to every schema object it needs.

    Re-applied on every startup so tables/functions added since the role was
    first created (no fresh volume in this dev-phase, create-all-on-boot
    project) are automatically covered too.
    """

    url = make_url(runtime_database_url)
    username = url.username or ""
    database = url.database or ""
    if not username or not database:
        return

    role = _quote_ident(username)
    db = _quote_ident(database)
    statements = (
        f"GRANT CONNECT ON DATABASE {db} TO {role}",
        f"GRANT USAGE ON SCHEMA public TO {role}",
        f"GRANT USAGE ON SCHEMA app_private TO {role}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
        f"GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO {role}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {role}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA app_private GRANT EXECUTE ON FUNCTIONS TO {role}",
    )
    for statement in statements:
        connection.exec_driver_sql(statement)
