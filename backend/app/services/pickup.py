"""Where a brand's customers collect a will-call order.

One answer for the checkout, the admin's order page and the "ready for pickup"
mail. It is the brand's own pickup location when it has set one (Admin →
Shipping → Pickup location); otherwise its ship-from address, which is what the
checkout has always shown, so a brand that never opens the setting sees no
change.

The hours and the note have no such fallback: a ship-from address has neither,
and saying nothing is better than giving out another shop's opening times,
which is what the mail did.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import scoped_key


def _saved(raw: Any) -> dict:
    try:
        value = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _field(source: dict, key: str) -> str:
    return str(source.get(key) or "").strip()


def one_line(address: dict) -> str:
    """Street, city, state and ZIP on one line, skipping what is missing."""
    region = " ".join(filter(None, [_field(address, "state"), _field(address, "zip")]))
    return ", ".join(filter(None, [_field(address, "street1"), _field(address, "city"), region]))


def resolve(pickup_raw: Any, ship_from_raw: Any) -> dict[str, str]:
    """The two saved values in, what the customer is told out.

    A pickup location counts as set once it has a street: a name or hours on
    their own go with the ship-from address rather than replacing it with
    nothing.
    """
    own, ship_from = _saved(pickup_raw), _saved(ship_from_raw)
    place = own if _field(own, "street1") else ship_from
    return {
        "name": _field(place, "name"),
        "address": one_line(place),
        "hours": _field(own, "hours"),
        "note": _field(own, "note"),
    }


async def pickup_location(db: AsyncSession, tenant_id: uuid.UUID | str | None) -> dict[str, str]:
    """This brand's pickup location. Every value is "" when it has none."""
    if not tenant_id:
        return resolve(None, None)
    keys = {"p": scoped_key("pickup_location", tenant_id), "s": scoped_key("ship_from", tenant_id)}
    rows = dict((await db.execute(text("SELECT key, value FROM settings WHERE key IN (:p, :s)"), keys)).all())
    return resolve(rows.get(keys["p"]), rows.get(keys["s"]))


PICKUP_OFF = "This shop doesn't offer pickup. Please choose a shipping method."


def offered(value: Any) -> bool:
    """A saved switch as yes or no. Unset is yes: every shop offered pickup
    before there was a switch, so one that never touches it keeps it."""
    return str(value if value is not None else "").strip().lower() not in ("false", "0", "no", "off")


async def pickup_offered(db: AsyncSession, tenant_id: uuid.UUID | str | None) -> bool:
    """Whether this brand lets a customer collect an order (Will Call).

    The brand decides (Settings, Shipping and pickup). Asked again on the
    server before an order is priced for the card: the checkout hiding the
    choice is not what stops it.
    """
    if not tenant_id:
        return True
    from app.core.tenant_settings import get_setting

    try:
        return offered(await get_setting(db, "pickup_enabled", tenant_id=tenant_id))
    except Exception:
        return True
