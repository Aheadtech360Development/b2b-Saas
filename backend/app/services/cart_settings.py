"""How a shop's cart and checkout look, beyond its theme (Settings → Cart and checkout).

Basic on purpose: the cart and checkout take their fonts and corners from the
shop's theme, and the shop chooses only the main button's colour (its theme
colour unless it picks another), the words on the cart's and the checkout's
main buttons, and whether buyers can leave an order note.
"""
from __future__ import annotations

import json
import re
from typing import Any

SETTINGS_KEY = "cart_settings"
TEXT_MAX = 40
DEFAULTS: dict[str, Any] = {
    "button_color": "",          # "" = the theme's own colour
    "checkout_text": "Checkout",
    "place_order_text": "Place order",
    "show_order_note": True,
}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULTS)
    if not isinstance(raw, dict):
        return out
    color = raw.get("button_color")
    if isinstance(color, str) and (color == "" or _HEX.match(color.strip())):
        out["button_color"] = color.strip().upper()
    for key in ("checkout_text", "place_order_text"):
        text = raw.get(key)
        if isinstance(text, str) and text.strip():
            out[key] = re.sub(r"\s+", " ", text.strip())[:TEXT_MAX]
    if isinstance(raw.get("show_order_note"), bool):
        out["show_order_note"] = raw["show_order_note"]
    return out


async def load(db, tenant_id=None) -> dict[str, Any]:
    from app.core.tenant_settings import get_own_setting

    raw = await get_own_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        return clean(json.loads(raw) if raw else None)
    except (TypeError, ValueError):
        return dict(DEFAULTS)


async def save(db, changes: dict, tenant_id=None) -> dict[str, Any]:
    from app.core.tenant_settings import set_setting

    merged = clean({**(await load(db, tenant_id)), **(changes or {})})
    await set_setting(db, SETTINGS_KEY, json.dumps(merged), tenant_id=tenant_id)
    return merged
