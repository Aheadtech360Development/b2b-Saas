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
from html import escape
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


def email_block(place: dict[str, str]) -> str:
    """The pickup location as a block for a mail. "" when there is nothing to say."""
    if not (place.get("address") or place.get("hours") or place.get("note")):
        return ""
    lines = []
    if place.get("name"):
        lines.append(f'<p style="margin:0;font-weight:700;color:#065f46;font-size:14px">{escape(place["name"])}</p>')
    if place.get("address"):
        lines.append(f'<p style="margin:4px 0 0;color:#065f46;font-size:14px">{escape(place["address"])}</p>')
    if place.get("hours"):
        lines.append(f'<p style="margin:8px 0 0;color:#047857;font-size:13px">{escape(place["hours"])}</p>')
    if place.get("note"):
        lines.append(f'<p style="margin:8px 0 0;color:#047857;font-size:13px">{escape(place["note"])}</p>')
    return (
        '<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px;margin:16px 0">'
        '<p style="margin:0 0 8px;font-weight:700;color:#047857;font-size:12px;text-transform:uppercase;'
        'letter-spacing:.06em">Pickup location</p>'
        + "".join(lines) + "</div>"
    )
