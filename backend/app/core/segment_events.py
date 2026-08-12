"""Centralized event propagation for customer metrics.

Instead of scattering "recompute this customer" calls across every controller
that touches an order, one global hook watches the SQLAlchemy session: any
Order inserted, updated, or deleted — from checkout, admin edits, cancellations,
refunds, anywhere — marks its company dirty, and on commit a background recompute
is enqueued for exactly those companies.

Company field changes (tags, tier, tax status, address) need no recompute: the
segment engine reads those columns live, so the next query already reflects them.

Enqueue failures are swallowed — a metrics refresh must never break a committed
business transaction. Install once at import time (from app.core.database).
"""
from __future__ import annotations

import logging

from sqlalchemy import event
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_KEY = "segment_dirty_companies"


def install_segment_events() -> None:
    @event.listens_for(Session, "after_flush")
    def _collect_dirty_companies(session: Session, flush_context) -> None:
        from app.models.order import Order

        dirty: set = session.info.setdefault(_KEY, set())
        for obj in list(session.new) + list(session.dirty) + list(session.deleted):
            if isinstance(obj, Order):
                cid = getattr(obj, "company_id", None)
                if cid:
                    tid = getattr(obj, "tenant_id", None)
                    dirty.add((str(cid), str(tid) if tid else None))

    @event.listens_for(Session, "after_commit")
    def _dispatch_recompute(session: Session) -> None:
        dirty = session.info.pop(_KEY, None)
        if not dirty:
            return
        for company_id, tenant_id in dirty:
            try:
                from app.tasks.segment_tasks import recompute_customer_metrics_task
                recompute_customer_metrics_task.delay(company_id, tenant_id)
            except Exception as exc:  # noqa: BLE001
                # Broker down / eager mode issue — never break the committed txn.
                logger.warning("segment recompute enqueue failed for %s: %s", company_id, exc)

    @event.listens_for(Session, "after_rollback")
    def _clear_on_rollback(session: Session) -> None:
        session.info.pop(_KEY, None)
