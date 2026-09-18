"""Supplier imports and syncs, run inside the web app.

The old syncs were Celery tasks, and the deployment runs no Celery worker or
beat — Railway starts uvicorn and nothing else — so "Sync now" queued work that
no process ever picked up, and the 15-minute schedule never ran. Worse, the
inventory task only updated the supplier catalogue cache, never the store's own
stock, so even a running worker wouldn't have moved a single number a customer
sees.

Here a job is an asyncio task in the web process:

* One job per brand per supplier at a time, held by a Redis lock that expires
  on its own if the process dies mid-run.
* Progress lives in Redis, so any worker can answer "how far along is it".
* Every run is written to the brand's sync history when it ends.
* A small scheduler loop runs in every worker; a Redis lock lets exactly one of
  them act on each tick, and it starts the syncs that are due.

A deploy restart interrupts a running job. The lock then lapses, the progress
reads as interrupted, and the next run — manual or scheduled — carries on,
because imports skip what is already imported and a stock sync is idempotent.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.redis import get_redis_pool, redis_delete_pattern, tenant_cache_key
from app.core.tenant_context import set_bypass_scoping, set_current_tenant
from app.services.suppliers import config as cfgmod
from app.services.suppliers import ss_catalog

logger = logging.getLogger(__name__)

LOCK_TTL = 2 * 3600
PROGRESS_TTL = 7 * 24 * 3600
TICK_SECONDS = 300
MAX_IMPORT_PER_RUN = 500
INVENTORY_BATCH = 10

_tasks: set[asyncio.Task] = set()   # strong refs, or the loop may collect a running task


class JobBusy(Exception):
    pass


def _lock_key(tenant_id, supplier): return f"supplier:lock:{tenant_id}:{supplier}"
def _progress_key(tenant_id, supplier): return f"supplier:job:{tenant_id}:{supplier}"


async def _write_progress(tenant_id, supplier, data: dict) -> None:
    try:
        await get_redis_pool().set(_progress_key(tenant_id, supplier), json.dumps(data, default=str), ex=PROGRESS_TTL)
    except Exception as exc:
        logger.warning("supplier progress write failed: %s", exc)


async def progress(tenant_id, supplier) -> dict | None:
    r = get_redis_pool()
    try:
        raw = await r.get(_progress_key(tenant_id, supplier))
        running = bool(await r.exists(_lock_key(tenant_id, supplier)))
    except Exception:
        return None
    if not raw:
        return None
    data = json.loads(raw)
    # A job marked running whose lock is gone died with its process.
    if data.get("status") == "running" and not running:
        data["status"] = "interrupted"
        data["message"] = "Interrupted (the server restarted). Run it again — it picks up where it left off."
    return data


async def start(tenant_id, supplier: str, kind: str, *, trigger: str = "manual") -> dict:
    """Begin a job in the background. Raises JobBusy if one is already running."""
    r = get_redis_pool()
    token = uuid.uuid4().hex
    if not await r.set(_lock_key(tenant_id, supplier), token, nx=True, ex=LOCK_TTL):
        raise JobBusy("A sync is already running for this supplier.")
    state = {
        "kind": kind, "trigger": trigger, "status": "running",
        "done": 0, "total": 0, "message": "Starting…",
        "started_at": datetime.now(UTC).isoformat(),
    }
    await _write_progress(tenant_id, supplier, state)
    task = asyncio.create_task(_run(str(tenant_id), supplier, kind, trigger, token, state))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return state


async def _run(tenant_id: str, supplier: str, kind: str, trigger: str, token: str, state: dict) -> None:
    from app.core.database import AsyncSessionLocal
    from app.services.integrations_service import get_connection
    from app.services.ss_activewear_service import SSActivewearService

    # This task writes one brand's products and stock. Scope everything to it.
    set_bypass_scoping(False)
    set_current_tenant(uuid.UUID(tenant_id))
    summary: dict = {}
    status, message = "completed", ""

    async def step(done: int, total: int, msg: str) -> None:
        state.update(done=done, total=total, message=msg)
        await _write_progress(tenant_id, supplier, state)

    svc = None
    try:
        async with AsyncSessionLocal() as db:
            cfg = await cfgmod.load(db, supplier)
            conn = await get_connection(db, supplier, tenant_id=tenant_id)
        if not conn:
            raise RuntimeError("Connect your S&S Activewear account first (Edit supplier → Connection).")
        # The brand's own account only — never the platform fallback, or the
        # brand would be importing someone else's prices.
        svc = SSActivewearService(conn.get("account_number"), conn.get("api_key"))
        styles = await ss_catalog.all_styles(svc)

        if kind in ("import", "sync") and (kind == "import" or cfg.get("auto_import")):
            summary["import"] = await _import(tenant_id, styles, cfg, step)
        if kind in ("inventory", "sync") and (kind == "inventory" or cfg["inventory"].get("sync", True)):
            summary["inventory"] = await _inventory(tenant_id, styles, svc, cfg, step)

        parts = []
        if "import" in summary:
            i = summary["import"]
            parts.append(f"{i['imported']} imported" + (f", {i['failed']} failed" if i["failed"] else "")
                         + (f", {i['remaining']} left for the next run" if i["remaining"] else ""))
        if "inventory" in summary:
            v = summary["inventory"]
            parts.append(f"stock checked on {v['variants_checked']} variants, {v['variants_changed']} changed")
        message = "; ".join(parts) or "Nothing to do — no filters set, and stock sync is off."
    except ss_catalog.CatalogUnavailable as exc:
        status, message = "failed", str(exc)
    except Exception as exc:
        logger.exception("supplier job %s/%s for %s failed", supplier, kind, tenant_id)
        # The raw exception can carry SQL or a stack detail; the admin gets a
        # plain line and the log keeps the rest. Our own messages pass through.
        status = "failed"
        message = str(exc) if isinstance(exc, RuntimeError) else             f"The sync stopped with an error ({type(exc).__name__}). Please try again; if it keeps failing, contact support."
    finally:
        if svc is not None:
            await svc.close()

    finished = datetime.now(UTC).isoformat()
    state.update(status=status, message=message, finished_at=finished, summary=summary)
    await _write_progress(tenant_id, supplier, state)
    try:
        async with AsyncSessionLocal() as db:
            cfg = await cfgmod.load(db, supplier)
            cfg = cfgmod.record_run(cfg, {
                "kind": kind, "trigger": trigger, "status": status, "message": message,
                "started_at": state["started_at"], "finished_at": finished, "summary": summary,
            })
            await cfgmod.save(db, supplier, cfg)
            await db.commit()
    except Exception:
        logger.exception("could not record supplier run history")
    try:
        await redis_delete_pattern(tenant_cache_key("products:*"))
    except Exception:
        pass
    # Release only our own lock.
    try:
        r = get_redis_pool()
        if await r.get(_lock_key(tenant_id, supplier)) in (token, token.encode()):
            await r.delete(_lock_key(tenant_id, supplier))
    except Exception:
        pass


async def _import(tenant_id: str, styles: list[dict], cfg: dict, step) -> dict:
    from fastapi import HTTPException

    from app.api.v1.admin.supplier_catalog import import_ss_product
    from app.core.database import AsyncSessionLocal
    from app.models.product import Product

    wanted = [s for s in styles if ss_catalog.matches(s, cfg.get("filters") or {})]
    async with AsyncSessionLocal() as db:
        have = set((await db.execute(
            select(Product.product_code).where(Product.product_code.in_([s["style_id"] for s in wanted] or ["-"]))
        )).scalars().all())
    todo = [s for s in wanted if s["style_id"] not in have]
    batch, remaining = todo[:MAX_IMPORT_PER_RUN], max(0, len(todo) - MAX_IMPORT_PER_RUN)

    imported = failed = 0
    errors: list[str] = []
    for n, s in enumerate(batch, 1):
        await step(n - 1, len(batch), f"Importing {s['brand']} {s['style_name']} ({n} of {len(batch)})")
        async with AsyncSessionLocal() as db:
            try:
                await import_ss_product(s["style_id"], db)
                imported += 1
            except HTTPException as exc:
                failed += 1
                if len(errors) < 5:
                    errors.append(f"{s['brand']} {s['style_name']}: {exc.detail}")
            except Exception as exc:
                failed += 1
                logger.warning("import of style %s failed: %s", s["style_id"], exc)
                if len(errors) < 5:
                    errors.append(f"{s['brand']} {s['style_name']}: {type(exc).__name__}")
    await step(len(batch), len(batch), "Import finished")
    return {"matched": len(wanted), "already_imported": len(have), "imported": imported,
            "failed": failed, "remaining": remaining, "errors": errors}


async def _inventory(tenant_id: str, styles: list[dict], svc, cfg: dict, step) -> dict:
    """Set the store's own stock from S&S — what the storefront actually reads."""
    from app.core.database import AsyncSessionLocal
    from app.models.inventory import InventoryRecord, Warehouse
    from app.models.product import Product, ProductVariant

    by_id = {s["style_id"]: s for s in styles}
    safety = max(0, int((cfg.get("inventory") or {}).get("safety_stock") or 0))

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(ProductVariant.id, ProductVariant.sku, Product.product_code)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.product_code.in_(list(by_id) or ["-"]))
        )).all()
    variants_by_sku = {sku: vid for vid, sku, _ in rows if sku}
    parts = sorted({by_id[code]["part_number"] for _, _, code in rows if code in by_id and by_id[code]["part_number"]})

    checked = changed = 0
    for i in range(0, len(parts), INVENTORY_BATCH):
        batch = parts[i:i + INVENTORY_BATCH]
        await step(i, len(parts), f"Checking stock ({min(i + len(batch), len(parts))} of {len(parts)} styles)")
        try:
            inv = await svc.fetch_inventory_for_parts(batch)
        except Exception as exc:
            logger.warning("S&S inventory batch failed: %s", exc)
            continue
        qty_by_sku: dict[str, int] = {}
        for row in inv:
            sku = str(row.get("sku") or "")
            if not sku:
                continue
            q = row.get("qty")
            if q is None:
                q = sum(int(w.get("qty") or 0) for w in (row.get("warehouses") or []))
            qty_by_sku[sku] = qty_by_sku.get(sku, 0) + int(q or 0)

        async with AsyncSessionLocal() as db:
            warehouse = (await db.execute(
                select(Warehouse).where(Warehouse.is_active.is_(True)).limit(1)
            )).scalar_one_or_none()
            for sku, qty in qty_by_sku.items():
                vid = variants_by_sku.get(sku)
                if not vid:
                    continue
                checked += 1
                sell = max(0, qty - safety)
                rec = (await db.execute(
                    select(InventoryRecord).where(InventoryRecord.variant_id == vid)
                    .order_by(InventoryRecord.created_at).limit(1)
                )).scalar_one_or_none()
                if rec is None:
                    if warehouse is None:
                        continue
                    db.add(InventoryRecord(variant_id=vid, warehouse_id=warehouse.id, quantity=sell, low_stock_threshold=10))
                    changed += 1
                elif rec.quantity != sell:
                    rec.quantity = sell
                    changed += 1
            await db.commit()
    await step(len(parts), len(parts), "Stock sync finished")
    return {"styles": len(parts), "variants_checked": checked, "variants_changed": changed, "safety_stock": safety}


