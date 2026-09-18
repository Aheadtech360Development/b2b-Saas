"""Admin: Manage Suppliers.

  GET  /admin/suppliers                              every supplier, connected or not
  GET  /admin/suppliers/{id}                         one supplier's setup + last run
  PUT  /admin/suppliers/{id}                         save name, filters, pricing, sync…
  GET  /admin/suppliers/{id}/brands                  brands in the supplier's catalogue
  GET  /admin/suppliers/{id}/catalog                 browse: search + brand, paged
  GET  /admin/suppliers/{id}/import-preview          what the filters select, paged
  GET  /admin/suppliers/{id}/import-preview/count    variant total for the selection
  POST /admin/suppliers/{id}/import                  import everything the filters select
  POST /admin/suppliers/{id}/sync                    sync stock now (?full=1 also imports)
  GET  /admin/suppliers/{id}/job                     progress of the running job

Everything here is one brand's: its own credentials, its own filters and
pricing, its own products. It refuses to run without a single brand in scope,
for the same reason the copilot does — tenant scoping steps aside when no brand
is set or a platform admin bypasses it.
"""
from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import NO_TENANT, get_current_tenant_id, is_scoping_bypassed
from app.middleware.auth_middleware import require_admin
from app.services.suppliers import config as cfgmod
from app.services.suppliers import jobs, ss_catalog

router = APIRouter(prefix="/admin/suppliers", tags=["admin", "suppliers"])


async def require_brand() -> None:
    if is_scoping_bypassed() or get_current_tenant_id() in (None, NO_TENANT):
        raise HTTPException(status_code=400, detail="Open suppliers from a store's own admin.")


def _known(supplier: str) -> dict:
    meta = cfgmod.CATALOG.get(supplier)
    if not meta:
        raise HTTPException(status_code=404, detail="Unknown supplier")
    if not meta["available"]:
        raise HTTPException(status_code=409, detail=f"{meta['label']} isn't available yet.")
    return meta


async def _connection(db: AsyncSession, supplier: str) -> dict:
    from app.services.integrations_service import get_connection

    conn = await get_connection(db, supplier)
    if not conn:
        return {"connected": False, "account": None}
    acct = str(conn.get("account_number") or "")
    return {"connected": True, "account": ("•" * max(0, len(acct) - 3)) + acct[-3:] if acct else None}


async def _client(db: AsyncSession, supplier: str):
    """The brand's own S&S client — never the platform fallback."""
    from app.services.integrations_service import get_connection
    from app.services.ss_activewear_service import SSActivewearService

    conn = await get_connection(db, supplier)
    if not conn:
        raise HTTPException(status_code=409, detail="Connect your S&S Activewear account first (Edit supplier → Connection).")
    return SSActivewearService(conn.get("account_number"), conn.get("api_key"))


async def _styles(db: AsyncSession, supplier: str):
    svc = await _client(db, supplier)
    try:
        return svc, await ss_catalog.all_styles(svc)
    except ss_catalog.CatalogUnavailable as exc:
        await svc.close()
        raise HTTPException(status_code=502, detail=str(exc))


async def _imported(db: AsyncSession, style_ids: list[str]) -> set[str]:
    from app.models.product import Product

    if not style_ids:
        return set()
    rows = (await db.execute(select(Product.product_code).where(Product.product_code.in_(style_ids)))).scalars().all()
    return {str(r) for r in rows if r}


def _row(s: dict, *, imported: set[str], stats: dict | None = None, filters: dict | None = None) -> dict:
    out = {**s, "is_imported": s["style_id"] in imported}
    if stats is not None:
        st = stats.get(s["style_id"])
        out.update(variants=st["variants"] if st else None, sizes=st["sizes"] if st else [], colors=st["colors"] if st else None)
    if filters is not None:
        out["in_filters"] = ss_catalog.matches(s, filters)
    return out


def _public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items()}


# ── List & detail ─────────────────────────────────────────────────────────────

