"""A brand's setup for each supplier, kept in its own settings row.

Everything a brand decides about a supplier lives here: the name it shows, which
products it imports (filters), how they are priced, how stock is synced and how
often. It is stored per brand in the `suppliers` tenant setting, so no two brands
ever share any of it — including pricing rules, which the old global
`ss_markup_rules` table did share across every brand on the platform.

Credentials are not stored here; they stay in the integrations record, masked,
with the rest of the brand's connected accounts.
"""
from __future__ import annotations

import json
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_setting, set_setting

KEY = "suppliers"

# What the platform can connect to. "available: False" is shown, but can't be used yet.
CATALOG: dict[str, dict] = {
    "ss_activewear": {"label": "S&S Activewear", "available": True},
    "sanmar": {"label": "SanMar", "available": False},
}

FILTER_FIELDS = ("brand", "category", "style", "title")
FILTER_OPS = ("equals", "contains", "not_equals")
PRICE_SCOPES = ("all", "brand", "category", "style")
MAX_HISTORY = 20


def _default(supplier: str) -> dict:
    return {
        "name": CATALOG.get(supplier, {}).get("label", supplier),
        "created_at": None,
        # Import
        "auto_import": False,
        "filters": {"match": "any", "rules": []},
        # Pricing: first matching rule wins, most specific first (style > brand
        # > category > all). With no rule at all, cost + 40%.
        "pricing": {"rules": [], "round_to": None},
        # Stock
        "inventory": {"sync": True, "safety_stock": 0},
        # Schedule
        "automatic_sync": {"enabled": False, "every_hours": 24},
        "last_sync_at": None,
        "history": [],
    }


def _merge(base: dict, over: dict) -> dict:
    """Saved values over defaults, so a config saved before a field existed still
    reads complete."""
    out = deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


async def _load_all(db: AsyncSession) -> dict:
    raw = await get_setting(db, KEY)
    try:
        data = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        data = {}
    return data if isinstance(data, dict) else {}


async def load(db: AsyncSession, supplier: str) -> dict:
    return _merge(_default(supplier), (await _load_all(db)).get(supplier) or {})


async def save(db: AsyncSession, supplier: str, cfg: dict) -> dict:
    all_cfg = await _load_all(db)
    cfg = _merge(_default(supplier), cfg)
    if not cfg.get("created_at"):
        cfg["created_at"] = datetime.now(UTC).isoformat()
    cfg["history"] = (cfg.get("history") or [])[:MAX_HISTORY]
    all_cfg[supplier] = cfg
    await set_setting(db, KEY, json.dumps(all_cfg, default=str))
    return cfg


def clean_filters(raw: dict | None) -> dict:
    """Keep only rules the matcher understands; drop blanks."""
    raw = raw or {}
    rules = []
    for r in raw.get("rules") or []:
        field, op, value = r.get("field"), r.get("op", "equals"), str(r.get("value") or "").strip()
        if field in FILTER_FIELDS and op in FILTER_OPS and value:
            rules.append({"field": field, "op": op, "value": value[:200]})
    return {"match": "all" if raw.get("match") == "all" else "any", "rules": rules[:50]}


def clean_pricing(raw: dict | None) -> dict:
    raw = raw or {}
    rules = []
    for r in raw.get("rules") or []:
        scope = r.get("scope", "all")
        if scope not in PRICE_SCOPES:
            continue
        value = str(r.get("value") or "").strip()
        if scope != "all" and not value:
            continue
        try:
            pct = max(-90.0, min(float(r.get("markup_pct") or 0), 1000.0))
            fixed = max(-1000.0, min(float(r.get("markup_fixed") or 0), 10000.0))
        except (TypeError, ValueError):
            continue
        rules.append({
            "id": str(r.get("id") or uuid.uuid4()),
            "scope": scope, "value": value if scope != "all" else "",
            "markup_pct": pct, "markup_fixed": fixed,
            "active": bool(r.get("active", True)),
        })
    round_to = raw.get("round_to")
    return {"rules": rules[:100], "round_to": round_to if round_to in (None, 0.99, 0.95, 0.0) else None}


def markup_rules_for_import(cfg: dict) -> list:
    """The brand's pricing rules in the shape the importer's matcher expects."""
    kind = {"all": "global", "brand": "brand", "category": "category", "style": "product"}
    return [SimpleNamespace(
        is_active=r.get("active", True),
        rule_type=kind.get(r.get("scope"), "global"),
        target_value=r.get("value") or None,
        markup_pct=r.get("markup_pct", 0),
        markup_fixed=r.get("markup_fixed", 0),
    ) for r in (cfg.get("pricing") or {}).get("rules") or []]


def apply_rounding(price: float, round_to: float | None) -> float:
    """Charm pricing: 12.37 → 12.99 / 12.95 / 13.00. None leaves it alone."""
    if round_to is None or price <= 0:
        return round(price, 2)
    whole = int(price)
    if round_to == 0.0:
        return float(whole if price == whole else whole + 1)
    candidate = whole + round_to
    return round(candidate if candidate >= price else candidate + 1, 2)


def record_run(cfg: dict, entry: dict) -> dict:
    cfg = deepcopy(cfg)
    cfg["history"] = [entry, *(cfg.get("history") or [])][:MAX_HISTORY]
    # A failed scheduled run still counts as the attempt, so the scheduler waits
    # out the interval instead of retrying every few minutes.
    cfg["last_run_at"] = entry.get("finished_at")
    if entry.get("status") == "completed":
        cfg["last_sync_at"] = entry.get("finished_at")
    return cfg
