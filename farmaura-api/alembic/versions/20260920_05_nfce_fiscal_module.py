"""nfce_fiscal_module

Turns the prototype `fiscal_documents` table (hash-derived number/key, never sent to SEFAZ) into the
real NFC-e lifecycle table, and adds the supporting tables:

- `fiscal_documents`: numbering, access key, SEFAZ outcome, outbox/retry columns, payload snapshot and
  storage references. `access_key` becomes nullable (a DRAFT has no key yet). Existing rows are kept and
  flagged `LEGACY_SIMULATED` so they can never be mistaken for an authorized note.
  The legacy `(document_number, series_code)` unique constraint is dropped: it would collide with real
  numbers. Uniqueness is now `(emitter_cnpj, environment, model, serie, number)` and one document per sale.
- `fiscal_events`, `fiscal_attempts`, `fiscal_number_sequences`, `fiscal_inutilizations`,
  `product_fiscal_profiles`.

Purely additive for data: nothing is deleted. Row-level security for the new tables is applied by
`scripts/bootstrap_database.py` (see `app/core/row_level_security.py`), as for every other table.
"""

import sqlalchemy as sa

from alembic import op

# ============================================================================
# MIGRATION METADATA
# ============================================================================


revision = "20260920_05"
down_revision = "20260920_04"
branch_labels = None
depends_on = None

_STATUSES = (
    "DRAFT", "VALIDATING", "SIGNING", "SENDING", "PROCESSING", "AUTHORIZED", "REJECTED", "DENIED",
    "CANCELED", "CONTINGENCY", "PENDING_RECOVERY", "ERROR", "LEGACY_SIMULATED",
)


def _uuid() -> sa.UUID:
    return sa.UUID(as_uuid=False)


# ============================================================================
# UPGRADE
# ============================================================================


