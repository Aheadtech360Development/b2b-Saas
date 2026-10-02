"""A brand's free period: how long is left, and who has been told.

A trial is one date. Everything else is read off it — the banner at the top of
a shop's console, the reminders in the last few days, and whether the free
period is over at all — so there is one answer to "how long have I got" rather
than one per screen.

Nothing here ends a brand's access. Running out is a fact this records and
shows; what the platform does about it is a decision for somebody, not a side
effect of a date passing.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_DAYS = 14

# Days-remaining marks that earn an email. The last one is the day it ends,
# which is the one people actually act on.
NOTICE_DAYS = (3, 2, 1, 0)


def days_left(ends_at: datetime | None, now: datetime | None = None) -> int | None:
    """Whole days from now until the trial ends, or None when there is no trial.

    Counted by calendar day rather than by the hour, because that is how the
    number is read: a trial ending tomorrow morning says "1 day left", not
    "0", which would read as over while it is still running.
    """
    if ends_at is None:
        return None
    now = now or datetime.now(timezone.utc)
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    seconds = (ends_at - now).total_seconds()
    if seconds <= 0:
        return 0
    # Rounded up: any part of a day is still that day. A trial ending tomorrow
    # morning has one day left, not none.
    return math.ceil(seconds / 86400)


async def status(db: AsyncSession, tenant_id: object) -> dict[str, Any]:
    """Where this brand stands on its trial.

    Read on every page of a shop's console, so it is one row and no Stripe
    call. `on_trial` is false once a brand is paying, even if the date has not
    passed: somebody who has entered a card is a customer, and a countdown
    over their head is a countdown to nothing.
    """
    row = (await db.execute(text("""
        SELECT trial_ends_at, status, stripe_subscription_id, plan
        FROM tenant_subscriptions WHERE tenant_id = CAST(:t AS uuid)
    """), {"t": str(tenant_id)})).mappings().first()
    if not row:
        return {"on_trial": False, "days_left": None, "ends_at": None, "expired": False, "plan": None}

    ends_at = row["trial_ends_at"]
    paying = bool(row["stripe_subscription_id"]) and row["status"] in ("active", "past_due")
    left = days_left(ends_at)
    return {
        "on_trial": ends_at is not None and not paying and (left or 0) > 0,
        "days_left": left,
        "ends_at": ends_at.isoformat() if ends_at else None,
        "expired": ends_at is not None and not paying and left == 0,
        "plan": row["plan"],
    }


async def start(db: AsyncSession, tenant_id: object, days: int = DEFAULT_DAYS) -> dict[str, Any]:
    """Begin a trial now, running for this many days.

    Starting again resets the clock and clears which reminders have been sent,
    because a brand given another fortnight should be warned about that one
    too rather than being told nothing, having already had the emails once.
    """
    days = max(1, min(int(days), 365))
    ends = datetime.now(timezone.utc) + timedelta(days=days)
    await db.execute(text("""
        INSERT INTO tenant_subscriptions (tenant_id, trial_ends_at, trial_notices_sent)
        VALUES (CAST(:t AS uuid), :e, '[]'::jsonb)
        ON CONFLICT (tenant_id) DO UPDATE
          SET trial_ends_at = EXCLUDED.trial_ends_at,
              trial_notices_sent = '[]'::jsonb,
              updated_at = now()
    """), {"t": str(tenant_id), "e": ends})
    await db.commit()
    logger.info("Trial started for tenant %s, %s days", tenant_id, days)
    return await status(db, tenant_id)


async def clear(db: AsyncSession, tenant_id: object) -> dict[str, Any]:
    """End a trial without ending anything else, so the banner goes away."""
    await db.execute(text("""
        UPDATE tenant_subscriptions
           SET trial_ends_at = NULL, trial_notices_sent = '[]'::jsonb, updated_at = now()
         WHERE tenant_id = CAST(:t AS uuid)
    """), {"t": str(tenant_id)})
    await db.commit()
    return await status(db, tenant_id)


def notice_due(left: int | None, already_sent: list[Any]) -> int | None:
    """Which reminder to send now, or None.

    Returns the mark rather than a yes, because the mark is what gets recorded
    and what decides the wording. A brand that was not looked at for days gets
    the one for where they are now, not the four they missed.
    """
    if left is None or left > max(NOTICE_DAYS):
        return None
    sent = {int(x) for x in already_sent if isinstance(x, (int, float, str)) and str(x).lstrip("-").isdigit()}
    for mark in NOTICE_DAYS:
        if left <= mark and mark not in sent:
            return mark
    return None


async def due_for_notice(db: AsyncSession) -> list[dict[str, Any]]:
    """Brands whose trial is close enough to warrant an email, and which one.

    One query rather than one per brand: this runs on a schedule across every
    shop on the platform, and a trial is a row, not a conversation with Stripe.
    """
    rows = (await db.execute(text("""
        SELECT s.tenant_id, s.trial_ends_at, s.trial_notices_sent, s.plan,
               t.name AS brand_name, t.slug, t.email AS brand_email
          FROM tenant_subscriptions s
          JOIN tenants t ON t.id = s.tenant_id
         WHERE s.trial_ends_at IS NOT NULL
           AND t.status = 'active'
           AND (s.stripe_subscription_id IS NULL OR s.status NOT IN ('active', 'past_due'))
    """))).mappings().all()

    out: list[dict[str, Any]] = []
    for row in rows:
        left = days_left(row["trial_ends_at"])
        mark = notice_due(left, list(row["trial_notices_sent"] or []))
        if mark is None:
            continue
        out.append({**dict(row), "days_left": left, "mark": mark})
    return out


async def record_notice(db: AsyncSession, tenant_id: object, mark: int) -> None:
    """Remember that this reminder went out, so it goes out once."""
    await db.execute(text("""
        UPDATE tenant_subscriptions
           SET trial_notices_sent = trial_notices_sent || CAST(:m AS jsonb),
               updated_at = now()
         WHERE tenant_id = CAST(:t AS uuid)
    """), {"t": str(tenant_id), "m": f"[{int(mark)}]"})
    await db.commit()
