"""Where an order came from.

The browser collects this (see frontend/src/lib/attribution.ts) and sends it
once, at checkout. Everything here treats that payload as untrusted: it arrives
from a URL anybody can edit, so every value is trimmed, length-capped and
dropped if it is not a string.

Two rules shape the rest:

* An unknown source is recorded as unknown. A buyer who typed the address in
  has no campaign, and filling the blank with "direct" would turn a fact we do
  not have into one a brand would go on to act on.
* Last non-direct wins. If someone arrives from a Google ad, leaves, and comes
  back by typing the address, the ad is still what sold it — the second visit
  carries no campaign, so it must not erase the first. The browser decides
  this; the server only stores the answer.
"""
from __future__ import annotations

from typing import Any

# The five a brand filters, groups and exports by. These get real columns.
UTM_FIELDS = ("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content")

# Everything else about the visit, kept together in one JSONB column.
META_FIELDS = (
    "referrer",       # the page that linked here
    "landing_page",   # the first page of this store they saw
    "gclid",          # Google Ads click
    "fbclid",         # Meta click
    "msclkid",        # Microsoft Ads click
    "ttclid",         # TikTok click
    "first_seen",     # ISO time of their first visit
    "last_seen",      # ISO time of the visit that placed the order
    "visits",         # how many visits before ordering
    "device",         # mobile | tablet | desktop
)

_MAX = 255
_MAX_URL = 1000


def _text(value: Any, limit: int = _MAX) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned[:limit] if cleaned else None


def clean(payload: Any) -> dict[str, Any]:
    """A safe, normalised copy of what the browser sent.

    Returns `{"utm": {...}, "meta": {...}}`, both possibly empty. Anything not
    recognised is discarded rather than stored, so a crafted URL cannot push
    arbitrary data into the orders table.
    """
    if not isinstance(payload, dict):
        return {"utm": {}, "meta": {}}

    utm = {
        field: value
        for field in UTM_FIELDS
        # utm_source is lower-cased so "Google", "google" and "GOOGLE" group as
        # one campaign source rather than three.
        if (value := _text(payload.get(field))) is not None
    }
    if "utm_source" in utm:
        utm["utm_source"] = utm["utm_source"].lower()
    if "utm_medium" in utm:
        utm["utm_medium"] = utm["utm_medium"].lower()

    meta: dict[str, Any] = {}
    for field in META_FIELDS:
        raw = payload.get(field)
        if field == "visits":
            try:
                count = int(raw)
            except (TypeError, ValueError):
                continue
            if 0 < count < 10_000:
                meta[field] = count
            continue
        limit = _MAX_URL if field in ("referrer", "landing_page") else _MAX
        value = _text(raw, limit)
        if value is not None:
            meta[field] = value

    return {"utm": utm, "meta": meta}


def apply(order: Any, payload: Any) -> bool:
    """Put a cleaned payload on an order. True if anything was recorded.

    Never overwrites attribution an order already has: it is a record of how
    that one order arrived, and a later edit cannot know better than the visit
    that placed it.
    """
    data = clean(payload)
    if not data["utm"] and not data["meta"]:
        return False
    if any(getattr(order, field, None) for field in UTM_FIELDS) or getattr(order, "attribution", None):
        return False

    for field, value in data["utm"].items():
        setattr(order, field, value)
    if data["meta"]:
        order.attribution = data["meta"]
    return True


def summary(order: Any) -> dict[str, Any] | None:
    """How this order arrived, ready for the order page — or None if unknown.

    `label` is the one line a brand reads at a glance: "google / cpc" and, when
    there is one, the campaign that paid for it.
    """
    utm = {field: getattr(order, field, None) for field in UTM_FIELDS}
    meta = getattr(order, "attribution", None) or {}
    if not any(utm.values()) and not meta:
        return None

    source = utm.get("utm_source")
    medium = utm.get("utm_medium")
    if source:
        label = f"{source} / {medium}" if medium else source
    elif meta.get("referrer"):
        label = f"Referral — {meta['referrer']}"
    else:
        # Something was recorded (a click id, a landing page) but nothing that
        # names a source. Say so rather than guessing at one.
        label = "Unattributed"

    return {
        **{field: value for field, value in utm.items() if value},
        "label": label,
        "campaign": utm.get("utm_campaign"),
        "referrer": meta.get("referrer"),
        "landing_page": meta.get("landing_page"),
        "visits": meta.get("visits"),
        "device": meta.get("device"),
        "first_seen": meta.get("first_seen"),
        "paid_click": next(
            (name for name in ("gclid", "fbclid", "msclkid", "ttclid") if meta.get(name)), None
        ),
    }
