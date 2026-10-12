"""Named slices of the order list.

Home says "3 paid orders to ship" and the button beside it opens the order
list. Both read the slice from here, so the number and the rows behind it are
the same rows because there is one definition, not two filters kept alike by
hand.

Four of Home's pipeline stages are slices too (new, in production, ready,
shipped), and no order is in two of them. An accepted order with a print job
still to approve is in none: that job is counted under "Awaiting artwork".

The order list's tabs are slices as well, so a tab's count and the rows under
it are the same rows.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.order import Order

# Paid, but not yet out of the door.
UNSHIPPED = ("pending", "confirmed", "processing")
# Accepted by the shop and not finished.
IN_HAND = ("confirmed", "processing")
# How long a paid order may sit unshipped before it is late.
LATE_AFTER_DAYS = 3


def real():
    """Not a draft the shop is still writing."""
    return ~Order.order_number.like("DRAFT-%")


def _job(*states: str):
    """The order has a print job in one of these states."""
    from app.api.v1.gang_sheets import GangSheetOrder

    return exists(select(GangSheetOrder.id).where(
        GangSheetOrder.order_id == Order.id, GangSheetOrder.status.in_(states)))


def _artwork_waiting():
    # A job the shop has not approved yet, or one sent back to the customer.
    return _job("submitted", "in_review", "revision_requested")


def _packed():
    # Somebody pressed "Mark packed": a recorded event, the same row the
    # order's timeline shows. Nothing is inferred from a status.
    from app.models.order import OrderEvent

    return exists(select(OrderEvent.id).where(OrderEvent.order_id == Order.id, OrderEvent.type == "packed"))


def _printing():
    # A print job not finished yet: in review, sent back, approved, or on the press.
    return _job("submitted", "in_review", "revision_requested", "approved", "production")


def _to_ship() -> list:
    # Marking the last print job ready to ship (Production) is what puts an
    # order with a sheet on it here.
    return [real(), Order.payment_status == "paid", Order.status.in_(UNSHIPPED), Order.shipped_at.is_(None),
            func.coalesce(Order.shipping_method, "") != "will_call", ~_printing()]


def _late() -> list:
    return [*_to_ship(), Order.created_at < datetime.now(UTC) - timedelta(days=LATE_AFTER_DAYS)]


def _pickups() -> list:
    return [real(), Order.shipping_method == "will_call", Order.status.in_((*IN_HAND, "ready_for_pickup"))]


def _unpaid() -> list:
    # Delivered orders stay in: an order on terms is delivered first and paid
    # after. A part-payment counts for what is left.
    owed = Order.total - func.coalesce(Order.amount_paid, 0)
    return [real(), Order.payment_status.notin_(("paid", "refunded")),
            Order.status.notin_(("cancelled", "refunded")), owed > 0]


def _new() -> list:
    return [real(), Order.status == "pending"]


def _ready() -> list:
    # Waiting at the counter for the customer, or packed and waiting for a label.
    return [real(), or_(Order.status == "ready_for_pickup",
                        and_(Order.status.in_(IN_HAND), ~_artwork_waiting(), _packed()))]


def _production() -> list:
    return [real(), Order.status.in_(IN_HAND), ~_artwork_waiting(), ~_packed()]


def _ready_for_pickup() -> list:
    return [real(), Order.status == "ready_for_pickup"]


def _all() -> list:
    return [real()]


def _sent() -> list:
    # On its way or arrived: what the Shipments tab lists.
    return [real(), Order.status.in_(("shipped", "delivered")), func.coalesce(Order.shipping_method, "") != "will_call"]


def _shipped() -> list:
    return [real(), Order.status == "shipped"]


# name: (what the list calls it, its conditions)
QUEUES: dict[str, tuple[str, object]] = {
    "to_ship": ("Paid orders to ship", _to_ship),
    "late": ("Paid more than three days ago and not shipped", _late),
    "pickups": ("Pickup orders to hand over", _pickups),
    "unpaid": ("Unpaid orders", _unpaid),
    "new": ("New orders to confirm", _new),
    "production": ("Orders in production", _production),
    "ready": ("Orders ready to ship or collect", _ready),
    "shipped": ("Orders shipped and not delivered yet", _shipped),
    "ready_for_pickup": ("Orders ready for pickup", _ready_for_pickup),
    "all": ("Every order that is not a draft", _all),
    "sent": ("Orders shipped or delivered", _sent),
}


def conditions(name: str) -> list | None:
    """The WHERE clauses of a queue, or None when there is no queue by that name."""
    found = QUEUES.get(name)
    return found[1]() if found else None  # type: ignore[operator]


async def count(db: AsyncSession, name: str) -> int:
    return int((await db.execute(select(func.count(Order.id)).where(*conditions(name)))).scalar_one() or 0)


async def oldest(db: AsyncSession, name: str, limit: int = 2) -> list[tuple[Order, str | None]]:
    """The few that have waited longest, with the company's name, for naming them."""
    rows = (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
        .where(*conditions(name)).order_by(Order.created_at.asc()).limit(limit)
    )).all()
    return [(o, name_) for o, name_ in rows]
