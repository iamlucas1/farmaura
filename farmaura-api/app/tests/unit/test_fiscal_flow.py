"""
farmaura-api/app/tests/unit/test_fiscal_flow.py

NFC-e service flow tests for Farmaura (real ORM on SQLite, SEFAZ replaced by a scripted fake).

Responsibilities:
- prove a queued sale becomes an authorized note with stored XML, protocol and DANFE;
- prove one sale can never produce two notes, and concurrent workers never share a number;
- prove a timeout is never a rejection: the note is consulted, and only re-sent when SEFAZ never saw it;
- prove rejections keep their number, denied/canceled notes never come back, and cancellation/inutilization rules;
- prove the production guard, the PDV snapshot rules (missing tax data, discount, cashback, delivery fee) and that
  no log line ever contains the certificate password;

Observations:
- SQLite serializes writes, so the concurrency test proves the single-statement allocation logic; the PostgreSQL
  row-lock behaviour of the same statement is standard READ COMMITTED semantics, still to be exercised in Docker;
- the fake gateway records every call, so "sent once" and "sent the same XML" are asserted directly;
"""

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 - registers every mapped table
from app.core.fiscal_config import FiscalConfigurationError, FiscalSettings
from app.domain.fiscal import (
    FiscalDataError,
    FiscalDocumentStatus,
    FiscalError,
    FiscalTransientError,
    can_transition,
)
from app.fiscal import sefaz_messages as msg
from app.fiscal.inputs import PaymentData
from app.fiscal.snapshot import FiscalSnapshot, snapshot_to_dict
from app.models.base import Base
from app.models.brand import Brand
from app.models.category import Category
from app.models.fiscal_document import FiscalDocument
from app.models.fiscal_support_tables import (
    FiscalAttempt,
    FiscalEvent,
    FiscalInutilization,
    FiscalNumberSequence,
    ProductFiscalProfile,
)
from app.models.inventory_item import InventoryItem
from app.models.inventory_product import InventoryProduct
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.store import Store
from app.models.therapeutic_class import TherapeuticClass
from app.repositories.fiscal_repository import FiscalRepository
from app.services.fiscal_service import FiscalService
from app.tests.fiscal_support import TEST_CNPJ, make_certificate, make_item

CERT = make_certificate()
TENANT = str(uuid4())
NS = "http://www.portalfiscal.inf.br/nfe"
TABLES = [
    FiscalDocument.__table__, FiscalNumberSequence.__table__, FiscalEvent.__table__, FiscalAttempt.__table__,
    FiscalInutilization.__table__, ProductFiscalProfile.__table__, PdvSale.__table__, PdvSaleItem.__table__,
    Order.__table__, OrderItem.__table__,
    Store.__table__, InventoryItem.__table__, InventoryProduct.__table__, Brand.__table__, Category.__table__,
    TherapeuticClass.__table__,
]


# ============================================================================
# FAKES
# ============================================================================


class Clock:
    """Adjustable UTC clock."""

    def __init__(self) -> None:
        self.now = datetime(2026, 9, 20, 17, 30, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: int) -> None:
        self.now += timedelta(**kwargs)


