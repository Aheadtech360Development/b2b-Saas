"""The Reports screen: sales, customers and production for one shop and one
stretch of days, each number counted here once.

- Money counts real orders (drafts never), paid or not, leaving out cancelled
  and refunded ones: the customer list's "spent". Orders by status lists every
  status, cancelled included, so nothing is hidden.
- A buyer's kind is the customer list's (services/customer_directory): Retail
  or Wholesale from the account's owner, Guest for an order with no account.
  The old report called every signed-in buyer wholesale.
- Top products count every line, gang sheets and made-to-order lines (no
  variant) included. The old one joined variants, so a print shop's best
  sellers never showed.
- A change against the period before is given only when the shop has orders
  from before that period began; otherwise it compares with nothing and says
  +100%.
- On time: a print job approved before the same-day cutoff should go out
  (shipped, or ready for pickup) that day, one approved after it the next day.
  Approval and printing are read from the order history (artwork_approved and
  sheet_printed, written by the print job's status route), so jobs approved
  before that history began are not measured.
- Days are the viewer's days: the browser sends its offset from UTC, the same
  clock the Production screen reads the cutoff on.

Every query names its shop (`:t`), as the customer list's do.
"""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

RANGES: dict[str, int] = {"today": 1, "7d": 7, "30d": 30, "90d": 90, "12m": 365}
RANGE_WORDS = {"today": "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months"}
NOT_SPENT = "('cancelled', 'refunded')"
# A custom stretch is held to this many days, so one request stays one page of work.
MAX_DAYS = 3 * 366


@dataclass(frozen=True)
class Span:
    """A stretch of whole days on the viewer's clock, and the UTC moments it runs between."""
    first: date
    last: date
    start: datetime  # inclusive, UTC
    end: datetime    # exclusive, UTC
    offset: timedelta

    @property
    def days(self) -> int:
        return (self.last - self.first).days + 1


def _span(first: date, last: date, offset: timedelta) -> Span:
    start = datetime.combine(first, time.min, tzinfo=timezone.utc) - offset
    end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=timezone.utc) - offset
    return Span(first, last, start, end, offset)


def span(range_key: str, *, date_from: str | None = None, date_to: str | None = None,
         offset_minutes: int = 0, now: datetime | None = None) -> Span:
    """The days a report covers. ValueError for a custom range that is not two dates."""
    offset = timedelta(minutes=max(-840, min(840, int(offset_minutes or 0))))
    today = ((now or datetime.now(timezone.utc)) + offset).date()
    if range_key == "custom":
        first, last = date.fromisoformat(date_from or ""), date.fromisoformat(date_to or "")
        if last < first:
            first, last = last, first
        if (last - first).days + 1 > MAX_DAYS:
            first = last - timedelta(days=MAX_DAYS - 1)
        return _span(first, last, offset)
    days = RANGES.get(range_key, 30)
    return _span(today - timedelta(days=days - 1), today, offset)


def before(s: Span) -> Span:
    """The same number of days just before."""
    last = s.first - timedelta(days=1)
    return _span(last - timedelta(days=s.days - 1), last, s.offset)


def change(current: float, previous: float, has_history: bool) -> float | None:
    """Percent change, or None when there is nothing fair to compare with."""
    if not has_history or not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def due_day(approved_local: datetime, cutoff: str) -> date:
    """The day a job approved at this local time should go out."""
    h, m = (int(x) for x in cutoff.split(":"))
    same_day = approved_local.time() < time(h, m)
    return approved_local.date() if same_day else approved_local.date() + timedelta(days=1)


def on_time(approved_at: datetime, done_at: datetime, cutoff: str, offset: timedelta) -> bool:
    return (done_at + offset).date() <= due_day(approved_at + offset, cutoff)


def _money(v: Any) -> float:
    return round(float(v or 0), 2)


# ── The orders in a stretch, each with its buyer and their kind ──────────────

