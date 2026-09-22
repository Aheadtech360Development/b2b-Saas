"""The order history: one stored row per thing that happened, and when.

Why this exists
---------------
The history used to live in `orders.timeline`, a JSONB array. Every writer read
the whole array, appended to it in Python, and wrote the whole array back. Two
writers at once — a supplier job finishing while an admin changes the status —
and one of the two entries was simply gone. On top of that, the "Order placed"
line was never stored anywhere: the order page drew it from `orders.created_at`,
so part of the history a brand looked at was a guess rather than a record.

Here an event is an INSERT, which no concurrent write can clobber, and it
carries the real moment it happened plus who caused it.

Two times, on purpose
---------------------
`occurred_at` is when the thing happened; `created_at` is when we wrote it down.
They differ whenever somebody else's clock is the true one — a carrier's
delivery scan, a supplier's ship confirmation — and a timeline that showed our
clock for those would be telling the brand something false.

Never invent an event
---------------------
Everything here is called from the code path that actually performs the action.
Nothing derives an event from a status alone, because a status says where an
order *is*, never when it got there.

Recording joins the caller's transaction
----------------------------------------
`record()` adds to the session without committing. The event is therefore
saved exactly when the action it describes is saved, and rolled back with it —
never a history entry for something that did not happen.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderEvent

logger = logging.getLogger(__name__)


# ── The catalogue ───────────────────────────────────────────────────────────
# `label` is the heading the timeline shows when the caller gives no message.
# `customer` marks the events a buyer may see on their own order — internal
# notes, supplier purchase orders and staff edits are deliberately not among
# them.
EVENTS: dict[str, dict[str, Any]] = {
    # Placing and paying
    "order_created":       {"label": "Order placed",              "customer": True},
    "order_confirmed":     {"label": "Order confirmed",           "customer": True},
    "payment_authorized":  {"label": "Payment authorised",        "customer": True},
    "payment_received":    {"label": "Payment received",          "customer": True},
    "payment_failed":      {"label": "Payment failed",            "customer": True},
    "invoice_sent":        {"label": "Invoice sent",              "customer": True},
    "discount_applied":    {"label": "Discount applied",          "customer": True},
    # Working on it
    "processing_started":  {"label": "Processing started",        "customer": True},
    "items_edited":        {"label": "Items changed",             "customer": True},
    "status_changed":      {"label": "Status changed",            "customer": True},
    "ready_for_pickup":    {"label": "Ready for pickup",          "customer": True},
    # Getting it there
    "label_purchased":     {"label": "Shipping label bought",     "customer": False},
    "tracking_added":      {"label": "Tracking added",            "customer": True},
    "shipped":             {"label": "Order shipped",             "customer": True},
    "delivered":           {"label": "Order delivered",           "customer": True},
    # Undoing it
    "cancelled":           {"label": "Order cancelled",           "customer": True},
    "return_requested":    {"label": "Return requested",          "customer": True},
    "return_approved":     {"label": "Return approved",           "customer": True},
    "return_rejected":     {"label": "Return rejected",           "customer": True},
    "return_completed":    {"label": "Return completed",          "customer": True},
    "refund_issued":       {"label": "Refund issued",             "customer": True},
    "restocked":           {"label": "Items restocked",           "customer": False},
    # Chargebacks. Internal: the customer started it at their bank and does
    # not need the brand's side of it on their order page.
    "dispute_opened":           {"label": "Payment disputed",          "customer": False},
    "dispute_updated":          {"label": "Dispute updated",           "customer": False},
    "dispute_won":              {"label": "Dispute won",               "customer": False},
    "dispute_lost":             {"label": "Dispute lost",              "customer": False},
    "dispute_funds_withdrawn":  {"label": "Dispute funds withdrawn",   "customer": False},
    "dispute_funds_reinstated": {"label": "Dispute funds returned",    "customer": False},
    # Talking about it
    "note":                {"label": "Note",                      "customer": False},
    "comment":             {"label": "Comment",                   "customer": True},
    "email_sent":          {"label": "Email sent",                "customer": False},
    # The purchase order behind the sale
    "supplier_po_sent":    {"label": "Sent to supplier",          "customer": False},
    "supplier_po_failed":  {"label": "Supplier order failed",     "customer": False},
    "supplier_shipped":    {"label": "Supplier shipped it",       "customer": False},
}

CUSTOMER_VISIBLE: frozenset[str] = frozenset(k for k, v in EVENTS.items() if v["customer"])

# What the old `orders.timeline` entries carried in their "status" field, so the
# dual write below keeps saying what those readers expect.
_STATUS_FOR_TYPE: dict[str, str] = {
    "order_created": "pending",
    "order_confirmed": "confirmed",
    "processing_started": "processing",
    "ready_for_pickup": "ready_for_pickup",
    "shipped": "shipped",
    "delivered": "delivered",
    "cancelled": "cancelled",
    "refund_issued": "refunded",
    "payment_received": "paid",
    "invoice_sent": "invoice_sent",
}


def label_for(event_type: str) -> str:
    return EVENTS.get(event_type, {}).get("label", event_type.replace("_", " ").capitalize())


async def record(
    db: AsyncSession,
    order: Any,
    event_type: str,
    message: str | None = None,
    *,
    actor_type: str = "system",
    actor_id: uuid.UUID | str | None = None,
    actor_name: str | None = None,
    meta: dict | None = None,
    occurred_at: datetime | None = None,
    mirror: bool = True,
) -> OrderEvent | None:
    """Write one event onto an order, inside the caller's transaction.

    `order` may be an Order or just its id. `occurred_at` defaults to now, and
    is passed explicitly whenever somebody else's clock is the true one.

    With `mirror`, the entry is also appended to the legacy `orders.timeline`
    array so screens still reading that keep working. The append is done in SQL
    (`timeline || entry`) rather than in Python, so even the old column stops
    losing concurrent writes.

    Recording must never be the reason an order action fails: on error this
    logs and returns None. The action itself still commits.
    """
    order_id = getattr(order, "id", order)
    if order_id is None:
        return None
    when = occurred_at or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    body = (message or label_for(event_type)).strip()

    try:
        event = OrderEvent(
            order_id=order_id if isinstance(order_id, uuid.UUID) else uuid.UUID(str(order_id)),
            type=event_type,
            message=body,
            actor_type=actor_type,
            actor_id=uuid.UUID(str(actor_id)) if actor_id else None,
            actor_name=actor_name,
            meta=meta or None,
            occurred_at=when,
        )
        # A tenant-scoped model: `tenant_id` is stamped by the flush hook, and
        # taken from the order when the event is written by a background job
        # that has no request tenant of its own.
        parent_tenant = getattr(order, "tenant_id", None)
        if parent_tenant is not None:
            event.tenant_id = parent_tenant
        db.add(event)
    except Exception:
        logger.exception("Could not record order event %s for order %s", event_type, order_id)
        return None

    if mirror:
        try:
            entry = {
                "status": _STATUS_FOR_TYPE.get(event_type, event_type),
                "message": body,
                "created_by": actor_name or actor_type,
                "created_at": when.isoformat(),
            }
            await db.execute(
                text(
                    "UPDATE orders SET timeline = "
                    "COALESCE(CASE WHEN jsonb_typeof(timeline) = 'array' THEN timeline END, '[]'::jsonb)"
                    " || CAST(:entry AS jsonb) WHERE id = :oid"
                ),
                {"entry": json.dumps([entry]), "oid": str(order_id)},
            )
        except Exception:
            logger.exception("Could not mirror order event %s to orders.timeline", event_type)

    return event


async def admin_actor(db: AsyncSession, request: Any) -> tuple[uuid.UUID | None, str]:
    """Which staff member is doing this, by id and display name.

    The old history recorded the literal word "admin" for every staff action,
    so a brand could never tell who cancelled an order. Falls back to "Admin"
    when the request carries no user.
    """
    user_id = getattr(getattr(request, "state", None), "user_id", None)
    if not user_id:
        return None, "Admin"
    try:
        from app.models.user import User

        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user:
            name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            return user.id, (name or user.email or "Admin")
    except Exception:
        logger.debug("Could not resolve the acting admin", exc_info=True)
    try:
        return uuid.UUID(str(user_id)), "Admin"
    except (ValueError, TypeError):
        return None, "Admin"


async def record_admin(
    db: AsyncSession, request: Any, order: Any, event_type: str,
    message: str | None = None, **kwargs: Any,
) -> OrderEvent | None:
    """`record()` for something a staff member did, with their name attached."""
    actor_id, actor_name = await admin_actor(db, request)
    return await record(
        db, order, event_type, message,
        actor_type="admin", actor_id=actor_id, actor_name=actor_name, **kwargs,
    )


def to_dict(event: OrderEvent) -> dict[str, Any]:
    """One event as the API and the timeline card want it."""
    return {
        "id": str(event.id),
        "type": event.type,
        "label": label_for(event.type),
        "message": event.message,
        "actor_type": event.actor_type,
        "actor_name": event.actor_name,
        "meta": event.meta or {},
        "occurred_at": event.occurred_at.isoformat() if event.occurred_at else None,
        "recorded_at": event.created_at.isoformat() if event.created_at else None,
    }


async def for_order(
    db: AsyncSession,
    order_id: uuid.UUID | str,
    *,
    only: Iterable[str] | None = None,
    newest_first: bool = True,
) -> list[dict[str, Any]]:
    """This order's history, oldest or newest first.

    `only` limits it to a set of types — the buyer's copy of an order passes
    CUSTOMER_VISIBLE so internal notes and supplier purchase orders stay
    internal.
    """
    query = select(OrderEvent).where(OrderEvent.order_id == order_id)
    if only is not None:
        query = query.where(OrderEvent.type.in_(list(only)))
    # Ties broken by insertion order so two events in the same moment still read
    # in the order they happened.
    query = query.order_by(OrderEvent.occurred_at.asc(), OrderEvent.created_at.asc())
    rows = list((await db.execute(query)).scalars().all())
    if newest_first:
        rows.reverse()
    return [to_dict(row) for row in rows]
