"""order_payment_method_code

Adds orders.payment_method — the raw checkout payment code ("pix",
"credit_card", "debit_card", "pickup_cash", see CheckoutPaymentRequest.method
in app/schemas/orders.py) alongside the already-existing payment_method_label
(humanized display text, e.g. "Cartão de crédito").

Needed so real fiscal issuance for marketplace orders (FiscalService.enqueue_order)
can map to a tpag code (ONLINE_PAYMENT_METHOD_TO_TPAG in app/domain/fiscal.py) the
same reliable way PdvSale.payment_method already does for PDV sales — mapping from
a humanized display label would be fragile and break silently if the label copy
ever changes.

Not backfilled: existing orders keep payment_method="" (unknown code from before
this column existed). They already have no fiscal document (marketplace issuance
was simulated until now), so there is nothing to retroactively fix — the empty
string will simply keep them out of tpag mapping if they were ever reprocessed.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260922_01"
down_revision = "20260921_01"
branch_labels = None
depends_on = None


# ============================================================================
# UPGRADE / DOWNGRADE
# ============================================================================


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("payment_method", sa.String(length=24), nullable=False, server_default=""),
    )
    op.alter_column("orders", "payment_method", server_default=None)


def downgrade() -> None:
    op.drop_column("orders", "payment_method")
