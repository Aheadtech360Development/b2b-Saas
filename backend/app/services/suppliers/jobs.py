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

from sqlalchemy import select, update

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
    from app.services.ss_activewear_service import from_connection

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
        if not cfg.get("active", True):
            raise RuntimeError("S&S Activewear is turned off for this store. Turn it on in Manage Suppliers to use it.")
        # The brand's own account only — never the platform fallback, or the
        # brand would be importing someone else's prices.
        svc = from_connection(conn)
        styles = await ss_catalog.all_styles(svc)
        auto = cfg["automatic_sync"]

        created: list[str] = []
        if kind == "import" or (kind == "sync" and auto["create"] == "always"):
            summary["import"] = await _import(tenant_id, styles, svc, cfg, step)
            created = summary["import"].pop("created", [])
        if kind == "inventory":
            summary["inventory"] = await _inventory(tenant_id, styles, svc, cfg, step)
        elif kind == "sync":
            summary["update"] = await _update(tenant_id, supplier, styles, svc, cfg, step, skip=set(created))
        message = _message(summary)
    except ss_catalog.CatalogUnavailable as exc:
        status, message = "failed", str(exc)
    except Exception as exc:
        logger.exception("supplier job %s/%s for %s failed", supplier, kind, tenant_id)
        # The raw exception can carry SQL or a stack detail; the admin gets a
        # plain line and the log keeps the rest. Our own messages pass through.
        status = "failed"
        message = str(exc) if isinstance(exc, RuntimeError) else \
            f"The sync stopped with an error ({type(exc).__name__}). Please try again; if it keeps failing, contact support."
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


def _message(summary: dict) -> str:
    parts = []
    if "import" in summary:
        i = summary["import"]
        bits = [f"{i['imported']} imported"]
        if i.get("skipped"):
            bits.append(f"{i['skipped']} skipped (variant limit)")
        if i["failed"]:
            bits.append(f"{i['failed']} failed")
        if i["remaining"]:
            bits.append(f"{i['remaining']} left for the next run")
        parts.append(", ".join(bits))
    if "update" in summary:
        u = summary["update"]
        bits = [f"{u['products']} products checked"]
        for key, label in (("prices", "price changes"), ("fields", "field changes"),
                           ("new_variants", "new variants"), ("stock", "stock changes"),
                           ("unavailable", "no longer sold")):
            if u.get(key):
                bits.append(f"{u[key]} {label}")
        parts.append(", ".join(bits))
    if "inventory" in summary:
        v = summary["inventory"]
        parts.append(f"stock checked on {v['variants_checked']} variants, {v['variants_changed']} changed")
    return "; ".join(parts) or "Nothing to do — no filters set, and nothing to update."


