"""
farmaura-api/app/repositories/fiscal_repository.py

Fiscal persistence access for Farmaura.

Responsibilities:
- load, list and store fiscal documents, events, attempts and inutilizations;
- allocate NFC-e numbers atomically, with no `MAX(number)+1` anywhere;
- lease documents to the emission worker so two workers never process the same one;

Observations:
- number allocation is one `UPDATE ... SET next_number = next_number + 1 ... RETURNING` on the sequence row:
  concurrent callers serialize on that row lock (PostgreSQL) and each gets a distinct value; if the caller's
  transaction rolls back, the increment rolls back with it, so a failed emission leaves no gap;
- the worker lease is also one conditional `UPDATE ... RETURNING`, safe across processes and replicas;
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.fiscal import WORKABLE_STATUSES, FiscalDocumentStatus
from app.models.fiscal_document import FiscalDocument
from app.models.fiscal_support_tables import (
    FiscalAttempt,
    FiscalEvent,
    FiscalInutilization,
    FiscalNumberSequence,
    ProductFiscalProfile,
)

# ============================================================================
# REPOSITORY
# ============================================================================


class FiscalRepository:
    """Encapsulate database access for the fiscal domain."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- documents ------------------------------------------------------------------------

    async def get(self, document_id: str) -> FiscalDocument | None:
        return await self.session.get(FiscalDocument, document_id)

    async def get_by_pdv_sale_id(self, sale_id: str) -> FiscalDocument | None:
        statement = select(FiscalDocument).where(FiscalDocument.pdv_sale_id == sale_id).limit(1)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def get_by_order_id(self, order_id: str) -> FiscalDocument | None:
        statement = select(FiscalDocument).where(FiscalDocument.order_id == order_id).limit(1)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def get_by_access_key(self, access_key: str) -> FiscalDocument | None:
        statement = select(FiscalDocument).where(FiscalDocument.access_key == access_key).limit(1)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def add(self, document: FiscalDocument) -> FiscalDocument:
        self.session.add(document)
        await self.session.flush()
        return document

    def _filtered(
        self, *, status: str | None, number: int | None, serie: int | None, access_key: str | None,
        sale_id: str | None, document_cpf: str | None, date_from: datetime | None, date_to: datetime | None,
        store_id: str | None,
    ) -> Select[Any]:
        statement = select(FiscalDocument).where(FiscalDocument.status != FiscalDocumentStatus.LEGACY_SIMULATED.value)
        if status:
            statement = statement.where(FiscalDocument.status == status)
        if store_id:
            statement = statement.where(FiscalDocument.store_id == store_id)
        if number is not None:
            statement = statement.where(FiscalDocument.number == number)
        if serie is not None:
            statement = statement.where(FiscalDocument.serie == serie)
        if access_key:
            statement = statement.where(FiscalDocument.access_key == access_key)
        if sale_id:
            statement = statement.where(FiscalDocument.pdv_sale_id == sale_id)
        if document_cpf:
            statement = statement.where(FiscalDocument.recipient_document_snapshot == document_cpf)
        if date_from is not None:
            statement = statement.where(FiscalDocument.created_at >= date_from)
        if date_to is not None:
            statement = statement.where(FiscalDocument.created_at <= date_to)
        return statement

    async def list_documents(
        self, *, limit: int, offset: int, status: str | None = None, number: int | None = None,
        serie: int | None = None, access_key: str | None = None, sale_id: str | None = None,
        document_cpf: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None,
        store_id: str | None = None,
    ) -> tuple[list[FiscalDocument], int]:
        base = self._filtered(
            status=status, number=number, serie=serie, access_key=access_key, sale_id=sale_id,
            document_cpf=document_cpf, date_from=date_from, date_to=date_to, store_id=store_id,
        )
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (
            await self.session.execute(base.order_by(FiscalDocument.created_at.desc()).limit(limit).offset(offset))
        ).scalars().all()
        return list(rows), int(total)

    async def count_by_status(self) -> dict[str, int]:
        statement = (
            select(FiscalDocument.status, func.count())
            .where(FiscalDocument.status != FiscalDocumentStatus.LEGACY_SIMULATED.value)
            .group_by(FiscalDocument.status)
        )
        return {status: int(count) for status, count in (await self.session.execute(statement)).all()}

    async def list_reconcilable(self, *, limit: int) -> list[FiscalDocument]:
        """Documents whose local state may disagree with SEFAZ and carry an access key to ask about."""

        statuses = (
            FiscalDocumentStatus.SENDING.value, FiscalDocumentStatus.PROCESSING.value,
            FiscalDocumentStatus.PENDING_RECOVERY.value, FiscalDocumentStatus.ERROR.value,
        )
        statement = (
            select(FiscalDocument)
            .where(FiscalDocument.status.in_(statuses), FiscalDocument.access_key.is_not(None))
            .order_by(FiscalDocument.created_at)
            .limit(limit)
        )
        return list((await self.session.execute(statement)).scalars().all())

    # --- worker lease ----------------------------------------------------------------------

    async def list_workable_ids(self, *, now: datetime, limit: int) -> list[str]:
        statuses = [status.value for status in WORKABLE_STATUSES]
        statement = (
            select(FiscalDocument.id)
            .where(
                FiscalDocument.status.in_(statuses),
                or_(FiscalDocument.next_attempt_at.is_(None), FiscalDocument.next_attempt_at <= now),
                or_(FiscalDocument.locked_until.is_(None), FiscalDocument.locked_until < now),
            )
            .order_by(FiscalDocument.created_at)
            .limit(limit)
        )
        return [str(value) for value in (await self.session.execute(statement)).scalars().all()]

    async def try_lease(self, document_id: str, *, now: datetime, lease_until: datetime) -> bool:
        """Atomically take the processing lease; False when another worker already holds it."""

        statuses = [status.value for status in WORKABLE_STATUSES]
        statement = (
            update(FiscalDocument)
            .where(
                FiscalDocument.id == document_id,
                FiscalDocument.status.in_(statuses),
                or_(FiscalDocument.locked_until.is_(None), FiscalDocument.locked_until < now),
            )
            .values(locked_until=lease_until)
            .returning(FiscalDocument.id)
        )
        return (await self.session.execute(statement)).first() is not None

    # --- numbering -------------------------------------------------------------------------

    async def allocate_number(
        self, *, tenant_id: str, emitter_cnpj: str, environment: str, model: str, serie: int, now: datetime,
    ) -> int:
        """Return the next unused number for the key, incrementing the counter atomically."""

        insert = postgresql.insert if self.session.bind is not None and self.session.bind.dialect.name == "postgresql" else sqlite.insert
        await self.session.execute(
            insert(FiscalNumberSequence)
            .values(
                id=str(uuid4()), tenant_id=tenant_id, emitter_cnpj=emitter_cnpj, environment=environment,
                model=model, serie=serie, next_number=1, created_at=now, updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["emitter_cnpj", "environment", "model", "serie"])
        )
        statement = (
            update(FiscalNumberSequence)
            .where(
                FiscalNumberSequence.emitter_cnpj == emitter_cnpj,
                FiscalNumberSequence.environment == environment,
                FiscalNumberSequence.model == model,
                FiscalNumberSequence.serie == serie,
            )
            .values(next_number=FiscalNumberSequence.next_number + 1, updated_at=now)
            .returning(FiscalNumberSequence.next_number)
        )
        return int((await self.session.execute(statement)).scalar_one()) - 1

    async def peek_next_number(self, *, emitter_cnpj: str, environment: str, model: str, serie: int) -> int:
        statement = select(FiscalNumberSequence.next_number).where(
            FiscalNumberSequence.emitter_cnpj == emitter_cnpj,
            FiscalNumberSequence.environment == environment,
            FiscalNumberSequence.model == model,
            FiscalNumberSequence.serie == serie,
        )
        return int((await self.session.execute(statement)).scalar_one_or_none() or 1)

    async def documents_in_number_range(
        self, *, emitter_cnpj: str, environment: str, serie: int, first: int, last: int,
    ) -> list[FiscalDocument]:
        statement = select(FiscalDocument).where(
            FiscalDocument.emitter_cnpj == emitter_cnpj,
            FiscalDocument.environment == environment,
            FiscalDocument.model == "65",
            FiscalDocument.serie == serie,
            FiscalDocument.number >= first,
            FiscalDocument.number <= last,
        )
        return list((await self.session.execute(statement)).scalars().all())

    # --- events / attempts / inutilizations ---------------------------------------------------

    async def add_event(self, event: FiscalEvent) -> FiscalEvent:
        self.session.add(event)
        await self.session.flush()
        return event

    async def next_event_sequence(self, *, document_id: str, event_type: str) -> int:
        statement = select(func.coalesce(func.max(FiscalEvent.sequence), 0)).where(
            FiscalEvent.fiscal_document_id == document_id, FiscalEvent.event_type == event_type
        )
        return int((await self.session.execute(statement)).scalar_one()) + 1

    async def list_events(self, document_id: str) -> list[FiscalEvent]:
        statement = select(FiscalEvent).where(FiscalEvent.fiscal_document_id == document_id).order_by(FiscalEvent.created_at)
        return list((await self.session.execute(statement)).scalars().all())

    async def add_attempt(self, attempt: FiscalAttempt) -> FiscalAttempt:
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def list_attempts(self, document_id: str, *, limit: int = 50) -> list[FiscalAttempt]:
        statement = (
            select(FiscalAttempt).where(FiscalAttempt.fiscal_document_id == document_id)
            .order_by(FiscalAttempt.requested_at.desc()).limit(limit)
        )
        return list((await self.session.execute(statement)).scalars().all())

    async def add_inutilization(self, record: FiscalInutilization) -> FiscalInutilization:
        self.session.add(record)
        await self.session.flush()
        return record

    async def list_inutilizations(self, *, limit: int = 50) -> list[FiscalInutilization]:
        statement = select(FiscalInutilization).order_by(FiscalInutilization.created_at.desc()).limit(limit)
        return list((await self.session.execute(statement)).scalars().all())

    # --- product fiscal profiles --------------------------------------------------------------

    async def profiles_by_product(self, product_ids: list[str]) -> dict[str, ProductFiscalProfile]:
        if not product_ids:
            return {}
        statement = select(ProductFiscalProfile).where(ProductFiscalProfile.product_id.in_(product_ids))
        return {str(row.product_id): row for row in (await self.session.execute(statement)).scalars().all()}

    async def get_profile(self, product_id: str) -> ProductFiscalProfile | None:
        statement = select(ProductFiscalProfile).where(ProductFiscalProfile.product_id == product_id).limit(1)
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def add_profile(self, profile: ProductFiscalProfile) -> ProductFiscalProfile:
        self.session.add(profile)
        await self.session.flush()
        return profile
