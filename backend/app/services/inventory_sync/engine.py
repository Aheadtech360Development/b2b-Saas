"""Inventory sync: AdvancePro's stock written into the shop, by SKU.

Run inside the web app, the way supplier syncs are (services/suppliers/jobs):
one job per brand per connector at a time, held by a Redis lock that lapses
if the process dies; progress in Redis so any worker can report it; each run
written to the brand's history when it ends; a scheduler loop in every worker,
with a Redis lock so one of them acts on each tick.

A run reads every AdvancePro variant (for its SKU) and every warehouse's
stock, works out each store location's number (plan_stock, no database), and
writes the numbers that changed (apply), each change with an audit row in
inventory_adjustments. It is a full read every time: the spec does not say
what moves `updated_since`, and a sync that misses a change is worse than one
that reads a little more. Stock that sold on the shop since the last run is
overwritten by AdvancePro's number, so orders taken here must reach AdvancePro
(entered there, or sent by the order connector when it comes).
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select, update

from app.core.redis import get_redis_pool, redis_delete_pattern, tenant_cache_key
from app.core.tenant_context import set_bypass_scoping, set_current_tenant
from app.services.inventory_sync import config as cfgmod
from app.services.inventory_sync.advancepro import AdvanceProError, from_connection

logger = logging.getLogger(__name__)

LOCK_TTL = 3600
PROGRESS_TTL = 7 * 24 * 3600
TICK_SECONDS = 120
SAMPLE = 50

_tasks: set[asyncio.Task] = set()


class JobBusy(Exception):
    pass


def norm(sku: Any) -> str:
    """A SKU as it is matched: no spaces round it, case left out (AB-1 is ab-1)."""
    return str(sku or "").strip().casefold()


# ── Working out the numbers (no database) ────────────────────────────────────
def plan_stock(variants: list[dict], inventory: list[dict], locations: dict[str, str],
               safety: int = 0) -> tuple[dict[str, dict[str, int]], dict]:
    """Each AdvancePro SKU's number for each store location.

    `locations`: store location id → "all" (every AdvancePro warehouse added
    up) or an AdvancePro warehouse id. A variant AdvancePro lists with no stock
    row anywhere has none: 0. Quantities are AdvancePro's available quantity
    (on hand less what its own orders hold), rounded down, less the safety
    stock, never below 0. Returns (plan by normalised SKU, facts: the SKUs as
    AdvancePro writes them, how many SKUs were on two variants)."""
    sku_of: dict[str, str] = {}
    shown: dict[str, str] = {}
    for v in variants:
        sku, vid = norm(v.get("sku")), v.get("id")
        if not sku or vid is None:
            continue
        sku_of[str(vid)] = sku
        shown.setdefault(sku, str(v.get("sku")).strip())

    stock: dict[str, dict[str, float]] = {}
    for row in inventory:
        if row.get("deleted"):
            continue
        vid, wid = row.get("variant_id"), row.get("warehouse_id")
        if vid is None or wid is None:
            continue
        try:
            qty = float(row.get("available_quantity") or 0)
        except (TypeError, ValueError):
            qty = 0.0
        houses = stock.setdefault(str(vid), {})
        houses[str(wid)] = houses.get(str(wid), 0.0) + qty

    plan: dict[str, dict[str, int]] = {}
    twice = 0
    for vid, sku in sku_of.items():
        houses = stock.get(vid, {})
        nums: dict[str, int] = {}
        for loc, src in locations.items():
            raw = sum(houses.values()) if src == "all" else houses.get(str(src), 0.0)
            nums[loc] = max(0, math.floor(raw) - max(0, int(safety or 0)))
        if sku in plan:
            # The same SKU on two AdvancePro variants: the shop has one, so it gets both.
            twice += 1
            for loc, n in nums.items():
                plan[sku][loc] = plan[sku].get(loc, 0) + n
        else:
            plan[sku] = nums
    return plan, {"shown": shown, "duplicate_skus": twice}


# ── Writing them ─────────────────────────────────────────────────────────────
async def apply(db, plan: dict[str, dict[str, int]], facts: dict, cfg: dict) -> dict:
    """Write the plan into this brand's locations. The caller commits."""
    from app.models.inventory import InventoryAdjustment, InventoryRecord, Warehouse
    from app.models.product import Product, ProductVariant

    # Only the brand's own locations (a supplier's held stock is not the brand's to overwrite).
    own = {str(w) for w in (await db.execute(
        select(Warehouse.id).where(Warehouse.supplier.is_(None))
    )).scalars().all()}
    locs = {loc: src for loc, src in (cfg.get("locations") or {}).items() if loc in own}
    if not locs:
        raise RuntimeError("None of the chosen store locations exist any more. Choose them again in Inventory sync.")
    loc_ids = {loc: uuid.UUID(loc) for loc in locs}

    shop = (await db.execute(select(ProductVariant.id, ProductVariant.sku, ProductVariant.product_id))).all()
    by_sku: dict[str, tuple[uuid.UUID, uuid.UUID, str]] = {}
    for vid, sku, pid in shop:
        key = norm(sku)
        if key:
            by_sku[key] = (vid, pid, str(sku))

    targets: dict[uuid.UUID, dict[uuid.UUID, int]] = {}
    managed: set[uuid.UUID] = set()
    for key, nums in plan.items():
        hit = by_sku.get(key)
        if hit:
            vid, pid, _ = hit
            managed.add(pid)
            targets[vid] = {loc_ids[loc]: n for loc, n in nums.items() if loc in loc_ids}
    not_in_shop = sorted(facts.get("shown", {}).get(k, k) for k in plan if k not in by_sku)
    # Sizes and colours of a product AdvancePro keeps that AdvancePro does not list.
    not_in_ap = sorted(shown for key, (vid, pid, shown) in by_sku.items() if key not in plan and pid in managed)
    if cfg.get("missing") == "zero":
        for key, (vid, pid, _) in by_sku.items():
            if key not in plan and pid in managed:
                targets[vid] = {lid: 0 for lid in loc_ids.values()}

    existing: dict[tuple[uuid.UUID, uuid.UUID], Any] = {}
    ids = list(targets)
    for i in range(0, len(ids), 1000):
        for rec in (await db.execute(
            select(InventoryRecord).where(InventoryRecord.variant_id.in_(ids[i:i + 1000]),
                                          InventoryRecord.warehouse_id.in_(list(loc_ids.values())))
        )).scalars().all():
            existing[(rec.variant_id, rec.warehouse_id)] = rec

    updated = created = unchanged = 0
    for vid, nums in targets.items():
        for lid, qty in nums.items():
            rec = existing.get((vid, lid))
            if rec is None:
                db.add(InventoryRecord(variant_id=vid, warehouse_id=lid, quantity=qty, low_stock_threshold=10))
                created += 1
            elif rec.quantity != qty:
                db.add(InventoryAdjustment(inventory_record_id=rec.id, quantity_before=rec.quantity, quantity_after=qty,
                                           reason="correction", notes="Synced from AdvancePro"))
                rec.quantity = qty
                updated += 1
            else:
                unchanged += 1

    counting = 0
    if cfg.get("count_stock", True) and managed:
        res = await db.execute(update(Product).where(Product.id.in_(list(managed)), Product.track_inventory.is_(False))
                               .values(track_inventory=True))
        counting = res.rowcount or 0

    return {
        "advancepro_skus": len(plan),
        "matched": sum(1 for k in plan if k in by_sku),
        "updated": updated, "created": created, "unchanged": unchanged,
        "not_in_shop": len(not_in_shop), "not_in_shop_sample": not_in_shop[:SAMPLE],
        "not_in_advancepro": len(not_in_ap), "not_in_advancepro_sample": not_in_ap[:SAMPLE],
        "count_stock_on": counting, "duplicate_skus": facts.get("duplicate_skus", 0),
        "zeroed": cfg.get("missing") == "zero",
    }


