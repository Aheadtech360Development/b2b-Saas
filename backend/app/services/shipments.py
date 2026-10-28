"""Parcels and where they are: the one place shipments are written.

- `record` a tracking number that has arrived: a label bought, a number typed
  by the shop, or one a supplier sent. A comma separated list is one shipment
  each. The same number twice on one order is one shipment.
- `set_status` when the courier or the shop says where a parcel is now. When
  every parcel of a shipped order is delivered, the order is delivered.
- `from_courier` turns Shippo's words into ours.
- `timeline` is the buyer's steps for one parcel: Paid, Packed, Shipped, Out
  for delivery, Delivered.

`orders.tracking_*` stay the callers' to write, as before; this keeps the
parcels beside them (migration 0068_retail_shipments).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import select

from app.models.shipment import Shipment, ShipmentEvent

logger = logging.getLogger(__name__)

STATUSES = ("label_created", "in_transit", "out_for_delivery", "delivered", "returned", "failure", "unknown")
FINAL = frozenset({"delivered", "returned"})
SOURCES = ("courier", "manual")

# How often the tracking loop asks the courier: every 2 hours for the first
# 3 days, every 6 after that, and not at all after 30 days.
CHECK_EVERY = timedelta(hours=2)
SLOWER_AFTER = timedelta(days=3)
SLOW_EVERY = timedelta(hours=6)
GIVE_UP_AFTER = timedelta(days=30)

# The buyer's steps, and how far each status gets along them.
STEPS: list[tuple[str, str]] = [
    ("paid", "Paid"), ("packed", "Packed"), ("shipped", "Shipped"),
    ("out_for_delivery", "Out for delivery"), ("delivered", "Delivered"),
]
_REACHED = {"label_created": 2, "in_transit": 3, "unknown": 3, "failure": 3, "returned": 3,
            "out_for_delivery": 4, "delivered": 5}

WORDS = {
    "label_created": "Label created", "in_transit": "In transit", "out_for_delivery": "Out for delivery",
    "delivered": "Delivered", "returned": "Returned to the shop", "failure": "Delivery problem",
    "unknown": "Waiting for the courier",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def numbers_in(raw: str | None) -> list[str]:
    """The tracking numbers in a field that may hold several, comma separated."""
    return list(dict.fromkeys(x.strip() for x in (raw or "").split(",") if x.strip()))


def from_courier(status: str | None, substatus: str | None = None) -> str:
    """Shippo's tracking status (PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED,
    FAILURE, UNKNOWN) and substatus code, in our words."""
    s = (status or "").strip().upper()
    if s == "DELIVERED":
        return "delivered"
    if s == "RETURNED":
        return "returned"
    if s == "FAILURE":
        return "failure"
    if s == "TRANSIT":
        return "out_for_delivery" if "out_for_delivery" in (substatus or "").lower() else "in_transit"
    if s == "PRE_TRANSIT":
        return "label_created"
    return "unknown"


def next_check(status: str, shipped_at: datetime | None, now: datetime | None = None) -> datetime | None:
    """When to ask the courier again, or None when there is no point."""
    now = now or _now()
    if status in FINAL:
        return None
    age = now - (shipped_at or now)
    if age > GIVE_UP_AFTER:
        return None
    return now + (SLOW_EVERY if age > SLOWER_AFTER else CHECK_EVERY)


def timeline(status: str, *, paid: bool = True) -> list[dict[str, Any]]:
    """The buyer's steps for one parcel, each done or not."""
    reached = _REACHED.get(status, 2)
    return [{"key": key, "label": label, "done": (i + 1 <= reached) and (paid or i > 0)}
            for i, (key, label) in enumerate(STEPS)]


async def for_order(db, order_id) -> list[Shipment]:
    return list((await db.execute(
        select(Shipment).where(Shipment.order_id == order_id).order_by(Shipment.created_at)
    )).scalars().all())


def _event(shipment: Shipment, status: str, source: str, note: str | None, at: datetime) -> ShipmentEvent:
    return ShipmentEvent(tenant_id=shipment.tenant_id, shipment_id=shipment.id, status=status, source=source,
                         note=(note or None) and note[:500], occurred_at=at)


