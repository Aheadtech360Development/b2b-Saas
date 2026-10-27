"""Visits to a shop: Home's Sessions and Conversion rate.

The storefront reports each new visit once (frontend lib/attribution.ts →
POST /storefront/visits), and the checkout marks the visit that placed the
order. Conversion rate is the visits that placed an order out of all visits,
as Shopify counts it: 100 visits and 5 of them ordered is 5%.

A visit is named the way the order page names it (services/attribution
.classify): direct, Google search, a Meta ad and so on.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import attribution

logger = logging.getLogger(__name__)

# Search engines' crawlers, speed tests and test browsers run a page's scripts
# too; they are not people visiting the shop. "bot" only before / ; - or ),
# as in Googlebot/2.1 or AdsBot-Google: a phone called CUBOT is a person.
_BOTS = re.compile(
    r"bot[/;\-)]|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|"
    r"python-requests|httpx|curl/|wget/",
    re.IGNORECASE,
)
DEVICES = ("mobile", "tablet", "desktop")


def is_bot(user_agent: str | None) -> bool:
    return not user_agent or bool(_BOTS.search(user_agent))


def _path(url: Any) -> str | None:
    """The page's path only: no host, and nothing typed into a query string."""
    if not isinstance(url, str) or not url.strip():
        return None
    try:
        path = urlsplit(url.strip()).path or "/"
    except ValueError:
        return None
    return path[:500]


def _visit_id(value: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value or ""))
    except ValueError:
        return None


async def record(db: AsyncSession, tenant_id: Any, payload: dict[str, Any], user_agent: str | None) -> bool:
    """Keep one visit. False for a crawler, a visit with no id, or one already kept."""
    if is_bot(user_agent):
        return False
    visit_id = _visit_id(payload.get("id"))
    if visit_id is None:
        return False

    sent = {key: payload.get(key) for key in (*attribution.UTM_FIELDS, "referrer")}
    click = payload.get("click")
    if click in attribution.CLICK_FIELDS:
        sent[click] = "1"
    data = attribution.clean(sent)
    named = attribution.classify({**data["utm"], **data["meta"]})
    device = payload.get("device") if payload.get("device") in DEVICES else None

    result = await db.execute(text("""
        INSERT INTO storefront_visits
            (id, tenant_id, kind, source, utm_source, utm_medium, utm_campaign, landing_path, device)
        VALUES (:id, CAST(:t AS uuid), :kind, :source, :us, :um, :uc, :path, :device)
        ON CONFLICT (id) DO NOTHING
    """), {
        "id": str(visit_id), "t": str(tenant_id), "kind": named["kind"], "source": named["source"][:120],
        "us": data["utm"].get("utm_source"), "um": data["utm"].get("utm_medium"),
        "uc": data["utm"].get("utm_campaign"), "path": _path(payload.get("landing_page")), "device": device,
    })
    return (result.rowcount or 0) > 0


async def mark_converted(db: AsyncSession, order: Any, payload: Any) -> None:
    """The visit that placed this order (the last one the browser listed)
    counts as converted. Never stops the order: a visit that was not reported,
    or anything at all going wrong, leaves the order as it is."""
    try:
        sessions = attribution.clean(payload)["meta"].get("sessions") or []
        visit_id = _visit_id(sessions[-1].get("id")) if sessions else None
        tenant_id = getattr(order, "tenant_id", None)
        if visit_id is None or tenant_id is None or getattr(order, "id", None) is None:
            return
        async with db.begin_nested():
            await db.execute(text("""
                UPDATE storefront_visits SET order_id = CAST(:o AS uuid), converted_at = now()
                WHERE id = CAST(:id AS uuid) AND tenant_id = CAST(:t AS uuid) AND order_id IS NULL
            """), {"o": str(order.id), "id": str(visit_id), "t": str(tenant_id)})
    except Exception:  # noqa: BLE001  (a count on Home is never worth an order)
        logger.warning("Could not mark the visit for order %s as converted", getattr(order, "id", None), exc_info=True)


def rate(converted: int, sessions: int) -> float | None:
    """Percent of visits that placed an order, two decimals; None with no visits."""
    return round(converted / sessions * 100, 2) if sessions else None


async def stats(db: AsyncSession, tenant_id: Any, start: datetime, end: datetime) -> dict[str, Any]:
    """Visits that began in [start, end), how many ordered, and since when visits are counted."""
    row = (await db.execute(text("""
        SELECT count(*) AS sessions, count(*) FILTER (WHERE order_id IS NOT NULL) AS converted
        FROM storefront_visits
        WHERE tenant_id = CAST(:t AS uuid) AND started_at >= :start AND started_at < :end
    """), {"t": str(tenant_id), "start": start, "end": end})).mappings().one()
    first = (await db.execute(text(
        "SELECT min(started_at) FROM storefront_visits WHERE tenant_id = CAST(:t AS uuid)"
    ), {"t": str(tenant_id)})).scalar()
    sessions, converted = int(row["sessions"] or 0), int(row["converted"] or 0)
    return {
        "sessions": sessions,
        "converted": converted,
        "conversion_rate": rate(converted, sessions),
        "counted_since": first.isoformat() if first else None,
    }
