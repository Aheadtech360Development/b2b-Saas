"""Products → Inventory sync: a brand's own inventory system feeding its shop's stock.

  GET  /admin/inventory-sync                        every connector: login (masked), setup, last runs, the job
  GET  /admin/inventory-sync/{connector}/warehouses the warehouses in the brand's AdvancePro company
  PUT  /admin/inventory-sync/{connector}            the setup: schedule, which location takes which stock, …
  POST /admin/inventory-sync/{connector}/run        sync now
  POST /admin/inventory-sync/{connector}/preview    the same, writing nothing: what would change
  GET  /admin/inventory-sync/{connector}/job        how far the running sync is

The login itself is saved through /admin/integrations/advancepro, with the
brand's other connected accounts (tested before it is saved).

Sold as an add-on: the platform turns the "inventory_sync" feature on brand by
brand (core/features: no plan includes it), and these routes are gated on it.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import NO_TENANT, get_current_tenant_id, is_scoping_bypassed
from app.middleware.auth_middleware import require_admin
from app.services.inventory_sync import config as cfgmod
from app.services.inventory_sync import engine
from app.services.inventory_sync.advancepro import AdvanceProError, from_connection

router = APIRouter(prefix="/admin/inventory-sync", tags=["admin", "inventory-sync"])


async def require_brand() -> None:
    if is_scoping_bypassed() or get_current_tenant_id() in (None, NO_TENANT):
        raise HTTPException(status_code=400, detail="Open Inventory sync from a store's own admin.")


def _known(connector: str) -> dict:
    meta = cfgmod.CONNECTORS.get(connector)
    if not meta or not meta.get("available"):
        raise HTTPException(status_code=404, detail="Unknown inventory connector")
    return meta


async def _locations(db: AsyncSession) -> list[dict]:
    """The brand's own store locations (a supplier's held stock is not one of them)."""
    from app.models.inventory import Warehouse

    rows = (await db.execute(
        select(Warehouse).where(Warehouse.supplier.is_(None)).order_by(Warehouse.created_at)
    )).scalars().all()
    return [{"id": str(w.id), "name": w.name, "code": w.code, "is_active": w.is_active} for w in rows]


def _public(cfg: dict) -> dict:
    return {k: cfg.get(k) for k in ("active", "every_minutes", "locations", "safety_stock", "count_stock", "missing",
                                    "last_run_at", "last_sync_at", "history")}


@router.get("")
async def overview(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
                   __: None = Depends(require_brand)):
    from app.services.integrations_service import get_connection, mask

    tid = get_current_tenant_id()
    out = []
    for key, meta in cfgmod.CONNECTORS.items():
        conn = await get_connection(db, key, tenant_id=tid)
        out.append({
            "key": key, "label": meta["label"], "by": meta.get("by"), "available": meta["available"],
            "connection": mask(key, conn),
            "config": _public(await cfgmod.load(db, key, tenant_id=tid)),
            "job": await engine.progress(tid, key),
        })
    return {"connectors": out, "locations": await _locations(db),
            "every_minutes": list(cfgmod.EVERY_MINUTES)}


async def _client(db: AsyncSession, connector: str):
    from app.services.integrations_service import get_connection

    conn = await get_connection(db, connector, tenant_id=get_current_tenant_id())
    if not conn:
        raise HTTPException(status_code=409, detail="Connect your AdvancePro account first.")
    try:
        return from_connection(conn, tenant_id=get_current_tenant_id())
    except AdvanceProError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.get("/{connector}/warehouses")
async def warehouses(connector: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
                     __: None = Depends(require_brand)):
    _known(connector)
    client = await _client(db, connector)
    try:
        rows = await client.warehouses()
    except AdvanceProError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    finally:
        await client.close()
    return {"warehouses": [
        {"id": str(w.get("id")), "name": str(w.get("name") or f"Warehouse {w.get('id')}"), "active": w.get("active", True) is not False}
        for w in rows if w.get("id") is not None
    ]}


class SyncSetup(BaseModel):
    active: bool | None = None
    every_minutes: int | None = None
    locations: dict[str, str] | None = None
    safety_stock: int | None = None
    count_stock: bool | None = None
    missing: str | None = None


@router.put("/{connector}")
async def save_setup(connector: str, body: SyncSetup, _: None = Depends(require_admin),
                     db: AsyncSession = Depends(get_db), __: None = Depends(require_brand)):
    from app.services.integrations_service import get_connection

    _known(connector)
    tid = get_current_tenant_id()
    raw = body.model_dump(exclude_none=True)
    previous = await cfgmod.load(db, connector, tenant_id=tid)
    if raw.get("active") and not await get_connection(db, connector, tenant_id=tid):
        raise HTTPException(status_code=409, detail="Connect your AdvancePro account before turning the sync on.")
    warehouse_ids: set[str] | None = None
    if any(src not in ("all", "none") for src in (raw.get("locations") or {}).values()):
        # A chosen warehouse is checked against AdvancePro; if AdvancePro cannot be
        # read just now, the choice is kept rather than refused.
        client = await _client(db, connector)
        try:
            warehouse_ids = {str(w.get("id")) for w in await client.warehouses() if w.get("id") is not None}
        except AdvanceProError:
            warehouse_ids = None
        finally:
            await client.close()
    try:
        cfg = cfgmod.clean(raw, previous, location_ids={loc["id"] for loc in await _locations(db)},
                           warehouse_ids=warehouse_ids)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    cfg = await cfgmod.save(db, connector, cfg, tenant_id=tid)
    await db.commit()
    return {"config": _public(cfg)}


async def _start(db: AsyncSession, connector: str, *, dry: bool) -> dict:
    from app.services.integrations_service import get_connection

    _known(connector)
    tid = get_current_tenant_id()
    if not await get_connection(db, connector, tenant_id=tid):
        raise HTTPException(status_code=409, detail="Connect your AdvancePro account first.")
    if not (await cfgmod.load(db, connector, tenant_id=tid)).get("locations"):
        raise HTTPException(status_code=409, detail="Choose which store locations take AdvancePro's stock, and save, first.")
    try:
        job = await engine.start(tid, connector, trigger="manual", dry=dry)
    except engine.JobBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"job": job}


@router.post("/{connector}/run")
async def run_now(connector: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
                  __: None = Depends(require_brand)):
    return await _start(db, connector, dry=False)


@router.post("/{connector}/preview")
async def preview(connector: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
                  __: None = Depends(require_brand)):
    """Everything a sync does except writing: what would change, before a first sync touches live stock."""
    return await _start(db, connector, dry=True)


@router.get("/{connector}/job")
async def job(connector: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
              __: None = Depends(require_brand)):
    # `db` stays: opening it is what sets the request's shop, which require_brand reads.
    _known(connector)
    return {"job": await engine.progress(get_current_tenant_id(), connector)}