@router.get("")
async def list_suppliers(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> list[dict]:
    tid = get_current_tenant_id()
    out = []
    for sid, meta in cfgmod.CATALOG.items():
        if not meta["available"]:
            out.append({"id": sid, "label": meta["label"], "available": False, "connected": False})
            continue
        cfg = await cfgmod.load(db, sid)
        conn = await _connection(db, sid)
        out.append({
            "id": sid, "label": meta["label"], "available": True, "name": cfg["name"],
            "connected": conn["connected"], "account": conn["account"],
            "auto_import": cfg["auto_import"], "automatic_sync": cfg["automatic_sync"],
            "last_sync_at": cfg.get("last_sync_at"), "created_at": cfg.get("created_at"),
            "job": await jobs.progress(tid, sid),
        })
    return out


@router.get("/{supplier}")
async def get_supplier(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    meta = _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    return {
        "id": supplier, "label": meta["label"], "config": _public(cfg),
        "connection": await _connection(db, supplier),
        "job": await jobs.progress(get_current_tenant_id(), supplier),
    }


class FilterRule(BaseModel):
    field: Literal["brand", "category", "style", "title"]
    op: Literal["equals", "contains", "not_equals"] = "equals"
    value: str = Field(min_length=1, max_length=200)


class Filters(BaseModel):
    match: Literal["any", "all"] = "any"
    rules: list[FilterRule] = []


class PriceRule(BaseModel):
    id: str | None = None
    scope: Literal["all", "brand", "category", "style"] = "all"
    value: str = ""
    markup_pct: float = 0
    markup_fixed: float = 0
    active: bool = True


class Pricing(BaseModel):
    rules: list[PriceRule] = []
    round_to: float | None = None


class Inventory(BaseModel):
    sync: bool = True
    safety_stock: int = Field(0, ge=0, le=100000)


class AutoSync(BaseModel):
    enabled: bool = False
    every_hours: int = Field(24, ge=1, le=168)


class SupplierUpdate(BaseModel):
    """Every part optional: each tab saves only what it shows."""
    name: str | None = Field(None, min_length=1, max_length=80)
    auto_import: bool | None = None
    filters: Filters | None = None
    pricing: Pricing | None = None
    inventory: Inventory | None = None
    automatic_sync: AutoSync | None = None


@router.put("/{supplier}")
async def update_supplier(
    supplier: str, body: SupplierUpdate, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    if body.name is not None:
        cfg["name"] = body.name.strip()
    if body.auto_import is not None:
        cfg["auto_import"] = body.auto_import
    if body.filters is not None:
        cfg["filters"] = cfgmod.clean_filters(body.filters.model_dump())
    if body.pricing is not None:
        cfg["pricing"] = cfgmod.clean_pricing(body.pricing.model_dump())
    if body.inventory is not None:
        cfg["inventory"] = body.inventory.model_dump()
    if body.automatic_sync is not None:
        cfg["automatic_sync"] = body.automatic_sync.model_dump()
    cfg = await cfgmod.save(db, supplier, cfg)
    await db.commit()
    return {"config": _public(cfg)}


# ── Catalogue ─────────────────────────────────────────────────────────────────

@router.get("/{supplier}/brands")
async def supplier_brands(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    svc, styles = await _styles(db, supplier)
    await svc.close()
    return {"brands": ss_catalog.brands(styles), "categories": sorted({s["category"] for s in styles if s["category"]})}


@router.get("/{supplier}/catalog")
async def browse_catalog(
    supplier: str,
    q: str | None = None,
    brand: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    svc, styles = await _styles(db, supplier)
    await svc.close()
    cfg = await cfgmod.load(db, supplier)
    found = ss_catalog.search(styles, q, brand)
    rows = found[(page - 1) * page_size: page * page_size]
    imported = await _imported(db, [s["style_id"] for s in rows])
    return {
        "items": [_row(s, imported=imported, filters=cfg["filters"]) for s in rows],
        "total": len(found), "page": page, "pages": max(1, -(-len(found) // page_size)),
    }


@router.get("/{supplier}/import-preview")
async def import_preview(
    supplier: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 25,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    """What the saved filters select. Variants and sizes are filled in for this
    page only; the total comes from /import-preview/count, which is slower."""
    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    svc, styles = await _styles(db, supplier)
    try:
        chosen = [s for s in styles if ss_catalog.matches(s, cfg["filters"])]
        rows = chosen[(page - 1) * page_size: page * page_size]
        stats = await ss_catalog.style_stats(svc, rows)
    finally:
        await svc.close()
    imported_all = await _imported(db, [s["style_id"] for s in chosen])
    return {
        "filters": cfg["filters"],
        "products": len(chosen),
        "already_imported": len(imported_all),
        "items": [_row(s, imported=imported_all, stats=stats) for s in rows],
        "page": page, "pages": max(1, -(-len(chosen) // page_size)),
    }


@router.get("/{supplier}/import-preview/count")
async def import_preview_count(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    svc, styles = await _styles(db, supplier)
    try:
        chosen = [s for s in styles if ss_catalog.matches(s, cfg["filters"])]
        if len(chosen) > ss_catalog.COUNT_LIMIT:
            return {"products": len(chosen), "variants": None,
                    "note": f"Too many products to count variants ({len(chosen)}). Narrow the filters to see it."}
        stats = await ss_catalog.style_stats(svc, chosen)
    finally:
        await svc.close()
    counted = [stats[s["style_id"]]["variants"] for s in chosen if s["style_id"] in stats]
    return {"products": len(chosen), "variants": sum(counted),
            "complete": len(counted) == len(chosen)}


# ── Jobs ──────────────────────────────────────────────────────────────────────

async def _start(db: AsyncSession, supplier: str, kind: str) -> dict:
    _known(supplier)
    if not (await _connection(db, supplier))["connected"]:
        raise HTTPException(status_code=409, detail="Connect your S&S Activewear account first (Edit supplier → Connection).")
    try:
        return await jobs.start(get_current_tenant_id(), supplier, kind)
    except jobs.JobBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{supplier}/import")
async def start_import(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    cfg = await cfgmod.load(db, supplier)
    if not (cfg.get("filters") or {}).get("rules"):
        raise HTTPException(status_code=400, detail="Set import filters first — without them nothing is selected.")
    return {"job": await _start(db, supplier, "import")}


@router.post("/{supplier}/sync")
async def start_sync(
    supplier: str, full: bool = False, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    return {"job": await _start(db, supplier, "sync" if full else "inventory")}


@router.get("/{supplier}/job")
async def job_status(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    return {"job": await jobs.progress(get_current_tenant_id(), supplier)}
