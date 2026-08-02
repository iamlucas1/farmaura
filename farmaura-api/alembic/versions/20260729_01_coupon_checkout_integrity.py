"""coupon_checkout_integrity

Give the checkout flow enough backend-owned data to validate coupons instead of
trusting client-computed discounts:
- orders.coupon_code snapshots which coupon (if any) was actually applied, so
  per-customer usage limits can be counted from real order history;
- coupon_campaigns.starts_at/ends_at become real timezone-aware datetimes
  (replacing the free-text starts_at_label/ends_at_label), mirroring
  pricing_promotions, so the backend can enforce the campaign window instead of
  only displaying it;
- two check constraints (percent discount capped at 100, valid schedule window)
  mirror the ones pricing_promotions already has.
"""

from datetime import datetime

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260729_01"
down_revision = "20260727_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("coupon_code", sa.String(length=24), server_default="", nullable=False),
    )

    op.add_column("coupon_campaigns", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("coupon_campaigns", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, starts_at_label, ends_at_label FROM coupon_campaigns")).fetchall()
    for row in rows:
        starts_at = _parse_label(row.starts_at_label)
        ends_at = _parse_label(row.ends_at_label)
        if starts_at is None and ends_at is None:
            continue
        bind.execute(
            sa.text("UPDATE coupon_campaigns SET starts_at = :starts_at, ends_at = :ends_at WHERE id = :id"),
            {"starts_at": starts_at, "ends_at": ends_at, "id": row.id},
        )

    op.drop_column("coupon_campaigns", "starts_at_label")
    op.drop_column("coupon_campaigns", "ends_at_label")

    op.create_check_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_percent_discount_max_100"),
        "coupon_campaigns",
        "discount_type <> 'percent' OR discount_value <= 100",
    )
    op.create_check_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_schedule_window_valid"),
        "coupon_campaigns",
        "starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_schedule_window_valid"), "coupon_campaigns", type_="check"
    )
    op.drop_constraint(
        op.f("ck_coupon_campaigns_coupon_campaigns_percent_discount_max_100"), "coupon_campaigns", type_="check"
    )

    op.add_column(
        "coupon_campaigns", sa.Column("starts_at_label", sa.String(length=32), server_default="", nullable=False)
    )
    op.add_column(
        "coupon_campaigns", sa.Column("ends_at_label", sa.String(length=32), server_default="", nullable=False)
    )

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, starts_at, ends_at FROM coupon_campaigns")).fetchall()
    for row in rows:
        bind.execute(
            sa.text("UPDATE coupon_campaigns SET starts_at_label = :starts_at, ends_at_label = :ends_at WHERE id = :id"),
            {
                "starts_at": row.starts_at.isoformat() if row.starts_at else "",
                "ends_at": row.ends_at.isoformat() if row.ends_at else "",
                "id": row.id,
            },
        )

    op.drop_column("coupon_campaigns", "ends_at")
    op.drop_column("coupon_campaigns", "starts_at")

    op.drop_column("orders", "coupon_code")


def _parse_label(value: str | None) -> datetime | None:
    """Return one timezone-aware datetime parsed from a legacy label string, if any."""

    raw = (value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.astimezone()
