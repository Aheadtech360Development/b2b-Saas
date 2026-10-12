"""Where an order stands, said once.

The pills on the order list, the panel beside it, the steps across the top of
an order and the order's main button all answer one question: what has
happened to this order, and what is next. They read the answer from here, so a
row cannot say "To ship" while the order's own page offers "Confirm".

Pure. It is handed what is known about an order (its status, how it is paid
and delivered, the print jobs on it, whether it has been packed) and returns
words. Nothing in this file reads the database; `facts_for` at the foot does,
for a page of orders at a time.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

# A print job the shop has not approved yet, or one sent back to the customer.
WAITING_JOBS = ("submitted", "in_review", "revision_requested")
# Accepted by the shop and not finished.
IN_HAND = ("confirmed", "processing")
CLOSED = ("delivered", "cancelled", "refunded")


@dataclass(frozen=True)
class Facts:
    status: str
    payment_status: str = "unpaid"
    shipping_method: str | None = None
    # The status of each print job on the order.
    jobs: tuple[str, ...] = ()
    # Lines that carry a file the buyer uploaded and have no print job of their own.
    files: int = 0
    packed: bool = False
    # Something was paid, but not all of it.
    part_paid: bool = False


def is_pickup(method: str | None) -> bool:
    m = (method or "").lower()
    return "will_call" in m or "pickup" in m


def _pill(key: str, label: str, tone: str = "") -> dict:
    return {"key": key, "label": label, "tone": tone}


def payment(f: Facts) -> dict:
    p = (f.payment_status or "").lower()
    if p == "paid":
        return _pill("paid", "Paid", "green")
    if p == "refunded":
        return _pill("refunded", "Refunded")
    if p == "authorized":
        return _pill("authorized", "Authorised", "blue")
    if p == "failed":
        return _pill("failed", "Payment failed", "red")
    if f.part_paid:
        return _pill("part_paid", "Part paid", "amber")
    return _pill("unpaid", "Unpaid", "amber")


def artwork(f: Facts) -> dict:
    if not f.jobs:
        return _pill("file", "File attached", "blue") if f.files else _pill("none", "No file")
    live = [j for j in f.jobs if j != "rejected"]
    if not live:
        return _pill("rejected", "Rejected", "red")
    if "revision_requested" in live:
        return _pill("revision", "Revision asked", "red")
    if any(j in ("submitted", "in_review") for j in live):
        return _pill("in_review", "In review", "amber")
    if all(j == "completed" for j in live):
        return _pill("printed", "Printed", "green")
    if "production" in live:
        return _pill("printing", "Printing", "blue")
    return _pill("approved", "Approved", "green")


def fulfilment(f: Facts) -> dict:
    s = f.status
    pickup = is_pickup(f.shipping_method)
    if s == "cancelled":
        return _pill("cancelled", "Cancelled")
    if s == "refunded":
        return _pill("refunded", "Refunded")
    if s == "delivered":
        return _pill("delivered", "Collected" if pickup else "Delivered", "green")
    if s == "shipped":
        return _pill("shipped", "Shipped", "green")
    if s == "ready_for_pickup":
        return _pill("ready_for_pickup", "Ready for pickup", "blue")
    if s == "pending":
        return _pill("to_confirm", "To confirm", "amber")
    art = artwork(f)["key"]
    if art in ("in_review", "revision"):
        return _pill("waiting_artwork", "Waiting on artwork", "amber")
    if pickup:
        return _pill("preparing_pickup", "Preparing for pickup", "amber")
    if f.packed:
        return _pill("packed", "Packed", "blue")
    if art in ("approved", "printing"):
        return _pill("in_production", "In production", "blue")
    return _pill("to_ship", "To ship", "red")


def next_step(f: Facts) -> dict:
    """The one thing to do next, as a key the page knows how to act on."""
    def step(key: str, label: str, hint: str = "") -> dict:
        return {"key": key, "label": label, "hint": hint}

    s = f.status
    paid = (f.payment_status or "").lower() == "paid"
    if s in ("cancelled", "refunded"):
        return step("none", "Nothing left to do")
    if s == "pending":
        return step("confirm", "Confirm the order", "The customer is told it has been confirmed.")
    if s == "delivered":
        if not paid:
            return step("collect", "Collect the payment", "It has been delivered and is not paid in full.")
        return step("none", "Nothing left to do")
    if s == "shipped":
        return step("deliver", "Mark it delivered", "When the parcel has arrived.")
    if s == "ready_for_pickup":
        return step("collected", "Hand it over", "Mark it collected once the customer has it.")
    art = artwork(f)["key"]
    if art == "in_review":
        return step("artwork", "Review the artwork", "A print job on this order is waiting for approval.")
    if art == "revision":
        return step("customer", "Wait for the customer", "They were asked to send the artwork again.")
    if is_pickup(f.shipping_method):
        return step("ready", "Mark it ready for pickup", "The customer is told where and when to collect it.")
    return step("ship", "Buy a shipping label", "Or mark it shipped with a tracking number of your own.")


def steps(f: Facts) -> list[dict]:
    """The steps across the top of an order. Each is done or not on its own
    evidence; the first that is not done is the current one."""
    s = f.status
    pickup = is_pickup(f.shipping_method)
    paid = (f.payment_status or "").lower() in ("paid", "refunded")
    out: list[tuple[str, str, bool]] = [("placed", "Placed", True), ("paid", "Paid", paid)]

    if s in ("cancelled", "refunded"):
        done = [{"key": k, "label": label, "state": "done" if ok else "todo"} for k, label, ok in out]
        return done + [{"key": s, "label": "Cancelled" if s == "cancelled" else "Refunded", "state": "stopped"}]

    out.append(("confirmed", "Confirmed", s != "pending"))
    if f.jobs or f.files:
        out.append(("artwork", "Artwork approved", artwork(f)["key"] in ("approved", "printing", "printed", "file")))
    if pickup:
        out.append(("ready", "Ready for pickup", s in ("ready_for_pickup", "delivered")))
        out.append(("delivered", "Collected", s == "delivered"))
    else:
        out.append(("packed", "Packed", f.packed or s in ("shipped", "delivered")))
        out.append(("shipped", "Shipped", s in ("shipped", "delivered")))
        out.append(("delivered", "Delivered", s == "delivered"))

    result, current_given = [], False
    for key, label, ok in out:
        if ok:
            state = "done"
        elif not current_given:
            state, current_given = "current", True
        else:
            state = "todo"
        result.append({"key": key, "label": label, "state": state})
    return result


def summary(f: Facts) -> dict:
    """What a row of the order list carries."""
    return {"payment": payment(f), "artwork": artwork(f), "fulfilment": fulfilment(f),
            "next": next_step(f), "packed": f.packed, "pickup": is_pickup(f.shipping_method)}


# ── Reading the facts ────────────────────────────────────────────────────────

def _has_file(configuration: Any) -> bool:
    art = (configuration or {}).get("artwork") if isinstance(configuration, dict) else None
    return bool(isinstance(art, dict) and art.get("url"))


async def facts_for(db, orders: Iterable[Any]) -> dict:
    """The facts for a page of orders, in three queries however many there are.

    Returns {order id: Facts}. A part that cannot be read (a table missing on an
    old database) leaves its facts empty rather than failing the list.
    """
    import logging

    from sqlalchemy import select

    from app.models.order import OrderEvent, OrderItem

    log = logging.getLogger(__name__)
    orders = list(orders)
    ids = [o.id for o in orders]
    jobs: dict[Any, list[str]] = {}
    packed: set = set()
    files: dict[Any, int] = {}
    if ids:
        try:
            from app.api.v1.gang_sheets import GangSheetOrder

            async with db.begin_nested():
                for oid, status in (await db.execute(
                    select(GangSheetOrder.order_id, GangSheetOrder.status).where(GangSheetOrder.order_id.in_(ids))
                )).all():
                    jobs.setdefault(oid, []).append(status)
        except Exception as exc:  # noqa: BLE001
            log.warning("order progress: print jobs unreadable: %s", exc)
        try:
            async with db.begin_nested():
                packed = set((await db.execute(
                    select(OrderEvent.order_id).where(OrderEvent.order_id.in_(ids), OrderEvent.type == "packed")
                )).scalars().all())
        except Exception as exc:  # noqa: BLE001
            log.warning("order progress: packed events unreadable: %s", exc)
        try:
            async with db.begin_nested():
                for oid, sku, configuration in (await db.execute(
                    select(OrderItem.order_id, OrderItem.sku, OrderItem.configuration)
                    .where(OrderItem.order_id.in_(ids), OrderItem.configuration.isnot(None))
                )).all():
                    if (sku or "").upper() != "GANG-SHEET" and _has_file(configuration):
                        files[oid] = files.get(oid, 0) + 1
        except Exception as exc:  # noqa: BLE001
            log.warning("order progress: line files unreadable: %s", exc)

    out = {}
    for o in orders:
        paid_so_far = float(getattr(o, "amount_paid", 0) or 0)
        out[o.id] = Facts(
            status=o.status,
            payment_status=o.payment_status,
            shipping_method=getattr(o, "shipping_method", None),
            jobs=tuple(jobs.get(o.id, ())),
            files=files.get(o.id, 0),
            packed=o.id in packed,
            part_paid=0 < paid_so_far < float(o.total or 0),
        )
    return out