_ORDERS = """
WITH o AS (
    SELECT o.id, o.order_number, o.status, o.payment_status, o.total, o.created_at,
           o.company_id, o.shipping_address_snapshot,
           CASE WHEN o.company_id IS NOT NULL THEN CAST(o.company_id AS text)
                ELSE 'guest:' || lower(trim(COALESCE(o.guest_email, ''))) END AS who,
           COALESCE(c.name, NULLIF(trim(o.guest_name), ''), NULLIF(trim(o.guest_email), ''), 'Guest') AS name,
           CASE WHEN o.company_id IS NULL THEN 'guest'
                WHEN h.account_type = 'retail' THEN 'retail' ELSE 'wholesale' END AS kind
    FROM orders o
    LEFT JOIN companies c ON c.id = o.company_id AND c.tenant_id = CAST(:t AS uuid)
    LEFT JOIN LATERAL (
        SELECT u.account_type
        FROM company_users cu JOIN users u ON u.id = cu.user_id
        WHERE cu.company_id = o.company_id AND cu.tenant_id = CAST(:t AS uuid)
        ORDER BY (cu.role = 'owner') DESC, cu.is_active DESC, cu.created_at
        LIMIT 1
    ) h ON o.company_id IS NOT NULL
    WHERE o.tenant_id = CAST(:t AS uuid) AND o.order_number NOT LIKE 'DRAFT-%'
      AND o.created_at >= :start AND o.created_at < :end
)
"""


def _p(tenant_id: Any, s: Span) -> dict:
    return {"t": str(tenant_id), "start": s.start, "end": s.end}


async def _totals(db: AsyncSession, tenant_id: Any, s: Span) -> dict:
    row = (await db.execute(text(_ORDERS + f"""
        SELECT count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) AS orders,
               COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS revenue
        FROM o"""), _p(tenant_id, s))).mappings().one()
    orders, revenue = int(row["orders"] or 0), _money(row["revenue"])
    return {"orders": orders, "revenue": revenue, "average": round(revenue / orders, 2) if orders else 0.0}


async def _by_day(db: AsyncSession, tenant_id: Any, s: Span) -> list[dict]:
    """Revenue and orders on each day of the stretch, on the viewer's clock,
    days with nothing included: the chart the old Analytics page drew."""
    rows = (await db.execute(text(_ORDERS + f"""
        SELECT CAST((created_at AT TIME ZONE 'UTC') + make_interval(mins => :mins) AS date) AS day,
               count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) AS orders,
               COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS revenue
        FROM o GROUP BY 1"""), {**_p(tenant_id, s), "mins": int(s.offset.total_seconds() // 60)})).mappings().all()
    got = {r["day"]: r for r in rows}
    out, day = [], s.first
    while day <= s.last:
        r = got.get(day)
        out.append({"date": day.isoformat(), "revenue": _money(r["revenue"]) if r else 0.0,
                    "orders": int(r["orders"]) if r else 0})
        day += timedelta(days=1)
    return out


async def _paid_share(db: AsyncSession, tenant_id: Any, s: Span) -> dict:
    """Paid orders out of every order placed in the stretch: what the old
    Analytics page called the conversion rate."""
    row = (await db.execute(text(_ORDERS + """
        SELECT count(*) AS orders, count(*) FILTER (WHERE CAST(payment_status AS text) = 'paid') AS paid
        FROM o"""), _p(tenant_id, s))).mappings().one()
    orders, paid = int(row["orders"] or 0), int(row["paid"] or 0)
    return {"orders": orders, "paid": paid, "percent": round(paid / orders * 100, 1) if orders else None}


async def _has_history(db: AsyncSession, tenant_id: Any, since: datetime) -> bool:
    return bool((await db.execute(text(
        "SELECT EXISTS (SELECT 1 FROM orders WHERE tenant_id = CAST(:t AS uuid) "
        "AND order_number NOT LIKE 'DRAFT-%' AND created_at < :since)"
    ), {"t": str(tenant_id), "since": since})).scalar())


async def _by_status(db: AsyncSession, tenant_id: Any, s: Span) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + """
        SELECT CAST(status AS text) AS status, count(*) AS orders, COALESCE(sum(total), 0) AS amount
        FROM o GROUP BY 1 ORDER BY count(*) DESC, 1"""), _p(tenant_id, s))).mappings().all()
    return [{"status": r["status"], "orders": int(r["orders"]), "amount": _money(r["amount"])} for r in rows]


async def _top_customers(db: AsyncSession, tenant_id: Any, s: Span, limit: int) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + f"""
        SELECT who, max(name) AS name, max(kind) AS kind,
               count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) AS orders,
               COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS spent
        FROM o GROUP BY who
        HAVING count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) > 0
        ORDER BY spent DESC, orders DESC, max(name)
        LIMIT :limit"""), {**_p(tenant_id, s), "limit": limit})).mappings().all()
    return [{
        "id": r["who"], "name": r["name"], "kind": r["kind"],
        "orders": int(r["orders"]), "spent": _money(r["spent"]),
    } for r in rows]


