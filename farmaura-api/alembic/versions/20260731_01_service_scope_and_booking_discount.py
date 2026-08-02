"""service_scope_and_booking_discount

Add pricing_promotions.target_services and coupon_campaigns.target_services_json
so both discount mechanisms gain a "services" scope axis, deliberately isolated
from "all"/"categories"/"products" — an existing catalog-wide campaign never
silently starts discounting health-service bookings.

Also add health_service_appointments.original_price_amount (pre-discount price
snapshot) and .coupon_code (redeemed code, if any) so a booking's discount is
auditable the same way Order/PdvSale already track theirs.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260731_01"
down_revision = "20260730_05"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "pricing_promotions",
        sa.Column("target_services", sa.JSON(), server_default="[]", nullable=False),
    )
    op.add_column(
        "coupon_campaigns",
        sa.Column("target_services_json", sa.Text(), server_default="[]", nullable=False),
    )
    op.add_column(
        "health_service_appointments",
        sa.Column("original_price_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column(
        "health_service_appointments",
        sa.Column("coupon_code", sa.String(length=24), server_default="", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("health_service_appointments", "coupon_code")
    op.drop_column("health_service_appointments", "original_price_amount")
    op.drop_column("coupon_campaigns", "target_services_json")
    op.drop_column("pricing_promotions", "target_services")
