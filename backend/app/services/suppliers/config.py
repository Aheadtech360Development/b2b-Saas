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
from app.services.suppliers import mapping

KEY = "suppliers"

# What the platform can connect to. "available: False" is shown, but can't be used yet.
CATALOG: dict[str, dict] = {
    "ss_activewear": {"label": "S&S Activewear", "available": True},
    "sanmar": {"label": "SanMar", "available": False},
}

FILTER_FIELDS = ("brand", "category", "style", "title")

# Where a store location's stock comes from: every S&S warehouse, every one but
# drop-ship, one warehouse by its code (e.g. "KS"), or nothing.
STOCK_SOURCES = ("all", "all_except_ds", "none")

SYNC_UPDATE = ("inventory", "inventory_price", "all", "none")
SYNC_CREATE = ("always", "variants_only", "never")
SYNC_UNAVAILABLE = ("none", "zero_stock", "draft", "archive")
SYNC_IMAGES = ("use_update", "always")
VARIANT_LIMITS = (100, 250, 2048, 0)              # 0 = no limit
VARIANT_LIMIT_MODE = ("limit", "skip")

ORDER_SYNC = ("disabled", "automatic", "scheduled", "manual")
ORDER_FULFILL = ("on_ship", "on_po", "never")
ORDER_SHIP_TO = ("customer", "store")
# S&S shipping method codes (Orders API). 54 lets S&S pick the cheapest.
SHIPPING_METHODS = {
    "US": {"54": "Cheapest (chosen by S&S)", "1": "Ground", "6": "Will Call / Pickup", "8": "Messenger Pickup"},
    "CA": {"54": "Cheapest (chosen by S&S)", "1": "Ground", "81": "Purolator Ground",
           "83": "Purolator Express", "82": "Purolator Express 10:30am", "40": "UPS Ground",
           "91": "UPS Express Saver", "6": "Will Call / Pickup"},
}
FILTER_OPS = ("equals", "contains", "not_equals")
PRICE_SCOPES = ("all", "brand", "category", "style")
MAX_HISTORY = 20