class Storage:
    """In-memory private storage."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    async def write(self, key: str, content: bytes) -> None:
        self.files[key] = content

    async def read(self, key: str) -> bytes:
        return self.files[key]


def protocol_xml(key: str, cstat: int = 100, reason: str = "Autorizado o uso da NF-e", number: str = "153260000000123") -> str:
    return (
        f'<protNFe xmlns="{NS}" versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SVRS</verAplic><chNFe>{key}</chNFe>'
        f"<dhRecbto>2026-09-20T14:30:05-03:00</dhRecbto><nProt>{number}</nProt><digVal>abc=</digVal>"
        f"<cStat>{cstat}</cStat><xMotivo>{reason}</xMotivo></infProt></protNFe>"
    )


def protocol(key: str, cstat: int = 100, reason: str = "Autorizado o uso da NF-e") -> msg.Protocol:
    return msg.Protocol(
        cstat=cstat, reason=reason, number="153260000000123", access_key=key,
        received_at="2026-09-20T14:30:05-03:00", digest="abc=", raw_xml=protocol_xml(key, cstat, reason),
    )


def key_of(xml: str) -> str:
    return re.search(r'Id="NFe(\d{44})"', xml).group(1)


class FakeGateway:
    """Scripted SEFAZ: each queue is consumed in order; an empty queue means 'authorize'."""

    def __init__(self) -> None:
        self.authorize_script: list = []
        self.consult_script: list = []
        self.event_script: list = []
        self.inut_script: list = []
        self.calls: list[tuple[str, str]] = []
        self.delay = 0.0

    async def authorize(self, *, batch_id: str, signed_nfe_xml: str) -> msg.AuthorizationResult:
        self.calls.append(("authorize", signed_nfe_xml))
        if self.delay:
            await asyncio.sleep(self.delay)
        step = self.authorize_script.pop(0) if self.authorize_script else ("authorized",)
        return self._resolve(step, key_of(signed_nfe_xml))

    def _resolve(self, step, key: str) -> msg.AuthorizationResult:
        kind = step[0]
        if kind == "timeout":
            raise FiscalTransientError("A SEFAZ não respondeu a tempo.")
        if kind == "authorized":
            return msg.AuthorizationResult(104, "Lote processado", protocol(key))
        if kind == "denied":
            return msg.AuthorizationResult(104, "Lote processado", protocol(key, 302, "Uso Denegado"))
        if kind == "rejected":
            return msg.AuthorizationResult(104, "Lote processado", protocol(key, step[1], step[2]))
        if kind == "duplicate":
            return msg.AuthorizationResult(104, "Lote processado", protocol(key, 204, "Rejeicao: Duplicidade de NF-e"))
        raise AssertionError(kind)

    async def consult(self, *, access_key: str) -> msg.ConsultResult:
        self.calls.append(("consult", access_key))
        step = self.consult_script.pop(0) if self.consult_script else ("authorized",)
        kind = step[0]
        if kind == "timeout":
            raise FiscalTransientError("timeout")
        if kind == "authorized":
            return msg.ConsultResult(100, "Autorizado o uso da NF-e", protocol(access_key))
        if kind == "not_found":
            return msg.ConsultResult(217, "Rejeicao: NF-e nao consta na base de dados da SEFAZ", None)
        if kind == "canceled":
            return msg.ConsultResult(101, "Cancelamento de NF-e homologado", protocol(access_key), "153260000000999")
        if kind == "processing":
            return msg.ConsultResult(105, "Lote em processamento", None)
        raise AssertionError(kind)

    async def service_status(self) -> msg.StatusResult:
        return msg.StatusResult(107, "Servico em Operacao")

    async def register_event(self, *, event_envelope_xml: str) -> msg.EventResult:
        self.calls.append(("event", event_envelope_xml))
        step = self.event_script.pop(0) if self.event_script else ("accepted",)
        if step[0] == "timeout":
            raise FiscalTransientError("timeout")
        if step[0] == "accepted":
            return msg.EventResult(128, 135, "Evento registrado e vinculado a NF-e", "153260000000999")
        return msg.EventResult(128, step[1], step[2], "")

    async def inutilize(self, *, inutilization_xml: str) -> msg.InutilizationResult:
        self.calls.append(("inut", inutilization_xml))
        step = self.inut_script.pop(0) if self.inut_script else ("accepted",)
        if step[0] == "timeout":
            raise FiscalTransientError("timeout")
        return msg.InutilizationResult(102, "Inutilizacao de numero homologado", "153260000000555")

    def sent(self, kind: str) -> list[str]:
        return [payload for name, payload in self.calls if name == kind]


def fiscal_settings(**overrides: object) -> FiscalSettings:
    values: dict[str, object] = {
        "nfce_enabled": True, "fiscal_env": "homologacao", "nfce_cnpj": TEST_CNPJ, "nfce_ie": "0712345600123",
        "nfce_razao_social": "FARMAURA COMERCIO DE MEDICAMENTOS LTDA", "nfce_crt": "1",
        "nfce_logradouro": "SCS QUADRA 6", "nfce_numero": "100", "nfce_bairro": "ASA SUL", "nfce_cep": "70306915",
        "nfce_municipio": "BRASILIA", "nfce_codigo_ibge_municipio": "5300108", "nfce_serie": "1",
        "nfce_certificate_path": "certificado-de-teste.pfx",
        "nfce_certificate_password": SecretStr("senha-super-secreta-do-certificado"),
        "nfce_csc_homologacao": SecretStr("CSC-QUE-NUNCA-PODE-VAZAR"),
    }
    values.update(overrides)
    return FiscalSettings(_env_file=None, **values)  # type: ignore[arg-type]


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
async def factory(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'fiscal.db'}", connect_args={"timeout": 30},
    )
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: Base.metadata.create_all(sync, tables=TABLES))
    yield async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    await engine.dispose()


def make_service(session: AsyncSession, gateway: FakeGateway, storage: Storage, clock: Clock, **settings: object) -> FiscalService:
    return FiscalService(
        session, fiscal_settings=fiscal_settings(**settings), gateway=gateway, storage=storage,
        certificate=CERT, clock=clock,
    )


def snapshot(*, total: str = "25.00", crt: str = "1", ean: str = "7891000100103") -> FiscalSnapshot:
    item = make_item("SKU-1", "DIPIRONA 500MG 10 COMPRIMIDOS", "2", "12.50", crt=crt, ean=ean)
    return FiscalSnapshot(
        items=[item], payments=[PaymentData(tpag="17", amount=Decimal(total))], change_amount=Decimal("0.00"),
        recipient=None, additional_info="Venda PDV TESTE",
    )


async def queued(session: AsyncSession, *, sale_id: str | None = None, snap: FiscalSnapshot | None = None) -> FiscalDocument:
    document = FiscalDocument(
        id=str(uuid4()), tenant_id=TENANT, store_id=str(uuid4()), document_type="nfce", source_channel="pdv",
        pdv_sale_id=sale_id or str(uuid4()), status=FiscalDocumentStatus.DRAFT.value, model="65",
        environment="homologacao", gross_total_amount=Decimal("25.00"), error_details=[],
        payload_snapshot=snapshot_to_dict(snap or snapshot()), payment_method_snapshot="pix",
    )
    session.add(document)
    await session.commit()
    return document


# ============================================================================
# HAPPY PATH
# ============================================================================


@pytest.mark.anyio
async def test_queued_sale_becomes_authorized_note_with_files(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        outcome = await service.process_document(document.id)
        await session.refresh(document)
    assert outcome is not None and document.status == "AUTHORIZED"
    assert document.number == 1 and document.serie == 1 and document.protocol == "153260000000123"
    assert document.cstat == 100 and len(document.access_key) == 44 and document.emitter_cnpj == TEST_CNPJ
    assert document.authorization_datetime is not None and document.error_category == ""
    assert document.document_number == "1" and document.series_code == "001" and document.authorized is True
    kinds = sorted(name.rsplit("/", 1)[-1] for name in storage.files)
    assert kinds == ["authorized.xml", "danfe.pdf", "signed.xml"]
    assert all(f"/{TENANT}/" in name and f"/{document.access_key}/" in name for name in storage.files)
    assert storage.files[document.xml_authorized_key].startswith(b"<nfeProc")
    assert storage.files[document.pdf_key].startswith(b"%PDF")
    assert len(gateway.sent("authorize")) == 1


@pytest.mark.anyio
async def test_attempts_are_audited_without_secrets(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await queued(session)
        await service.process_document(document.id)
        attempts = (await session.execute(select(FiscalAttempt))).scalars().all()
    assert len(attempts) == 1 and attempts[0].action == "AUTHORIZE" and attempts[0].cstat == 100
    assert attempts[0].correlation_id and attempts[0].duration_ms is not None


@pytest.mark.anyio
async def test_logs_never_contain_secrets(factory, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    gateway = FakeGateway()
    gateway.authorize_script = [("timeout",)]
    async with factory() as session:
        service = make_service(session, gateway, Storage(), Clock())
        document = await queued(session)
        await service.process_document(document.id)
        await service.module_status()
    text = caplog.text
    assert "senha-super-secreta-do-certificado" not in text and "CSC-QUE-NUNCA-PODE-VAZAR" not in text
    assert "PRIVATE KEY" not in text
    assert "senha-super-secreta-do-certificado" not in repr(fiscal_settings())


# ============================================================================
# IDEMPOTENCY + NUMBERING
# ============================================================================


@pytest.mark.anyio
async def test_one_sale_can_never_have_two_documents(factory) -> None:
    from sqlalchemy.exc import IntegrityError

    sale_id = str(uuid4())
    async with factory() as session:
        await queued(session, sale_id=sale_id)
        with pytest.raises(IntegrityError):
            await queued(session, sale_id=sale_id)


@pytest.mark.anyio
async def test_processing_an_authorized_document_again_does_not_resend(factory) -> None:
    gateway = FakeGateway()
    async with factory() as session:
        service = make_service(session, gateway, Storage(), Clock())
        document = await queued(session)
        await service.process_document(document.id)
        again = await service.process_document(document.id)
    assert again is None  # not workable: the lease is refused
    assert len(gateway.sent("authorize")) == 1


@pytest.mark.anyio
async def test_concurrent_number_allocation_never_repeats(factory) -> None:
    async def take(_: int) -> int:
        async with factory() as session:
            number = await FiscalRepository(session).allocate_number(
                tenant_id=TENANT, emitter_cnpj=TEST_CNPJ, environment="homologacao", model="65", serie=1,
                now=datetime.now(UTC),
            )
            await session.commit()
            return number

    numbers = await asyncio.gather(*(take(i) for i in range(30)))
    assert sorted(numbers) == list(range(1, 31))


@pytest.mark.anyio
async def test_two_simultaneous_sales_get_different_numbers(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.delay = 0.05
    async with factory() as seed:
        first, second = await queued(seed), await queued(seed)

    async def run(document_id: str) -> None:
        async with factory() as session:
            await make_service(session, gateway, storage, clock).process_document(document_id)

    await asyncio.gather(run(first.id), run(second.id))
    async with factory() as session:
        rows = (await session.execute(select(FiscalDocument).order_by(FiscalDocument.number))).scalars().all()
    assert [r.number for r in rows] == [1, 2] and all(r.status == "AUTHORIZED" for r in rows)
    assert len({r.access_key for r in rows}) == 2


@pytest.mark.anyio
async def test_numbering_is_separate_per_environment_and_serie(factory) -> None:
    async with factory() as session:
        repo = FiscalRepository(session)
        now = datetime.now(UTC)
        kwargs = {"tenant_id": TENANT, "emitter_cnpj": TEST_CNPJ, "model": "65", "now": now}
        assert await repo.allocate_number(environment="homologacao", serie=1, **kwargs) == 1
        assert await repo.allocate_number(environment="homologacao", serie=1, **kwargs) == 2
        assert await repo.allocate_number(environment="homologacao", serie=2, **kwargs) == 1
        assert await repo.allocate_number(environment="producao", serie=1, **kwargs) == 1


@pytest.mark.anyio
async def test_only_one_worker_wins_the_lease(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.delay = 0.1
    async with factory() as seed:
        document = await queued(seed)

    async def run() -> object:
        async with factory() as session:
            return await make_service(session, gateway, storage, clock).process_document(document.id)

    results = await asyncio.gather(run(), run(), run())
    assert sum(1 for r in results if r is not None) == 1
    assert len(gateway.sent("authorize")) == 1


# ============================================================================
# TIMEOUT / RECOVERY
# ============================================================================


@pytest.mark.anyio
async def test_timeout_is_not_a_rejection_and_recovery_consults_before_resending(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",)]
    gateway.consult_script = [("authorized",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "PENDING_RECOVERY" and document.next_attempt_at is not None
        assert document.access_key and document.number == 1 and document.error_category == "TRANSIENT_NETWORK"
        key, sent_xml = document.access_key, gateway.sent("authorize")[0]
        clock.advance(minutes=5)
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "AUTHORIZED" and document.access_key == key
    assert len(gateway.sent("authorize")) == 1  # SEFAZ already had it: never sent twice
    assert gateway.sent("consult") == [key]
    assert storage.files[document.xml_signed_key].decode() == sent_xml


@pytest.mark.anyio
async def test_recovery_resends_the_same_signed_xml_when_sefaz_never_saw_it(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",), ("authorized",)]
    gateway.consult_script = [("not_found",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        await service.process_document(document.id)
        clock.advance(minutes=2)
        await service.process_document(document.id)
        await session.refresh(document)
    first, second = gateway.sent("authorize")
    assert first == second  # byte-identical: same number, key and signature
    assert document.status == "AUTHORIZED" and document.number == 1


@pytest.mark.anyio
async def test_stale_unsent_xml_is_re_signed_with_same_number_and_numeric_code(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",), ("authorized",)]
    gateway.consult_script = [("not_found",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
        original_cnf, original_key = document.numeric_code, document.access_key
        clock.advance(minutes=45)
        await service.process_document(document.id)
        await session.refresh(document)
    first, second = gateway.sent("authorize")
    assert first != second and document.status == "AUTHORIZED"
    assert document.number == 1 and document.numeric_code == original_cnf
    assert document.access_key == original_key  # same month: same key, only dhEmi/signature refreshed


@pytest.mark.anyio
async def test_transient_failures_back_off_and_stop_after_max_attempts(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",)] * 5
    gateway.consult_script = [("timeout",)] * 5
    async with factory() as session:
        service = make_service(session, gateway, storage, clock, nfce_max_attempts=2)
        document = await queued(session)
        delays = []
        for _ in range(3):
            await service.process_document(document.id)
            await session.refresh(document)
            if document.next_attempt_at is None:
                break
            delays.append(document.next_attempt_at - clock.now.replace(tzinfo=None))
            clock.now = document.next_attempt_at.replace(tzinfo=UTC) + timedelta(seconds=1)
    assert document.status == "ERROR" and "esgotadas" in document.status_message
    assert delays and all(d > timedelta(0) for d in delays)


# ============================================================================
# REJECTION / DENIAL
# ============================================================================


@pytest.mark.anyio
async def test_rejection_keeps_number_is_not_retried_and_reprocess_reuses_it(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("rejected", 778, "Rejeicao: Informado NCM inexistente")]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "REJECTED" and document.cstat == 778
        assert document.error_category == "SEFAZ_REJECTION" and "NCM" in document.status_message
        number, cnf = document.number, document.numeric_code
        assert await FiscalRepository(session).list_workable_ids(now=clock.now + timedelta(days=1), limit=10) == []
        assert await service.process_document(document.id) is None
        assert len(gateway.sent("authorize")) == 1  # never re-sent automatically
        document.status = "DRAFT"  # what reprocess does after re-snapshot
        await session.commit()
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "AUTHORIZED" and document.number == number and document.numeric_code == cnf


@pytest.mark.anyio
async def test_denied_is_final_and_never_authorized_again(factory) -> None:
    gateway = FakeGateway()
    gateway.authorize_script = [("denied",)]
    async with factory() as session:
        service = make_service(session, gateway, Storage(), Clock())
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "DENIED" and document.error_category == "SEFAZ_DENIED"
        assert await service.process_document(document.id) is None
        await session.refresh(document)  # the refused lease rolled the session back
        with pytest.raises(FiscalError):
            service._transition(document, FiscalDocumentStatus.AUTHORIZED)
    assert not can_transition(FiscalDocumentStatus.DENIED, FiscalDocumentStatus.AUTHORIZED)
    assert not can_transition(FiscalDocumentStatus.CANCELED, FiscalDocumentStatus.AUTHORIZED)


@pytest.mark.anyio
async def test_duplicate_answer_is_resolved_by_consulting_not_by_rejecting(factory) -> None:
    gateway = FakeGateway()
    gateway.authorize_script = [("duplicate",)]
    async with factory() as session:
        service = make_service(session, gateway, Storage(), Clock())
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "AUTHORIZED" and len(gateway.sent("consult")) == 1


# ============================================================================
# CANCELLATION
# ============================================================================


async def authorized_document(session: AsyncSession, service: FiscalService) -> FiscalDocument:
    document = await queued(session)
    await service.process_document(document.id)
    await session.refresh(document)
    assert document.status == "AUTHORIZED"
    return document


@pytest.mark.anyio
async def test_cancel_within_window_stores_event_and_blocks_reauthorization(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await authorized_document(session, service)
        actor = str(uuid4())
        clock.advance(minutes=10)
        await service.cancel_document(document_id=document.id, justification="Erro de digitacao no valor cobrado", actor_user_id=actor)
        await session.refresh(document)
        events = (await session.execute(select(FiscalEvent))).scalars().all()
        with pytest.raises(FiscalError):
            service._transition(document, FiscalDocumentStatus.AUTHORIZED)
    assert document.status == "CANCELED" and document.canceled_at is not None
    assert len(events) == 1 and events[0].protocol == "153260000000999" and events[0].created_by_user_id == actor
    assert events[0].justification.startswith("Erro de digitacao") and events[0].cstat == 135
    assert any(name.endswith("events/cancel-01.xml") for name in storage.files)
    assert f"110111{document.access_key}01" in events[0].xml


@pytest.mark.anyio
async def test_cancel_rules_window_status_and_justification(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await authorized_document(session, service)
        with pytest.raises(HTTPException) as short:
            await service.cancel_document(document_id=document.id, justification="curto", actor_user_id="u")
        assert short.value.status_code == 422
        assert service.cancel_deadline(document) is not None
        clock.advance(minutes=31)
        with pytest.raises(HTTPException) as late:
            await service.cancel_document(document_id=document.id, justification="Cancelamento fora do prazo permitido", actor_user_id="u")
        assert late.value.status_code == 409 and "30 minutos" in late.value.detail
        draft = await queued(session)
        with pytest.raises(HTTPException) as unauthorized:
            await service.cancel_document(document_id=draft.id, justification="Nota que nem foi autorizada ainda", actor_user_id="u")
        assert unauthorized.value.status_code == 409
    assert gateway.sent("event") == []  # the local guard never even bothered SEFAZ


@pytest.mark.anyio
async def test_cancel_refused_by_sefaz_or_unreachable_keeps_the_note_authorized(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.event_script = [("refused", 573, "Rejeicao: Duplicidade de evento"), ("timeout",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await authorized_document(session, service)
        with pytest.raises(HTTPException) as refused:
            await service.cancel_document(document_id=document.id, justification="Cancelamento solicitado pelo cliente", actor_user_id="u")
        assert refused.value.status_code == 422 and "573" in refused.value.detail
        with pytest.raises(HTTPException) as down:
            await service.cancel_document(document_id=document.id, justification="Cancelamento solicitado pelo cliente", actor_user_id="u")
        assert down.value.status_code == 503
        await session.refresh(document)
        assert document.status == "AUTHORIZED" and (await session.execute(select(FiscalEvent))).first() is None


# ============================================================================
# INUTILIZATION
# ============================================================================


@pytest.mark.anyio
async def test_inutilization_rules_and_success(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await authorized_document(session, service)  # uses number 1
        repo = FiscalRepository(session)
        for _ in range(4):  # burn numbers 2..5 as if a crash had skipped them
            await repo.allocate_number(
                tenant_id=TENANT, emitter_cnpj=TEST_CNPJ, environment="homologacao", model="65", serie=1, now=clock.now,
            )
        await session.commit()
        args = {"tenant_id": TENANT, "justification": "Numeracao pulada por falha no emissor", "actor_user_id": str(uuid4())}
        with pytest.raises(HTTPException) as used:
            await service.inutilize(first_number=1, last_number=3, **args)
        assert used.value.status_code == 409 and "documento fiscal" in used.value.detail
        with pytest.raises(HTTPException) as future:
            await service.inutilize(first_number=2, last_number=9, **args)
        assert future.value.status_code == 409
        with pytest.raises(HTTPException) as short:
            await service.inutilize(first_number=2, last_number=3, tenant_id=TENANT, justification="curta", actor_user_id="u")
        assert short.value.status_code == 422
        record = await service.inutilize(first_number=2, last_number=5, **args)
    assert record.status == "ACCEPTED" and record.cstat == 102 and record.protocol == "153260000000555"
    assert (record.number_start, record.number_end, record.serie) == (2, 5, 1)
    assert 'Id="ID5326' + TEST_CNPJ + '65001000000002000000005"' in record.xml
    assert document.number == 1


# ============================================================================
# SYNC / RECONCILIATION
# ============================================================================


@pytest.mark.anyio
async def test_sync_fixes_local_state_from_the_official_answer(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",)]
    gateway.consult_script = [("authorized",), ("canceled",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "PENDING_RECOVERY"
        await service.sync_document(document.id)
        await session.refresh(document)
        assert document.status == "AUTHORIZED" and document.protocol
        await service.sync_document(document.id)
        await session.refresh(document)
    assert document.status == "CANCELED"


@pytest.mark.anyio
async def test_sync_failure_never_changes_an_authorized_document(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        document = await authorized_document(session, service)
        before = (document.status, document.protocol, document.xml_authorized_key, document.status_message)
        gateway.consult_script = [("timeout",)]
        with pytest.raises(HTTPException) as down:
            await service.sync_document(document.id)
        assert down.value.status_code == 503
        await session.refresh(document)
    assert (document.status, document.protocol, document.xml_authorized_key, document.status_message) == before


@pytest.mark.anyio
async def test_reconcile_pending_checks_stuck_documents(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("timeout",), ("timeout",)]
    async with factory() as session:
        service = make_service(session, gateway, storage, clock)
        first, second = await queued(session), await queued(session)
        await service.process_document(first.id)
        await service.process_document(second.id)
        checked = await service.reconcile_pending()
        await session.refresh(first)
        await session.refresh(second)
    assert checked == 2 and first.status == "AUTHORIZED" and second.status == "AUTHORIZED"


# ============================================================================
# CONFIGURATION GUARDS
# ============================================================================


def test_production_requires_explicit_unlock() -> None:
    blocked = fiscal_settings(fiscal_env="producao", fiscal_production_enabled=False)
    with pytest.raises(FiscalConfigurationError):
        blocked.assert_environment_allowed()
    fiscal_settings(fiscal_env="producao", fiscal_production_enabled=True).assert_environment_allowed()
    assert fiscal_settings().tp_amb == "2" and fiscal_settings(fiscal_env="producao", fiscal_production_enabled=True).tp_amb == "1"


def test_ambiguous_environment_is_refused() -> None:
    with pytest.raises(ValueError):
        fiscal_settings(nfce_env="producao", fiscal_env="homologacao")
    assert fiscal_settings(nfce_env="homologacao").fiscal_env == "homologacao"


@pytest.mark.anyio
async def test_blocked_production_never_calls_sefaz(factory) -> None:
    gateway = FakeGateway()
    async with factory() as session:
        service = make_service(session, gateway, Storage(), Clock(), fiscal_env="producao", fiscal_production_enabled=False)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "ERROR" and "FISCAL_PRODUCTION_ENABLED" in " ".join(document.error_details)
    assert gateway.calls == []


def test_missing_emitter_fields_are_listed_not_invented() -> None:
    incomplete = fiscal_settings(nfce_cnpj="", nfce_ie="", nfce_serie="", nfce_crt="", nfce_certificate_path="")
    assert incomplete.missing_emitter_fields() == ["NFCE_CNPJ", "NFCE_IE", "NFCE_CRT", "NFCE_SERIE", "NFCE_CERTIFICATE_PATH"]
    bad = fiscal_settings(nfce_cnpj="123", nfce_crt="9", nfce_serie="1000", nfce_codigo_ibge_municipio="3550308")
    assert len(bad.invalid_emitter_fields()) == 4


@pytest.mark.anyio
async def test_module_status_never_exposes_secrets_and_reports_certificate(factory) -> None:
    async with factory() as session:
        info = await make_service(session, FakeGateway(), Storage(), Clock()).module_status(live=True)
    dumped = repr(info)
    assert "senha-super-secreta" not in dumped and "CSC-QUE" not in dumped
    assert info["environment"] == "homologacao" and info["problems"] == []
    assert info["certificate"]["ok"] and info["certificate"]["matches_emitter_cnpj"] is True
    assert info["sefaz"] == {"cstat": 107, "message": "Servico em Operacao"} and info["contingency_available"] is False


@pytest.mark.anyio
async def test_certificate_of_another_cnpj_is_refused_before_signing(factory) -> None:
    foreign = make_certificate(cnpj="99888777000161")
    async with factory() as session:
        service = FiscalService(
            session, fiscal_settings=fiscal_settings(), gateway=FakeGateway(), storage=Storage(), certificate=foreign, clock=Clock(),
        )
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "ERROR" and "outro CNPJ" in document.status_message


@pytest.mark.anyio
async def test_expired_certificate_blocks_emission(factory) -> None:
    clock = Clock()
    expired_at = CERT.not_after + timedelta(days=1)
    clock.now = expired_at
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), clock)
        document = await queued(session)
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "ERROR" and "expirado" in document.status_message


# ============================================================================
# PDV SNAPSHOT RULES
# ============================================================================

_ean_counter = iter(range(1, 10_000))


def next_valid_gtin13() -> str:
    """Return a fresh GTIN-13 with a correct check digit (EANs are unique per tenant)."""

    body = f"789100{next(_ean_counter):06d}"
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body))
    return body + str((10 - total % 10) % 10)



async def seed_sale(session: AsyncSession, *, profile: bool = True, delivery_fee: str = "0.00", discount: str = "0.00",
                    cashback: str = "0.00", total: str | None = None, cpf: str = "", include_cpf: bool = True,
                    store_cnpj: str = "") -> tuple[PdvSale, list[PdvSaleItem]]:
    store = Store(id=str(uuid4()), tenant_id=TENANT, code=f"L{uuid4().hex[:4]}", name="Loja Asa Sul", cnpj=store_cnpj)
    product = InventoryProduct(id=str(uuid4()), tenant_id=TENANT, sku=f"SKU-{uuid4().hex[:6]}", ean_code=next_valid_gtin13(), name="DIPIRONA 500MG")
    session.add_all([store, product])
    await session.flush()
    item = InventoryItem(
        id=str(uuid4()), tenant_id=TENANT, store_id=store.id, product_id=product.id, storage_location="A1",
        quantity=10, sale_price=Decimal("12.50"),
    )
    session.add(item)
    if profile:
        session.add(ProductFiscalProfile(
            id=str(uuid4()), tenant_id=TENANT, product_id=product.id, ncm="30049099", cest="1300100", cfop="5102",
            origin="0", commercial_unit="UN", icms_csosn="102", pis_cst="49", pis_rate=Decimal("0"),
            cofins_cst="49", cofins_rate=Decimal("0"),
        ))
    gross = Decimal("25.00")
    expected = gross - Decimal(discount) - Decimal(cashback) + Decimal(delivery_fee)
    sale = PdvSale(
        id=str(uuid4()), tenant_id=TENANT, store_id=store.id, sale_code="NFCE-" + uuid4().hex[:8].upper(), payment_method="pix",
        payment_status="paid", sale_status="completed", include_cpf_on_invoice=include_cpf,
        customer_display_name="Maria Silva", customer_document_snapshot=cpf, subtotal_amount=gross,
        discount_amount=Decimal(discount), cashback_applied_amount=Decimal(cashback),
        total_amount=Decimal(total) if total else expected, delivery_fee_amount=Decimal(delivery_fee),
    )
    session.add(sale)
    line = PdvSaleItem(
        id=str(uuid4()), pdv_sale_id=sale.id, inventory_item_id=item.id, item_name_snapshot="DIPIRONA 500MG 10 COMPRIMIDOS",
        quantity=2, unit_price=Decimal("12.50"), line_total=gross,
    )
    session.add(line)
    await session.commit()
    return sale, [line]


@pytest.mark.anyio
async def test_enqueue_builds_snapshot_with_discount_cashback_and_valid_cpf(factory) -> None:
    async with factory() as session:
        sale, lines = await seed_sale(session, discount="2.50", cashback="1.00", cpf="529.982.247-25")
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await service.enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=str(uuid4()))
        await session.commit()
        assert document is not None and document.status == "DRAFT" and document.payload_snapshot is not None
        snap = document.payload_snapshot
        assert Decimal(snap["items"][0]["discount"]) == Decimal("3.50")
        assert snap["payments"][0] == {"tpag": "17", "amount": "21.50", "card_integration": ""}
        assert snap["recipient"]["cpf"] == "52998224725"
        again = await service.enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=str(uuid4()))
    assert again is not None and again.id == document.id  # idempotent per sale


@pytest.mark.anyio
async def test_enqueue_omits_invalid_cpf_and_respects_the_operator_choice(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        bad, lines_bad = await seed_sale(session, cpf="111.111.111-11")
        skipped, lines_skipped = await seed_sale(session, cpf="529.982.247-25", include_cpf=False)
        doc_bad = await service.enqueue_pdv_sale(sale=bad, sale_items=lines_bad, actor_user_id=None)
        doc_skipped = await service.enqueue_pdv_sale(sale=skipped, sale_items=lines_skipped, actor_user_id=None)
    assert doc_bad.payload_snapshot["recipient"] is None and doc_skipped.payload_snapshot["recipient"] is None


@pytest.mark.anyio
async def test_missing_fiscal_data_blocks_emission_and_names_the_product(factory) -> None:
    async with factory() as session:
        sale, lines = await seed_sale(session, profile=False)
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await service.enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=None)
    assert document.status == "ERROR" and document.error_category == "MISSING_FISCAL_DATA"
    assert "não foi possível emitir a NFC-e" in document.status_message
    assert any("DIPIRONA 500MG 10 COMPRIMIDOS" in d and "sem cadastro fiscal" in d for d in document.error_details)
    assert document.payload_snapshot is None


@pytest.mark.anyio
async def test_incomplete_profile_lists_each_missing_field(factory) -> None:
    async with factory() as session:
        sale, lines = await seed_sale(session)
        profile = (await session.execute(select(ProductFiscalProfile))).scalar_one()
        profile.ncm, profile.cfop, profile.icms_csosn = "", "", ""
        await session.commit()
        document = await make_service(session, FakeGateway(), Storage(), Clock()).enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=None)
    detail = " ".join(document.error_details)
    assert "NCM (8 dígitos)" in detail and "CFOP (4 dígitos)" in detail and "CSOSN" in detail


@pytest.mark.anyio
async def test_delivery_fee_total_mismatch_and_foreign_store_are_refused(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        fee, fee_lines = await seed_sale(session, delivery_fee="8.00")
        drift, drift_lines = await seed_sale(session, total="24.00")
        foreign, foreign_lines = await seed_sale(session, store_cnpj="99.888.777/0001-61")
        results = [
            await service.enqueue_pdv_sale(sale=fee, sale_items=fee_lines, actor_user_id=None),
            await service.enqueue_pdv_sale(sale=drift, sale_items=drift_lines, actor_user_id=None),
            await service.enqueue_pdv_sale(sale=foreign, sale_items=foreign_lines, actor_user_id=None),
        ]
    assert [d.status for d in results] == ["ERROR", "ERROR", "ERROR"]
    assert "taxa de entrega" in results[0].status_message
    assert "não fecha" in results[1].status_message
    assert "estabelecimento emitente" in results[2].status_message


@pytest.mark.anyio
async def test_module_disabled_creates_no_fiscal_document(factory) -> None:
    async with factory() as session:
        sale, lines = await seed_sale(session)
        service = make_service(session, FakeGateway(), Storage(), Clock(), nfce_enabled=False)
        assert await service.enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=None) is None
        assert (await session.execute(select(FiscalDocument))).first() is None


@pytest.mark.anyio
async def test_reprocess_after_fixing_profile_requeues_and_reuses_the_number(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("rejected", 778, "Rejeicao: NCM inexistente")]
    async with factory() as session:
        sale, lines = await seed_sale(session)
        service = make_service(session, gateway, storage, clock)
        document = await service.enqueue_pdv_sale(sale=sale, sale_items=lines, actor_user_id=None)
        await session.commit()
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "REJECTED"
        number = document.number
        queued_again = await service.reprocess(document.id)
        assert queued_again.status == "DRAFT" and queued_again.error_category == ""
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "AUTHORIZED" and document.number == number


@pytest.mark.anyio
async def test_reprocess_is_refused_for_authorized_notes(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await authorized_document(session, service)
        with pytest.raises(HTTPException) as refused:
            await service.reprocess(document.id)
    assert refused.value.status_code == 409


# ============================================================================
# MARKETPLACE ORDER SNAPSHOT (pickup only — see FiscalService.enqueue_order)
# ============================================================================


async def seed_order(
    session: AsyncSession, *, profile: bool = True, delivery_fee: str = "0.00", discount: str = "0.00",
    cashback: str = "0.00", total: str | None = None, cpf: str = "529.982.247-25", store_cnpj: str = "",
    fulfillment_type: str = "pickup", payment_method: str = "pix", missing_inventory_link: bool = False,
) -> tuple[Order, list[OrderItem]]:
    store = Store(id=str(uuid4()), tenant_id=TENANT, code=f"L{uuid4().hex[:4]}", name="Loja Asa Sul", cnpj=store_cnpj)
    product = InventoryProduct(id=str(uuid4()), tenant_id=TENANT, sku=f"SKU-{uuid4().hex[:6]}", ean_code=next_valid_gtin13(), name="DIPIRONA 500MG")
    session.add_all([store, product])
    await session.flush()
    item = InventoryItem(
        id=str(uuid4()), tenant_id=TENANT, store_id=store.id, product_id=product.id, storage_location="A1",
        quantity=10, sale_price=Decimal("12.50"),
    )
    session.add(item)
    if profile:
        session.add(ProductFiscalProfile(
            id=str(uuid4()), tenant_id=TENANT, product_id=product.id, ncm="30049099", cest="1300100", cfop="5102",
            origin="0", commercial_unit="UN", icms_csosn="102", pis_cst="49", pis_rate=Decimal("0"),
            cofins_cst="49", cofins_rate=Decimal("0"),
        ))
    gross = Decimal("25.00")
    expected = gross - Decimal(discount) - Decimal(cashback) + Decimal(delivery_fee)
    order = Order(
        id=str(uuid4()), tenant_id=TENANT, store_id=store.id, order_code="ORD-" + uuid4().hex[:8].upper(),
        fulfillment_type=fulfillment_type, payment_method=payment_method, payment_method_label="Pix",
        payment_status="approved", customer_display_name="Maria Silva", customer_document_snapshot=cpf,
        subtotal_amount=gross, discount_amount=Decimal(discount), cashback_applied_amount=Decimal(cashback),
        total_amount=Decimal(total) if total else expected, delivery_fee_amount=Decimal(delivery_fee),
    )
    session.add(order)
    line = OrderItem(
        id=str(uuid4()), order_id=order.id, inventory_item_id=None if missing_inventory_link else item.id,
        item_sku=product.sku, item_name_snapshot="DIPIRONA 500MG 10 COMPRIMIDOS",
        quantity=2, unit_price=Decimal("12.50"), line_total=gross,
    )
    session.add(line)
    await session.commit()
    return order, [line]


@pytest.mark.anyio
async def test_enqueue_order_builds_snapshot_with_discount_cashback_and_valid_cpf(factory) -> None:
    async with factory() as session:
        order, lines = await seed_order(session, discount="2.50", cashback="1.00", cpf="529.982.247-25")
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await service.enqueue_order(order=order, order_items=lines)
        await session.commit()
        assert document is not None and document.status == "DRAFT" and document.payload_snapshot is not None
        snap = document.payload_snapshot
        assert Decimal(snap["items"][0]["discount"]) == Decimal("3.50")
        assert snap["payments"][0] == {"tpag": "17", "amount": "21.50", "card_integration": ""}
        assert snap["recipient"]["cpf"] == "52998224725"
        again = await service.enqueue_order(order=order, order_items=lines)
    assert again is not None and again.id == document.id  # idempotent per order


@pytest.mark.anyio
async def test_enqueue_order_maps_online_payment_methods_to_tpag(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        card, card_lines = await seed_order(session, payment_method="credit_card")
        pickup_cash, pickup_cash_lines = await seed_order(session, payment_method="pickup_cash")
        card_doc = await service.enqueue_order(order=card, order_items=card_lines)
        pickup_cash_doc = await service.enqueue_order(order=pickup_cash, order_items=pickup_cash_lines)
    assert card_doc.payload_snapshot["payments"][0]["tpag"] == "03"
    # Despite the name, pickup_cash is charged on the customer's saved card at pickup confirmation
    # (never physical cash) — tpag "03" (credit card), not "01" (cash), is the correct mapping.
    assert pickup_cash_doc.payload_snapshot["payments"][0]["tpag"] == "03"


@pytest.mark.anyio
async def test_enqueue_order_skips_delivery_and_shipping_fulfillment(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        delivery, delivery_lines = await seed_order(session, fulfillment_type="delivery")
        shipping, shipping_lines = await seed_order(session, fulfillment_type="shipping")
        delivery_doc = await service.enqueue_order(order=delivery, order_items=delivery_lines)
        shipping_doc = await service.enqueue_order(order=shipping, order_items=shipping_lines)
        pending = (await session.execute(select(FiscalDocument))).first()
    # No document at all — not an ERROR row either — so the scheduler never retries these forever.
    assert delivery_doc is None and shipping_doc is None and pending is None


@pytest.mark.anyio
async def test_enqueue_order_missing_inventory_link_blocks(factory) -> None:
    async with factory() as session:
        order, lines = await seed_order(session, missing_inventory_link=True)
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await service.enqueue_order(order=order, order_items=lines)
    assert document.status == "ERROR"
    assert "sem vínculo com o estoque" in document.status_message


@pytest.mark.anyio
async def test_enqueue_order_missing_fiscal_data_blocks_emission_and_names_the_product(factory) -> None:
    async with factory() as session:
        order, lines = await seed_order(session, profile=False)
        service = make_service(session, FakeGateway(), Storage(), Clock())
        document = await service.enqueue_order(order=order, order_items=lines)
    assert document.status == "ERROR" and document.error_category == "MISSING_FISCAL_DATA"
    assert "não foi possível emitir a NFC-e" in document.status_message
    assert any("DIPIRONA 500MG 10 COMPRIMIDOS" in d and "sem cadastro fiscal" in d for d in document.error_details)
    assert document.payload_snapshot is None


@pytest.mark.anyio
async def test_enqueue_order_incomplete_profile_lists_each_missing_field(factory) -> None:
    async with factory() as session:
        order, lines = await seed_order(session)
        profile = (await session.execute(select(ProductFiscalProfile))).scalar_one()
        profile.ncm, profile.cfop, profile.icms_csosn = "", "", ""
        await session.commit()
        document = await make_service(session, FakeGateway(), Storage(), Clock()).enqueue_order(order=order, order_items=lines)
    detail = " ".join(document.error_details)
    assert "NCM (8 dígitos)" in detail and "CFOP (4 dígitos)" in detail and "CSOSN" in detail


@pytest.mark.anyio
async def test_enqueue_order_delivery_fee_total_mismatch_and_foreign_store_are_refused(factory) -> None:
    # These construct a pickup order with a delivery fee anyway — not a real checkout scenario
    # (pickup orders never carry a fee), but proves _snapshot_marketplace_order's own defense-in-depth
    # guard still refuses it even if a caller ever bypassed the scheduler's fulfillment_type filter.
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        fee, fee_lines = await seed_order(session, delivery_fee="8.00")
        drift, drift_lines = await seed_order(session, total="24.00")
        foreign, foreign_lines = await seed_order(session, store_cnpj="99.888.777/0001-61")
        results = [
            await service.enqueue_order(order=fee, order_items=fee_lines),
            await service.enqueue_order(order=drift, order_items=drift_lines),
            await service.enqueue_order(order=foreign, order_items=foreign_lines),
        ]
    assert [d.status for d in results] == ["ERROR", "ERROR", "ERROR"]
    assert "taxa de entrega" in results[0].status_message
    assert "não fecha" in results[1].status_message
    assert "estabelecimento emitente" in results[2].status_message


@pytest.mark.anyio
async def test_enqueue_order_module_disabled_creates_no_fiscal_document(factory) -> None:
    async with factory() as session:
        order, lines = await seed_order(session)
        service = make_service(session, FakeGateway(), Storage(), Clock(), nfce_enabled=False)
        assert await service.enqueue_order(order=order, order_items=lines) is None
        assert (await session.execute(select(FiscalDocument))).first() is None


@pytest.mark.anyio
async def test_reprocess_order_after_fixing_profile_requeues_and_reuses_the_number(factory) -> None:
    gateway, storage, clock = FakeGateway(), Storage(), Clock()
    gateway.authorize_script = [("rejected", 778, "Rejeicao: NCM inexistente")]
    async with factory() as session:
        order, lines = await seed_order(session)
        service = make_service(session, gateway, storage, clock)
        document = await service.enqueue_order(order=order, order_items=lines)
        await session.commit()
        await service.process_document(document.id)
        await session.refresh(document)
        assert document.status == "REJECTED"
        number = document.number
        queued_again = await service.reprocess(document.id)
        assert queued_again.status == "DRAFT" and queued_again.error_category == ""
        await service.process_document(document.id)
        await session.refresh(document)
    assert document.status == "AUTHORIZED" and document.number == number


# ============================================================================
# DOWNLOADS / PRINT
# ============================================================================


@pytest.mark.anyio
async def test_downloads_and_print_only_exist_for_authorized_notes(factory) -> None:
    async with factory() as session:
        service = make_service(session, FakeGateway(), Storage(), Clock())
        draft = await queued(session)
        with pytest.raises(HTTPException) as early:
            await service.read_document_file(draft, "xml")
        assert early.value.status_code == 409
        with pytest.raises(HTTPException):
            await service.render_printable_html(draft)
        authorized = await authorized_document(session, service)
        xml, media, name = await service.read_document_file(authorized, "xml")
        pdf, pdf_media, pdf_name = await service.read_document_file(authorized, "pdf")
        html = await service.render_printable_html(authorized)
        payload = service.serialize_document(authorized)
    assert media == "application/xml" and xml.startswith(b"<nfeProc") and name.endswith(".xml")
    assert pdf.startswith(b"%PDF") and pdf_media == "application/pdf" and pdf_name.endswith(".pdf")
    assert "153260000000123" in html and "@page" in html
    assert payload.authorized and payload.status == "AUTHORIZED" and payload.pdf_url.endswith("/pdf")
    assert payload.cancel_deadline is not None and not payload.simulated


@pytest.mark.anyio
async def test_legacy_simulated_documents_are_never_presented_as_authorized_notes(factory) -> None:
    async with factory() as session:
        legacy = FiscalDocument(
            id=str(uuid4()), tenant_id=TENANT, store_id=str(uuid4()), source_channel="marketplace",
            status="LEGACY_SIMULATED", document_number="123456", series_code="001", access_key="1" * 44,
            gross_total_amount=Decimal("10.00"), authorized=True, error_details=[],
        )
        session.add(legacy)
        await session.commit()
        service = make_service(session, FakeGateway(), Storage(), Clock())
        payload = service.serialize_document(legacy)
        listed, total = await FiscalRepository(session).list_documents(limit=10, offset=0)
        with pytest.raises(HTTPException):
            await service.sync_document(legacy.id)
        with pytest.raises(FiscalError):
            service._transition(legacy, FiscalDocumentStatus.AUTHORIZED)
    assert payload.simulated is True and total == 0 and listed == []  # hidden from the fiscal panel


def test_data_error_carries_operator_details() -> None:
    error = FiscalDataError("Dados fiscais ausentes", details=["NCM", "CFOP"])
    assert error.details == ["NCM", "CFOP"] and error.category.value == "MISSING_FISCAL_DATA"
