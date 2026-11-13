"""A brand's inventory-sync setup, per connector, in its own settings row.

Kept in the `inventory_sync` tenant setting (one JSON blob, no migration),
the way suppliers keep theirs. The login is not here: it stays with the
brand's other connected accounts in the integrations record, its password
masked (services/integrations_service, provider "advancepro").

    active          the schedule runs (a manual "Sync now" works while off, once connected)
    every_minutes   how often
    locations       store location id → "all" (every AdvancePro warehouse, added up),
                    an AdvancePro warehouse id, or "none"
    safety_stock    held back from every number written
    count_stock     matched products count their stock (products.track_inventory on)
    missing         a size or colour of a synced product that AdvancePro does not have:
                    "keep" its stock, or set it to "zero"
"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_own_setting, set_setting

KEY = "inventory_sync"
FEATURE = "inventory_sync"

CONNECTORS: dict[str, dict] = {
    "advancepro": {"label": "AdvancePro", "by": "AdvanceWare", "available": True},
}

EVERY_MINUTES = (15, 30, 60, 180, 360, 720, 1440)
MISSING = ("keep", "zero")
MAX_HISTORY = 20


def default(connector: str = "advancepro") -> dict:
    return {
        "active": False,
        "every_minutes": 30,
        "locations": {},
        "safety_stock": 0,
        "count_stock": True,
        "missing": "keep",
        "created_at": None,
        "last_run_at": None,
        "last_sync_at": None,
        "history": [],
    }


def _merge(base: dict, over: dict) -> dict:
    out = deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k != "locations":
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


async def _load_all(db: AsyncSession, tenant_id=None) -> dict:
    # The brand's own row only: a setup is never shared between brands.
    raw = await get_own_setting(db, KEY, tenant_id=tenant_id)
    try:
        data = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        data = {}
    return data if isinstance(data, dict) else {}


async def load(db: AsyncSession, connector: str, tenant_id=None) -> dict:
    return _merge(default(connector), (await _load_all(db, tenant_id)).get(connector) or {})


async def save(db: AsyncSession, connector: str, cfg: dict, tenant_id=None) -> dict:
    everything = await _load_all(db, tenant_id)
    cfg = _merge(default(connector), cfg)
    if not cfg.get("created_at"):
        cfg["created_at"] = datetime.now(UTC).isoformat()
    cfg["history"] = (cfg.get("history") or [])[:MAX_HISTORY]
    everything[connector] = cfg
    await set_setting(db, KEY, json.dumps(everything, default=str), tenant_id=tenant_id)
    return cfg


def clean(raw: dict, previous: dict, *, location_ids: set[str], warehouse_ids: set[str] | None) -> dict:
    """What an admin may set, checked. `warehouse_ids` None: AdvancePro could not be read just now,
    so a warehouse already chosen is kept rather than dropped."""
    out = deepcopy(previous)
    if "active" in raw:
        out["active"] = bool(raw["active"])
    if "every_minutes" in raw:
        try:
            every = int(raw["every_minutes"])
        except (TypeError, ValueError):
            raise ValueError("Choose how often to sync.")
        if every not in EVERY_MINUTES:
            raise ValueError("Choose how often to sync from the list.")
        out["every_minutes"] = every
    if "safety_stock" in raw:
        try:
            out["safety_stock"] = max(0, min(int(raw["safety_stock"] or 0), 100000))
        except (TypeError, ValueError):
            raise ValueError("Safety stock must be a whole number.")
    if "count_stock" in raw:
        out["count_stock"] = bool(raw["count_stock"])
    if "missing" in raw:
        if raw["missing"] not in MISSING:
            raise ValueError("Choose what happens to sizes AdvancePro does not have.")
        out["missing"] = raw["missing"]
    if "locations" in raw:
        locs: dict[str, str] = {}
        for loc, src in (raw.get("locations") or {}).items():
            loc, src = str(loc), str(src or "none").strip()
            if loc not in location_ids:
                raise ValueError("A store location in the list no longer exists. Reload the page.")
            if src == "none":
                continue
            if src != "all" and warehouse_ids is not None and src not in warehouse_ids:
                raise ValueError("An AdvancePro warehouse in the list no longer exists. Reload the page.")
            if src != "all" and not src.isdigit():
                raise ValueError("Choose an AdvancePro warehouse from the list.")
            locs[loc] = src
        out["locations"] = locs
    if out.get("active") and not out.get("locations"):
        raise ValueError("Choose at least one store location for AdvancePro's stock before turning the sync on.")
    return out


def record_run(cfg: dict, entry: dict) -> dict:
    cfg = deepcopy(cfg)
    cfg["history"] = [entry, *(cfg.get("history") or [])][:MAX_HISTORY]
    # A failed scheduled run still counts as the attempt: the schedule waits out
    # its interval rather than trying again every few minutes.
    cfg["last_run_at"] = entry.get("finished_at")
    if entry.get("status") == "completed":
        cfg["last_sync_at"] = entry.get("finished_at")
    return cfg