def _group_by_style(rows: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        sid = str(r.get("styleID") or "")
        if sid:
            out.setdefault(sid, []).append(r)
    return out


async def _import(tenant_id: str, styles: list[dict], svc, cfg: dict, step) -> dict:
    """Create products for every style the filters select that isn't in the
    store yet — ten styles per S&S call."""
    from sqlalchemy import or_
    from sqlalchemy.exc import IntegrityError

    from app.core.database import AsyncSessionLocal
    from app.models.product import Product
    from app.services.suppliers import ss_products

    wanted = [s for s in styles if ss_catalog.matches(s, cfg.get("filters") or {})]
    ids = [s["style_id"] for s in wanted] or ["-"]
    async with AsyncSessionLocal() as db:
        have = set((await db.execute(
            select(Product.product_code).where(or_(Product.product_code.in_(ids), Product.supplier_ref.in_(ids)))
        )).scalars().all())
    todo = [s for s in wanted if s["style_id"] not in have]
    batch_all, remaining = todo[:MAX_IMPORT_PER_RUN], max(0, len(todo) - MAX_IMPORT_PER_RUN)

    imported = failed = skipped = 0
    created: list[str] = []
    errors: list[str] = []

    def err(s, text):
        if len(errors) < 5:
            errors.append(f"{s['brand']} {s['style_name']}: {text}")

    for i in range(0, len(batch_all), INVENTORY_BATCH):
        batch = batch_all[i:i + INVENTORY_BATCH]
        await step(i, len(batch_all), f"Importing {batch[0]['brand']} {batch[0]['style_name']}… ({i + 1}–{i + len(batch)} of {len(batch_all)})")
        try:
            rows = await svc.fetch_products_for_parts([s["part_number"] for s in batch if s["part_number"]])
        except Exception as exc:
            logger.warning("S&S products batch failed: %s", exc)
            failed += len(batch)
            for s in batch:
                err(s, "S&S didn't answer; it will be tried again next run")
            continue
        grouped = _group_by_style(rows)
        for s in batch:
            async with AsyncSessionLocal() as db:
                try:
                    await ss_products.create_product(db, ss_catalog.as_ss(s), grouped.get(s["style_id"], []), cfg)
                    await db.commit()
                    imported += 1
                    created.append(s["style_id"])
                except ss_products.SkipProduct as exc:
                    await db.rollback()
                    skipped += 1
                    err(s, str(exc))
                except IntegrityError:
                    await db.rollback()
                    failed += 1
                    err(s, "one of its SKUs already exists in your store")
                except Exception as exc:
                    await db.rollback()
                    failed += 1
                    logger.warning("import of style %s failed: %s", s["style_id"], exc)
                    err(s, type(exc).__name__)
    await step(len(batch_all), len(batch_all), "Import finished")
    return {"matched": len(wanted), "already_imported": len(have), "imported": imported, "skipped": skipped,
            "failed": failed, "remaining": remaining, "errors": errors, "created": created}


async def _claim(db, style_ids) -> None:
    """Products imported before products had a supplier column carry only
    product_code = the S&S style id. Mark those, once, as S&S products."""
    from app.models.product import Product
    from app.services.suppliers import ss_products

    ids = set(style_ids)
    rows = (await db.execute(
        select(Product.id, Product.product_code).where(Product.supplier.is_(None), Product.product_code.isnot(None))
    )).all()
    mine = [(pid, code) for pid, code in rows if code in ids]
    for pid, code in mine:
        await db.execute(
            update(Product).where(Product.id == pid)
            .values(supplier=ss_products.SUPPLIER, supplier_ref=code)
            .execution_options(synchronize_session=False)
        )


async def _update(tenant_id: str, supplier: str, styles: list[dict], svc, cfg: dict, step, *, skip: set[str]) -> dict:
    """Bring existing S&S products in line with S&S under the sync settings."""
    from app.core.database import AsyncSessionLocal
    from app.models.product import Product, ProductVariant
    from app.services.suppliers import ss_products

    auto = cfg["automatic_sync"]
    mode, on_unav = auto["update"], auto["on_unavailable"]
    create_variants = auto["create"] in ("always", "variants_only")
    refresh_images = auto["images"] == "always" or mode == "all"
    by_id = {s["style_id"]: s for s in styles}
    stats = {"products": 0, "prices": 0, "fields": 0, "new_variants": 0, "stock": 0, "unavailable": 0}

    async with AsyncSessionLocal() as db:
        await _claim(db, by_id)
        await db.commit()
        products = (await db.execute(
            select(Product.id, Product.supplier_ref, Product.status).where(Product.supplier == ss_products.SUPPLIER)
        )).all()
        locs = await ss_products.locations(db, cfg)
    unavailable_ids = set(cfg.get("unavailable_products") or [])

    live = [p for p in products if p.supplier_ref in by_id and p.supplier_ref not in skip]
    gone = [p for p in products if p.supplier_ref not in by_id]

    for i in range(0, len(live), INVENTORY_BATCH):
        batch = live[i:i + INVENTORY_BATCH]
        await step(i, len(live), f"Updating products ({i + 1}–{i + len(batch)} of {len(live)})")
        parts = [by_id[p.supplier_ref]["part_number"] for p in batch if by_id[p.supplier_ref]["part_number"]]
        try:
            grouped = _group_by_style(await svc.fetch_products_for_parts(parts))
        except Exception as exc:
            # Never read a failed call as "S&S stopped selling all of these".
            logger.warning("S&S products batch failed during sync: %s", exc)
            continue
        async with AsyncSessionLocal() as db:
            for p in batch:
                product = await db.get(Product, p.id)
                if product is None:
                    continue
                st = await ss_products.update_product(
                    db, product, ss_catalog.as_ss(by_id[p.supplier_ref]), grouped.get(p.supplier_ref, []), cfg,
                    locs=locs, update=mode, create_variants=create_variants,
                    refresh_images=refresh_images, on_unavailable=on_unav,
                )
                # It was set aside when S&S dropped it, and S&S sells it again.
                if str(p.id) in unavailable_ids and grouped.get(p.supplier_ref):
                    product.status = "active"
                    unavailable_ids.discard(str(p.id))
                stats["products"] += 1
                for k in ("prices", "fields", "new_variants", "stock", "unavailable"):
                    stats[k] += st[k]
            await db.commit()

    # Styles S&S no longer lists at all. A catalogue that suddenly lost most of
    # the brand's styles is far likelier a bad answer than a real change.
    if gone and on_unav != "none":
        if len(gone) > 20 and len(gone) > len(products) / 2:
            logger.warning("S&S catalogue is missing %d of %d products for %s; not marking them unavailable",
                           len(gone), len(products), tenant_id)
        else:
            async with AsyncSessionLocal() as db:
                for p in gone:
                    variants = (await db.execute(
                        select(ProductVariant.id).where(ProductVariant.product_id == p.id)
                    )).scalars().all()
                    stats["stock"] += await ss_products.set_stock(db, [(v, {}) for v in variants], locs, 0, zero=True)
                    if on_unav in ("draft", "archive") and p.status == "active":
                        product = await db.get(Product, p.id)
                        product.status = "draft" if on_unav == "draft" else "archived"
                        unavailable_ids.add(str(p.id))
                    stats["unavailable"] += 1
                await db.commit()

    async with AsyncSessionLocal() as db:
        fresh = await cfgmod.load(db, supplier)
        fresh["unavailable_products"] = sorted(unavailable_ids)[:5000]
        await cfgmod.save(db, supplier, fresh)
        await db.commit()
    await step(len(live), len(live), "Sync finished")
    return stats


async def _inventory(tenant_id: str, styles: list[dict], svc, cfg: dict, step) -> dict:
    """Set the store's own stock from S&S — what the storefront actually reads —
    into each location the Inventory Settings feed."""
    from app.core.database import AsyncSessionLocal
    from app.models.product import Product, ProductVariant
    from app.services.suppliers import ss_products

    by_id = {s["style_id"]: s for s in styles}
    safety = max(0, int((cfg.get("inventory") or {}).get("safety_stock") or 0))

    async with AsyncSessionLocal() as db:
        await _claim(db, by_id)
        await db.commit()
        rows = (await db.execute(
            select(ProductVariant.id, ProductVariant.sku, Product.supplier_ref)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.supplier == ss_products.SUPPLIER)
        )).all()
        locs = await ss_products.locations(db, cfg)
    if not locs:
        raise RuntimeError("No store location receives supplier stock. Pick one in Edit Supplier → Inventory Settings.")
    variants_by_sku = {sku: vid for vid, sku, _ in rows if sku}
    parts = sorted({by_id[ref]["part_number"] for _, _, ref in rows if ref in by_id and by_id[ref]["part_number"]})
    style_by_part = {s["part_number"]: s for s in styles if s["part_number"]}

    checked = changed = 0
    for i in range(0, len(parts), INVENTORY_BATCH):
        batch = parts[i:i + INVENTORY_BATCH]
        await step(i, len(parts), f"Checking stock ({min(i + len(batch), len(parts))} of {len(parts)} styles)")
        try:
            inv = await svc.fetch_inventory_for_parts(batch)
        except Exception as exc:
            logger.warning("S&S inventory batch failed: %s", exc)
            continue
        by_style = {str(s["style_id"]): s for p in batch if (s := style_by_part.get(p))}
        pairs = []
        for row in inv:
            style = ss_catalog.as_ss(by_style.get(str(row.get("styleID") or ""), {}) or {})
            vid = variants_by_sku.get(ss_products.mapped_sku(cfg, style, row))
            if vid:
                pairs.append((vid, row))
        checked += len(pairs)
        async with AsyncSessionLocal() as db:
            changed += await ss_products.set_stock(db, pairs, locs, safety)
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
            if (cfg or {}).get("active") is False:
                continue                      # turned off: no syncs, no orders
            if supplier == "ss_activewear" and ((cfg or {}).get("orders") or {}).get("sync", "disabled") != "disabled":
                from app.services.suppliers import orders as supplier_orders
                full = cfgmod._merge(cfgmod._default(supplier), cfg)
                await supplier_orders.tick(tenant_id, full)
                set_current_tenant(None)
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