def message(summary: dict) -> str:
    if not summary:
        return "Nothing to do."
    parts = [f"{summary.get('matched', 0)} of your SKUs matched AdvancePro"]
    changed = summary.get("updated", 0) + summary.get("created", 0)
    parts.append(f"{changed} stock number{'s' if changed != 1 else ''} changed" if changed else "no stock changed")
    if summary.get("not_in_shop"):
        parts.append(f"{summary['not_in_shop']} AdvancePro SKU{'s' if summary['not_in_shop'] != 1 else ''} not in your shop")
    if summary.get("not_in_advancepro"):
        parts.append(f"{summary['not_in_advancepro']} of your sizes not in AdvancePro")
    return ", ".join(parts) + "."


# ── Jobs ─────────────────────────────────────────────────────────────────────
def _lock_key(tenant_id, connector): return f"invsync:lock:{tenant_id}:{connector}"
def _progress_key(tenant_id, connector): return f"invsync:job:{tenant_id}:{connector}"


async def _write_progress(tenant_id, connector, data: dict) -> None:
    try:
        await get_redis_pool().set(_progress_key(tenant_id, connector), json.dumps(data, default=str), ex=PROGRESS_TTL)
    except Exception as exc:
        logger.warning("inventory sync progress write failed: %s", exc)


async def progress(tenant_id, connector: str) -> dict | None:
    r = get_redis_pool()
    try:
        raw = await r.get(_progress_key(tenant_id, connector))
        running = bool(await r.exists(_lock_key(tenant_id, connector)))
    except Exception:
        return None
    if not raw:
        return None
    data = json.loads(raw)
    if data.get("status") == "running" and not running:
        data["status"] = "interrupted"
        data["message"] = "Interrupted (the server restarted). Run it again; a sync can always be run again."
    return data


async def start(tenant_id, connector: str, *, trigger: str = "manual") -> dict:
    """Begin a sync in the background. Raises JobBusy if one is running."""
    r = get_redis_pool()
    token = uuid.uuid4().hex
    if not await r.set(_lock_key(tenant_id, connector), token, nx=True, ex=LOCK_TTL):
        raise JobBusy("A sync is already running.")
    state = {"trigger": trigger, "status": "running", "done": 0, "total": 3, "message": "Starting…",
             "started_at": datetime.now(UTC).isoformat()}
    await _write_progress(tenant_id, connector, state)
    task = asyncio.create_task(_run(str(tenant_id), connector, trigger, token, state))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return state


