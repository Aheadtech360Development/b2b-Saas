"""The buyer's order tracking page (Retail launch, package 2).

What the page may show, and to whom:
- the one order, its parcels' timelines, couriers, numbers and courier links;
- where it goes as city, state and postcode only: no street, name, phone or
  payment details, whoever is asking;
- to the order's own buyer signed in, to anyone holding the order's view key
  (the link in the shop's emails), or to whoever types the order number with
  the email it was placed with. A wrong email and a made-up number get the
  same answer, and lookups are rate limited (api/v1/tracking.py).

The shop can turn the page off and add a short message (Settings).
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select, text

from app.services import order_view, shipments

SETTINGS_KEY = "order_tracking"
DEFAULTS: dict[str, Any] = {"enabled": True, "message": ""}
MESSAGE_MAX = 300

ORDER_WORDS = {
    "pending": "Order received", "confirmed": "Confirmed", "processing": "Being prepared",
    "ready_for_pickup": "Ready for pickup", "shipped": "On its way", "delivered": "Delivered",
    "cancelled": "Cancelled", "refunded": "Refunded",
}
# How far along the buyer's steps an order is when it has no parcel yet.
_ORDER_REACHED = {"pending": 0, "confirmed": 1, "processing": 1, "ready_for_pickup": 2,
                  "shipped": 3, "delivered": 5}


def clean_settings(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULTS)
    if isinstance(raw, dict):
        if isinstance(raw.get("enabled"), bool):
            out["enabled"] = raw["enabled"]
        if isinstance(raw.get("message"), str):
            out["message"] = raw["message"].strip()[:MESSAGE_MAX]
    return out


async def settings_for(db, tenant_id) -> dict[str, Any]:
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        return clean_settings(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return dict(DEFAULTS)


async def save_settings(db, tenant_id, changes: dict) -> dict[str, Any]:
    from app.core.tenant_settings import set_setting

    current = await settings_for(db, tenant_id)
    merged = clean_settings({**current, **(changes or {})})
    await set_setting(db, SETTINGS_KEY, json.dumps(merged), tenant_id=tenant_id)
    return merged


async def find_order(db, tenant_id, order_number: str):
    from app.models.order import Order

    number = (order_number or "").strip().lstrip("#").upper()[:50]
    if not tenant_id or not number:
        return None
    return (await db.execute(
        select(Order).where(Order.tenant_id == tenant_id, func.upper(Order.order_number) == number)
    )).scalar_one_or_none()


async def email_matches(db, order, email: str) -> bool:
    """The address the order was placed with: the guest's, or the buyer's who placed it."""
    wanted = (email or "").strip().lower()
    if not wanted:
        return False
    if (order.guest_email or "").strip().lower() == wanted:
        return True
    if order.placed_by_id:
        placed = (await db.execute(
            text("SELECT lower(email) FROM users WHERE id = :u"), {"u": str(order.placed_by_id)}
        )).scalar_one_or_none()
        if placed and placed == wanted:
            return True
    return False


def place(order) -> dict[str, str] | None:
    """Where it goes, as much as a tracking page may say: city, state, postcode."""
    to = order_view._ship_to(getattr(order, "shipping_address_snapshot", None))
    if not to:
        return None
    return {"city": to["city"], "state": to["state"], "postal_code": to["postal_code"], "country": to["country"]}


def _paid(order) -> bool:
    return (order.payment_status or "") in ("paid", "refunded") or float(order.amount_paid or 0) > 0


def order_steps(order) -> list[dict[str, Any]]:
    reached = _ORDER_REACHED.get(order.status, 0)
    if _paid(order):
        reached = max(reached, 1)
    return [{"key": key, "label": label, "done": i + 1 <= reached} for i, (key, label) in enumerate(shipments.STEPS)]


async def link(db, order) -> str | None:
    """The order's tracking page on the shop's own address, with the view key
    in the fragment (no server or log sees it), for the shop's emails. None
    when the shop does not have the page or has turned it off."""
    from app.services import brand_urls, entitlements

    try:
        if not await entitlements.enabled(db, order.tenant_id, "order_tracking"):
            return None
        if not (await settings_for(db, order.tenant_id))["enabled"]:
            return None
        base = await brand_urls.for_tenant(db, order.tenant_id, f"/track/{order.order_number}")
    except Exception:  # noqa: BLE001 - an email without the button is still an email
        return None
    return f"{base}#k={order_view.view_key(order.id, order.tenant_id)}"


async def page(db, order) -> dict[str, Any]:
    parcels = await shipments.for_order(db, order.id)
    conf = await settings_for(db, order.tenant_id)
    paid = _paid(order)
    return {
        "order_number": order.order_number,
        "placed_at": order.created_at.isoformat() if order.created_at else None,
        "status": order.status,
        "status_words": ORDER_WORDS.get(order.status, order.status.replace("_", " ").capitalize()),
        "paid": paid,
        "ship_to": place(order),
        "steps": order_steps(order),
        "shipments": shipments.views(parcels, paid=paid),
        "message": conf["message"] or None,
    }