def _default(supplier: str) -> dict:
    return {
        "name": CATALOG.get(supplier, {}).get("label", supplier),
        "created_at": None,
        # Off pauses the supplier completely — no catalogue calls, imports,
        # syncs or orders — while keeping the connection and every setting.
        "active": True,
        # Import
        "auto_import": False,
        "filters": {"match": "any", "rules": []},
        # Pricing: first matching rule wins, most specific first (style > brand
        # > category > all). With no rule at all, cost + 40%.
        "pricing": {"rules": [], "round_to": None},
        # Stock: which S&S warehouses feed which store location, less a buffer.
        # No locations saved = the first active location gets "all_except_ds".
        "inventory": {"sync": True, "safety_stock": 0, "locations": {}},
        # Products: what an import creates, and from which supplier fields.
        "product": {"status": "active", "fields": deepcopy(mapping.DEFAULT_FIELDS)},
        # Schedule, and what a scheduled sync is allowed to change.
        "automatic_sync": {
            "enabled": False, "every_hours": 24,
            "update": "inventory", "create": "never", "on_unavailable": "none",
            "images": "use_update", "max_variants": 0, "variant_limit": "limit",
        },
        # Sending store orders to the supplier.
        "orders": {
            "sync": "disabled", "since": None, "schedule_hour": 17,
            "combine": False, "ship_to": "customer",
            "store_address": {"customer": "", "attn": "", "address": "", "city": "",
                              "state": "", "zip": "", "residential": False},
            "fulfillment": "on_ship", "po_template": "{{ order.order_number }}",
            "warehouses": "auto", "warehouse_list": [], "warehouse_preference": "fewest",
            "shipping_method": "54", "payment": "credit", "payment_email": "",
            "payment_profile_id": None, "email_confirmation": "", "ship_blind": False,
            "test_mode": True,
        },
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
    saved = (await _load_all(db)).get(supplier) or {}
    cfg = _merge(_default(supplier), saved)
    # "Auto import" on the list and "Auto create products" in Automatic Sync are
    # one setting. Configs saved before the second existed carry only the first.
    if "create" not in (saved.get("automatic_sync") or {}):
        cfg["automatic_sync"]["create"] = "always" if cfg.get("auto_import") else "never"
    cfg["auto_import"] = cfg["automatic_sync"]["create"] == "always"
    return cfg


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


def _pick(v, allowed, default):
    return v if v in allowed else default


def clean_inventory(raw: dict | None) -> dict:
    raw = raw or {}
    locs = {}
    for wid, src in (raw.get("locations") or {}).items():
        src = str(src or "").strip()
        if src in STOCK_SOURCES or (0 < len(src) <= 6 and src.isalnum() and src.isupper()):
            locs[str(wid)] = src
    try:
        safety = max(0, min(int(raw.get("safety_stock") or 0), 100000))
    except (TypeError, ValueError):
        safety = 0
    return {"sync": bool(raw.get("sync", True)), "safety_stock": safety, "locations": locs}


def clean_product(raw: dict | None) -> dict:
    raw = raw or {}
    fields = raw.get("fields")
    return {
        "status": _pick(raw.get("status"), ("active", "draft"), "active"),
        "fields": mapping.clean_fields(fields if fields is not None else mapping.DEFAULT_FIELDS),
    }


def clean_automatic_sync(raw: dict | None) -> dict:
    raw = raw or {}
    d = _default("ss_activewear")["automatic_sync"]
    try:
        every = max(1, min(int(raw.get("every_hours") or 24), 168))
    except (TypeError, ValueError):
        every = 24
    try:
        maxv = int(raw.get("max_variants") or 0)
    except (TypeError, ValueError):
        maxv = 0
    return {
        "enabled": bool(raw.get("enabled")),
        "every_hours": every,
        "update": _pick(raw.get("update"), SYNC_UPDATE, d["update"]),
        "create": _pick(raw.get("create"), SYNC_CREATE, d["create"]),
        "on_unavailable": _pick(raw.get("on_unavailable"), SYNC_UNAVAILABLE, d["on_unavailable"]),
        "images": _pick(raw.get("images"), SYNC_IMAGES, d["images"]),
        "max_variants": maxv if maxv in VARIANT_LIMITS else 0,
        "variant_limit": _pick(raw.get("variant_limit"), VARIANT_LIMIT_MODE, "limit"),
    }


def clean_orders(raw: dict | None, previous: dict | None = None, country: str = "US") -> dict:
    """Validate order settings. Turning sending on stamps `since`, so only
    orders placed from then on are sent - never the store's whole history."""
    raw = raw or {}
    prev = previous or {}
    d = _default("ss_activewear")["orders"]
    mode = _pick(raw.get("sync"), ORDER_SYNC, "disabled")
    since = prev.get("since")
    if mode != "disabled" and (prev.get("sync", "disabled") == "disabled" or not since):
        since = datetime.now(UTC).isoformat()
    if mode == "disabled":
        since = None
    addr_in = raw.get("store_address") or {}
    addr = {k: str(addr_in.get(k) or "").strip()[:120] for k in ("customer", "attn", "address", "city", "state", "zip")}
    addr["residential"] = bool(addr_in.get("residential"))
    ship_to = _pick(raw.get("ship_to"), ORDER_SHIP_TO, "customer")
    if ship_to == "store" and not all(addr[k] for k in ("address", "city", "state", "zip")):
        raise ValueError("Enter your full ship-to address (address, city, state, ZIP), or ship to the customer.")
    methods = SHIPPING_METHODS.get(country, SHIPPING_METHODS["US"])
    wl = [str(w).strip().upper()[:6] for w in (raw.get("warehouse_list") or []) if str(w).strip()][:20]
    warehouses = _pick(raw.get("warehouses"), ("auto", "list"), "auto")
    if warehouses == "list" and not wl:
        raise ValueError("Pick at least one warehouse, or let S&S choose automatically.")
    payment = _pick(raw.get("payment"), ("credit", "card"), "credit")
    email = str(raw.get("payment_email") or "").strip()[:200]
    try:
        profile = int(raw.get("payment_profile_id")) if raw.get("payment_profile_id") not in (None, "") else None
    except (TypeError, ValueError):
        raise ValueError("The payment profile ID must be a number.")
    if payment == "card" and (not email or "@" not in email or not profile):
        raise ValueError("Paying by card needs your S&S website email and the saved card's profile ID.")
    po = str(raw.get("po_template") or d["po_template"]).strip()[:200]
    try:
        mapping.render(po, {"order": {"order_number": "1001", "po_number": "PO-1"}, "value": None})
    except mapping.MappingError as exc:
        raise ValueError(f"Supplier PO number: {exc}")
    try:
        hour = max(0, min(int(raw.get("schedule_hour", d["schedule_hour"])), 23))
    except (TypeError, ValueError):
        hour = d["schedule_hour"]
    conf = str(raw.get("email_confirmation") or "").strip()[:200]
    if conf and "@" not in conf:
        raise ValueError("The confirmation email doesn't look like an email address.")
    return {
        "sync": mode, "since": since, "schedule_hour": hour,
        # One PO for many orders only makes sense when they all ship to you.
        "combine": bool(raw.get("combine")) and mode == "scheduled" and ship_to == "store",
        "ship_to": ship_to, "store_address": addr,
        "fulfillment": _pick(raw.get("fulfillment"), ORDER_FULFILL, "on_ship"),
        "po_template": po,
        "warehouses": warehouses, "warehouse_list": wl,
        "warehouse_preference": _pick(raw.get("warehouse_preference"), ("fewest", "fastest"), "fewest"),
        "shipping_method": _pick(str(raw.get("shipping_method") or "54"), tuple(methods), "54"),
        "payment": payment, "payment_email": email, "payment_profile_id": profile,
        "email_confirmation": conf, "ship_blind": bool(raw.get("ship_blind")),
        "test_mode": bool(raw.get("test_mode", True)),
    }