async def _top_products(db: AsyncSession, tenant_id: Any, s: Span, limit: int) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + f"""
        , lines AS (
            SELECT COALESCE(oi.product_id, pv.product_id) AS pid, oi.product_name, oi.quantity, oi.line_total
            FROM order_items oi
            JOIN o ON o.id = oi.order_id AND o.status NOT IN {NOT_SPENT}
            LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        )
        SELECT CAST(l.pid AS text) AS pid, max(COALESCE(p.name, l.product_name)) AS name,
               COALESCE(sum(l.quantity), 0) AS units, COALESCE(sum(l.line_total), 0) AS revenue
        FROM lines l LEFT JOIN products p ON p.id = l.pid AND p.tenant_id = CAST(:t AS uuid)
        GROUP BY COALESCE(CAST(l.pid AS text), 'name:' || lower(trim(l.product_name))), l.pid
        ORDER BY revenue DESC, units DESC
        LIMIT :limit"""), {**_p(tenant_id, s), "limit": limit})).mappings().all()
    return [{"product_id": r["pid"], "name": r["name"], "units": int(r["units"]), "revenue": _money(r["revenue"])}
            for r in rows]


async def _by_kind(db: AsyncSession, tenant_id: Any, s: Span) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + f"""
        SELECT kind, count(*) AS orders, COALESCE(sum(total), 0) AS revenue
        FROM o WHERE status NOT IN {NOT_SPENT} GROUP BY kind"""), _p(tenant_id, s))).mappings().all()
    got = {r["kind"]: r for r in rows}
    return [{"kind": k, "orders": int(got[k]["orders"]) if k in got else 0,
             "revenue": _money(got[k]["revenue"]) if k in got else 0.0}
            for k in ("retail", "wholesale", "guest")]


async def _people(db: AsyncSession, tenant_id: Any, s: Span) -> dict:
    """Who bought in the stretch, and how many of them bought for the first time."""
    row = (await db.execute(text(_ORDERS + f"""
        , buyers AS (SELECT DISTINCT who FROM o WHERE status NOT IN {NOT_SPENT}),
        firsts AS (
            SELECT CASE WHEN company_id IS NOT NULL THEN CAST(company_id AS text)
                        ELSE 'guest:' || lower(trim(COALESCE(guest_email, ''))) END AS who,
                   min(created_at) AS first_order
            FROM orders
            WHERE tenant_id = CAST(:t AS uuid) AND order_number NOT LIKE 'DRAFT-%'
              AND status NOT IN {NOT_SPENT}
            GROUP BY 1
        )
        SELECT count(*) AS buyers,
               count(*) FILTER (WHERE f.first_order >= :start) AS new_buyers
        FROM buyers b LEFT JOIN firsts f ON f.who = b.who"""), _p(tenant_id, s))).mappings().one()
    buyers, new = int(row["buyers"] or 0), int(row["new_buyers"] or 0)
    return {"buyers": buyers, "new": new, "returning": max(0, buyers - new)}


