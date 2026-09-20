"""user_ui_theme

Adds users.ui_theme — the internal console color theme each staff member picked
('auto' follows the operating system, 'light' and 'dark' force one). Stored on
the account, not in the browser, so the choice follows the person across
devices and browsers. Existing rows backfill to 'auto', which is exactly what
they render today.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260920_01"
down_revision = "20260919_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ui_theme", sa.String(length=16), nullable=False, server_default="auto"),
    )
    op.alter_column("users", "ui_theme", server_default=None)
    op.create_check_constraint(
        op.f("ck_users_users_ui_theme_allowed"),
        "users",
        "ui_theme IN ('auto', 'light', 'dark')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_users_ui_theme_allowed"), "users", type_="check")
    op.drop_column("users", "ui_theme")
