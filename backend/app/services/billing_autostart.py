"""Brands with a card on file and no plan, put on their plan every hour.

A card goes on file in Stripe's billing portal, and nothing there starts a
plan (BillingService.start_from_card_on_file says why that left brands
unbilled). The brand's billing page starts it when they come back from the
portal; this starts it for a brand that never comes back.

In-process, like the supplier sync: the deployment runs uvicorn only, with no
Celery beat to schedule it. Every web worker runs the loop and a Redis lock
lets one of them act on each tick.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)

TICK_SECONDS = 3600

# A brand that might have a card and no plan: it has a Stripe customer (made
# the first time it opened Checkout or the portal) and nothing paying on record.
_CANDIDATES = """
    SELECT t.slug
      FROM tenant_subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
     WHERE t.status = 'active'
       AND s.stripe_customer_id IS NOT NULL
       AND (s.stripe_subscription_id IS NULL OR s.status NOT IN ('active', 'trialing', 'past_due'))
     ORDER BY t.slug
"""


async def scheduler_loop() -> None:
    await asyncio.sleep(120)  # let the app finish booting first
    while True:
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("billing autostart tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def tick(*, use_lock: bool = True) -> list[dict]:
    """One pass over the candidates; what happened to each."""
    from app.core.database import AsyncSessionLocal
    from app.core.redis import get_redis_pool
    from app.core.tenant_context import set_bypass_scoping
    from app.services.billing_service import BillingService

    if use_lock and not await get_redis_pool().set("billing:autostart", "1", nx=True, ex=TICK_SECONDS - 60):
        return []

    set_bypass_scoping(True)  # every brand's billing row
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
            slugs = [r[0] for r in (await db.execute(text(_CANDIDATES))).all()]
    finally:
        set_bypass_scoping(False)

    results: list[dict] = []
    for slug in slugs:
        set_bypass_scoping(True)
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
                try:
                    outcome = await BillingService(db).start_from_card_on_file(slug)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("billing autostart: %s could not be started", slug)
                    outcome = {"started": False, "reason": "error"}
        finally:
            set_bypass_scoping(False)
        if outcome.get("started") or outcome.get("reason") == "card_declined":
            logger.info("billing autostart: %s %s", slug, outcome)
        results.append({"slug": slug, **outcome})
    return results
