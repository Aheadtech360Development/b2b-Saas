"""Quotes: requests that need a price, then orders once accepted.

A quote is a draft order (DRAFT-<six digits>, status pending) priced line by
line: one made on the Quotes screen, on the Drafts tab, or by the Copilot
(copilot/quoting.py). Before it is priced, a quote is a request: what came in
on the storefront's "Get a quote" form (an Inbox message, services/inbox).

Where a quote stands, in order:

- needs_pricing  a quote request not yet made into a draft (and not archived);
- draft          priced, not sent;
- sent           emailed to the customer with a valid-until date;
- expired        sent, and the date has passed without an answer;
- accepted       the customer accepted it from the quote's own page;
- ordered        converted: the draft became an order with a real number.

Sent, accepted and the link from a request are order events (quote_sent,
quote_accepted, order_created's quote_request_id), so none of this needs a
column. A converted draft is found again by the number it had, kept on its
order_confirmed event (from_draft), so a quote link sent before still opens.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.order import Order, OrderEvent, OrderItem
from app.services import inbox

STATUS_WORDS = {
    "needs_pricing": "Needs pricing", "draft": "Draft", "sent": "Sent", "expired": "Expired",
    "accepted": "Accepted", "ordered": "Ordered",
}
# How long a quote holds by default, when the shop does not say.
DEFAULT_VALID_DAYS = 30


def default_valid_until(today: date) -> date:
    return today + timedelta(days=DEFAULT_VALID_DAYS)


def status_of(*, order_status: str, sent: dict | None, accepted: bool, today: date) -> str:
    """Where a draft stands as a quote (see the module's note)."""
    if order_status != "pending":
        return "ordered"
    if accepted:
        return "accepted"
    if sent:
        until = sent.get("valid_until")
        if until and date.fromisoformat(until) < today:
            return "expired"
        return "sent"
    return "draft"


async def _events(db: AsyncSession, order_ids: list[Any], types: tuple[str, ...]) -> dict[tuple[str, str], dict]:
    """The latest event of each type per order: {(order id, type): meta + when}."""
    if not order_ids:
        return {}
    rows = (await db.execute(
        select(OrderEvent.order_id, OrderEvent.type, OrderEvent.meta, OrderEvent.occurred_at)
        .where(OrderEvent.order_id.in_(order_ids), OrderEvent.type.in_(types))
        .order_by(OrderEvent.occurred_at)
    )).all()
    out: dict[tuple[str, str], dict] = {}
    for oid, kind, meta, at in rows:
        out[(str(oid), kind)] = {**(meta or {}), "at": at.isoformat() if at else None}
    return out


async def _quote_orders(db: AsyncSession) -> list[tuple[Order, str | None]]:
    """Drafts still open, and drafts converted in the last 90 days."""
    since = datetime.now(timezone.utc) - timedelta(days=90)
    pending = (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
        .where(Order.order_number.like("DRAFT-%"), Order.status == "pending")
        .order_by(Order.created_at.desc()).limit(500)
    )).all()
    converted_ids = [r[0] for r in (await db.execute(
        select(OrderEvent.order_id).where(OrderEvent.type == "order_confirmed",
                                          OrderEvent.meta["from_draft"].astext.isnot(None),
                                          OrderEvent.occurred_at >= since)
    )).all()]
    converted = (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
        .where(Order.id.in_(converted_ids))
    )).all() if converted_ids else []
    return list(pending) + list(converted)


async def _requests(db: AsyncSession, tenant_id: Any, linked: set[str]) -> list[dict[str, Any]]:
    """Quote requests not archived and not yet made into a quote."""
    rows = (await db.execute(text(f"""
        SELECT id, page_slug, form_name, data, is_read, answered_at, archived_at, created_at
          FROM contact_submissions
         WHERE tenant_id = CAST(:t AS uuid) AND archived_at IS NULL AND {inbox._QUOTE_SQL}
         ORDER BY created_at DESC LIMIT 200
    """), {"t": str(tenant_id)})).mappings().all()
    return [inbox.row(m) for m in rows if str(m["id"]) not in linked]


