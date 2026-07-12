"""
farmaura-api/app/services/inventory_invoice_service.py

Inventory invoice import service for Farmaura.

Responsibilities:
- extract structured stock data from invoice files using AI;
- prepare invoice review payloads with candidate item matches;
- persist confirmed invoice lines into inventory items and movements;

Observations:
- invoice review stays server-authoritative for candidate matching;
- document extraction currently favors Gemini for PDFs and OpenAI for images.
"""

from __future__ import annotations

import base64
import json
import re
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.file_validation import validate_upload
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.auth import TokenSubject
from app.schemas.inventory import (
    InventoryInvoiceCommittedLineResponse,
    InventoryInvoiceConfirmRequest,
    InventoryInvoiceConfirmResponse,
    InventoryInvoiceHeaderResponse,
    InventoryInvoiceMatchCandidateResponse,
    InventoryInvoicePreviewLineResponse,
    InventoryInvoicePreviewResponse,
    InventoryItemCreateRequest,
)
from app.services.ai_service import AiDocumentExecutionRequest, AiService
from app.services.inventory_service import InventoryService


# ============================================================================
# INVENTORY INVOICE SERVICE
# ============================================================================


class InventoryInvoiceService:
    """Extract and confirm invoice imports for inventory operations."""

    def __init__(self, session: AsyncSession, subject: TokenSubject, settings: Settings) -> None:
        """Store dependencies required for invoice extraction and import."""

        self.session = session
        self.subject = subject
        self.settings = settings
        self.repository = InventoryRepository(session)
        self.ai_service = AiService(settings)
        self.inventory_service = InventoryService(session=session, subject=subject)

    async def preview_invoice_import(
        self,
        *,
        file: UploadFile,
        provider: str,
        model: str,
    ) -> InventoryInvoicePreviewResponse:
        """Extract invoice data and return a review payload."""

        await validate_upload(file, self.settings)
        content = await file.read(self.settings.max_upload_bytes + 1)
        await file.seek(0)
        if not content:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invoice file is empty.")
        normalized_provider = (provider or self.settings.ai_default_provider).strip().lower()
        response = await self.ai_service.execute_document_prompt(
            AiDocumentExecutionRequest(
                provider=normalized_provider,
                model=model,
                prompt=self._invoice_extraction_prompt(file.filename or "invoice"),
                system_prompt=self._invoice_system_prompt(),
                mime_type=file.content_type or "application/octet-stream",
                file_name=file.filename or "invoice",
                file_base64=base64.b64encode(content).decode("ascii"),
                temperature=0.1,
                max_output_tokens=4000,
            )
        )
        parsed = self._parse_extracted_payload(response.content)
        store_id = await self.repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))
        default_location = await self._resolve_default_location(store_id)
        lines: list[InventoryInvoicePreviewLineResponse] = []
        for index, raw_item in enumerate(parsed.get("items") or [], start=1):
            description = self._safe_text(raw_item.get("description"), fallback=f"Item {index}")
            brand_name = self._safe_text(raw_item.get("brand_name"))
            ean_code = self._safe_text(raw_item.get("ean_code"))
            batch_code = self._safe_text(raw_item.get("batch_code"))
            expiry_label = self._safe_text(raw_item.get("expiry_label"))
            quantity = self._safe_int(raw_item.get("quantity"), minimum=0)
            unit_cost = self._safe_decimal(raw_item.get("unit_cost"))
            total_cost = self._safe_decimal(raw_item.get("total_cost"), fallback=unit_cost * Decimal(max(quantity, 1)))
            acquisition_cost = self._calculate_acquisition_cost(
                quantity=quantity,
                unit_cost=unit_cost,
                total_cost=total_cost,
            )
            candidates = await self.repository.search_candidate_items(
                tenant_id=str(self.subject.tenant_id),
                store_id=store_id,
                ean_code=ean_code,
                query=(description + " " + brand_name).strip(),
                limit=6,
            )
            first_candidate = candidates[0] if candidates else None
            suggested_name = self._safe_text(raw_item.get("name"), fallback=description)
            suggested_brand = self._safe_text(raw_item.get("brand_name"), fallback=first_candidate.brand_name if first_candidate else "")
            suggested_category = self._safe_text(raw_item.get("category_name"), fallback=first_candidate.category_name if first_candidate else "Medicamentos")
            suggested_medication_class = self._safe_text(raw_item.get("medication_class_name"), fallback=first_candidate.medication_class_name if first_candidate else suggested_category)
            suggested_location = self._safe_text(raw_item.get("storage_location_code"), fallback=first_candidate.storage_location if first_candidate else default_location)
            suggested_minimum_quantity = self._safe_int(raw_item.get("minimum_quantity"), minimum=0)
            suggested_low_stock_threshold = self._safe_int(raw_item.get("low_stock_threshold"), minimum=0)
            suggested_attention_stock_threshold = self._safe_int(raw_item.get("attention_stock_threshold"), minimum=0)
            suggested_normal_stock_threshold = self._safe_int(raw_item.get("normal_stock_threshold"), minimum=0)
            suggested_sale_price = self._safe_decimal(raw_item.get("sale_price"), fallback=acquisition_cost)
            suggested_market_reference_price = self._safe_decimal(raw_item.get("market_reference_price"), fallback=suggested_sale_price)
            suggested_discount = self._safe_decimal(raw_item.get("promotional_discount_percent"))
            suggested_controlled = self._safe_bool(raw_item.get("is_controlled"), fallback=bool(first_candidate.is_controlled) if first_candidate else False)
            lines.append(
                InventoryInvoicePreviewLineResponse(
                    line_id=f"line-{index}",
                    description=description,
                    brand_name=brand_name,
                    ean_code=ean_code,
                    batch_code=batch_code,
                    expiry_label=expiry_label,
                    quantity=quantity,
                    unit_cost=unit_cost,
                    total_cost=total_cost,
                    suggested_sku=self._safe_text(raw_item.get("sku")),
                    suggested_name=suggested_name,
                    suggested_brand_name=suggested_brand,
                    suggested_category_name=suggested_category,
                    suggested_medication_class_name=suggested_medication_class,
                    suggested_storage_location_code=suggested_location,
                    suggested_minimum_quantity=suggested_minimum_quantity,
                    suggested_low_stock_threshold=suggested_low_stock_threshold,
                    suggested_attention_stock_threshold=suggested_attention_stock_threshold,
                    suggested_normal_stock_threshold=suggested_normal_stock_threshold,
                    suggested_sale_price=suggested_sale_price,
                    suggested_acquisition_cost=acquisition_cost,
                    suggested_market_reference_price=suggested_market_reference_price,
                    suggested_promotional_discount_percent=suggested_discount,
                    suggested_is_controlled=suggested_controlled,
                    match_candidates=[self._serialize_candidate(item) for item in candidates],
                )
            )
        header_payload = parsed.get("invoice") or {}
        return InventoryInvoicePreviewResponse(
            provider=response.provider,
            model=response.model,
            source_file_name=file.filename or "invoice",
            header=InventoryInvoiceHeaderResponse(
                supplier_name=self._safe_text(header_payload.get("supplier_name")),
                supplier_document=self._safe_text(header_payload.get("supplier_document")),
                invoice_number=self._safe_text(header_payload.get("invoice_number")),
                invoice_series=self._safe_text(header_payload.get("invoice_series")),
                issue_date=self._safe_text(header_payload.get("issue_date")),
                total_amount=self._safe_decimal(header_payload.get("total_amount")),
                notes=self._safe_text(header_payload.get("notes")),
            ),
            items=lines,
        )

    async def confirm_invoice_import(self, payload: InventoryInvoiceConfirmRequest) -> InventoryInvoiceConfirmResponse:
        """Persist confirmed invoice lines as inventory operations."""

        await self.inventory_service._get_store_id()
        reference_code = payload.reference_code.strip() or self._build_reference_code(payload.invoice_number, payload.invoice_series)
        created_count = 0
        updated_count = 0
        skipped_count = 0
        committed: list[InventoryInvoiceCommittedLineResponse] = []
        for line in payload.items:
            if line.action == "skip":
                skipped_count += 1
                continue
            if line.action == "existing":
                if line.matched_item_id.strip() == "":
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Matched inventory item is required for existing actions.")
                item = await self.inventory_service._require_item(line.matched_item_id)
                if line.storage_location_code.strip():
                    await self.inventory_service._ensure_location_exists(line.storage_location_code)
                    item.storage_location = line.storage_location_code
                quantity_before = int(item.quantity)
                quantity_delta = int(line.quantity)
                item.quantity = quantity_before + quantity_delta
                if line.batch_code.strip():
                    item.batch_code = line.batch_code
                if line.expiry_label.strip():
                    item.expiry_label = line.expiry_label
                if line.minimum_quantity >= 0:
                    item.minimum_quantity = int(line.minimum_quantity)
                item.low_stock_threshold = int(line.low_stock_threshold)
                item.attention_stock_threshold = int(line.attention_stock_threshold)
                item.normal_stock_threshold = int(line.normal_stock_threshold)
                item.medication_class_name = line.medication_class_name or item.medication_class_name
                item.sale_price = line.sale_price
                item.acquisition_cost = line.acquisition_cost
                item.market_reference_price = line.market_reference_price
                item.promotional_discount_percent = line.promotional_discount_percent
                item.is_controlled = line.is_controlled
                await self.repository.add_movement(
                    self.inventory_service._build_movement_model(
                        item_id=item.id,
                        movement_type="entry",
                        quantity_delta=quantity_delta,
                        quantity_before=quantity_before,
                        resulting_quantity=int(item.quantity),
                        reason="Invoice import",
                        note=self._build_line_note(payload.note, line.note, payload.supplier_name),
                        reference_code=reference_code,
                        from_location_code="",
                        to_location_code=item.storage_location,
                        unit_cost_snapshot=item.acquisition_cost,
                    )
                )
                updated_count += 1
                committed.append(
                    InventoryInvoiceCommittedLineResponse(
                        line_id=line.line_id,
                        action="existing",
                        inventory_item_id=item.id,
                        item_name=item.name,
                        quantity_delta=quantity_delta,
                        storage_location_code=item.storage_location,
                    )
                )
                continue
            if line.storage_location_code.strip() == "":
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Storage location is required for new invoice items.")
            await self.inventory_service._ensure_location_exists(line.storage_location_code)
            create_payload = InventoryItemCreateRequest(
                sku=line.sku,
                name=line.name or line.ean_code or line.line_id,
                brand_name=line.brand_name,
                category_name=line.category_name or "Medicamentos",
                medication_class_name=line.medication_class_name or "Geral",
                ean_code=line.ean_code,
                storage_location_code=line.storage_location_code,
                batch_code=line.batch_code,
                expiry_label=line.expiry_label,
                initial_quantity=int(line.quantity),
                minimum_quantity=int(line.minimum_quantity),
                low_stock_threshold=int(line.low_stock_threshold),
                attention_stock_threshold=int(line.attention_stock_threshold),
                normal_stock_threshold=int(line.normal_stock_threshold),
                sale_price=line.sale_price,
                acquisition_cost=line.acquisition_cost,
                market_reference_price=line.market_reference_price,
                promotional_discount_percent=line.promotional_discount_percent,
                is_controlled=line.is_controlled,
                note=self._build_line_note(payload.note, line.note, payload.supplier_name),
            )
            item = await self.repository.add_item(self.inventory_service._build_item_model(create_payload))
            if line.quantity > 0:
                await self.repository.add_movement(
                    self.inventory_service._build_movement_model(
                        item_id=item.id,
                        movement_type="initial",
                        quantity_delta=int(line.quantity),
                        quantity_before=0,
                        resulting_quantity=int(line.quantity),
                        reason="Invoice import",
                        note=self._build_line_note(payload.note, line.note, payload.supplier_name),
                        reference_code=reference_code,
                        from_location_code="",
                        to_location_code=line.storage_location_code,
                        unit_cost_snapshot=line.acquisition_cost,
                    )
                )
            created_count += 1
            committed.append(
                InventoryInvoiceCommittedLineResponse(
                    line_id=line.line_id,
                    action="new",
                    inventory_item_id=item.id,
                    item_name=item.name,
                    quantity_delta=int(line.quantity),
                    storage_location_code=item.storage_location,
                )
            )
        await self.session.commit()
        return InventoryInvoiceConfirmResponse(
            created_count=created_count,
            updated_count=updated_count,
            skipped_count=skipped_count,
            reference_code=reference_code,
            items=committed,
        )

    async def _resolve_default_location(self, store_id: str) -> str:
        """Return the first available location code for the store."""

        locations = await self.repository.list_locations(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
        )
        return locations[0].code if locations else ""

    def _serialize_candidate(self, item) -> InventoryInvoiceMatchCandidateResponse:
        """Serialize a candidate inventory item match."""

        return InventoryInvoiceMatchCandidateResponse(
            id=item.id,
            sku=item.sku,
            name=item.name,
            brand_name=item.brand_name,
            medication_class_name=item.medication_class_name,
            ean_code=item.ean_code,
            storage_location_code=item.storage_location,
            current_quantity=int(item.quantity),
            minimum_quantity=int(item.minimum_quantity),
            low_stock_threshold=int(item.low_stock_threshold),
            attention_stock_threshold=int(item.attention_stock_threshold),
            normal_stock_threshold=int(item.normal_stock_threshold),
            is_controlled=bool(item.is_controlled),
        )

    def _invoice_system_prompt(self) -> str:
        """Return the system prompt for invoice extraction."""

        return (
            "Voce extrai dados de notas fiscais farmacêuticas para entrada de estoque. "
            "Responda apenas em JSON valido, sem markdown, sem comentarios e sem texto adicional. "
            "Se um campo nao existir, devolva string vazia, zero ou false conforme o tipo."
        )

    def _invoice_extraction_prompt(self, file_name: str) -> str:
        """Build the user prompt used for invoice extraction."""

        schema = json.dumps(
            {
                "invoice": {
                    "supplier_name": "",
                    "supplier_document": "",
                    "invoice_number": "",
                    "invoice_series": "",
                    "issue_date": "",
                    "total_amount": 0,
                    "notes": "",
                },
                "items": [
                    {
                        "description": "",
                        "name": "",
                        "brand_name": "",
                        "category_name": "Medicamentos",
                        "medication_class_name": "Geral",
                        "ean_code": "",
                        "batch_code": "",
                        "expiry_label": "",
                        "quantity": 0,
                        "unit_cost": 0,
                        "total_cost": 0,
                        "sku": "",
                        "storage_location_code": "",
                        "minimum_quantity": 0,
                        "low_stock_threshold": 0,
                        "attention_stock_threshold": 0,
                        "normal_stock_threshold": 0,
                        "sale_price": 0,
                        "market_reference_price": 0,
                        "promotional_discount_percent": 0,
                        "is_controlled": False,
                    }
                ],
            },
            ensure_ascii=True,
        )
        return (
            "Analise o arquivo de nota fiscal enviado e extraia um JSON com a estrutura exata: "
            + schema
            + ". Use numeros sem simbolos monetarios. Use expiry_label no formato MM/AAAA quando houver. "
            + "Considere o arquivo "
            + file_name
            + "."
        )

    def _parse_extracted_payload(self, content: str) -> dict[str, object]:
        """Parse the JSON body returned by the AI model."""

        cleaned = str(content or "").strip()
        fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
        if fenced_match:
            cleaned = fenced_match.group(1).strip()
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError:
            object_match = re.search(r"(\{.*\})", cleaned, flags=re.DOTALL)
            if not object_match:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI invoice extraction did not return valid JSON.")
            try:
                payload = json.loads(object_match.group(1))
            except json.JSONDecodeError as error:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI invoice extraction returned malformed JSON.") from error
        if not isinstance(payload, dict):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI invoice extraction returned an invalid payload.")
        payload.setdefault("invoice", {})
        payload.setdefault("items", [])
        if not isinstance(payload["items"], list):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI invoice extraction items must be a list.")
        return payload

    def _build_reference_code(self, invoice_number: str, invoice_series: str) -> str:
        """Build the stock movement reference code for an invoice import."""

        number = self._safe_text(invoice_number)
        series = self._safe_text(invoice_series)
        if number and series:
            return f"NF-{series}-{number}"[:64]
        if number:
            return f"NF-{number}"[:64]
        return "NF-IMPORT"

    def _build_line_note(self, base_note: str, line_note: str, supplier_name: str) -> str:
        """Build the persisted operation note for one imported line."""

        chunks = [self._safe_text(base_note), self._safe_text(line_note)]
        supplier = self._safe_text(supplier_name)
        if supplier:
            chunks.append("Supplier: " + supplier)
        return " | ".join(chunk for chunk in chunks if chunk)[:500]

    def _calculate_acquisition_cost(self, *, quantity: int, unit_cost: Decimal, total_cost: Decimal) -> Decimal:
        """Calculate the per-unit acquisition cost from invoice quantity and purchase total."""

        if quantity > 0 and total_cost > Decimal("0.00"):
            return (total_cost / Decimal(quantity)).quantize(Decimal("0.01"))
        return self._safe_decimal(unit_cost)

    def _safe_text(self, value: object, *, fallback: str = "") -> str:
        """Normalize optional text values."""

        return str(value or fallback).strip()

    def _safe_int(self, value: object, *, minimum: int = 0) -> int:
        """Normalize optional numeric values to integers."""

        try:
            normalized = int(Decimal(str(value or 0)))
        except (InvalidOperation, ValueError, TypeError):
            normalized = minimum
        return max(minimum, normalized)

    def _safe_decimal(self, value: object, *, fallback: Decimal | None = None) -> Decimal:
        """Normalize optional numeric values to decimals."""

        if fallback is None:
            fallback = Decimal("0.00")
        try:
            normalized = Decimal(str(value or fallback)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError, TypeError):
            normalized = fallback
        return normalized if normalized >= Decimal("0.00") else Decimal("0.00")

    def _safe_bool(self, value: object, *, fallback: bool = False) -> bool:
        """Normalize optional truthy values to booleans."""

        if isinstance(value, bool):
            return value
        normalized = str(value or "").strip().lower()
        if normalized in {"1", "true", "yes", "sim"}:
            return True
        if normalized in {"0", "false", "no", "nao", "não"}:
            return False
        return fallback
