"""
farmaura-api/app/services/purchase_quote_ai_service.py

Purchase quote AI import service for Farmaura.

Responsibilities:
- extract structured purchase quote data (supplier, payment terms, items,
  freight, delivery time) from a supplier document using AI;
- support PDF/PNG/JPEG via the multimodal document prompt, and XLSX/DOCX by
  parsing them locally first (no multimodal support exists for those formats)
  and feeding the extracted text/table content through a text prompt;
- persist the human-reviewed result as a purchase quote, including the
  original source document, without ever touching sellable inventory;

Observations:
- Gemini accepts PDF/image inline; OpenAI's document path is image-only, same
  constraint InventoryInvoiceService already works within;
- XLSX/DOCX text extraction is capped to keep prompts within provider limits —
  layouts vary a lot, so the AI still normalizes the extracted table/text into
  the target schema rather than us trying to parse columns ourselves.
"""

from __future__ import annotations

import base64
import json
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from docx import Document as DocxDocument
from fastapi import HTTPException, UploadFile, status
from openpyxl import load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_json import parse_ai_json_object
from app.core.config import Settings
from app.core.file_storage import write_private_file
from app.core.file_validation import validate_quote_upload
from app.repositories.purchase_quote_repository import PurchaseQuoteRepository
from app.schemas.auth import TokenSubject
from app.schemas.purchase_quote import (
    PurchaseQuoteImportConfirmRequest,
    PurchaseQuoteImportPreviewHeaderResponse,
    PurchaseQuoteImportPreviewLineResponse,
    PurchaseQuoteImportPreviewPaymentTermResponse,
    PurchaseQuoteImportPreviewResponse,
    PurchaseQuoteProductCandidateResponse,
    PurchaseQuoteResponse,
)
from app.services.ai_service import AiDocumentExecutionRequest, AiExecutionRequest, AiService
from app.services.purchase_quote_service import PurchaseQuoteService

DOCUMENT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}
LOCAL_PARSE_MAX_CHARS = 20_000

PAYMENT_METHOD_ALIASES: dict[str, str] = {
    "pix": "pix",
    "boleto a vista": "boleto_avista",
    "boleto à vista": "boleto_avista",
    "boleto avista": "boleto_avista",
    "boleto a prazo": "boleto_prazo",
    "boleto parcelado": "boleto_prazo",
    "cartao de credito": "cartao_credito",
    "cartão de crédito": "cartao_credito",
    "cartao credito": "cartao_credito",
    "cartao de debito": "cartao_debito",
    "cartão de débito": "cartao_debito",
    "cartao debito": "cartao_debito",
    "consignado": "consignado",
    "dinheiro": "dinheiro",
    "especie": "dinheiro",
    "espécie": "dinheiro",
    "transferencia": "transferencia",
    "transferência": "transferencia",
    "ted": "transferencia",
    "doc": "transferencia",
}


# ============================================================================
# PURCHASE QUOTE AI SERVICE
# ============================================================================