async def board(db: AsyncSession, tenant_id: Any, *, utc_offset_minutes: int = 0) -> list[dict[str, Any]]:
    """Every quote and quote request, newest first."""
    today = (datetime.now(timezone.utc) + timedelta(minutes=utc_offset_minutes)).date()
    orders = await _quote_orders(db)
    ids = [o.id for o, _ in orders]
    ev = await _events(db, ids, ("order_created", "quote_sent", "quote_accepted", "order_confirmed"))
    linked = {str(e["quote_request_id"]) for (_, kind), e in ev.items()
              if kind == "order_created" and e.get("quote_request_id")}
    rows: list[dict[str, Any]] = []
    for o, company in orders:
        oid = str(o.id)
        sent = ev.get((oid, "quote_sent"))
        made = ev.get((oid, "order_created")) or {}
        status = status_of(order_status=o.status, sent=sent, accepted=(oid, "quote_accepted") in ev, today=today)
        number = (ev.get((oid, "order_confirmed")) or {}).get("from_draft") or o.order_number
        rows.append({
            "kind": "quote", "id": oid, "number": number,
            "order_number": o.order_number if status == "ordered" else None,
            "customer": company or o.guest_name or o.guest_email or "Customer",
            "requested_at": o.created_at.isoformat() if o.created_at else None,
            "total": float(o.total or 0),
            "status": status, "status_words": STATUS_WORDS[status],
            "valid_until": (sent or {}).get("valid_until"),
            "request_id": made.get("quote_request_id"),
            "by_copilot": "copilot" in (o.notes or "").lower(),
        })
    for r in await _requests(db, tenant_id, linked):
        who = r["from"]
        rows.append({
            "kind": "request", "id": r["id"], "number": f"REQ-{r['id'][:6].upper()}",
            "order_number": None,
            "customer": who.get("company") or who.get("name") or who.get("email") or "Someone",
            "requested_at": r["created_at"], "total": None,
            "status": "needs_pricing", "status_words": STATUS_WORDS["needs_pricing"],
            "valid_until": None, "request_id": r["id"], "by_copilot": False,
            # Who asked and what for, as the Inbox reads the form.
            "from": who,
        })
    rows.sort(key=lambda x: x["requested_at"] or "", reverse=True)
    return rows


async def detail(db: AsyncSession, tenant_id: Any, order_id: Any, *, utc_offset_minutes: int = 0) -> dict[str, Any] | None:
    """One quote: its lines, what the customer asked for, and its dates."""
    today = (datetime.now(timezone.utc) + timedelta(minutes=utc_offset_minutes)).date()
    found = (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id).where(Order.id == order_id)
    )).first()
    if not found:
        return None
    o, company = found
    oid = str(o.id)
    ev = await _events(db, [o.id], ("order_created", "quote_sent", "quote_accepted", "order_confirmed"))
    sent = ev.get((oid, "quote_sent"))
    accepted = ev.get((oid, "quote_accepted"))
    status = status_of(order_status=o.status, sent=sent, accepted=accepted is not None, today=today)
    asked = None
    request_id = (ev.get((oid, "order_created")) or {}).get("quote_request_id")
    if request_id:
        m = (await db.execute(text("""
            SELECT id, page_slug, form_name, data, is_read, answered_at, archived_at, created_at
              FROM contact_submissions WHERE id = CAST(:id AS uuid) AND tenant_id = CAST(:t AS uuid)
        """), {"id": str(request_id), "t": str(tenant_id)})).mappings().first()
        if m:
            asked = inbox.row(m)
    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == o.id))).scalars().all()
    return {
        "id": oid,
        "number": (ev.get((oid, "order_confirmed")) or {}).get("from_draft") or o.order_number,
        "order_number": o.order_number if status == "ordered" else None,
        "company_id": str(o.company_id) if o.company_id else None,
        "customer": company or o.guest_name or o.guest_email or "Customer",
        "status": status, "status_words": STATUS_WORDS[status],
        "notes": o.notes,
        "asked": asked,
        "items": [{"id": str(i.id), "name": i.product_name, "sku": i.sku, "color": i.color, "size": i.size,
                   "quantity": i.quantity, "unit_price": float(i.unit_price or 0), "line_total": float(i.line_total or 0)}
                  for i in items],
        "subtotal": float(o.subtotal or 0), "shipping": float(o.shipping_cost or 0),
        "tax": float(o.tax_amount or 0), "total": float(o.total or 0),
        "valid_until": (sent or {}).get("valid_until"),
        "sent_at": (sent or {}).get("at"), "sent_to": (sent or {}).get("to"),
        "accepted_at": (accepted or {}).get("at"),
        "default_valid_until": default_valid_until(today).isoformat(),
    }


async def find_by_number(db: AsyncSession, tenant_id: Any, number: str) -> Order | None:
    """A quote by the number its customer was sent, also once converted."""
    number = (number or "").strip().upper()
    # Only a quote's own number: an order's number does not open its order here.
    if not number.startswith("DRAFT-") or not tenant_id:
        return None
    order = (await db.execute(
        select(Order).where(Order.order_number == number, Order.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if order is not None:
        return order
    moved = (await db.execute(
        select(OrderEvent.order_id).where(OrderEvent.type == "order_confirmed",
                                          OrderEvent.meta["from_draft"].astext == number)
    )).first()
    if not moved:
        return None
    return (await db.execute(
        select(Order).where(Order.id == moved[0], Order.tenant_id == tenant_id)
    )).scalar_one_or_none()
