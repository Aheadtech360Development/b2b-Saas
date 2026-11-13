"""The brand's review sources, one settings row per brand.

    {
      "rules":        {"who": "signed_in" | "buyers", "hold": false},
      "judgeme":      {"shop_domain", "api_token", "shop_name", "connected_at",
                       "last_synced_at", "last_attempt_at", "last_error",
                       "imported", "store_reviews", "unmatched", "unmatched_handles"},
      "google_place": {"place_id", "name", "address", "maps_url", "saved_at"},
      "yelp":         {"url", "name", "reviews": [...], "saved_at"}
    }

The Judge.me token is the only secret. `public_view` is what an admin's browser
may see, and never carries it.
"""
from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_own_setting, set_setting

KEY = "review_sources"

WHO = ("signed_in", "buyers")

DEFAULT: dict = {
    # As the shop has always worked: any signed-in customer, shown at once.
    "rules": {"who": "signed_in", "hold": False},
    "judgeme": {},
    "google_place": {},
    "yelp": {},
}


async def load(db: AsyncSession, *, tenant_id: Any = None) -> dict:
    raw = await get_own_setting(db, KEY, tenant_id=tenant_id)
    try:
        data = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        data = {}
    out = deepcopy(DEFAULT)
    if isinstance(data, dict):
        for part in out:
            if isinstance(data.get(part), dict):
                out[part].update(data[part])
    rules = out["rules"]
    if rules.get("who") not in WHO:
        rules["who"] = "signed_in"
    rules["hold"] = bool(rules.get("hold"))
    return out


async def save(db: AsyncSession, data: dict, *, tenant_id: Any = None) -> None:
    await set_setting(db, KEY, json.dumps(data, default=str), tenant_id=tenant_id)


def public_view(data: dict) -> dict:
    """The setup as the admin screen shows it. Never the Judge.me token."""
    judgeme = {k: v for k, v in (data.get("judgeme") or {}).items() if k != "api_token"}
    token = str((data.get("judgeme") or {}).get("api_token") or "")
    judgeme["connected"] = bool(token and judgeme.get("shop_domain"))
    judgeme["token_hint"] = f"••••{token[-4:]}" if len(token) >= 8 else ("••••" if token else "")
    return {
        "rules": dict(data.get("rules") or DEFAULT["rules"]),
        "judgeme": judgeme,
        "google_place": dict(data.get("google_place") or {}),
        "yelp": dict(data.get("yelp") or {}),
    }
