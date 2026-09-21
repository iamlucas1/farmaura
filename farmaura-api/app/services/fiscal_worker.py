"""
farmaura-api/app/services/fiscal_worker.py

NFC-e emission worker for Farmaura.

Responsibilities:
- drain the durable fiscal outbox (`fiscal_documents` in a workable state) on a fixed interval;
- process one document right after its sale commits, so the counter normally sees the result in seconds;
- warn when the A1 certificate is close to expiring;

Observations:
- the queue IS the database: if the process restarts, every queued/pending document is picked up again;
- each document is claimed with a lease (`locked_until`), so several workers or replicas never double-send;
- each document runs in its own short session; a failing one never blocks the others;
- the worker is trusted server code and uses the system-job RLS context, which only the fiscal tables allow;
- with `NFCE_ENABLED` false the loop does nothing at all;
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from app.core.database import SessionFactory
from app.core.fiscal_config import get_fiscal_settings
from app.core.tenant_context import apply_system_job_context
from app.repositories.fiscal_repository import FiscalRepository
from app.services.fiscal_service import FiscalService

logger = logging.getLogger("farmaura.fiscal.worker")

POLL_SECONDS = 20
BATCH_SIZE = 50
MAX_CONCURRENT_DOCUMENTS = 4
CERTIFICATE_CHECK_INTERVAL = timedelta(hours=6)

_running_tasks: set[asyncio.Task[None]] = set()
_last_certificate_check: datetime | None = None


# ============================================================================
# PROCESSING
# ============================================================================


async def process_in_own_session(document_id: str) -> None:
    """Process one document in a fresh system-job session; never raises."""

    try:
        async with SessionFactory() as session:
            await apply_system_job_context(session)

            async def reapply() -> None:
                await apply_system_job_context(session)

            service = FiscalService(session, context_applier=reapply)
            await service.process_document(document_id)
    except Exception:
        logger.exception("fiscal worker failed document=%s", document_id)


def schedule_document(document_id: str) -> None:
    """Fire-and-forget processing of one document (called right after the sale commits)."""

    if not get_fiscal_settings().nfce_enabled:
        return
    try:
        task = asyncio.get_running_loop().create_task(process_in_own_session(document_id))
    except RuntimeError:  # no running loop: the periodic tick will pick the document up
        return
    _running_tasks.add(task)
    task.add_done_callback(_running_tasks.discard)


async def run_fiscal_worker_tick() -> int:
    """Process every workable document once; returns how many were attempted."""

    if not get_fiscal_settings().nfce_enabled:
        return 0
    async with SessionFactory() as session:
        await apply_system_job_context(session)
        document_ids = await FiscalRepository(session).list_workable_ids(now=datetime.now(UTC), limit=BATCH_SIZE)
    gate = asyncio.Semaphore(MAX_CONCURRENT_DOCUMENTS)

    async def run(document_id: str) -> None:
        async with gate:
            await process_in_own_session(document_id)

    await asyncio.gather(*(run(document_id) for document_id in document_ids))
    await _warn_about_certificate()
    return len(document_ids)


async def run_fiscal_worker_forever() -> None:
    """Run the emission worker forever."""

    while True:
        try:
            await run_fiscal_worker_tick()
        except Exception:
            logger.exception("fiscal worker tick failed")
        await asyncio.sleep(POLL_SECONDS)


async def _warn_about_certificate() -> None:
    global _last_certificate_check
    now = datetime.now(UTC)
    if _last_certificate_check is not None and now - _last_certificate_check < CERTIFICATE_CHECK_INTERVAL:
        return
    _last_certificate_check = now
    try:
        async with SessionFactory() as session:
            info = await FiscalService(session).module_status()
    except Exception:
        logger.exception("fiscal certificate check failed")
        return
    certificate = info.get("certificate") or {}
    if certificate and not certificate.get("ok"):
        logger.error("fiscal certificate invalid or expired: %s", certificate.get("message", "expired"))
    elif certificate.get("expiring_soon"):
        logger.warning("fiscal certificate expires in %s day(s)", certificate.get("days_until_expiry"))
