"""
Platform Admin API — the sales tax each brand has charged.

  GET /platform/taxes?date_from=&date_to=&basis=&tz=

One row per brand for the dates asked for: how many orders, how many of them
carried tax, the sales, the tax itself, how much of that tax went back to
customers with refunds, and what is left. Under each brand the same figures
month by month and by tax region, which is how tax is filed.

Two ways of counting, because they answer different questions:

  paid — orders the customer has paid for: the tax a brand is holding.
  all  — every order that was not cancelled, paid yet or not: what was
         charged, invoices still owing included.

Tax on a refunded order counts as given back — all of it when the order was
refunded in full, and in proportion when part of it was. (A refund does not
record its tax separately, so the share is the refund's share of the order.)

Dates are order dates read in the viewer's time zone, so "this month" is the
calendar month on their wall and not midnight UTC.

Cross-tenant on purpose, like the rest of /platform, and gated the same way.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/platform", tags=["platform-taxes"])

_TZ_SHAPE = re.compile(r"^[A-Za-z][A-Za-z0-9_+\-]*(/[A-Za-z0-9_+\-]+){0,2}$")

# Which orders count.
_BASIS = {
    "paid": "o.payment_status IN ('paid', 'refunded')",
    "all": "o.status <> 'cancelled' AND o.payment_status <> 'failed'",
}

# The part of an order's tax that went back with its refunds.
_REFUNDED = """
    CASE
        WHEN o.payment_status = 'refunded' THEN o.tax_amount
        WHEN o.total > 0 AND COALESCE(o.amount_refunded, 0) > 0
            THEN ROUND(o.tax_amount * LEAST(o.amount_refunded, o.total) / o.total, 2)
        ELSE 0
    END
"""

_FIGURES = f"""
    COUNT(o.id) AS orders,
    COUNT(o.id) FILTER (WHERE o.tax_amount > 0) AS taxed_orders,
    COALESCE(SUM(o.subtotal), 0) AS sales,
    COALESCE(SUM(o.tax_amount), 0) AS tax,
    COALESCE(SUM({_REFUNDED}), 0) AS tax_refunded
"""


def _require_platform_admin(request: Request) -> None:
    if not getattr(request.state, "is_platform_admin", False):
        raise HTTPException(status_code=403, detail="Platform admin access required")


async def _time_zone(db: AsyncSession, asked: str | None) -> str:
    """The viewer's time zone when the database knows it, else UTC."""
    name = (asked or "").strip()
    if not name or not _TZ_SHAPE.match(name):
        return "UTC"
    found = (await db.execute(
        text("SELECT 1 FROM pg_timezone_names WHERE name = :tz LIMIT 1"), {"tz": name}
    )).first()
    return name if found else "UTC"


async def _rows(db: AsyncSession, sql: str, params: dict[str, Any]) -> list[Any]:
    """Run a query with only the parameters it names."""
    used = {k: v for k, v in params.items() if f":{k}" in sql}
    return list((await db.execute(text(sql), used)).mappings().all())


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def _figures(row: Any) -> dict[str, Any]:
    tax = _money(row["tax"])
    back = min(_money(row["tax_refunded"]), tax)
    return {
        "orders": int(row["orders"] or 0),
        "taxed_orders": int(row["taxed_orders"] or 0),
        "sales": _money(row["sales"]),
        "tax": tax,
        "tax_refunded": back,
        "net_tax": round(tax - back, 2),
    }


@router.get("/taxes")
async def platform_taxes(
    request: Request,
    date_from: date | None = Query(None, description="First day counted (YYYY-MM-DD)"),
    date_to: date | None = Query(None, description="Last day counted (YYYY-MM-DD)"),
    basis: Literal["paid", "all"] = Query("paid"),
    tz: str | None = Query(None, max_length=64, description="The viewer's time zone, e.g. America/Chicago"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Sales tax by brand for a range of dates, with each brand's months and regions."""
    _require_platform_admin(request)
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from
    zone = await _time_zone(db, tz)

    # Whole days in the viewer's zone: from the first midnight to the midnight
    # after the last day, turned into instants by the database.
    where = [_BASIS[basis]]
    params: dict[str, Any] = {"tz": zone}
    if date_from:
        where.append("o.created_at >= (CAST(:d1 AS timestamp) AT TIME ZONE CAST(:tz AS text))")
        params["d1"] = datetime(date_from.year, date_from.month, date_from.day)
    if date_to:
        after = date_to + timedelta(days=1)
        where.append("o.created_at < (CAST(:d2 AS timestamp) AT TIME ZONE CAST(:tz AS text))")
        params["d2"] = datetime(after.year, after.month, after.day)
    cond = " AND ".join(where)

    # Every brand is listed, with zeros when it took no orders in the range —
    # "this brand charged no tax" is an answer too.
    per_brand = await _rows(db, f"""
        SELECT t.id, t.slug, t.name, t.status,
               {_FIGURES},
               MAX(o.created_at) AS last_order
        FROM tenants t
        LEFT JOIN orders o ON o.tenant_id = t.id AND {cond}
        GROUP BY t.id, t.slug, t.name, t.status
        ORDER BY tax DESC, t.name
    """, params)

    by_month = await _rows(db, f"""
        SELECT o.tenant_id,
               to_char(date_trunc('month', o.created_at AT TIME ZONE CAST(:tz AS text)), 'YYYY-MM') AS bucket,
               {_FIGURES}
        FROM orders o
        WHERE {cond}
        GROUP BY o.tenant_id, bucket
        ORDER BY bucket DESC
    """, params)

    # A region is where tax was charged, or where an order says it belongs.
    by_region = await _rows(db, f"""
        SELECT o.tenant_id,
               COALESCE(NULLIF(UPPER(TRIM(o.tax_region)), ''), '') AS bucket,
               {_FIGURES}
        FROM orders o
        WHERE {cond} AND (o.tax_amount > 0 OR NULLIF(TRIM(o.tax_region), '') IS NOT NULL)
        GROUP BY o.tenant_id, bucket
        ORDER BY tax DESC, bucket
    """, params)

    months: dict[str, list[dict[str, Any]]] = {}
    for r in by_month:
        months.setdefault(str(r["tenant_id"]), []).append({"month": r["bucket"], **_figures(r)})
    regions: dict[str, list[dict[str, Any]]] = {}
    for r in by_region:
        regions.setdefault(str(r["tenant_id"]), []).append({"region": r["bucket"], **_figures(r)})

    brands = [
        {
            "id": str(r["id"]),
            "slug": r["slug"],
            "name": r["name"],
            "status": r["status"],
            **_figures(r),
            "last_order": r["last_order"].isoformat() if r["last_order"] else None,
            "months": months.get(str(r["id"]), []),
            "regions": regions.get(str(r["id"]), []),
        }
        for r in per_brand
    ]

    keys = ("orders", "taxed_orders", "sales", "tax", "tax_refunded", "net_tax")
    totals = {k: round(sum(b[k] for b in brands), 2) for k in keys}
    totals["orders"] = int(totals["orders"])
    totals["taxed_orders"] = int(totals["taxed_orders"])
    totals["brands"] = len(brands)
    totals["brands_with_tax"] = sum(1 for b in brands if b["tax"] > 0)

    return {
        "range": {
            "from": date_from.isoformat() if date_from else None,
            "to": date_to.isoformat() if date_to else None,
            "tz": zone,
        },
        "basis": basis,
        "totals": totals,
        "brands": brands,
    }
