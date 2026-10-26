"""Telling a brand their free period is running out, once per warning.

A brand hears from us on each of the last few days and then on the day it
ends, and each of those is sent once — a run that happens twice, or a day
nobody was looked at, must not turn into four emails in an afternoon.

Nothing here ends anybody's access. The mail says where they stand; what
happens when a trial runs out is a decision somebody makes, not a side effect
of a reminder going out.

In-process, like the billing autostart: the deployment runs uvicorn only, with
no Celery beat, so the daily Celery task this used to be never ran on live and
no reminder went out. Every web worker runs the loop and a Redis lock lets one
of them act on each tick. The Celery task (tasks/trial_tasks) calls the same run.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TICK_SECONDS = 3600
# "Your trial has ended" is news for a day or two. A trial that ended long
# before reminders ever ran is not told about it now; it is marked as told.
ENDED_NOTICE_WITHIN_HOURS = 48


def stale_end(ends_at, now: datetime | None = None) -> bool:
    """Whether a trial ended too long ago to be told about it now."""
    if ends_at is None:
        return False
    now = now or datetime.now(timezone.utc)
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    return (now - ends_at).total_seconds() > ENDED_NOTICE_WITHIN_HOURS * 3600


async def run() -> dict:
    """One pass: every brand whose trial is close to its end, warned once."""
    from html import escape

    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    from app.services import brand_urls, trial
    from app.services.email_service import EmailService

    sent = 0
    failed = 0
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            due = await trial.due_for_notice(db)
            for row in due:
                tenant_id = row["tenant_id"]
                brand = escape(row["brand_name"] or "your shop")
                left = int(row["days_left"] or 0)
                mark = int(row["mark"])

                if mark == 0 and stale_end(row.get("trial_ends_at")):
                    await trial.record_notice(db, tenant_id, mark)
                    continue

                # Where to write. A brand's own address, not the platform's
                # notification inbox, which is ours.
                to = await _owner_email(db, tenant_id, row.get("brand_email"))
                if not to:
                    logger.warning("No address to warn %s about its trial", brand)
                    # Recorded anyway, so a brand with no address is not
                    # reconsidered every single day.
                    await trial.record_notice(db, tenant_id, mark)
                    continue

                shop_url = await brand_urls.for_tenant(db, tenant_id)
                plan_url = await brand_urls.for_tenant(db, tenant_id, "/admin/billing")

                try:
                    # Sent as this brand, so the mail carries their name and
                    # their reply-to rather than the platform's.
                    from app.core.database import _resolve_brand_name, _resolve_brand_site
                    from app.core.tenant_context import (
                        set_current_brand_name,
                        set_current_brand_site,
                    )

                    set_current_brand_name(await _resolve_brand_name(db, tenant_id))
                    set_current_brand_site(await _resolve_brand_site(db, tenant_id))

                    # The design's trial mail (services/mails.trial_notice),
                    # in PrintCoPilot's card: it is the platform writing.
                    from app.services import mails

                    subject, html = mails.trial_notice(
                        days_left=left, ends_on=row.get("trial_ends_at"), plans_url=plan_url, shop_url=shop_url)
                    EmailService(db).send_raw(to_email=to, subject=subject, body_html=html)
                    sent += 1
                except Exception:
                    failed += 1
                    logger.exception("Could not warn %s about its trial", brand)
                    # Not recorded, so the next run tries again.
                    continue

                await trial.record_notice(db, tenant_id, mark)
    finally:
        set_bypass_scoping(False)

    if sent or failed:
        logger.info("Trial notices: %s sent, %s failed", sent, failed)
    return {"sent": sent, "failed": failed}


async def _owner_email(db, tenant_id, fallback: str | None) -> str | None:
    """The person who signed the shop up, else the shop's own address."""
    from sqlalchemy import text

    row = (await db.execute(text("""
        SELECT email FROM users
         WHERE tenant_id = CAST(:t AS uuid) AND role = 'tenant_admin' AND is_active = true
         ORDER BY created_at ASC LIMIT 1
    """), {"t": str(tenant_id)})).first()
    return (row[0] if row else None) or (fallback or None)


async def scheduler_loop() -> None:
    await asyncio.sleep(180)  # let the app finish booting first
    while True:
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("trial notices tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def tick(*, use_lock: bool = True) -> dict | None:
    """One pass, by one worker: the lock outlives the tick by a minute less."""
    if use_lock:
        from app.core.redis import get_redis_pool

        if not await get_redis_pool().set("trial:notices", "1", nx=True, ex=TICK_SECONDS - 60):
            return None
    return await run()
