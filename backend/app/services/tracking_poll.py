"""Asking the couriers where parcels are (Retail launch, package 2).

Every 30 minutes, one worker (Redis lock) takes the shipments whose
`next_check_at` has come, shop by shop with that shop's own Shippo key (the
platform's when the shop has none; Shippo does not bill tracking), and moves
each on with what the courier says. At most one courier call a second.
A parcel Shippo cannot track (no known courier) is not asked again; the shop
sets its status by hand. When the last parcel of a shipped order is delivered,
the order is delivered and the buyer gets the delivered email.

In-process like the other timed jobs: live runs uvicorn only, no Celery.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TICK_SECONDS = 1800
BATCH = 200
CALL_GAP_SECONDS = 1.0


async def run(*, now: datetime | None = None, call=None, gap: float = CALL_GAP_SECONDS) -> dict:
    """One pass. `call(number, carrier, key)` is the courier lookup (Shippo by
    default), swappable for a check that must not leave the machine."""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping, set_current_tenant
    from app.models.order import Order
    from app.models.shipment import Shipment
    from app.services import shipments
    from app.services.shippo_service import get_shippo_key, shippo_carrier, tracking_status

    now = now or datetime.now(timezone.utc)
    call = call or tracking_status
    asked = moved = failed = 0
    delivered_orders: list = []

    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            due = (await db.execute(
                select(Shipment).where(Shipment.next_check_at.isnot(None), Shipment.next_check_at <= now)
                .order_by(Shipment.next_check_at).limit(BATCH)
            )).scalars().all()
            by_shop: dict = defaultdict(list)
            for s in due:
                by_shop[s.tenant_id].append(s)
            for tenant_id, parcels in by_shop.items():
                try:
                    key = await get_shippo_key(db, tenant_id)
                except Exception:  # noqa: BLE001
                    key = None
                for s in parcels:
                    token = shippo_carrier(s.carrier)
                    if token is None:
                        s.next_check_at = None      # nothing to ask; the shop sets it by hand
                        continue
                    result = await asyncio.to_thread(call, s.tracking_number, token, key)
                    asked += 1
                    if gap:
                        await asyncio.sleep(gap)
                    if result.get("error"):
                        failed += 1
                        s.last_checked_at = now
                        s.next_check_at = shipments.next_check(s.status, s.shipped_at, now)
                        continue
                    status = shipments.from_courier(result.get("status"), result.get("substatus"))
                    if status == "unknown" and s.status != "unknown":
                        # "No news yet" is not news: keep what we knew.
                        s.last_checked_at = now
                        s.next_check_at = shipments.next_check(s.status, s.shipped_at, now)
                        continue
                    was_shipped_order = None
                    if status == "delivered":
                        was_shipped_order = (await db.execute(
                            select(Order.status).where(Order.id == s.order_id))).scalar_one_or_none() == "shipped"
                    if await shipments.set_status(db, s, status, source="courier", note=result.get("detail"), at=now):
                        moved += 1
                        if was_shipped_order:
                            order = await db.get(Order, s.order_id)
                            if order is not None and order.status == "delivered":
                                delivered_orders.append(order)
                await db.commit()

            for order in delivered_orders:
                try:
                    set_bypass_scoping(False)
                    set_current_tenant(order.tenant_id)
                    # In the shop's name, never the platform's (brand mail identity).
                    from app.core.database import _resolve_brand_name, _resolve_brand_site
                    from app.core.tenant_context import set_current_brand_name, set_current_brand_site

                    set_current_brand_name(await _resolve_brand_name(db, order.tenant_id))
                    set_current_brand_site(await _resolve_brand_site(db, order.tenant_id))
                    from app.api.v1.admin.orders import _send_order_status_email

                    await _send_order_status_email(order, "delivered", db)
                except Exception:  # noqa: BLE001
                    logger.exception("Delivered email failed for order %s", order.id)
                finally:
                    set_bypass_scoping(True)
    finally:
        set_bypass_scoping(False)
    if asked:
        logger.info("Tracking: asked %s, moved %s, failed %s, delivered orders %s",
                    asked, moved, failed, len(delivered_orders))
    return {"asked": asked, "moved": moved, "failed": failed, "delivered_orders": len(delivered_orders)}


async def scheduler_loop() -> None:
    await asyncio.sleep(300)  # after boot, off the other loops' minutes
    while True:
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("tracking poll tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def tick(*, use_lock: bool = True) -> dict | None:
    if use_lock:
        from app.core.redis import get_redis_pool

        if not await get_redis_pool().set("tracking:poll", "1", nx=True, ex=TICK_SECONDS - 60):
            return None
    return await run()
