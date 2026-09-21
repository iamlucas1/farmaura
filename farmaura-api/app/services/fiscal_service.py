"""
farmaura-api/app/services/fiscal_service.py

Fiscal (NFC-e) orchestration service for Farmaura.

Responsibilities:
- freeze a fiscal snapshot when a PDV sale closes and queue it as a durable outbox row;
- allocate the number, build, validate, sign and transmit the NFC-e, then store XML/protocol/DANFE;
- recover after timeouts by asking SEFAZ before ever re-sending, and reconcile stuck documents;
- cancel, void number ranges and expose lookup/print/download helpers behind role checks;
- keep the marketplace's legacy simulated document path working until its policy is decided;

Observations:
- no SEFAZ call ever happens inside the sale transaction: the sale commits first, the worker transmits after;
- a timeout is never read as a rejection: the document becomes PENDING_RECOVERY and is consulted by access key;
- an authorized document is the `nfeProc` (NFe + SEFAZ protocol) and is stored verbatim, never regenerated;
- a rejection keeps its number and access key; only a human-fixed reprocess re-sends it;
- secrets (certificate password, CSC) are read from settings only inside this module and never logged;
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha1
from pathlib import Path
from typing import Any, Protocol
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.file_storage import read_private_file, write_private_file
from app.core.fiscal_config import (
    DF_UF_CODE,
    FiscalConfigurationError,
    FiscalSettings,
    get_fiscal_settings,
)
from app.domain.fiscal import (
    CARD_TPAGS,
    CONSULT_CANCELED_CSTAT,
    CONSULT_NOT_FOUND_CSTAT,
    DUPLICATE_CSTAT,
    EVENT_ACCEPTED_CSTATS,
    INUTILIZATION_ACCEPTED_CSTAT,
    PAYMENT_METHOD_TO_TPAG,
    TERMINAL_STATUSES,
    FiscalDataError,
    FiscalDocumentStatus,
    FiscalError,
    FiscalErrorCategory,
    FiscalEventType,
    FiscalSignatureError,
    FiscalTransientError,
    can_transition,
    is_authorized,
    is_denied,
    is_transient,
)
from app.domain.validators import is_valid_cpf
from app.fiscal import sefaz_messages as messages
from app.fiscal.access_key import generate_numeric_code
from app.fiscal.certificate import (
    LoadedCertificate,
    build_tls_client_context,
    load_pkcs12_certificate,
)
from app.fiscal.danfe import parse_danfe_data, render_danfe_html, render_danfe_pdf
from app.fiscal.inputs import (
    EmitterData,
    ItemData,
    NfceInput,
    PaymentData,
    RecipientData,
    TaxProfile,
)
from app.fiscal.schema_validator import assert_valid_xml
from app.fiscal.sefaz_client import SefazClient, SefazGateway
from app.fiscal.snapshot import FiscalSnapshot, snapshot_from_dict, snapshot_to_dict
from app.fiscal.xml_builder import apportion_discount, build_nfce, missing_tax_fields, money
from app.fiscal.xml_signer import sign_xml
from app.models.customer import Customer
from app.models.fiscal_document import FiscalDocument
from app.models.fiscal_support_tables import FiscalAttempt, FiscalEvent, FiscalInutilization
from app.models.inventory_item import InventoryItem
from app.models.order import Order
from app.models.pdv_sale import PdvSale
from app.models.pdv_sale_item import PdvSaleItem
from app.models.store import Store
from app.repositories.fiscal_repository import FiscalRepository
from app.schemas.fiscal import FiscalDocumentEmailResponse, FiscalDocumentResponse
from app.services.asaas_client import AsaasClient, AsaasError, build_invoice_payload
from app.services.notification_service import NotificationService

logger = logging.getLogger("farmaura.fiscal")

BRASILIA = ZoneInfo("America/Sao_Paulo")
LEASE_SECONDS = 90
STALE_SIGNED_XML_MINUTES = 10
MIN_JUSTIFICATION = 15
MAX_JUSTIFICATION = 255
_KEY_PATTERN = re.compile(r"^\d{44}$")
_SETTLED = frozenset(
    {FiscalDocumentStatus.AUTHORIZED.value, FiscalDocumentStatus.CANCELED.value, FiscalDocumentStatus.DENIED.value}
)


class FiscalStorage(Protocol):
    """Private storage for fiscal files (never publicly served)."""

    async def write(self, key: str, content: bytes) -> None: ...

    async def read(self, key: str) -> bytes: ...


class PrivateFiscalStorage:
    """Store fiscal files under the application's private storage root."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def write(self, key: str, content: bytes) -> None:
        await write_private_file(settings=self._settings, storage_key=key, content=content)

    async def read(self, key: str) -> bytes:
        return await read_private_file(settings=self._settings, storage_key=key)


@dataclass(frozen=True)
class ProcessOutcome:
    """Small result object the worker/tests can inspect."""

    document_id: str
    status: str


# ============================================================================
# FISCAL SERVICE
# ============================================================================