async def _run(tenant_id: str, connector: str, trigger: str, token: str, state: dict) -> None:
    from app.core.database import AsyncSessionLocal
    from app.services.integrations_service import get_connection

    set_bypass_scoping(False)
    set_current_tenant(uuid.UUID(tenant_id))
    summary: dict = {}
    status, text = "completed", ""

    async def step(done: int, msg: str) -> None:
        state.update(done=done, message=msg)
        await _write_progress(tenant_id, connector, state)

    client = None
    try:
        async with AsyncSessionLocal() as db:
            cfg = await cfgmod.load(db, connector)
            conn = await get_connection(db, connector, tenant_id=tenant_id)
        if not conn:
            raise RuntimeError("Connect your AdvancePro account first.")
        if not cfg.get("locations"):
            raise RuntimeError("Choose which store locations take AdvancePro's stock first.")
        client = from_connection(conn, tenant_id=tenant_id)
        await step(0, "Reading AdvancePro's products…")
        variants = await client.variants()
        await step(1, f"Reading stock for {len(variants):,} AdvancePro variants…")
        inventory = await client.warehouse_inventory()
        plan, facts = plan_stock(variants, inventory, cfg["locations"], int(cfg.get("safety_stock") or 0))
        await step(2, "Writing stock into your shop…")
        async with AsyncSessionLocal() as db:
            summary = await apply(db, plan, facts, cfg)
            await db.commit()
        text = message(summary)
    except AdvanceProError as exc:
        status, text = "failed", str(exc)
    except RuntimeError as exc:
        status, text = "failed", str(exc)
    except Exception as exc:
        logger.exception("inventory sync %s for %s failed", connector, tenant_id)
        status = "failed"
        text = f"The sync stopped with an error ({type(exc).__name__}). Please try again; if it keeps failing, contact support."
    finally:
        if client is not None:
            await client.close()

    finished = datetime.now(UTC).isoformat()
    state.update(status=status, message=text, finished_at=finished, summary=summary, done=3 if status == "completed" else state.get("done", 0))
    await _write_progress(tenant_id, connector, state)
    try:
        async with AsyncSessionLocal() as db:
            cfg = await cfgmod.load(db, connector)
            cfg = cfgmod.record_run(cfg, {"trigger": trigger, "status": status, "message": text,
                                          "started_at": state["started_at"], "finished_at": finished, "summary": summary})
            await cfgmod.save(db, connector, cfg)
            await db.commit()
    except Exception:
        logger.exception("could not record the inventory sync run")
    try:
        await redis_delete_pattern(tenant_cache_key("products:*"))
    except Exception:
        pass
    try:
        r = get_redis_pool()
        if await r.get(_lock_key(tenant_id, connector)) in (token, token.encode()):
            await r.delete(_lock_key(tenant_id, connector))
    except Exception:
        pass


# ── Schedule ─────────────────────────────────────────────────────────────────
def due(cfg: dict, now: datetime) -> bool:
    every = cfg.get("every_minutes") if cfg.get("every_minutes") in cfgmod.EVERY_MINUTES else 30
    last = cfg.get("last_run_at") or cfg.get("last_sync_at")
    if not last:
        return True
    try:
        return datetime.fromisoformat(last) + timedelta(minutes=every) <= now
    except ValueError:
        return True


async def scheduler_loop() -> None:
    """Runs in every web worker; a Redis lock lets one of them act per tick."""
    await asyncio.sleep(90)
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("inventory sync scheduler tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def _tick() -> None:
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_settings import _SEP
    from app.models.system import Settings
    from app.services import entitlements

    r = get_redis_pool()
    if not await r.set("invsync:scheduler", "1", nx=True, ex=TICK_SECONDS - 10):
        return
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Settings.key, Settings.value).where(Settings.key.like(f"{cfgmod.KEY}{_SEP}%"))
            )).all()
            now = datetime.now(UTC)
            starts: list[tuple[str, str]] = []
            for key, value in rows:
                tenant_id = key.split(_SEP, 1)[1].strip()
                try:
                    every = json.loads(value or "{}")
                except ValueError:
                    continue
                for connector, cfg in (every or {}).items():
                    if not (cfg or {}).get("active") or not cfgmod.CONNECTORS.get(connector, {}).get("available"):
                        continue
                    if not due(cfg, now):
                        continue
                    # Sold as an add-on: a brand the platform has not given it to does not sync.
                    if not await entitlements.enabled(db, tenant_id, cfgmod.FEATURE):
                        continue
                    starts.append((tenant_id, connector))
    finally:
        set_bypass_scoping(False)
    for tenant_id, connector in starts:
        try:
            await start(tenant_id, connector, trigger="schedule")
            logger.info("scheduled %s inventory sync started for %s", connector, tenant_id)
        except JobBusy:
            pass
        except Exception:
            logger.exception("could not start the scheduled inventory sync for %s", tenant_id)
        set_current_tenant(None)