# ── Scheduler ────────────────────────────────────────────────────────────────

async def scheduler_loop() -> None:
    """Runs in every web worker; a Redis lock lets one of them act per tick."""
    await asyncio.sleep(60)            # let the app finish booting first
    while True:
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("supplier scheduler tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def _tick() -> None:
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_settings import _SEP
    from app.models.system import Settings

    r = get_redis_pool()
    if not await r.set("supplier:scheduler", "1", nx=True, ex=TICK_SECONDS - 20):
        return

    set_bypass_scoping(True)          # reading every brand's settings row
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                select(Settings.key, Settings.value).where(Settings.key.like(f"{cfgmod.KEY}{_SEP}%"))
            )).all()
    finally:
        set_bypass_scoping(False)

    now = datetime.now(UTC)
    for key, value in rows:
        tenant_id = key.split(_SEP, 1)[1].strip()
        try:
            all_cfg = json.loads(value or "{}")
        except ValueError:
            continue
        for supplier, cfg in (all_cfg or {}).items():
            auto = (cfg or {}).get("automatic_sync") or {}
            if not auto.get("enabled") or not cfgmod.CATALOG.get(supplier, {}).get("available"):
                continue
            every = max(1, min(int(auto.get("every_hours") or 24), 168))
            last = cfg.get("last_run_at") or cfg.get("last_sync_at")
            try:
                due = not last or datetime.fromisoformat(last) + timedelta(hours=every) <= now
            except ValueError:
                due = True
            if not due:
                continue
            try:
                await start(tenant_id, supplier, "sync", trigger="schedule")
                logger.info("scheduled %s sync started for %s", supplier, tenant_id)
            except JobBusy:
                pass
            except Exception:
                logger.exception("could not start scheduled sync for %s", tenant_id)