class PurchaseQuoteAiService:
    """Extract and confirm purchase quote imports for the purchasing module."""

    def __init__(self, session: AsyncSession, subject: TokenSubject, settings: Settings) -> None:
        """Store dependencies required for quote extraction and import."""

        self.session = session
        self.subject = subject
        self.settings = settings
        self.repository = PurchaseQuoteRepository(session)
        self.ai_service = AiService(settings)
        self.quote_service = PurchaseQuoteService(session=session, subject=subject)

    async def preview_quote_import(
        self,
        *,
        file: UploadFile,
        provider: str,
        model: str,
    ) -> PurchaseQuoteImportPreviewResponse:
        """Extract purchase quote data from a supplier document and return a review payload."""

        await validate_quote_upload(file, self.settings)
        content = await file.read(self.settings.max_upload_bytes + 1)
        await file.seek(0)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quote file is empty."
            )
        normalized_provider = (provider or self.settings.ai_default_provider).strip().lower()
        extension = Path(file.filename or "").suffix.lower()

        if extension in DOCUMENT_EXTENSIONS:
            response = await self.ai_service.execute_document_prompt(
                AiDocumentExecutionRequest(
                    provider=normalized_provider,
                    model=model,
                    prompt=self._quote_extraction_prompt(file.filename or "orcamento"),
                    system_prompt=self._quote_system_prompt(),
                    mime_type=file.content_type or "application/octet-stream",
                    file_name=file.filename or "orcamento",
                    file_base64=base64.b64encode(content).decode("ascii"),
                    temperature=0.1,
                    max_output_tokens=4000,
                )
            )
        else:
            extracted_text = (
                self._extract_xlsx_text(content)
                if extension == ".xlsx"
                else self._extract_docx_text(content)
            )
            response = await self.ai_service.execute_prompt(
                AiExecutionRequest(
                    provider=normalized_provider,
                    model=model,
                    prompt=self._quote_extraction_prompt(file.filename or "orcamento")
                    + "\n\nConteudo extraido do arquivo:\n"
                    + extracted_text,
                    system_prompt=self._quote_system_prompt(),
                    temperature=0.1,
                    max_output_tokens=4000,
                )
            )

        parsed = parse_ai_json_object(response.content, error_context="AI quote extraction")
        raw_header = parsed.get("quote")
        payment_terms_payload = parsed.get("payment_terms") or []
        items_payload = parsed.get("items") or []
        if not isinstance(payment_terms_payload, list) or not isinstance(items_payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI quote extraction returned an invalid payload.",
            )
        header_payload: dict[str, object] = raw_header if isinstance(raw_header, dict) else {}

        supplier_name = self._safe_text(header_payload.get("supplier_name"))
        supplier_document = self._safe_text(header_payload.get("supplier_document"))
        matched_supplier = await self.repository.find_supplier_match(
            tenant_id=str(self.subject.tenant_id),
            cnpj=supplier_document,
            name=supplier_name,
        )

        payment_terms = [
            PurchaseQuoteImportPreviewPaymentTermResponse(
                method=self._safe_payment_method(term.get("method")),
                discount_percent=self._safe_optional_decimal(term.get("discount_percent")),
                surcharge_percent=self._safe_optional_decimal(term.get("surcharge_percent")),
                installment_count=self._safe_optional_int(term.get("installment_count")),
                days_to_pay=self._safe_optional_int(term.get("days_to_pay")),
                notes=self._safe_text(term.get("notes")),
            )
            for term in payment_terms_payload
            if isinstance(term, dict)
        ]

        lines: list[PurchaseQuoteImportPreviewLineResponse] = []
        for index, raw_item in enumerate(items_payload, start=1):
            if not isinstance(raw_item, dict):
                continue
            description = self._safe_text(raw_item.get("description"), fallback=f"Item {index}")
            brand_name = self._safe_text(raw_item.get("brand_name"))
            ean_code = self._safe_text(raw_item.get("ean_code"))
            candidates = await self.repository.search_candidate_products(
                tenant_id=str(self.subject.tenant_id),
                query=(description + " " + brand_name).strip(),
                ean_code=ean_code,
                limit=6,
            )
            lines.append(
                PurchaseQuoteImportPreviewLineResponse(
                    line_id=f"line-{index}",
                    description=description,
                    brand_name=brand_name,
                    sku=self._safe_text(raw_item.get("sku")),
                    ean_code=ean_code,
                    unit=self._safe_text(raw_item.get("unit"), fallback="un"),
                    quantity_reference=self._safe_optional_decimal(
                        raw_item.get("quantity_reference")
                    ),
                    unit_price=self._safe_decimal(raw_item.get("unit_price")),
                    is_comodato=self._safe_bool(raw_item.get("is_comodato")),
                    comodato_notes=self._safe_text(raw_item.get("comodato_notes")),
                    match_candidates=[
                        PurchaseQuoteProductCandidateResponse(
                            id=product.id,
                            name=product.name,
                            brand_name=product.brand_name,
                            sku=product.sku,
                            ean_code=product.ean_code,
                        )
                        for product in candidates
                    ],
                )
            )

        return PurchaseQuoteImportPreviewResponse(
            provider=response.provider,
            model=response.model,
            source_file_name=file.filename or "orcamento",
            header=PurchaseQuoteImportPreviewHeaderResponse(
                supplier_name=supplier_name,
                supplier_document=supplier_document,
                matched_supplier_id=matched_supplier.id if matched_supplier is not None else "",
                quote_date=self._safe_text(header_payload.get("quote_date")),
                valid_until=self._safe_text(header_payload.get("valid_until")),
                freight_type=self._safe_freight_type(header_payload.get("freight_type")),
                freight_cost=self._safe_optional_decimal(header_payload.get("freight_cost")),
                delivery_time_days=self._safe_optional_int(
                    header_payload.get("delivery_time_days")
                ),
                notes=self._safe_text(header_payload.get("notes")),
            ),
            payment_terms=payment_terms,
            items=lines,
        )

    async def confirm_quote_import(
        self,
        *,
        payload: PurchaseQuoteImportConfirmRequest,
        file: UploadFile,
    ) -> PurchaseQuoteResponse:
        """Persist the human-reviewed AI extraction result as a confirmed purchase quote."""

        await validate_quote_upload(file, self.settings)
        content = await file.read(self.settings.max_upload_bytes + 1)
        await file.seek(0)
        if not content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Quote file is empty."
            )
        extension = Path(file.filename or "").suffix.lower()
        storage_key = f"{self.subject.tenant_id}/purchase-quotes/{uuid4()}{extension}"
        await write_private_file(settings=self.settings, storage_key=storage_key, content=content)

        quote = self.quote_service.build_quote_entity(
            payload,
            status_value="confirmed",
            source_provider=payload.source_provider,
            source_model=payload.source_model,
            file_name=file.filename or "",
            content_type=file.content_type or "",
            size_bytes=len(content),
            storage_key=storage_key,
        )
        return await self.quote_service.persist_quote(quote)

    # ========================================================================
    # LOCAL DOCUMENT PARSING (XLSX / DOCX)
    # ========================================================================

    def _extract_xlsx_text(self, content: bytes) -> str:
        """Extract a plain-text table representation from an XLSX workbook."""

        try:
            workbook = load_workbook(BytesIO(content), data_only=True, read_only=True)
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not read the XLSX file.",
            ) from error
        lines: list[str] = []
        for sheet in workbook.worksheets:
            lines.append(f"### Planilha: {sheet.title}")
            for row in sheet.iter_rows(values_only=True):
                cells = ["" if value is None else str(value) for value in row]
                if any(cell.strip() for cell in cells):
                    lines.append(" | ".join(cells))
        text = "\n".join(lines)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The XLSX file has no readable content.",
            )
        return text[:LOCAL_PARSE_MAX_CHARS]

    def _extract_docx_text(self, content: bytes) -> str:
        """Extract paragraph and table text from a DOCX document."""

        try:
            document = DocxDocument(BytesIO(content))
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Could not read the DOCX file.",
            ) from error
        lines: list[str] = [
            paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()
        ]
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells]
                if any(cells):
                    lines.append(" | ".join(cells))
        text = "\n".join(lines)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The DOCX file has no readable content.",
            )
        return text[:LOCAL_PARSE_MAX_CHARS]

    # ========================================================================
    # PROMPTS
    # ========================================================================

    def _quote_system_prompt(self) -> str:
        """Return the system prompt for purchase quote extraction."""

        return (
            "Voce extrai dados de orcamentos/cotacoes de fornecedores para uma farmacia, a partir "
            "de documentos, planilhas ou imagens. Responda apenas em JSON valido, sem markdown, "
            "sem comentarios e sem texto adicional. Se um campo nao existir, devolva string "
            "vazia, zero, false ou null conforme o tipo."
        )

    def _quote_extraction_prompt(self, file_name: str) -> str:
        """Build the user prompt used for purchase quote extraction."""

        schema = json.dumps(
            {
                "quote": {
                    "supplier_name": "",
                    "supplier_document": "",
                    "quote_date": "",
                    "valid_until": "",
                    "freight_type": "",
                    "freight_cost": 0,
                    "delivery_time_days": 0,
                    "notes": "",
                },
                "payment_terms": [
                    {
                        "method": "pix",
                        "discount_percent": 0,
                        "surcharge_percent": 0,
                        "installment_count": 0,
                        "days_to_pay": 0,
                        "notes": "",
                    }
                ],
                "items": [
                    {
                        "description": "",
                        "brand_name": "",
                        "sku": "",
                        "ean_code": "",
                        "unit": "un",
                        "quantity_reference": 0,
                        "unit_price": 0,
                        "is_comodato": False,
                        "comodato_notes": "",
                    }
                ],
            },
            ensure_ascii=True,
        )
        return (
            "Analise o orcamento/cotacao de compra enviado e extraia um JSON com a estrutura "
            "exata: " + schema + ". Use numeros sem simbolos monetarios. quote_date e "
            "valid_until no formato AAAA-MM-DD quando for possivel identificar, senao string "
            "vazia. freight_type deve ser 'FOB', 'CIF' ou string vazia. method de cada forma de "
            "pagamento deve ser um destes valores: pix, boleto_avista, boleto_prazo, "
            "cartao_credito, cartao_debito, consignado, dinheiro, transferencia, outro. "
            "is_comodato indica que o item e um equipamento cedido pelo fornecedor (ex.: "
            "geladeira/freezer de marca) e nao um produto comprado; comodato_notes descreve as "
            "condicoes do comodato quando existirem. Considere o arquivo " + file_name + "."
        )

    # ========================================================================
    # NORMALIZATION HELPERS
    # ========================================================================

    def _safe_text(self, value: object, *, fallback: str = "") -> str:
        """Normalize optional text values."""

        return str(value or fallback).strip()

    def _safe_bool(self, value: object) -> bool:
        """Normalize optional truthy values to booleans."""

        if isinstance(value, bool):
            return value
        normalized = str(value or "").strip().lower()
        return normalized in {"1", "true", "yes", "sim"}

    def _safe_decimal(self, value: object) -> Decimal:
        """Normalize optional numeric values to non-negative decimals."""

        try:
            normalized = Decimal(str(value or "0")).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            normalized = Decimal("0.00")
        return normalized if normalized >= Decimal("0.00") else Decimal("0.00")

    def _safe_optional_decimal(self, value: object) -> Decimal | None:
        """Normalize an optional numeric value, keeping None when the AI didn't extract it."""

        if value is None or str(value).strip() == "":
            return None
        try:
            normalized = Decimal(str(value)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            return None
        return normalized if normalized >= Decimal("0.00") else None

    def _safe_optional_int(self, value: object) -> int | None:
        """Normalize an optional integer value, keeping None when the AI didn't extract it."""

        if value is None or str(value).strip() == "":
            return None
        try:
            normalized = int(Decimal(str(value)))
        except (InvalidOperation, ValueError, TypeError):
            return None
        return normalized if normalized >= 0 else None

    def _safe_payment_method(self, value: object) -> str:
        """Normalize a free-text payment method into the supported enum, defaulting to 'outro'."""

        normalized = str(value or "").strip().lower()
        if normalized in PAYMENT_METHOD_ALIASES.values():
            return normalized
        return PAYMENT_METHOD_ALIASES.get(normalized, "outro")

    def _safe_freight_type(self, value: object) -> str:
        """Normalize a free-text freight type into 'FOB', 'CIF', or empty."""

        normalized = str(value or "").strip().upper()
        return normalized if normalized in {"FOB", "CIF"} else ""
