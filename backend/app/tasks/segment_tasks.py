"""Background recompute of a single customer's metrics.

Enqueued (never run inline on the request) whenever one of a company's orders
changes — see app.core.segment_events. Recomputes exactly one company, so a busy
store's order traffic never triggers a full-table pass. Idempotent.
"""
import asyncio
import logging
import uuid

from app.core.celery import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="segments.recompute_customer_metrics")
def recompute_customer_metrics_task(company_id: str, tenant_id: str | None = None) -> dict:
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.core.tenant_context import set_current_tenant
        from app.services.metrics_service import recompute_company_metrics

        if tenant_id:
            set_current_tenant(uuid.UUID(tenant_id))
        async with AsyncSessionLocal() as db:
            await recompute_company_metrics(db, uuid.UUID(company_id))
            await db.commit()
        return {"company_id": company_id}

    try:
        return asyncio.get_event_loop().run_until_complete(_run())
    except Exception as exc:  # noqa: BLE001
        logger.error("recompute_customer_metrics failed for %s: %s", company_id, exc, exc_info=True)
        return {"company_id": company_id, "error": str(exc)}