async def record(
    db,
    order,
    tracking_number: str | None,
    *,
    carrier: str | None = None,
    service: str | None = None,
    tracking_url: str | None = None,
    status: str = "label_created",
    source: str = "courier",
    note: str | None = None,
    now: datetime | None = None,
) -> list[Shipment]:
    """The shipments for the numbers in `tracking_number` on this order: new
    ones made, known ones given any courier, service or link they lacked.
    Inside the caller's transaction; never commits."""
    numbers = numbers_in(tracking_number)
    if not numbers:
        return []
    now = now or _now()
    status = status if status in STATUSES else "label_created"
    known = {s.tracking_number: s for s in await for_order(db, order.id)}
    out: list[Shipment] = []
    for number in numbers:
        row = known.get(number)
        if row is None:
            row = Shipment(
                tenant_id=order.tenant_id, order_id=order.id, carrier=(carrier or None) and carrier[:100],
                service=(service or None) and service[:100], tracking_number=number[:255],
                # A link names one parcel: kept only when the field held one number.
                tracking_url=tracking_url if len(numbers) == 1 else None,
                status=status, status_source=source, shipped_at=now,
                next_check_at=next_check(status, now, now),
            )
            db.add(row)
            await db.flush()
            db.add(_event(row, status, source, note or "Tracking number added", now))
        else:
            row.carrier = row.carrier or ((carrier or None) and carrier[:100])
            row.service = row.service or ((service or None) and service[:100])
            if tracking_url and len(numbers) == 1:
                row.tracking_url = tracking_url
        out.append(row)
    return out


async def record_safely(db, order, tracking_number: str | None, **kw) -> list[Shipment]:
    """`record` in a savepoint: a parcel row that cannot be written never fails
    the label purchase, status change or supplier update it rides on."""
    try:
        async with db.begin_nested():
            return await record(db, order, tracking_number, **kw)
    except Exception:  # noqa: BLE001
        logger.exception("Could not record shipment %s on order %s", tracking_number, getattr(order, "id", None))
        return []


async def mark_order(db, order, status: str, *, source: str = "manual", note: str | None = None) -> None:
    """Every parcel of an order moved together, as when the shop marks the
    whole order delivered. In a savepoint, like `record_safely`."""
    try:
        async with db.begin_nested():
            for parcel in await for_order(db, order.id):
                if parcel.status != status:
                    await set_status(db, parcel, status, source=source, note=note)
    except Exception:  # noqa: BLE001
        logger.exception("Could not move the shipments of order %s to %s", getattr(order, "id", None), status)


async def set_status(
    db,
    shipment: Shipment,
    status: str,
    *,
    source: str,
    note: str | None = None,
    at: datetime | None = None,
) -> bool:
    """Move a parcel on. Returns whether anything changed. A courier repeating
    what it said last time changes nothing but when it was last asked."""
    if status not in STATUSES:
        raise ValueError(f"Unknown shipment status: {status}")
    if source not in SOURCES:
        raise ValueError(f"Unknown source: {source}")
    at = at or _now()
    if source == "courier":
        shipment.last_checked_at = at
    if status == shipment.status and (note or None) == shipment.status_detail:
        shipment.next_check_at = next_check(status, shipment.shipped_at, at)
        return False
    shipment.status = status
    shipment.status_source = source
    shipment.status_detail = (note or None) and note[:500]
    if status != "label_created" and not shipment.shipped_at:
        shipment.shipped_at = at
    if status == "delivered":
        shipment.delivered_at = shipment.delivered_at or at
    shipment.next_check_at = next_check(status, shipment.shipped_at, at)
    db.add(_event(shipment, status, source, note, at))
    await _order_follows(db, shipment, at)
    return True


async def _order_follows(db, shipment: Shipment, at: datetime) -> None:
    """A shipped order whose every parcel is delivered is delivered."""
    if shipment.status != "delivered":
        return
    from app.models.order import Order
    from app.services import order_events

    order = (await db.execute(select(Order).where(Order.id == shipment.order_id))).scalar_one_or_none()
    if order is None or order.status != "shipped":
        return
    parcels = await for_order(db, order.id)
    if parcels and all(p.status == "delivered" for p in parcels):
        order.status = "delivered"
        await order_events.record(db, order, "delivered", "Delivered", occurred_at=at)


def view(shipment: Shipment, *, paid: bool = True) -> dict[str, Any]:
    """One parcel as the tracking page and the admin show it."""
    return {
        "id": str(shipment.id),
        "carrier": shipment.carrier,
        "service": shipment.service,
        "tracking_number": shipment.tracking_number,
        "tracking_url": shipment.tracking_url,
        "status": shipment.status,
        "status_words": WORDS.get(shipment.status, shipment.status),
        "status_source": shipment.status_source,
        "detail": shipment.status_detail,
        "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "delivered_at": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
        "steps": timeline(shipment.status, paid=paid),
    }


def views(shipments: Iterable[Shipment], *, paid: bool = True) -> list[dict[str, Any]]:
    return [view(s, paid=paid) for s in shipments]