def upgrade() -> None:
    # --- fiscal_documents: new columns (server defaults only to fill existing rows) ----------
    text_defaults = {
        "model": ("65", sa.String(length=2)),
        "numeric_code": ("", sa.String(length=8)),
        "status": ("DRAFT", sa.String(length=24)),
        "status_message": ("", sa.String(length=500)),
        "protocol": ("", sa.String(length=20)),
        "qr_code_url": ("", sa.Text()),
        "correlation_id": ("", sa.String(length=64)),
        "error_category": ("", sa.String(length=32)),
        "xml_signed_key": ("", sa.String(length=255)),
        "xml_authorized_key": ("", sa.String(length=255)),
        "pdf_key": ("", sa.String(length=255)),
    }
    for name, (default, kind) in text_defaults.items():
        op.add_column("fiscal_documents", sa.Column(name, kind, nullable=False, server_default=default))
    op.add_column("fiscal_documents", sa.Column("contingency", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("fiscal_documents", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("fiscal_documents", sa.Column("error_details", sa.JSON(), nullable=False, server_default="[]"))
    for name, kind in (
        ("environment", sa.String(length=12)),
        ("emitter_cnpj", sa.String(length=14)),
        ("serie", sa.Integer()),
        ("number", sa.Integer()),
        ("cstat", sa.Integer()),
        ("payload_snapshot", sa.JSON()),
        ("issue_datetime", sa.DateTime(timezone=True)),
        ("authorization_datetime", sa.DateTime(timezone=True)),
        ("canceled_at", sa.DateTime(timezone=True)),
        ("next_attempt_at", sa.DateTime(timezone=True)),
        ("locked_until", sa.DateTime(timezone=True)),
        ("last_synced_at", sa.DateTime(timezone=True)),
    ):
        op.add_column("fiscal_documents", sa.Column(name, kind, nullable=True))

    # Existing rows are the prototype's simulated documents: keep them, never present them as authorized.
    op.execute("UPDATE fiscal_documents SET status = 'LEGACY_SIMULATED'")
    for name in text_defaults:
        op.alter_column("fiscal_documents", name, server_default=None)
    op.alter_column("fiscal_documents", "contingency", server_default=None)
    op.alter_column("fiscal_documents", "attempt_count", server_default=None)
    op.alter_column("fiscal_documents", "error_details", server_default=None)

    op.alter_column("fiscal_documents", "access_key", existing_type=sa.String(length=44), nullable=True)

    op.drop_constraint("uq_fiscal_documents_number_series", "fiscal_documents", type_="unique")
    op.drop_index("ix_fiscal_documents_pdv_sale_id", table_name="fiscal_documents")
    op.create_index(
        "uq_fiscal_documents_pdv_sale", "fiscal_documents", ["pdv_sale_id"], unique=True,
        postgresql_where=sa.text("pdv_sale_id IS NOT NULL"),
    )
    op.create_index(
        "uq_fiscal_documents_emitter_number", "fiscal_documents",
        ["emitter_cnpj", "environment", "model", "serie", "number"], unique=True,
        postgresql_where=sa.text("number IS NOT NULL"),
    )
    op.create_index("ix_fiscal_documents_status", "fiscal_documents", ["status"])
    op.create_index("ix_fiscal_documents_worker", "fiscal_documents", ["status", "next_attempt_at"])
    op.create_check_constraint(
        "fiscal_documents_status_valid", "fiscal_documents",
        "status IN (" + ", ".join(f"'{s}'" for s in _STATUSES) + ")",
    )
    op.create_check_constraint("fiscal_documents_attempts_non_negative", "fiscal_documents", "attempt_count >= 0")

    # --- new tables ---------------------------------------------------------------------------
    op.create_table(
        "fiscal_number_sequences",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("emitter_cnpj", sa.String(length=14), nullable=False),
        sa.Column("environment", sa.String(length=12), nullable=False),
        sa.Column("model", sa.String(length=2), nullable=False),
        sa.Column("serie", sa.Integer(), nullable=False),
        sa.Column("next_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("next_number >= 1", name=op.f("ck_fiscal_number_sequences_fiscal_number_sequences_next_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fiscal_number_sequences")),
        sa.UniqueConstraint("emitter_cnpj", "environment", "model", "serie", name="uq_fiscal_number_sequences_key"),
    )
    op.create_index(op.f("ix_fiscal_number_sequences_tenant_id"), "fiscal_number_sequences", ["tenant_id"])

    op.create_table(
        "fiscal_events",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("fiscal_document_id", _uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=24), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("protocol", sa.String(length=20), nullable=False),
        sa.Column("cstat", sa.Integer(), nullable=True),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("justification", sa.String(length=255), nullable=False),
        sa.Column("created_by_user_id", _uuid(), nullable=True),
        sa.Column("xml", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fiscal_document_id"], ["fiscal_documents.id"], name=op.f("fk_fiscal_events_fiscal_document_id_fiscal_documents"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], name=op.f("fk_fiscal_events_created_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fiscal_events")),
        sa.UniqueConstraint("fiscal_document_id", "event_type", "sequence", name="uq_fiscal_events_document_type_sequence"),
    )
    op.create_index(op.f("ix_fiscal_events_tenant_id"), "fiscal_events", ["tenant_id"])
    op.create_index(op.f("ix_fiscal_events_fiscal_document_id"), "fiscal_events", ["fiscal_document_id"])

    op.create_table(
        "fiscal_attempts",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("fiscal_document_id", _uuid(), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("cstat", sa.Integer(), nullable=True),
        sa.Column("xmotivo", sa.String(length=500), nullable=False),
        sa.Column("error_category", sa.String(length=32), nullable=False),
        sa.Column("correlation_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["fiscal_document_id"], ["fiscal_documents.id"], name=op.f("fk_fiscal_attempts_fiscal_document_id_fiscal_documents"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fiscal_attempts")),
    )
    op.create_index(op.f("ix_fiscal_attempts_tenant_id"), "fiscal_attempts", ["tenant_id"])
    op.create_index(op.f("ix_fiscal_attempts_fiscal_document_id"), "fiscal_attempts", ["fiscal_document_id"])

    op.create_table(
        "fiscal_inutilizations",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("environment", sa.String(length=12), nullable=False),
        sa.Column("emitter_cnpj", sa.String(length=14), nullable=False),
        sa.Column("serie", sa.Integer(), nullable=False),
        sa.Column("number_start", sa.Integer(), nullable=False),
        sa.Column("number_end", sa.Integer(), nullable=False),
        sa.Column("justification", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("cstat", sa.Integer(), nullable=True),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("protocol", sa.String(length=20), nullable=False),
        sa.Column("requested_by_user_id", _uuid(), nullable=True),
        sa.Column("xml", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("number_end >= number_start", name=op.f("ck_fiscal_inutilizations_fiscal_inutilizations_range_valid")),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], name=op.f("fk_fiscal_inutilizations_requested_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fiscal_inutilizations")),
    )
    op.create_index(op.f("ix_fiscal_inutilizations_tenant_id"), "fiscal_inutilizations", ["tenant_id"])

    op.create_table(
        "product_fiscal_profiles",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", _uuid(), nullable=False),
        sa.Column("ncm", sa.String(length=8), nullable=False),
        sa.Column("cest", sa.String(length=7), nullable=False),
        sa.Column("cfop", sa.String(length=4), nullable=False),
        sa.Column("origin", sa.String(length=1), nullable=False),
        sa.Column("commercial_unit", sa.String(length=6), nullable=False),
        sa.Column("icms_cst", sa.String(length=2), nullable=False),
        sa.Column("icms_csosn", sa.String(length=3), nullable=False),
        sa.Column("icms_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("pis_cst", sa.String(length=2), nullable=False),
        sa.Column("pis_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("cofins_cst", sa.String(length=2), nullable=False),
        sa.Column("cofins_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("cbenef", sa.String(length=10), nullable=False),
        sa.Column("ibscbs_cst", sa.String(length=3), nullable=False),
        sa.Column("ibscbs_cclasstrib", sa.String(length=6), nullable=False),
        sa.Column("ibscbs_has_tax_group", sa.Boolean(), nullable=False),
        sa.Column("ibs_uf_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("ibs_mun_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("cbs_rate", sa.Numeric(precision=7, scale=4), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=False),
        sa.Column("updated_by_user_id", _uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], name=op.f("fk_product_fiscal_profiles_product_id_inventory_products"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], name=op.f("fk_product_fiscal_profiles_updated_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_fiscal_profiles")),
        sa.UniqueConstraint("product_id", name="uq_product_fiscal_profiles_product"),
    )
    op.create_index(op.f("ix_product_fiscal_profiles_tenant_id"), "product_fiscal_profiles", ["tenant_id"])


# ============================================================================
# DOWNGRADE
# ============================================================================


def downgrade() -> None:
    bind = op.get_bind()
    real_documents = bind.execute(
        sa.text("SELECT count(*) FROM fiscal_documents WHERE status <> 'LEGACY_SIMULATED'")
    ).scalar_one()
    if real_documents:
        raise RuntimeError(
            "Recusado: existem documentos fiscais reais (não simulados). Reverter apagaria XML/protocolos. "
            "Exporte-os e trate manualmente antes de qualquer downgrade."
        )
    for table in ("product_fiscal_profiles", "fiscal_inutilizations", "fiscal_attempts", "fiscal_events", "fiscal_number_sequences"):
        op.drop_table(table)
    op.drop_constraint("fiscal_documents_attempts_non_negative", "fiscal_documents", type_="check")
    op.drop_constraint("fiscal_documents_status_valid", "fiscal_documents", type_="check")
    op.drop_index("ix_fiscal_documents_worker", table_name="fiscal_documents")
    op.drop_index("ix_fiscal_documents_status", table_name="fiscal_documents")
    op.drop_index("uq_fiscal_documents_emitter_number", table_name="fiscal_documents")
    op.drop_index("uq_fiscal_documents_pdv_sale", table_name="fiscal_documents")
    op.create_index("ix_fiscal_documents_pdv_sale_id", "fiscal_documents", ["pdv_sale_id"])
    op.create_unique_constraint("uq_fiscal_documents_number_series", "fiscal_documents", ["document_number", "series_code"])
    op.alter_column("fiscal_documents", "access_key", existing_type=sa.String(length=44), nullable=False)
    for column in (
        "model", "numeric_code", "status", "status_message", "protocol", "qr_code_url", "correlation_id",
        "error_category", "xml_signed_key", "xml_authorized_key", "pdf_key", "contingency", "attempt_count",
        "error_details", "environment", "emitter_cnpj", "serie", "number", "cstat", "payload_snapshot",
        "issue_datetime", "authorization_datetime", "canceled_at", "next_attempt_at", "locked_until", "last_synced_at",
    ):
        op.drop_column("fiscal_documents", column)
