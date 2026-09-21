"""users_google_link

Adds users.google_sub (the stable Google account id a user has linked, unique,
nullable — most accounts stay password-only) and users.has_password (false
only for accounts created purely via Google Sign-In, which get a random
unusable password hash to keep password_hash NOT NULL). Existing rows
backfill has_password=true, which is exactly what they already have.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260921_01"
down_revision = "20260920_05"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(length=255), nullable=True),
    )
    op.create_index(op.f("ix_users_google_sub"), "users", ["google_sub"], unique=True)
    op.add_column(
        "users",
        sa.Column("has_password", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("users", "has_password", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "has_password")
    op.drop_index(op.f("ix_users_google_sub"), table_name="users")
    op.drop_column("users", "google_sub")
