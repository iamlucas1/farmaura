"""
farmaura-api/app/services/inventory_ai_service.py

Inventory AI topic service for Farmaura.

Responsibilities:
- build stock-aware prompts from the Farmaura inventory database;
- constrain provider execution to inventory operations context;
- expose a focused AI workflow for the internal stock module;

Observations:
- stock context is assembled server-side to avoid trusting client-provided inventory snapshots;
- the generic AI service remains provider-focused while this service stays topic-focused.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.ai import AiPromptExecutionResponse, InventoryAiExecutionRequest
from app.schemas.auth import TokenSubject
from app.services.ai_service import AiExecutionRequest, AiService


# ============================================================================
# INVENTORY AI SERVICE
# ============================================================================


class InventoryAiService:
    """Execute inventory-focused AI prompts with live database context."""

    def __init__(self, session: AsyncSession, subject: TokenSubject, settings: Settings) -> None:
        """Store the dependencies required to build inventory context."""

        self.session = session
        self.subject = subject
        self.settings = settings
        self.repository = InventoryRepository(session)
        self.ai_service = AiService(settings)

    async def execute(self, payload: InventoryAiExecutionRequest) -> AiPromptExecutionResponse:
        """Execute an inventory-focused prompt with contextual stock data."""

        store_id = await self.repository.get_primary_store_id(tenant_id=str(self.subject.tenant_id))
        items = await self.repository.list_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            query="",
            stock_status=payload.stock_status,
            controlled_only=payload.controlled_only,
            location_code=payload.location_code,
        )
        movements = await self.repository.list_movements(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            limit=payload.max_movements,
        )
        summary = await self._build_summary(store_id=store_id)
        item_lines = [
            (
                f"- {item.name} | class={item.medication_class_name} | sku={item.sku} | loc={item.storage_location} | "
                f"qty={item.quantity} | min={item.minimum_quantity} | low={item.low_stock_threshold} | "
                f"attention={item.attention_stock_threshold} | normal={item.normal_stock_threshold} | "
                f"batch={item.batch_code or '-'} | expiry={item.expiry_label or '-'} | "
                f"controlled={'yes' if item.is_controlled else 'no'}"
            )
            for item in items[: payload.max_items]
        ]
        movement_lines = [
            (
                f"- {movement.created_at.isoformat()} | item_id={movement.inventory_item_id} | "
                f"type={movement.movement_type} | delta={movement.quantity_delta} | "
                f"before={movement.quantity_before} | after={movement.resulting_quantity} | "
                f"reason={movement.reason or '-'} | from={movement.from_location_code or '-'} | "
                f"to={movement.to_location_code or '-'}"
            )
            for movement in movements
        ]
        context = (
            "Contexto de estoque Farmaura:\n"
            f"- total_items={summary['total_items']}\n"
            f"- normal_stock_items={summary['normal_stock_items']}\n"
            f"- attention_stock_items={summary['attention_stock_items']}\n"
            f"- low_stock_items={summary['low_stock_items']}\n"
            f"- out_of_stock_items={summary['out_of_stock_items']}\n"
            f"- controlled_items={summary['controlled_items']}\n"
            f"- store_id={store_id}\n"
            f"- applied_stock_status_filter={payload.stock_status}\n"
            f"- applied_controlled_only={payload.controlled_only}\n"
            f"- applied_location_code={payload.location_code or 'all'}\n"
            "Itens considerados:\n"
            + ("\n".join(item_lines) if item_lines else "- nenhum item retornado pelo filtro")
            + "\nMovimentacoes recentes:\n"
            + ("\n".join(movement_lines) if movement_lines else "- nenhuma movimentacao recente")
        )
        execution_request = AiExecutionRequest(
            provider=(payload.provider or self.settings.ai_default_provider).strip().lower(),
            model=payload.model,
            prompt=context + "\n\nPergunta do operador:\n" + payload.question.strip(),
            system_prompt=self.settings.ai_inventory_system_prompt,
            temperature=payload.temperature,
            max_output_tokens=payload.max_output_tokens,
        )
        return await self.ai_service.execute_prompt(execution_request)

    async def _build_summary(self, *, store_id: str) -> dict[str, int]:
        """Return the summary counters for inventory AI context."""

        total_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
        )
        normal_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            stock_status="normal",
        )
        attention_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            stock_status="attention",
        )
        low_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            stock_status="low",
        )
        out_of_stock_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            stock_status="out",
        )
        controlled_items = await self.repository.count_items(
            tenant_id=str(self.subject.tenant_id),
            store_id=store_id,
            controlled_only=True,
        )
        return {
            "total_items": total_items,
            "normal_stock_items": normal_stock_items,
            "attention_stock_items": attention_stock_items,
            "low_stock_items": low_stock_items,
            "out_of_stock_items": out_of_stock_items,
            "controlled_items": controlled_items,
        }