def state_of(snapshot: str | None) -> str:
    """The state an order ships to, from its address snapshot ("" when unknown).
    Read here, not in SQL: the column is text, and one bad row would sink a cast."""
    try:
        a = json.loads(snapshot or "")
    except (TypeError, ValueError):
        return ""
    return str(a.get("state") or "").strip().upper() if isinstance(a, dict) else ""


async def _by_state(db: AsyncSession, tenant_id: Any, s: Span, limit: int = 10) -> list[dict]:
    rows = (await db.execute(text(_ORDERS + f"""
        SELECT shipping_address_snapshot AS snap, total FROM o
        WHERE status NOT IN {NOT_SPENT} AND shipping_address_snapshot IS NOT NULL"""),
        _p(tenant_id, s))).all()
    got: dict[str, list] = {}
    for snap, total in rows:
        st = state_of(snap)
        if st:
            g = got.setdefault(st, [0, 0.0])
            g[0] += 1
            g[1] += float(total or 0)
    ranked = sorted(got.items(), key=lambda kv: (-kv[1][0], kv[0]))[:limit]
    return [{"state": st, "orders": n, "revenue": _money(v)} for st, (n, v) in ranked]


# ── Production ───────────────────────────────────────────────────────────────

_PRINTED = """
SELECT j.id, j.reference, j.sheet_quantity, o.order_number,
       COALESCE(p.at, j.updated_at) AS printed_at
FROM gang_sheet_orders j
JOIN orders o ON o.id = j.order_id AND o.tenant_id = CAST(:t AS uuid)
LEFT JOIN LATERAL (
    SELECT min(e.occurred_at) AS at FROM order_events e
    WHERE e.order_id = j.order_id AND e.type = 'sheet_printed'
      AND e.meta ->> 'job_id' = CAST(j.id AS text)
) p ON true
WHERE j.tenant_id = CAST(:t AS uuid) AND j.status = 'completed'
  AND COALESCE(p.at, j.updated_at) >= :start AND COALESCE(p.at, j.updated_at) < :end
"""

_MEASURED = """
SELECT j.id, j.reference, o.order_number, a.at AS approved_at, d.at AS done_at
FROM gang_sheet_orders j
JOIN orders o ON o.id = j.order_id AND o.tenant_id = CAST(:t AS uuid)
CROSS JOIN LATERAL (
    SELECT COALESCE(o.shipped_at, (
        SELECT min(e.occurred_at) FROM order_events e
        WHERE e.order_id = o.id AND e.type IN ('shipped', 'ready_for_pickup'))) AS at
) d
CROSS JOIN LATERAL (
    SELECT max(e.occurred_at) AS at FROM order_events e
    WHERE e.order_id = o.id AND e.type = 'artwork_approved'
      AND e.meta ->> 'job_id' = CAST(j.id AS text) AND e.occurred_at <= d.at
) a
WHERE j.tenant_id = CAST(:t AS uuid) AND j.status <> 'rejected'
  AND d.at >= :start AND d.at < :end AND a.at IS NOT NULL
ORDER BY d.at
"""


async def _cutoff(db: AsyncSession) -> str | None:
    from app.core.tenant_settings import get_setting
    from app.services import production_board as pb

    try:
        return pb.clean_cutoff(await get_setting(db, pb.CUTOFF_KEY)) or None
    except ValueError:
        return None


