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


def _subject(brand: str, left: int) -> str:
    if left <= 0:
        return f"Your {brand} trial has ended"
    if left == 1:
        return f"One day left on your {brand} trial"
    return f"{left} days left on your {brand} trial"


def _body(brand: str, owner: str, left: int, shop_url: str, plan_url: str) -> str:
    """What the brand's owner reads.

    Written to one person about their own shop: their name, their shop's name,
    and the one thing to do about it. A countdown with no way to act on it is
    a nag.
    """
    hello = f"Hi {owner}," if owner else "Hi,"
    if left <= 0:
        middle = (
            f"<p>Your free trial of <b>{brand}</b> has ended.</p>"
            "<p>Your shop, your products and your orders are all still here. "
            "Choose a plan whenever you are ready and everything carries on "
            "from where it is.</p>"
        )
    elif left == 1:
        middle = (
            f"<p>There is <b>one day</b> left on your free trial of {brand}.</p>"
            "<p>Pick a plan before it ends and nothing changes — no gap, "
            "nothing to set up again.</p>"
        )
    else:
        middle = (
            f"<p>There are <b>{left} days</b> left on your free trial of {brand}.</p>"
            "<p>If the shop is doing what you need, choosing a plan now means "
            "it simply keeps going.</p>"
        )

    return f"""
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto">
      <div style="padding:28px 24px;background:#fff;color:#111318;line-height:1.6">
        <p style="margin:0 0 14px">{hello}</p>
        {middle}
        <p style="margin:26px 0">
          <a href="{plan_url}"
             style="background:#111318;color:#fff;padding:12px 24px;border-radius:8px;
                    text-decoration:none;font-weight:600;display:inline-block">
            Choose a plan
          </a>
        </p>
        <p style="color:#6B7280;font-size:13px;margin:0">
          Your shop: <a href="{shop_url}" style="color:#6B7280">{shop_url}</a>
        </p>
      </div>
    </div>
    """


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

                owner = escape(await _owner_name(db, tenant_id))
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

                    EmailService(db).send_raw(
                        to_email=to,
                        subject=_subject(row["brand_name"] or "your shop", left),
                        body_html=_body(brand, owner, left, shop_url, plan_url),
                    )
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


async def _owner_name(db, tenant_id) -> str:
    from sqlalchemy import text

    row = (await db.execute(text("""
        SELECT first_name FROM users
         WHERE tenant_id = CAST(:t AS uuid) AND role = 'tenant_admin' AND is_active = true
         ORDER BY created_at ASC LIMIT 1
    """), {"t": str(tenant_id)})).first()
    return (row[0] if row and row[0] else "") or ""


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
