"""The countries a brand sells to.

Checkout and the address book have always known two: the United States, and
Canada (an account's address book offers both; a guest checks out with a US
address). This is the brand's own say over the second. Unset, both are on, as
they were before there was a setting, so a brand that never opens it sees no
change.

The United States is the home market and is always on: guest checkout, the
sales tax lookup and live carrier rates are all built on a US address.

Pure, apart from `countries()` at the foot.
"""
from __future__ import annotations

import json
from typing import Any

HOME = "US"
# Every country an address can be in today, home first.
KNOWN: tuple[str, ...] = ("US", "CA")
NAMES: dict[str, str] = {"US": "United States", "CA": "Canada"}
KEY = "markets"


def clean(raw: Any) -> list[str]:
    """The saved value as the countries that are on, home first.

    Nothing saved, or something unreadable, means every known country: that is
    what a shop had before it could choose.
    """
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        value = None
    listed = value.get("countries") if isinstance(value, dict) else None
    if not isinstance(listed, list):
        return list(KNOWN)
    on = {str(c).strip().upper() for c in listed}
    return [c for c in KNOWN if c == HOME or c in on]


def dumps(countries: Any) -> str:
    """What to store for a choice of countries (unknown ones dropped, home kept)."""
    return json.dumps({"countries": clean({"countries": list(countries or [])})})


def refusal(country: str | None) -> str:
    code = (country or "").strip().upper()
    return f"This shop doesn't ship to {NAMES.get(code, code or 'that country')}."


def allows(countries: list[str], country: str | None) -> bool:
    return ((country or HOME).strip().upper() or HOME) in countries


async def countries(db, tenant_id) -> list[str]:
    """The countries this brand sells to."""
    if not tenant_id:
        return list(KNOWN)
    from app.core.tenant_settings import get_setting

    try:
        return clean(await get_setting(db, KEY, tenant_id=tenant_id))
    except Exception:
        return list(KNOWN)
