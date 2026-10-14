"""One checkout attempt makes one order.

The checkout page retries a request whose answer was lost (a timeout, a
dropped connection), and the order may already exist by then. A card order
was matched by its PaymentIntent; cash on delivery, ACH and Net 30 had
nothing to match, so the retry made a second order. The page now sends one
key per attempt (`idempotency_key`), and the order's `order_created` event
keeps it in its meta: no column, no migration.

Two requests with the same key wait for each other on a transaction lock, so
the second finds the first's order rather than making another. Both
checkouts make the order and its event in one transaction, committed at the
end, so the lock is held until the order can be found.
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

_KEY = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def clean(key: str | None) -> str | None:
    """The attempt's key, or None when there is none worth trusting."""
    key = (key or "").strip()
    return key if _KEY.match(key) else None


async def already_placed(db: AsyncSession, key: str | None) -> Any | None:
    """The order this attempt already made (lines loaded), or None.

    Takes a lock on the key that lasts until the transaction ends: call it in
    the transaction that will make the order.
    """
    if not key:
        return None
    from sqlalchemy.orm import selectinload

    from app.core.tenant_context import get_current_tenant_id
    from app.models.order import Order

    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
                     {"k": f"order-attempt:{get_current_tenant_id() or ''}:{key}"})
    found = (await db.execute(text("""
        SELECT order_id FROM order_events
         WHERE type = 'order_created' AND meta->>'idempotency_key' = :k
           AND occurred_at > now() - interval '2 days'
         ORDER BY occurred_at LIMIT 1
    """), {"k": key})).first()
    if not found:
        return None
    return (await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == found[0])
    )).scalar_one_or_none()