class FiscalService:
    """Provide NFC-e issuance, recovery, cancellation and lookup flows."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        fiscal_settings: FiscalSettings | None = None,
        gateway: SefazGateway | None = None,
        storage: FiscalStorage | None = None,
        certificate: LoadedCertificate | None = None,
        context_applier: Callable[[], Awaitable[None]] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.settings = get_settings()
        self.fiscal = fiscal_settings or get_fiscal_settings()
        self.repository = FiscalRepository(session)
        self.asaas_client = AsaasClient()
        self.notification_service = NotificationService()
        self._gateway = gateway
        self._storage = storage or PrivateFiscalStorage(self.settings)
        self._certificate = certificate
        self._apply_context = context_applier
        self._clock = clock or (lambda: datetime.now(UTC))

    # ------------------------------------------------------------------------------------
    # Configuration and status
    # ------------------------------------------------------------------------------------

    def module_enabled(self) -> bool:
        """Return whether NFC-e emission is switched on."""

        return bool(self.fiscal.nfce_enabled)

    def configuration_problems(self) -> list[str]:
        """Return everything that blocks emission right now, in operator language."""

        problems: list[str] = []
        try:
            self.fiscal.assert_environment_allowed()
        except FiscalConfigurationError as exc:
            return [str(exc)]
        missing = self.fiscal.missing_emitter_fields()
        if missing:
            problems.append("Configuração fiscal incompleta. Preencha: " + ", ".join(missing))
        problems.extend(self.fiscal.invalid_emitter_fields())
        return problems

    async def module_status(self, *, live: bool = False) -> dict[str, Any]:
        """Describe the fiscal module for the admin panel; optionally ask SEFAZ for its service status."""

        info: dict[str, Any] = {
            "enabled": self.module_enabled(),
            "environment": self.fiscal.fiscal_env,
            "production_unlocked": self.fiscal.fiscal_production_enabled,
            "serie": self.fiscal.nfce_serie,
            "problems": self.configuration_problems(),
            "certificate": None,
            "sefaz": None,
            "counts": await self.repository.count_by_status(),
            "contingency_available": False,
        }
        if not self.fiscal.certificate_file.name or not self.fiscal.nfce_certificate_password.get_secret_value():
            return info
        try:
            certificate = self._load_certificate(check_owner=False)
        except FiscalError as exc:
            info["certificate"] = {"ok": False, "message": exc.message}
            return info
        days = certificate.days_until_expiry(self._clock())
        owner = certificate.icp_brasil_cnpj()
        info["certificate"] = {
            "ok": not certificate.is_expired(self._clock()),
            "expires_at": certificate.not_after.isoformat(),
            "days_until_expiry": days,
            "expiring_soon": 0 <= days <= self.fiscal.nfce_certificate_warn_days,
            "matches_emitter_cnpj": None if owner is None else owner == self.fiscal.emitter_cnpj_digits,
        }
        if live and not info["problems"]:
            try:
                result = await self._get_gateway().service_status()
                info["sefaz"] = {"cstat": result.cstat, "message": result.reason}
            except FiscalError as exc:
                info["sefaz"] = {"cstat": None, "message": exc.message}
        return info

    # ------------------------------------------------------------------------------------
    # PDV enqueue (inside the sale transaction; database only, no network)
    # ------------------------------------------------------------------------------------

    async def enqueue_pdv_sale(
        self, *, sale: PdvSale, sale_items: list[PdvSaleItem], actor_user_id: str | None,
    ) -> FiscalDocument | None:
        """Queue the NFC-e for one closed PDV sale; idempotent per sale and a no-op when the module is off."""

        if not self.module_enabled():
            return None
        existing = await self.repository.get_by_pdv_sale_id(sale.id)
        if existing is not None:
            return existing
        document = FiscalDocument(
            id=str(uuid4()), tenant_id=sale.tenant_id, store_id=sale.store_id, document_type="nfce",
            source_channel="pdv", pdv_sale_id=sale.id, order_id=None, issued_by_user_id=actor_user_id,
            customer_id=sale.customer_id, status=FiscalDocumentStatus.DRAFT.value, model="65",
            environment=self.fiscal.fiscal_env, emitter_cnpj=self.fiscal.emitter_cnpj_digits or None,
            payment_method_snapshot=sale.payment_method,
            recipient_name_snapshot=sale.customer_display_name,
            recipient_document_snapshot=sale.customer_document_snapshot if sale.include_cpf_on_invoice else "",
            gross_total_amount=Decimal(sale.total_amount or 0),
            error_details=[], payload_snapshot=None,
        )
        try:
            snapshot = await self._snapshot_pdv_sale(sale, sale_items)
            document.payload_snapshot = snapshot_to_dict(snapshot)
        except FiscalError as exc:
            self._mark_failed(document, exc)
        await self.repository.add(document)
        return document

    async def reprocess(self, document_id: str) -> FiscalDocument:
        """Re-snapshot the sale from current product profiles and queue the document again.

        Allowed for ERROR and REJECTED documents; keeps the number and access key so SEFAZ never sees a hole.
        """

        document = await self.get_document(document_id=document_id)
        if document.status not in (FiscalDocumentStatus.ERROR.value, FiscalDocumentStatus.REJECTED.value):
            raise HTTPException(status.HTTP_409_CONFLICT, "Somente notas com erro ou rejeitadas podem ser reprocessadas.")
        if document.pdv_sale_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Documento sem venda de origem para reprocessar.")
        sale = await self.session.get(PdvSale, document.pdv_sale_id)
        if sale is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Venda de origem não encontrada.")
        items = list(
            (await self.session.execute(select(PdvSaleItem).where(PdvSaleItem.pdv_sale_id == sale.id))).scalars().all()
        )
        try:
            document.payload_snapshot = snapshot_to_dict(await self._snapshot_pdv_sale(sale, items))
        except FiscalError as exc:
            self._mark_failed(document, exc)
            await self.session.commit()
            await self._reapply_context()
            return document
        self._transition(document, FiscalDocumentStatus.DRAFT)
        document.error_category, document.error_details, document.status_message = "", [], ""
        document.next_attempt_at, document.attempt_count = None, 0
        await self.session.commit()
        await self._reapply_context()
        return document

    async def _snapshot_pdv_sale(self, sale: PdvSale, sale_items: list[PdvSaleItem]) -> FiscalSnapshot:
        problems: list[str] = list(self.configuration_problems())
        if problems:
            raise FiscalDataError("Configuração fiscal incompleta ou bloqueada.", details=problems)
        store = await self.session.get(Store, sale.store_id)
        store_cnpj = re.sub(r"\D", "", store.cnpj) if store is not None else ""
        if store_cnpj and store_cnpj != self.fiscal.emitter_cnpj_digits:
            raise FiscalDataError(
                "A loja da venda não é o estabelecimento emitente configurado.",
                details=[f"CNPJ da loja {store_cnpj} difere de NFCE_CNPJ."],
            )
        if Decimal(sale.delivery_fee_amount or 0) > 0:
            raise FiscalDataError(
                "Venda com taxa de entrega: o tratamento fiscal da taxa depende de definição do contador.",
                details=["Taxa de entrega não é emitida na NFC-e de mercadorias sem decisão contábil."],
            )
        if not sale_items:
            raise FiscalDataError("A venda não possui itens.")

        inventory_items: dict[str, InventoryItem] = {}
        for line in sale_items:
            if line.inventory_item_id is None:
                raise FiscalDataError("Item da venda sem vínculo com o estoque.", details=[line.item_name_snapshot])
            item = await self.session.get(InventoryItem, line.inventory_item_id)
            if item is None:
                raise FiscalDataError("Item do estoque não encontrado.", details=[line.item_name_snapshot])
            inventory_items[line.id] = item
        profiles = await self.repository.profiles_by_product([str(i.product_id) for i in inventory_items.values()])

        lines: list[tuple[PdvSaleItem, InventoryItem, TaxProfile, Decimal, Decimal]] = []
        blockers: list[str] = []
        for line in sale_items:
            item = inventory_items[line.id]
            profile = profiles.get(str(item.product_id))
            gross = money(Decimal(line.quantity) * Decimal(line.unit_price))
            item_discount = money(gross - Decimal(line.line_total))
            if item_discount < 0:
                raise FiscalDataError("Valor da linha maior que quantidade x preço.", details=[line.item_name_snapshot])
            if profile is None:
                blockers.append(f"Produto {item.sku} - {line.item_name_snapshot}: sem cadastro fiscal (NCM, CFOP, CST/CSOSN...)")
                continue
            tax = self._tax_from_profile(profile)
            missing = missing_tax_fields(tax, crt=self.fiscal.nfce_crt)
            if missing:
                blockers.append(f"Produto {item.sku} - {line.item_name_snapshot}: faltam " + ", ".join(missing))
                continue
            lines.append((line, item, tax, gross, item_discount))
        if blockers:
            raise FiscalDataError("Dados fiscais ausentes: não foi possível emitir a NFC-e.", details=blockers)

        sale_discount = money(Decimal(sale.discount_amount or 0) + Decimal(sale.cashback_applied_amount or 0))
        gross_total = sum((g for _, _, _, g, _ in lines), Decimal("0.00"))
        item_discount_total = sum((d for *_, d in lines), Decimal("0.00"))
        expected_total = money(gross_total - item_discount_total - sale_discount)
        if expected_total != money(Decimal(sale.total_amount or 0)):
            raise FiscalDataError(
                "O total da venda não fecha com os itens e descontos.",
                details=[f"itens={expected_total} venda={money(Decimal(sale.total_amount or 0))}"],
            )
        net_lines = [g - d for *_, g, d in lines]
        shares = apportion_discount(net_lines, sale_discount)
        items = [
            ItemData(
                code=item.sku, ean=(item.product.ean_code or "").strip(), description=line.item_name_snapshot,
                quantity=Decimal(line.quantity), unit_price=Decimal(line.unit_price),
                discount=money(item_discount + share), tax=tax,
            )
            for (line, item, tax, _gross, item_discount), share in zip(lines, shares, strict=True)
        ]
        total = money(gross_total - item_discount_total - sale_discount)
        tpag = PAYMENT_METHOD_TO_TPAG.get(sale.payment_method)
        if tpag is None:
            raise FiscalDataError("Forma de pagamento sem código fiscal.", details=[sale.payment_method])
        payments = [PaymentData(tpag=tpag, amount=total, card_integration="2" if tpag in CARD_TPAGS else "")]
        recipient = None
        cpf = re.sub(r"\D", "", sale.customer_document_snapshot or "")
        if sale.include_cpf_on_invoice and cpf and is_valid_cpf(cpf):
            recipient = RecipientData(cpf=cpf, name=sale.customer_display_name)
        return FiscalSnapshot(
            items=items, payments=payments, change_amount=Decimal("0.00"), recipient=recipient,
            additional_info=f"Venda PDV {sale.sale_code}",
        )

    @staticmethod
    def _tax_from_profile(profile: Any) -> TaxProfile:
        return TaxProfile(
            ncm=profile.ncm, cest=profile.cest, cfop=profile.cfop, origin=profile.origin, unit=profile.commercial_unit,
            icms_cst=profile.icms_cst, icms_csosn=profile.icms_csosn, icms_rate=profile.icms_rate,
            pis_cst=profile.pis_cst, pis_rate=profile.pis_rate, cofins_cst=profile.cofins_cst,
            cofins_rate=profile.cofins_rate, cbenef=profile.cbenef, ibscbs_cst=profile.ibscbs_cst,
            ibscbs_cclasstrib=profile.ibscbs_cclasstrib, ibscbs_has_tax_group=profile.ibscbs_has_tax_group,
            ibs_uf_rate=profile.ibs_uf_rate, ibs_mun_rate=profile.ibs_mun_rate, cbs_rate=profile.cbs_rate,
        )

    # ------------------------------------------------------------------------------------
    # Emission worker entrypoint
    # ------------------------------------------------------------------------------------

    async def process_document(self, document_id: str) -> ProcessOutcome | None:
        """Drive one queued document forward; safe to call concurrently, only one caller wins the lease."""

        now = self._clock()
        if not await self.repository.try_lease(document_id, now=now, lease_until=now + timedelta(seconds=LEASE_SECONDS)):
            await self.session.rollback()
            return None
        await self.session.commit()
        await self._reapply_context()
        document = await self.repository.get(document_id)
        if document is None:
            return None
        document.correlation_id = uuid4().hex
        try:
            if document.access_key and document.xml_signed_key and document.status in (
                FiscalDocumentStatus.SENDING.value, FiscalDocumentStatus.PROCESSING.value,
                FiscalDocumentStatus.PENDING_RECOVERY.value, FiscalDocumentStatus.CONTINGENCY.value,
            ):
                document.attempt_count += 1  # every recovery round counts, so backoff grows and the cap is reached
                await self._recover_or_resend(document)
            else:
                await self._emit_new(document)
        except FiscalTransientError as exc:
            self._schedule_retry(document, exc.category, exc.message)
        except FiscalError as exc:
            self._mark_failed(document, exc)
        except Exception:
            logger.exception("fiscal unexpected failure document=%s correlation=%s", document.id, document.correlation_id)
            self._mark_failed(document, FiscalError("Falha inesperada ao emitir a NFC-e. Consulte os logs."))
        finally:
            document.locked_until = None
            await self.session.commit()
            await self._reapply_context()
        return ProcessOutcome(document_id=document.id, status=document.status)

    async def _emit_new(self, document: FiscalDocument) -> None:
        if document.payload_snapshot is None:
            raise FiscalDataError("Documento sem snapshot fiscal.")
        problems = self.configuration_problems()
        if problems:
            raise FiscalDataError("Configuração fiscal incompleta ou bloqueada.", details=problems)
        self._transition(document, FiscalDocumentStatus.VALIDATING)
        snapshot = snapshot_from_dict(document.payload_snapshot)
        await self._assign_number(document)
        self._transition(document, FiscalDocumentStatus.SIGNING)
        signed = await self._build_and_sign(document, snapshot)
        self._transition(document, FiscalDocumentStatus.SENDING)
        document.attempt_count += 1
        await self.session.commit()  # number + key + signed XML are durable BEFORE any network call
        await self._reapply_context()
        await self._transmit(document, signed)

    async def _assign_number(self, document: FiscalDocument) -> None:
        if document.number is not None:
            return
        serie = int(self.fiscal.nfce_serie)
        document.number = await self.repository.allocate_number(
            tenant_id=document.tenant_id, emitter_cnpj=self.fiscal.emitter_cnpj_digits,
            environment=self.fiscal.fiscal_env, model="65", serie=serie, now=self._clock(),
        )
        document.serie = serie
        document.emitter_cnpj = self.fiscal.emitter_cnpj_digits
        document.environment = self.fiscal.fiscal_env
        document.numeric_code = generate_numeric_code(document.number)
        document.document_number = str(document.number)
        document.series_code = f"{serie:03d}"

    async def _build_and_sign(self, document: FiscalDocument, snapshot: FiscalSnapshot) -> str:
        issued_at = self._clock().astimezone(BRASILIA)
        built = build_nfce(
            NfceInput(
                emitter=self._emitter(), tp_amb=self.fiscal.tp_amb, serie=int(document.serie or 0),
                number=int(document.number or 0), numeric_code=document.numeric_code, issued_at=issued_at,
                items=snapshot.items, payments=snapshot.payments,
                qrcode_base_url=self._qrcode_base_url(), consultation_url=self._consultation_url(),
                recipient=snapshot.recipient, change_amount=snapshot.change_amount,
                additional_info=snapshot.additional_info, process_version="farmaura-api/1.0", uf_code=DF_UF_CODE,
            )
        )
        signed = sign_xml(built.xml, "infNFe", self._load_certificate())
        assert_valid_xml("nfe", signed)
        document.access_key = built.access_key
        document.issue_datetime = issued_at.astimezone(UTC)
        document.gross_total_amount = built.total_invoice
        document.qr_code_url = f"{self._qrcode_base_url()}?p={built.access_key}|3|{self.fiscal.tp_amb}"
        document.issue_datetime_label = issued_at.strftime("%d/%m/%Y %H:%M")
        document.xml_signed_key = self._storage_key(document, "signed.xml")
        await self._storage.write(document.xml_signed_key, signed.encode("utf-8"))
        return signed

    async def _transmit(self, document: FiscalDocument, signed_xml: str) -> None:
        started = self._clock()
        try:
            result = await self._get_gateway().authorize(batch_id=str(document.attempt_count or 1), signed_nfe_xml=signed_xml)
        except FiscalTransientError as exc:
            await self._record_attempt(document, "AUTHORIZE", started, None, exc.message, exc.category)
            self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
            self._schedule_retry(document, exc.category, exc.message)
            return
        cstat = result.protocol.cstat if result.protocol else result.cstat
        reason = result.protocol.reason if result.protocol else result.reason
        await self._record_attempt(document, "AUTHORIZE", started, cstat, reason, "")
        await self._apply_authorization(document, signed_xml, result)

    async def _apply_authorization(self, document: FiscalDocument, signed_xml: str, result: messages.AuthorizationResult) -> None:
        protocol = result.protocol
        if protocol is None:
            if is_transient(result.cstat):
                self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
                self._schedule_retry(document, FiscalErrorCategory.SEFAZ_UNAVAILABLE, result.reason)
            else:
                self._reject(document, result.cstat, result.reason)
            return
        if is_authorized(protocol.cstat):
            await self._finalize_authorized(document, signed_xml, protocol)
        elif is_denied(protocol.cstat):
            self._transition(document, FiscalDocumentStatus.DENIED)
            self._set_outcome(document, protocol.cstat, protocol.reason, FiscalErrorCategory.SEFAZ_DENIED)
            document.protocol = protocol.number
        elif protocol.cstat == DUPLICATE_CSTAT:
            await self._consult_and_apply(document, signed_xml, allow_resend=False)
        elif is_transient(protocol.cstat):
            self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
            self._schedule_retry(document, FiscalErrorCategory.SEFAZ_UNAVAILABLE, protocol.reason)
        else:
            self._reject(document, protocol.cstat, protocol.reason)

    # ------------------------------------------------------------------------------------
    # Recovery after timeouts
    # ------------------------------------------------------------------------------------

    async def _recover_or_resend(self, document: FiscalDocument) -> None:
        signed = (await self._storage.read(document.xml_signed_key)).decode("utf-8")
        await self._consult_and_apply(document, signed, allow_resend=True)

    async def _consult_and_apply(self, document: FiscalDocument, signed_xml: str, *, allow_resend: bool) -> None:
        started = self._clock()
        try:
            result = await self._get_gateway().consult(access_key=str(document.access_key))
        except FiscalTransientError as exc:
            await self._record_attempt(document, "CONSULT", started, None, exc.message, exc.category)
            if document.status in _SETTLED:
                raise
            if document.status != FiscalDocumentStatus.PENDING_RECOVERY.value:
                self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
            self._schedule_retry(document, exc.category, exc.message)
            return
        await self._record_attempt(document, "CONSULT", started, result.cstat, result.reason, "")
        document.last_synced_at = self._clock()
        protocol = result.protocol
        if protocol is not None and is_authorized(protocol.cstat):
            await self._finalize_authorized(document, signed_xml, protocol)
            if result.cstat == CONSULT_CANCELED_CSTAT or result.canceled_event_protocol:
                await self._mark_canceled_from_sefaz(document, result)
        elif result.cstat == CONSULT_CANCELED_CSTAT:
            await self._mark_canceled_from_sefaz(document, result)
        elif is_denied(result.cstat) or (protocol is not None and is_denied(protocol.cstat)):
            self._transition(document, FiscalDocumentStatus.DENIED)
            self._set_outcome(document, result.cstat, result.reason, FiscalErrorCategory.SEFAZ_DENIED)
        elif result.cstat == CONSULT_NOT_FOUND_CSTAT and allow_resend:
            await self._resend_same_document(document, signed_xml)
        elif result.cstat == CONSULT_NOT_FOUND_CSTAT:
            self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
            self._schedule_retry(document, FiscalErrorCategory.SEFAZ_UNAVAILABLE, result.reason)
        else:
            if document.status != FiscalDocumentStatus.PENDING_RECOVERY.value:
                self._transition(document, FiscalDocumentStatus.PENDING_RECOVERY)
            self._schedule_retry(document, FiscalErrorCategory.SEFAZ_UNAVAILABLE, result.reason)

    async def _resend_same_document(self, document: FiscalDocument, signed_xml: str) -> None:
        """SEFAZ confirmed it never received this key: re-send the very same signed XML (or re-sign if stale)."""

        age = self._clock() - (self._as_utc(document.issue_datetime) or self._clock())
        if age > timedelta(minutes=STALE_SIGNED_XML_MINUTES) and document.payload_snapshot is not None:
            signed_xml = await self._build_and_sign(document, snapshot_from_dict(document.payload_snapshot))
        self._transition(document, FiscalDocumentStatus.SENDING)
        await self.session.commit()
        await self._reapply_context()
        await self._transmit(document, signed_xml)

    # ------------------------------------------------------------------------------------
    # Reconciliation (admin)
    # ------------------------------------------------------------------------------------

    async def sync_document(self, document_id: str) -> FiscalDocument:
        """Ask SEFAZ about one document and correct the local state to match the official answer."""

        document = await self.get_document(document_id=document_id)
        if not document.access_key:
            raise HTTPException(status.HTTP_409_CONFLICT, "O documento ainda não possui chave de acesso para consultar.")
        if document.status == FiscalDocumentStatus.LEGACY_SIMULATED.value:
            raise HTTPException(status.HTTP_409_CONFLICT, "Documento simulado do protótipo: não existe na SEFAZ.")
        signed = ""
        if document.xml_signed_key:
            signed = (await self._storage.read(document.xml_signed_key)).decode("utf-8")
        try:
            await self._consult_and_apply(document, signed, allow_resend=False)
        except FiscalTransientError as exc:
            await self.session.commit()
            await self._reapply_context()
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "SEFAZ indisponível. Tente consultar novamente.") from exc
        except FiscalError as exc:
            if document.status in _SETTLED:
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "A SEFAZ retornou uma resposta inválida na consulta.") from exc
            self._mark_failed(document, exc)
        await self.session.commit()
        await self._reapply_context()
        return document

    async def reconcile_pending(self, *, limit: int = 100) -> int:
        """Sync every document whose state may be stale; returns how many were checked."""

        checked = 0
        for document in await self.repository.list_reconcilable(limit=limit):
            try:
                await self.sync_document(document.id)
                checked += 1
            except HTTPException:
                continue
        return checked

    # ------------------------------------------------------------------------------------
    # Cancellation and inutilization
    # ------------------------------------------------------------------------------------

    def cancel_deadline(self, document: FiscalDocument) -> datetime | None:
        """Return until when the operator may cancel (SEFAZ stays the final authority)."""

        authorized_at = self._as_utc(document.authorization_datetime)
        if authorized_at is None:
            return None
        return authorized_at + timedelta(minutes=self.fiscal.nfce_cancel_window_minutes)

    async def cancel_document(self, *, document_id: str, justification: str, actor_user_id: str) -> FiscalDocument:
        """Cancel an authorized NFC-e through the official event."""

        reason = " ".join(justification.split())
        if not MIN_JUSTIFICATION <= len(reason) <= MAX_JUSTIFICATION:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"A justificativa deve ter entre {MIN_JUSTIFICATION} e {MAX_JUSTIFICATION} caracteres.",
            )
        document = await self.get_document(document_id=document_id)
        if document.status != FiscalDocumentStatus.AUTHORIZED.value or not document.protocol or not document.access_key:
            raise HTTPException(status.HTTP_409_CONFLICT, "Somente uma NFC-e autorizada pode ser cancelada.")
        deadline = self.cancel_deadline(document)
        if deadline is not None and self._clock() > deadline:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Prazo de {self.fiscal.nfce_cancel_window_minutes} minutos para cancelamento expirado.",
            )
        sequence = await self.repository.next_event_sequence(
            document_id=document.id, event_type=FiscalEventType.CANCELLATION.value
        )
        certificate = self._load_certificate()
        envelope, event_xml = messages.build_cancellation_event(
            access_key=document.access_key, protocol=document.protocol, justification=reason,
            tp_amb=self.fiscal.tp_amb, cnpj=self.fiscal.emitter_cnpj_digits, uf_code=DF_UF_CODE,
            occurred_at=self._clock().astimezone(BRASILIA), sequence=sequence, batch_id=str(sequence),
            certificate=certificate,
        )
        started = self._clock()
        try:
            result = await self._get_gateway().register_event(event_envelope_xml=envelope)
        except FiscalTransientError as exc:
            await self._record_attempt(document, "CANCEL", started, None, exc.message, exc.category)
            await self.session.commit()
            await self._reapply_context()
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "SEFAZ indisponível. Use 'Consultar SEFAZ' antes de tentar cancelar novamente.",
            ) from exc
        await self._record_attempt(document, "CANCEL", started, result.cstat, result.reason, "")
        if result.cstat not in EVENT_ACCEPTED_CSTATS or result.cstat == 136:
            await self.session.commit()
            await self._reapply_context()
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"A SEFAZ recusou o cancelamento (cStat {result.cstat}): {result.reason}"
            )
        await self.repository.add_event(
            FiscalEvent(
                id=str(uuid4()), tenant_id=document.tenant_id, fiscal_document_id=document.id,
                event_type=FiscalEventType.CANCELLATION.value, sequence=sequence, protocol=result.protocol,
                cstat=result.cstat, message=result.reason[:500], justification=reason,
                created_by_user_id=actor_user_id, xml=event_xml,
            )
        )
        if document.access_key:
            await self._storage.write(
                self._storage_key(document, f"events/cancel-{sequence:02d}.xml"), event_xml.encode("utf-8")
            )
        self._transition(document, FiscalDocumentStatus.CANCELED)
        document.canceled_at = self._clock()
        self._set_outcome(document, result.cstat, result.reason, None)
        await self.session.commit()
        await self._reapply_context()
        logger.info("fiscal cancel document=%s cstat=%s", document.id, result.cstat)
        return document

    async def inutilize(
        self, *, tenant_id: str, first_number: int, last_number: int, justification: str, actor_user_id: str,
    ) -> FiscalInutilization:
        """Formally void a range of numbers that will never be used."""

        reason = " ".join(justification.split())
        if not MIN_JUSTIFICATION <= len(reason) <= MAX_JUSTIFICATION:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"A justificativa deve ter entre {MIN_JUSTIFICATION} e {MAX_JUSTIFICATION} caracteres.",
            )
        if first_number < 1 or last_number < first_number or last_number > 999_999_999:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Faixa de numeração inválida.")
        problems = self.configuration_problems()
        if problems:
            raise HTTPException(status.HTTP_409_CONFLICT, "; ".join(problems))
        serie = int(self.fiscal.nfce_serie)
        cnpj = self.fiscal.emitter_cnpj_digits
        next_number = await self.repository.peek_next_number(
            emitter_cnpj=cnpj, environment=self.fiscal.fiscal_env, model="65", serie=serie
        )
        if last_number >= next_number:
            raise HTTPException(status.HTTP_409_CONFLICT, "A faixa inclui números que ainda não foram utilizados.")
        clashing = await self.repository.documents_in_number_range(
            emitter_cnpj=cnpj, environment=self.fiscal.fiscal_env, serie=serie, first=first_number, last=last_number
        )
        if clashing:
            numbers = ", ".join(str(d.number) for d in clashing[:10])
            raise HTTPException(status.HTTP_409_CONFLICT, f"A faixa contém números com documento fiscal: {numbers}.")
        xml = messages.build_inutilization(
            tp_amb=self.fiscal.tp_amb, uf_code=DF_UF_CODE, year=self._clock().astimezone(BRASILIA).year, cnpj=cnpj,
            serie=serie, first_number=first_number, last_number=last_number, justification=reason,
            certificate=self._load_certificate(),
        )
        record = FiscalInutilization(
            id=str(uuid4()), tenant_id=tenant_id, environment=self.fiscal.fiscal_env, emitter_cnpj=cnpj,
            serie=serie, number_start=first_number, number_end=last_number, justification=reason,
            status="REQUESTED", requested_by_user_id=actor_user_id, xml=xml,
        )
        try:
            result = await self._get_gateway().inutilize(inutilization_xml=xml)
        except FiscalTransientError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "SEFAZ indisponível. Tente novamente em instantes.") from exc
        record.cstat, record.message, record.protocol = result.cstat, result.reason[:500], result.protocol
        record.status = "ACCEPTED" if result.cstat == INUTILIZATION_ACCEPTED_CSTAT else "REJECTED"
        await self.repository.add_inutilization(record)
        await self.session.commit()
        await self._reapply_context()
        return record

    # ------------------------------------------------------------------------------------
    # Reads, downloads, printing
    # ------------------------------------------------------------------------------------

    async def get_document(self, *, document_id: str) -> FiscalDocument:
        """Return one fiscal document by identifier or fail closed."""

        document = await self.repository.get(document_id)
        if document is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiscal document not found.")
        return document

    async def read_document_file(self, document: FiscalDocument, kind: str) -> tuple[bytes, str, str]:
        """Return `(content, media_type, filename)` for `xml` or `pdf` of an authorized document."""

        if document.status not in (FiscalDocumentStatus.AUTHORIZED.value, FiscalDocumentStatus.CANCELED.value) or not document.xml_authorized_key:
            raise HTTPException(status.HTTP_409_CONFLICT, "A NFC-e ainda não foi autorizada pela SEFAZ.")
        xml_bytes = await self._storage.read(document.xml_authorized_key)
        if kind == "xml":
            return xml_bytes, "application/xml", f"NFCe-{document.access_key}.xml"
        pdf = render_danfe_pdf(parse_danfe_data(xml_bytes.decode("utf-8")))
        return pdf, "application/pdf", f"NFCe-{document.access_key}.pdf"

    async def render_printable_html(self, document: FiscalDocument) -> str:
        """Return the print-ready HTML: DANFE for real notes, the old layout only for legacy simulated rows."""

        if document.status == FiscalDocumentStatus.LEGACY_SIMULATED.value:
            return self.notification_service.render_fiscal_document_html(document=document)
        if not document.xml_authorized_key:
            raise HTTPException(status.HTTP_409_CONFLICT, "A NFC-e ainda não foi autorizada pela SEFAZ.")
        xml = (await self._storage.read(document.xml_authorized_key)).decode("utf-8")
        return render_danfe_html(parse_danfe_data(xml))

    def serialize_document(self, document: FiscalDocument) -> FiscalDocumentResponse:
        """Convert one fiscal document ORM row into the API payload."""

        legacy = document.status == FiscalDocumentStatus.LEGACY_SIMULATED.value
        deadline = self.cancel_deadline(document) if document.status == FiscalDocumentStatus.AUTHORIZED.value else None
        return FiscalDocumentResponse(
            id=document.id, document_type=document.document_type, source_channel=document.source_channel,
            status=document.status, environment=document.environment or "", number=document.number,
            serie=document.serie, cstat=document.cstat, status_message=document.status_message or "",
            protocol=document.protocol or "", authorization_datetime=document.authorization_datetime,
            document_number=document.document_number, access_key=document.access_key or "",
            series_code=document.series_code or "", issue_datetime_label=document.issue_datetime_label,
            payment_method_snapshot=document.payment_method_snapshot,
            recipient_name_snapshot=document.recipient_name_snapshot,
            recipient_document_snapshot=document.recipient_document_snapshot,
            gross_total_amount=float(document.gross_total_amount or 0),
            approximate_tax_amount=float(document.approximate_tax_amount or 0),
            authorized=bool(document.authorized) if legacy else document.status == FiscalDocumentStatus.AUTHORIZED.value,
            printable_html_url=f"/api/v1/fiscal/nfce/{document.id}/printable",
            pdf_url=f"/api/v1/fiscal/nfce/{document.id}/pdf" if document.xml_authorized_key else "",
            xml_url=f"/api/v1/fiscal/nfce/{document.id}/xml" if document.xml_authorized_key else "",
            cancel_deadline=deadline, error_category=document.error_category or "",
            error_details=list(document.error_details or []), simulated=legacy,
        )

    async def map_by_order_ids(self, *, order_ids: list[str]) -> dict[str, FiscalDocumentResponse]:
        """Return fiscal documents keyed by order identifier."""

        if not order_ids:
            return {}
        rows = (await self.session.execute(select(FiscalDocument).where(FiscalDocument.order_id.in_(order_ids)))).scalars().all()
        return {row.order_id: self.serialize_document(row) for row in rows if row.order_id}

    async def map_by_pdv_sale_ids(self, *, pdv_sale_ids: list[str]) -> dict[str, FiscalDocumentResponse]:
        """Return fiscal documents keyed by PDV sale identifier."""

        if not pdv_sale_ids:
            return {}
        rows = (
            await self.session.execute(select(FiscalDocument).where(FiscalDocument.pdv_sale_id.in_(pdv_sale_ids)))
        ).scalars().all()
        return {row.pdv_sale_id: self.serialize_document(row) for row in rows if row.pdv_sale_id}

    async def get_document_html_by_order_id(self, *, order_id: str) -> str:
        """Return the printable HTML for the fiscal document linked to one order.

        Caller is responsible for confirming the order belongs to whoever is asking; this method only resolves
        `FiscalDocument.order_id` and never accepts a bare document id.
        """

        document = (
            await self.session.execute(select(FiscalDocument).where(FiscalDocument.order_id == order_id).limit(1))
        ).scalar_one_or_none()
        if document is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiscal document not found for this order.")
        return await self.render_printable_html(document)

    async def send_document_email(self, *, document_id: str, email: str, also_whatsapp: bool) -> FiscalDocumentEmailResponse:
        """Send one fiscal document by e-mail."""

        document = await self.get_document(document_id=document_id)
        if document.status not in (FiscalDocumentStatus.AUTHORIZED.value, FiscalDocumentStatus.LEGACY_SIMULATED.value):
            raise HTTPException(status.HTTP_409_CONFLICT, "Só é possível enviar por e-mail uma NFC-e autorizada.")
        sent, message = self.notification_service.send_fiscal_document_email(
            document=document, email=email.strip(), printable_html_url=f"/api/v1/fiscal/nfce/{document.id}/printable",
        )
        if sent and also_whatsapp:
            message += " O reenvio por WhatsApp permanece pendente de integração dedicada."
        return FiscalDocumentEmailResponse(id=document.id, email=email.strip(), sent=sent, message=message)

    # ------------------------------------------------------------------------------------
    # Legacy marketplace path (simulated; policy pending, see docs/fiscal/NFCE.md)
    # ------------------------------------------------------------------------------------

    async def issue_for_order(self, *, order: Order, customer: Customer | None) -> FiscalDocument:
        """Issue or return the (simulated) fiscal document associated with one marketplace order.

        Not a real NFC-e: number and key are hashes and nothing is sent to SEFAZ. It is flagged
        LEGACY_SIMULATED so no fiscal screen ever presents it as authorized. Whether marketplace orders should
        get a real fiscal document is a business/accounting decision, not made by this module.
        """

        existing = (
            await self.session.execute(select(FiscalDocument).where(FiscalDocument.order_id == order.id).limit(1))
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        document = FiscalDocument(
            id=str(uuid4()), tenant_id=order.tenant_id, store_id=order.store_id, document_type="nfce",
            source_channel="marketplace", pdv_sale_id=None, order_id=order.id, issued_by_user_id=None,
            customer_id=order.customer_id, status=FiscalDocumentStatus.LEGACY_SIMULATED.value,
            document_number=self._legacy_number(order.order_code), access_key=self._legacy_key(order.id),
            series_code="001", issue_datetime_label=datetime.now(tz=UTC).astimezone().strftime("%d/%m/%Y %H:%M"),
            payment_method_snapshot=order.payment_method_label, recipient_name_snapshot=order.customer_display_name,
            recipient_document_snapshot=order.customer_document_snapshot,
            gross_total_amount=Decimal(order.total_amount or 0),
            approximate_tax_amount=(Decimal(order.total_amount or 0) * Decimal("0.12")).quantize(Decimal("0.01")),
            authorized=True,
        )
        self.session.add(document)
        await self.session.flush()
        await self._schedule_asaas_invoice(
            order_code=order.order_code, payment_id=str(order.gateway_payment_id or ""),
            gross_total_amount=Decimal(order.total_amount or 0), description=f"Pedido marketplace {order.order_code}",
        )
        return document

    async def _schedule_asaas_invoice(
        self, *, order_code: str, payment_id: str, gross_total_amount: Decimal, description: str,
    ) -> None:
        """Best-effort service-invoice scheduling in Asaas (marketplace only); failures are logged, never raised."""

        if not self.settings.asaas_enabled or not self.settings.asaas_invoice_enabled:
            return
        payload, problems = build_invoice_payload(
            self.settings, payment_id=payment_id, value=gross_total_amount, description=description,
            effective_date=datetime.now(tz=UTC).astimezone(BRASILIA).date(),
        )
        if payload is None:
            logger.warning("asaas invoice skipped order=%s missing=%s", order_code, "; ".join(problems))
            return
        try:
            result = await asyncio.to_thread(self.asaas_client.schedule_invoice, payload)
        except AsaasError as error:
            logger.warning(
                "asaas invoice failed order=%s http=%s reason=%s", order_code, error.status_code, error.message,
            )
            return
        logger.info("asaas invoice scheduled order=%s invoice=%s status=%s", order_code, result.get("id"), result.get("status"))

    @staticmethod
    def _legacy_number(seed: str) -> str:
        return str(int(sha1(str(seed).encode("utf-8")).hexdigest()[:10], 16) % 900000 + 100000)

    @staticmethod
    def _legacy_key(seed: str) -> str:
        return str(int(sha1(str(seed).encode("utf-8")).hexdigest(), 16))[:44].zfill(44)

    # ------------------------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------------------------

    def _emitter(self) -> EmitterData:
        fiscal = self.fiscal
        return EmitterData(
            cnpj=fiscal.emitter_cnpj_digits, state_registration=fiscal.nfce_ie, legal_name=fiscal.nfce_razao_social,
            trade_name=fiscal.nfce_nome_fantasia, crt=fiscal.nfce_crt, street=fiscal.nfce_logradouro,
            number=fiscal.nfce_numero, complement=fiscal.nfce_complemento, district=fiscal.nfce_bairro,
            city_code=fiscal.nfce_codigo_ibge_municipio, city_name=fiscal.nfce_municipio, zip_code=fiscal.nfce_cep,
            phone=fiscal.nfce_telefone,
        )

    def _qrcode_base_url(self) -> str:
        return self.fiscal.nfce_qrcode_url

    def _consultation_url(self) -> str:
        return self.fiscal.nfce_consultation_url

    def _load_certificate(self, *, check_owner: bool = True) -> LoadedCertificate:
        if self._certificate is None:
            self._certificate = load_pkcs12_certificate(
                self.fiscal.certificate_file, self.fiscal.nfce_certificate_password.get_secret_value()
            )
        certificate = self._certificate
        if certificate.is_expired(self._clock()):
            raise FiscalSignatureError("O certificado digital A1 está expirado. Renove-o para emitir NFC-e.")
        owner = certificate.icp_brasil_cnpj()
        if check_owner and owner and owner != self.fiscal.emitter_cnpj_digits:
            raise FiscalSignatureError("O certificado digital pertence a outro CNPJ, diferente de NFCE_CNPJ.")
        return certificate

    def _get_gateway(self) -> SefazGateway:
        if self._gateway is None:
            self._gateway = SefazClient(
                environment=self.fiscal.fiscal_env,
                tls_context=build_tls_client_context(
                    self._load_certificate(),
                    ca_bundle=Path(self.fiscal.nfce_ca_bundle_path) if self.fiscal.nfce_ca_bundle_path else None,
                ),
                uf_code=DF_UF_CODE, timeout_seconds=self.fiscal.nfce_http_timeout_seconds,
            )
        return self._gateway

    def _storage_key(self, document: FiscalDocument, filename: str) -> str:
        access_key = str(document.access_key or "")
        if not _KEY_PATTERN.match(access_key):
            raise FiscalError("Chave de acesso inválida para armazenamento.")
        # Folder by the AAMM inside the key: stable for the whole life of the document, timezone-free.
        return (
            f"{self.fiscal.nfce_storage_prefix}/{document.environment or self.fiscal.fiscal_env}/{document.tenant_id}/"
            f"20{access_key[2:4]}/{access_key[4:6]}/nfce/{access_key}/{filename}"
        )

    async def _reapply_context(self) -> None:
        if self._apply_context is not None:
            await self._apply_context()

    def _transition(self, document: FiscalDocument, target: FiscalDocumentStatus) -> None:
        current = FiscalDocumentStatus(document.status)
        if current in TERMINAL_STATUSES and current != target:
            raise FiscalError(f"Transição fiscal inválida: {current.value} é um estado final.")
        if not can_transition(current, target):
            raise FiscalError(f"Transição fiscal inválida: {current.value} -> {target.value}.")
        document.status = target.value

    def _set_outcome(
        self, document: FiscalDocument, cstat: int | None, message: str, category: FiscalErrorCategory | None,
    ) -> None:
        document.cstat = cstat
        document.status_message = (message or "")[:500]
        document.error_category = category.value if category else ""
        if category is None:
            document.error_details = []

    def _reject(self, document: FiscalDocument, cstat: int, message: str) -> None:
        self._transition(document, FiscalDocumentStatus.REJECTED)
        self._set_outcome(document, cstat, message, FiscalErrorCategory.SEFAZ_REJECTION)
        document.next_attempt_at = None

    def _mark_failed(self, document: FiscalDocument, error: FiscalError) -> None:
        """Record a definitive failure; never touches a document SEFAZ already settled."""

        if document.status in _SETTLED:
            return
        if document.status != FiscalDocumentStatus.ERROR.value and can_transition(
            FiscalDocumentStatus(document.status), FiscalDocumentStatus.ERROR
        ):
            document.status = FiscalDocumentStatus.ERROR.value
        document.status_message = error.message[:500]
        document.error_category = error.category.value
        document.error_details = [str(d)[:300] for d in error.details][:50]
        document.next_attempt_at = None

    def _schedule_retry(self, document: FiscalDocument, category: FiscalErrorCategory, message: str) -> None:
        document.error_category = category.value
        document.status_message = (message or "")[:500]
        if document.attempt_count >= self.fiscal.nfce_max_attempts:
            if can_transition(FiscalDocumentStatus(document.status), FiscalDocumentStatus.ERROR):
                document.status = FiscalDocumentStatus.ERROR.value
            document.status_message = "Tentativas automáticas esgotadas. Use 'Consultar SEFAZ' para reconciliar."
            document.next_attempt_at = None
            return
        delay = min(30 * 2 ** max(document.attempt_count - 1, 0), 3600)
        document.next_attempt_at = self._clock() + timedelta(seconds=delay + random.uniform(0, delay * 0.1))  # noqa: S311

    async def _finalize_authorized(
        self, document: FiscalDocument, signed_xml: str, protocol: messages.Protocol,
    ) -> None:
        if document.status in (FiscalDocumentStatus.AUTHORIZED.value, FiscalDocumentStatus.CANCELED.value) and document.xml_authorized_key:
            return  # the authoritative XML is already stored; never regenerate it
        proc_xml = messages.build_authorized_document(signed_nfe_xml=signed_xml, protocol_xml=protocol.raw_xml)
        assert_valid_xml("procNFe", proc_xml)
        document.xml_authorized_key = self._storage_key(document, "authorized.xml")
        await self._storage.write(document.xml_authorized_key, proc_xml.encode("utf-8"))
        if document.status != FiscalDocumentStatus.AUTHORIZED.value:
            self._transition(document, FiscalDocumentStatus.AUTHORIZED)
        document.protocol = protocol.number
        document.authorization_datetime = self._parse_datetime(protocol.received_at) or self._clock()
        self._set_outcome(document, protocol.cstat, protocol.reason, None)
        document.next_attempt_at = None
        document.authorized = True
        try:
            pdf = render_danfe_pdf(parse_danfe_data(proc_xml))
            document.pdf_key = self._storage_key(document, "danfe.pdf")
            await self._storage.write(document.pdf_key, pdf)
        except Exception:  # the DANFE can always be regenerated from the stored authorized XML
            logger.exception("fiscal danfe generation failed document=%s", document.id)
        logger.info("fiscal authorized document=%s key=%s protocol=%s", document.id, document.access_key, document.protocol)

    async def _mark_canceled_from_sefaz(self, document: FiscalDocument, result: messages.ConsultResult) -> None:
        if document.status != FiscalDocumentStatus.CANCELED.value:
            self._transition(document, FiscalDocumentStatus.CANCELED)
        document.canceled_at = document.canceled_at or self._clock()
        self._set_outcome(document, CONSULT_CANCELED_CSTAT, result.reason, None)

    async def _record_attempt(
        self, document: FiscalDocument, action: str, started: datetime, cstat: int | None, message: str, category: str | FiscalErrorCategory,
    ) -> None:
        finished = self._clock()
        await self.repository.add_attempt(
            FiscalAttempt(
                id=str(uuid4()), tenant_id=document.tenant_id, fiscal_document_id=document.id, action=action,
                attempt=int(document.attempt_count or 0), requested_at=started, responded_at=finished,
                duration_ms=int((finished - started).total_seconds() * 1000), cstat=cstat,
                xmotivo=(message or "")[:500],
                error_category=category.value if isinstance(category, FiscalErrorCategory) else str(category),
                correlation_id=document.correlation_id,
            )
        )
        logger.info(
            "fiscal action=%s document=%s sale=%s key=%s cstat=%s duration_ms=%s correlation=%s",
            action, document.id, document.pdv_sale_id, document.access_key, cstat,
            int((finished - started).total_seconds() * 1000), document.correlation_id,
        )

    @staticmethod
    def _as_utc(value: datetime | None) -> datetime | None:
        """Return `value` as an aware UTC datetime (a naive value is read as UTC, as stored)."""

        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    @classmethod
    def _parse_datetime(cls, value: str) -> datetime | None:
        try:
            return cls._as_utc(datetime.fromisoformat(value)) if value else None
        except ValueError:
            return None


def kick_emission(document_id: str) -> None:
    """Fire-and-forget: ask the worker module to process one document right after its sale commits."""

    from app.services.fiscal_worker import schedule_document

    schedule_document(document_id)


__all__ = ["FiscalService", "ProcessOutcome", "kick_emission"]
