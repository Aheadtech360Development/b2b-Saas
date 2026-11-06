"""Home's sales over time: each number in steps across the days chosen, beside
the same number of days just before (Shopify's "over time" card).

Money and orders are counted as Reports counts them (report_view: order totals
with shipping and tax, drafts aside, cancelled and refunded orders left out);
sessions and the visits that placed an order come from the shop's visits
(services/visits). One day is shown by the hour, up to 92 days by the day, up
to two years by the week, anything longer by the month. The days are the
viewer's (or the shop's) own, as everywhere on Home.
"""
from __future__ import annotations

import logging
from bisect import bisect_right
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.report_view import _ORDERS, NOT_SPENT, Span, _money, _p, _span, before, change
from app.services.visits import rate

logger = logging.getLogger(__name__)


def unit_for(days: int) -> str:
    """How finely a stretch of this many days is shown."""
    if days <= 1:
        return "hour"
    if days <= 92:
        return "day"
    if days <= 731:
        return "week"
    return "month"


def starts(s: Span, unit: str) -> list[datetime]:
    """Where each step begins, on the local clock. A week runs from the first
    day chosen; the first and last month are cut to the days chosen."""
    cur = datetime.combine(s.first, time.min)
    end = datetime.combine(s.last + timedelta(days=1), time.min)
    out: list[datetime] = []
    while cur < end:
        out.append(cur)
        if unit == "month":
            cur = (cur.replace(day=1) + timedelta(days=32)).replace(day=1)
        else:
            cur += {"hour": timedelta(hours=1), "day": timedelta(days=1), "week": timedelta(days=7)}[unit]
    return out


def _step(at: datetime, unit: str) -> dict[str, Any]:
    return {"start": at.isoformat(timespec="minutes") if unit == "hour" else at.date().isoformat(),
            "total": 0.0, "orders": 0, "sessions": 0, "converted": 0}


def fill(s: Span, unit: str, money_rows: list[dict], visit_rows: list[dict] | None) -> list[dict[str, Any]]:
    """Every step of the stretch, empty ones included, from rows counted per
    hour (unit "hour") or per day: {"at": local datetime, ...}."""
    edges = starts(s, unit)
    steps = [_step(at, unit) for at in edges]

    def place(at: datetime) -> dict[str, Any] | None:
        i = bisect_right(edges, at) - 1
        return steps[i] if 0 <= i < len(steps) else None

    for r in money_rows:
        if (step := place(r["at"])) is not None:
            step["total"] = round(step["total"] + float(r["revenue"] or 0), 2)
            step["orders"] += int(r["orders"] or 0)
    for r in visit_rows or []:
        if (step := place(r["at"])) is not None:
            step["sessions"] += int(r["sessions"] or 0)
            step["converted"] += int(r["converted"] or 0)
    for step in steps:
        if visit_rows is None:
            step["sessions"] = step["converted"] = None
            step["conversion_rate"] = None
        else:
            step["conversion_rate"] = rate(step["converted"], step["sessions"])
        step["average"] = round(step["total"] / step["orders"], 2) if step["orders"] else 0.0
    return steps


async def _money_rows(db: AsyncSession, tenant_id: Any, s: Span, fine: str) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + f"""
        SELECT date_trunc(CAST(:fine AS text), (created_at AT TIME ZONE 'UTC') + make_interval(mins => :mins)) AS at,
               count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) AS orders,
               COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS revenue
        FROM o GROUP BY 1"""), {**_p(tenant_id, s), "mins": int(s.offset.total_seconds() // 60), "fine": fine})).mappings().all()
    return [dict(r) for r in rows]


async def _visit_rows(db: AsyncSession, tenant_id: Any, s: Span, fine: str) -> list[dict] | None:
    """Visits per hour or day; None when they cannot be read (Home then shows
    the money without them, as its totals do)."""
    try:
        async with db.begin_nested():
            rows = (await db.execute(text("""
                SELECT date_trunc(CAST(:fine AS text), (started_at AT TIME ZONE 'UTC') + make_interval(mins => :mins)) AS at,
                       count(*) AS sessions, count(*) FILTER (WHERE order_id IS NOT NULL) AS converted
                FROM storefront_visits
                WHERE tenant_id = CAST(:t AS uuid) AND started_at >= :start AND started_at < :end
                GROUP BY 1"""), {**_p(tenant_id, s), "mins": int(s.offset.total_seconds() // 60), "fine": fine})).mappings().all()
        return [dict(r) for r in rows]
    except Exception as exc:  # noqa: BLE001
        logger.warning("home: visits over time failed: %s", exc)
        return None


async def series(db: AsyncSession, tenant_id: Any, s: Span, unit: str) -> list[dict[str, Any]]:
    fine = "hour" if unit == "hour" else "day"
    return fill(s, unit, await _money_rows(db, tenant_id, s, fine), await _visit_rows(db, tenant_id, s, fine))


def totals(steps: list[dict[str, Any]]) -> dict[str, Any]:
    total = round(sum(x["total"] for x in steps), 2)
    orders = sum(x["orders"] for x in steps)
    known = [x for x in steps if x["sessions"] is not None]
    sessions = sum(x["sessions"] for x in known) if known else None
    converted = sum(x["converted"] for x in known) if known else None
    return {"total": _money(total), "orders": orders, "average": round(total / orders, 2) if orders else 0.0,
            "sessions": sessions, "converted_sessions": converted,
            "conversion_rate": rate(converted, sessions) if sessions else None}


async def first_activity(db: AsyncSession, tenant_id: Any, offset: timedelta) -> date | None:
    """The shop's first order or visit, on the local clock: where "All time" starts drawing."""
    at = (await db.execute(text("""
        SELECT least(
            (SELECT min(created_at) FROM orders WHERE tenant_id = CAST(:t AS uuid) AND order_number NOT LIKE 'DRAFT-%'),
            (SELECT min(started_at) FROM storefront_visits WHERE tenant_id = CAST(:t AS uuid)))
    """), {"t": str(tenant_id)})).scalar()
    return (at + offset).date() if at else None


async def over_time(db: AsyncSession, tenant_id: Any, s: Span, range_key: str) -> dict[str, Any]:
    """The steps of the days chosen and, but for "All time", of the same
    number of days just before, with how much each number changed."""
    drawn = s
    if range_key == "all":
        try:
            async with db.begin_nested():
                began = await first_activity(db, tenant_id, s.offset)
        except Exception:  # noqa: BLE001
            began = None
        drawn = _span(min(max(began or s.last, s.first), s.last), s.last, s.offset)
    unit = unit_for(drawn.days)
    now_steps = await series(db, tenant_id, drawn, unit)
    out: dict[str, Any] = {"granularity": unit, "series": now_steps, "previous": None, "changes": None}
    if range_key == "all":
        return out
    p = before(s)
    then_steps = await series(db, tenant_id, p, unit)
    now, then = totals(now_steps), totals(then_steps)
    out["previous"] = {"from": p.first.isoformat(), "to": p.last.isoformat(), **then, "series": then_steps}
    # Change against the days before; None where there is nothing to compare with.
    out["changes"] = {k: (change(float(now[k]), float(then[k]), True) if now[k] is not None and then[k] is not None else None)
                      for k in ("total", "orders", "average", "sessions", "conversion_rate")}
    return out
