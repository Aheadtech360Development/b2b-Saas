"""How much of its plan a shop is using, against the plan's limits.

Orders this calendar month and staff accounts. Only a plan with
`enforce_limits` (Retail) is held to its figures (owner, 2026-10-28); the print
plans' are shown but bind nothing.

The order limit never stops a buyer: past it, the shop keeps selling and the
owner is told, once at 80% and once at 100% each month, in the admin and by
email. The staff limit stops the shop adding a user past it; nobody already
there is ever removed by it.

Counted (owner, 2026-10-28): every order created in the month, whatever its
status. Months are UTC calendar months until the shop's own time zone is live.

The emails go from an hourly in-process loop (uvicorn only on live, no Celery),
one worker per tick by a Redis lock, the way trial notices do. Nothing here is
on the checkout path.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

TICK_SECONDS = 3600
LEVELS = (80, 100)
# Users who sign into the admin. Buyers are customers, not staff.
STAFF_SQL = ("SELECT count(*) FROM users WHERE tenant_id = CAST(:t AS uuid) AND is_active = true "
             "AND role NOT IN ('buyer', 'platform_admin')")
NOTICE_KEY = "plan_limit_notice"


class StaffLimitReached(Exception):
    """Adding one more user would pass the plan's staff limit."""

    def __init__(self, plan_name: str, limit: int):
        super().__init__(
            f"Your {plan_name} plan includes {limit} staff accounts, the owner included. "
            "Move to a plan with more to add another."
        )
        self.plan_name = plan_name
        self.limit = limit


def month_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The UTC calendar month `now` is in, as [start, next month's start)."""
    now = now or datetime.now(timezone.utc)
    start = now.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


def level(count: int, limit: int | None) -> int | None:
    """The notice an order count has reached: 100, 80, or None."""
    if not limit:
        return None
    if count >= limit:
        return 100
    if count * 100 >= limit * 80:
        return 80
    return None


def plan_of(key: str | None) -> tuple[str, dict]:
    from app.core.billing_plans import BILLING_PLANS, effective_plan

    effective = effective_plan(key)
    return effective, BILLING_PLANS[effective]


async def _plan_key(db, tenant_id) -> str | None:
    from sqlalchemy import text

    return (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).scalar_one_or_none()


async def usage(db, tenant_id, *, now: datetime | None = None) -> dict[str, Any]:
    """This shop's orders this month and staff, against its plan."""
    from sqlalchemy import text

    key, plan = plan_of(await _plan_key(db, tenant_id))
    start, end = month_window(now)
    orders = int((await db.execute(text(
        "SELECT count(*) FROM orders WHERE tenant_id = CAST(:t AS uuid) AND created_at >= :s AND created_at < :e"
    ), {"t": str(tenant_id), "s": start, "e": end})).scalar() or 0)
    staff = int((await db.execute(text(STAFF_SQL), {"t": str(tenant_id)})).scalar() or 0)
    limits = plan.get("limits") or {}
    enforced = bool(plan.get("enforce_limits"))
    orders_limit = limits.get("orders_per_month")
    return {
        "plan": key,
        "plan_name": plan["name"],
        "enforced": enforced,
        "month": start.strftime("%Y-%m"),
        "orders": orders,
        "orders_limit": orders_limit,
        "orders_percent": round(orders * 100 / orders_limit) if orders_limit else None,
        # Only a limit that binds raises a notice.
        "notice": level(orders, orders_limit) if enforced else None,
        "staff": staff,
        "staff_limit": limits.get("staff_accounts"),
    }


async def check_staff_room(db, tenant_id) -> None:
    """Raise StaffLimitReached when the shop's plan has no room for one more user."""
    from sqlalchemy import text

    key, plan = plan_of(await _plan_key(db, tenant_id))
    limit = (plan.get("limits") or {}).get("staff_accounts")
    if not plan.get("enforce_limits") or not limit:
        return
    staff = int((await db.execute(text(STAFF_SQL), {"t": str(tenant_id)})).scalar() or 0)
    if staff >= limit:
        raise StaffLimitReached(plan["name"], limit)


# ── The owner's notices ───────────────────────────────────────────────────────

def due_level(u: dict, sent: dict | None) -> int | None:
    """The notice to send now, given what this month has already had: the
    highest level reached and not yet sent (100 after 80, never 80 after 100)."""
    if not u.get("notice"):
        return None
    record = sent if sent and sent.get("month") == u["month"] else {}
    already = set(record.get("sent") or [])
    if u["notice"] in already or (u["notice"] == 80 and 100 in already):
        return None
    return u["notice"]


async def run(*, now: datetime | None = None) -> dict:
    """One pass over every shop whose plan's limits bind."""
    from sqlalchemy import text

    from app.core.billing_plans import BILLING_PLANS
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import set_bypass_scoping
    from app.core.tenant_settings import get_setting, set_setting

    enforcing = [k for k, p in BILLING_PLANS.items() if p.get("enforce_limits")]
    sent = failed = 0
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            shops = (await db.execute(
                text("SELECT id FROM tenants WHERE lower(plan) = ANY(:plans)"), {"plans": enforcing}
            )).scalars().all()
            for tenant_id in shops:
                try:
                    u = await usage(db, tenant_id, now=now)
                    record = _read(await get_setting(db, NOTICE_KEY, tenant_id=tenant_id))
                    due = due_level(u, record)
                    if due is None:
                        continue
                    await _mail_owner(db, tenant_id, u, due)
                    previous = record if record.get("month") == u["month"] else {}
                    await set_setting(db, NOTICE_KEY, json.dumps(
                        {"month": u["month"], "sent": sorted({*(previous.get("sent") or []), due})}
                    ), tenant_id=tenant_id)
                    await db.commit()
                    sent += 1
                except Exception:  # noqa: BLE001 - one shop's failure is not the others'
                    failed += 1
                    await db.rollback()
                    logger.exception("Plan limit notice failed for shop %s", tenant_id)
    finally:
        set_bypass_scoping(False)
    if sent or failed:
        logger.info("Plan limit notices: %s sent, %s failed", sent, failed)
    return {"sent": sent, "failed": failed}


def _read(raw: str | None) -> dict:
    try:
        value = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


async def _mail_owner(db, tenant_id, u: dict, due: int) -> None:
    from app.services import brand_urls, mails
    from app.services.email_service import EmailService
    from app.services.trial_notices import _owner_email

    to = await _owner_email(db, tenant_id, None)
    if not to:
        logger.warning("No owner address for plan limit notice, shop %s", tenant_id)
        return
    plans_url = await brand_urls.for_tenant(db, tenant_id, "/admin/billing")
    subject, html = mails.order_limit_notice(
        level=due, orders=u["orders"], limit=u["orders_limit"], plan=u["plan_name"], plans_url=plans_url)
    EmailService(db).send_raw(to_email=to, subject=subject, body_html=html)


async def scheduler_loop() -> None:
    await asyncio.sleep(240)  # after boot, off the other loops' minute
    while True:
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("plan limit notices tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def tick(*, use_lock: bool = True) -> dict | None:
    if use_lock:
        from app.core.redis import get_redis_pool

        if not await get_redis_pool().set("plan:limit-notices", "1", nx=True, ex=TICK_SECONDS - 60):
            return None
    return await run()