async def production(db: AsyncSession, tenant_id: Any, s: Span) -> dict:
    from app.services import production_board as pb

    queue = await pb.load_queue(db)
    jobs = [r for r in queue if r.get("column")]
    printed = (await db.execute(text(_PRINTED), _p(tenant_id, s))).mappings().all()
    cutoff = await _cutoff(db)
    measured = (await db.execute(text(_MEASURED), _p(tenant_id, s))).mappings().all() if cutoff else []
    good = sum(1 for r in measured if on_time(r["approved_at"], r["done_at"], cutoff, s.offset)) if cutoff else 0
    return {
        "in_review_paid": sum(1 for r in jobs if r["column"] == "review" and r["paid"]),
        "in_review": sum(1 for r in jobs if r["column"] == "review"),
        "columns": {c: sum(1 for r in jobs if r["column"] == c) for c in pb.COLUMNS},
        "sheets_printed": int(sum(int(r["sheet_quantity"] or 0) for r in printed)),
        "jobs_printed": len(printed),
        "cutoff": cutoff,
        "measured": len(measured),
        "on_time": good,
        "on_time_percent": round(good / len(measured) * 100) if measured else None,
    }


# ── The answers ──────────────────────────────────────────────────────────────

def _range_out(s: Span, range_key: str) -> dict:
    return {"range": range_key, "label": RANGE_WORDS.get(range_key, "Custom range"),
            "from": s.first.isoformat(), "to": s.last.isoformat(), "days": s.days}


async def overview(db: AsyncSession, tenant_id: Any, s: Span, range_key: str) -> dict:
    prev = before(s)
    cur, old = await _totals(db, tenant_id, s), await _totals(db, tenant_id, prev)
    history = await _has_history(db, tenant_id, prev.start)
    people = await _people(db, tenant_id, s)
    return {
        **_range_out(s, range_key),
        "sales": {
            **cur,
            "change": {
                "revenue": change(cur["revenue"], old["revenue"], history),
                "orders": change(cur["orders"], old["orders"], history),
                "average": change(cur["average"], old["average"], history),
            },
        },
        "by_day": await _by_day(db, tenant_id, s),
        "paid_share": await _paid_share(db, tenant_id, s),
        "by_status": await _by_status(db, tenant_id, s),
        "top_customers": await _top_customers(db, tenant_id, s, 10),
        "top_products": await _top_products(db, tenant_id, s, 10),
        "by_kind": await _by_kind(db, tenant_id, s),
        "customers": people,
        "by_state": await _by_state(db, tenant_id, s),
        "production": await production(db, tenant_id, s),
    }


async def export_csv(db: AsyncSession, tenant_id: Any, s: Span, tab: str) -> tuple[str, str]:
    """(filename, CSV text) for one tab of the report as it stands."""
    out = io.StringIO()
    w = csv.writer(out)
    p = _p(tenant_id, s)
    if tab == "customers":
        w.writerow(["Customer", "Type", "Orders", "Spent"])
        for r in await _top_customers(db, tenant_id, s, 100_000):
            w.writerow([r["name"], r["kind"].title(), r["orders"], f"{r['spent']:.2f}"])
    elif tab == "production":
        w.writerow(["Job", "Order", "Sheets", "Printed"])
        for r in (await db.execute(text(_PRINTED + " ORDER BY printed_at"), p)).mappings().all():
            w.writerow([r["reference"], r["order_number"], int(r["sheet_quantity"] or 0),
                        (r["printed_at"] + s.offset).strftime("%Y-%m-%d %H:%M")])
    else:
        tab = "sales"
        w.writerow(["Order", "Placed", "Customer", "Type", "Status", "Payment", "Total"])
        rows = (await db.execute(text(_ORDERS + """
            SELECT order_number, created_at, name, kind, CAST(status AS text) AS status,
                   CAST(payment_status AS text) AS payment_status, total
            FROM o ORDER BY created_at"""), p)).mappings().all()
        for r in rows:
            w.writerow([r["order_number"], (r["created_at"] + s.offset).strftime("%Y-%m-%d %H:%M"), r["name"],
                        r["kind"].title(), r["status"], r["payment_status"], f"{_money(r['total']):.2f}"])
    return f"{tab}-{s.first.isoformat()}-to-{s.last.isoformat()}.csv", out.getvalue()
