"""pricing_promotion_targeting

Add pricing_promotions.target_loyalty_tiers (selo de fidelidade como eixo de
segmentação), guest_visible (promoção visível para visitante deslogado, só
permitido sem nenhum filtro de audiência), and highlight_style (modo
"superpromoção" mais chamativo no marketplace vs exibição padrão).
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260730_03"
down_revision = "20260730_02"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pricing_promotions",
        sa.Column("target_loyalty_tiers", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column(
        "pricing_promotions",
        sa.Column("guest_visible", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "pricing_promotions",
        sa.Column("highlight_style", sa.String(length=16), server_default="standard", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_pricing_promotions_pricing_promotions_highlight_style_valid"),
        "pricing_promotions",
        "highlight_style IN ('standard', 'superpromo')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_pricing_promotions_pricing_promotions_highlight_style_valid"), "pricing_promotions", type_="check"
    )
    op.drop_column("pricing_promotions", "highlight_style")
    op.drop_column("pricing_promotions", "guest_visible")
    op.drop_column("pricing_promotions", "target_loyalty_tiers")
